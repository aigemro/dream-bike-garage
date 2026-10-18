// 레이스 막판 연출 규칙 (순수 데이터·규칙 · Phaser 비의존)
// 스포츠 중계가 승부처에서 쓰는 문법(Lab E안이 우마무스메 레이스 연출에서 참고한 범위)을 수치 규칙으로 정리합니다.
// - 마지막 600m: 속도선·시네마 바·선두 표식을 켜고, 마지막 150m에서 한 단계 더 강조합니다.
// - 역전 컷인: 주인공이 스퍼트 구간에서 마지막으로 선두를 빼앗는 순간을 슬로모션으로 보여 줍니다.
// - 사진 판정: 결승 통과 순간을 잠시 멈추고, 바로 뒤따라 들어오는 선수가 있으면 느리게 재생해 격차를 보여 줍니다.
// 결과는 race-progress가 먼저 확정하므로, 여기서는 확정된 타임라인을 읽어 '언제·무엇을' 연출할지만 정합니다.
// 화면(race-cinematic-broadcast)은 이 값을 읽어 재생만 하고, 수치는 tests/race-climax.test.ts가 지킵니다.
import { RACE_SEGMENTS, type RaceResult, type RacerResult } from './race-progress';

/** 결승까지 이 거리(m) 안으로 들어오면 '마지막 승부' 연출을 켭니다. */
export const FINAL_STRETCH_METERS = 600;
/** 결승까지 이 거리(m) 안에서는 연출 강도를 한 단계 올립니다(속도선 증가·남은 거리 강조). */
export const LAST_METERS = 150;
/** 주인공이 결승선을 넘은 뒤 이 시간(ms) 안에 들어오는 선수가 있으면 사진 판정 슬로모션으로 보여 줍니다. */
export const PHOTO_FINISH_WINDOW_MS = 1500;

/** 슬로모션 곡선: inMs 동안 scale 배속까지 느려져 holdMs 머문 뒤 outMs 동안 1배속으로 돌아옵니다(화면 시간 ms). */
export type SlowMotionProfile = { inMs: number; holdMs: number; outMs: number; scale: number };
/** 역전 컷인 슬로모션 */
export const OVERTAKE_SLOWMO: SlowMotionProfile = { inMs: 120, holdMs: 800, outMs: 350, scale: 0.3 };
/** 사진 판정: 결승 통과 순간 정지 시간, 뒤따르는 선수를 보여 주는 배속과 그 상한 시간, 마지막 코스팅 홀드 */
export const PHOTO_FINISH = { freezeMs: 600, slowScale: 0.3, slowMaxMs: 2600, holdMs: 1400 };

/** 연출 강도: 0 평상 · 1 마지막 600m · 2 마지막 150m(결승 통과 뒤에도 유지) */
export type ClimaxLevel = 0 | 1 | 2;

/**
 * 국면별 자동 카메라(Lab E안의 4단계 샷): 출발 직후 전체 무리 → 선두 그룹과 내 위치 → 내 레이서와 가장 가까운 라이벌 접전 → 마지막 600m.
 * 메인은 픽셀 스프라이트를 정수 배율로만 그리므로 Lab처럼 레이서를 축소하지 않고, 카메라 기준(선두/주인공)·화면 앵커·진행률당 px 간격만 바꿉니다.
 */
export type BroadcastShot = 'opening' | 'pack' | 'rival' | 'final';
/** 샷이 바뀌는 진행률(final은 finalStretchFrom) */
export const SHOT_FROM = { pack: 0.12, rival: 0.58 };
export type ShotCamera = {
  /** 카메라 기준 레이서가 놓이는 화면 x */
  anchorX: number;
  /** 진행률 1.0 차이가 화면 px로 환산되는 길이(작을수록 무리가 한 화면에 모임) */
  spreadPx: number;
  /** true면 선두를, false면 주인공을 카메라 기준으로 둡니다 */
  followLeader: boolean;
};
export const SHOT_CAMERA: Record<BroadcastShot, ShotCamera> = {
  opening: { anchorX: 236, spreadPx: 1400, followLeader: true },
  pack: { anchorX: 236, spreadPx: 2000, followLeader: true },
  rival: { anchorX: 150, spreadPx: 3000, followLeader: false },
  final: { anchorX: 150, spreadPx: 3000, followLeader: false },
};
/** 샷 전환 때 카메라 기준·앵커·간격이 미끄러지듯 바뀌는 시상수(ms) */
export const SHOT_BLEND_TAU_MS = 420;
export const SHOT_LABELS: Record<BroadcastShot, string> = {
  opening: 'OPENING · 전체 무리',
  pack: 'PACK CAM · 선두 그룹',
  rival: 'RIVAL FOCUS · 접전',
  final: `FINAL ${FINAL_STRETCH_METERS}m · 스퍼트`,
};

export function broadcastShotAt(progress: number, distanceMeters: number): BroadcastShot {
  if (progress >= finalStretchFrom(distanceMeters)) return 'final';
  if (progress >= SHOT_FROM.rival) return 'rival';
  if (progress >= SHOT_FROM.pack) return 'pack';
  return 'opening';
}

/** 주인공과 진행률이 가장 가까운 다른 레이서(접전 상대). 같은 거리면 앞선 쪽 */
export function nearestRivalId(entries: Array<{ id: string; progress: number }>, focusId: string): string | undefined {
  const focus = entries.find((entry) => entry.id === focusId);
  if (!focus) return undefined;
  return entries
    .filter((entry) => entry.id !== focusId)
    .sort((a, b) => Math.abs(a.progress - focus.progress) - Math.abs(b.progress - focus.progress) || b.progress - a.progress)[0]?.id;
}

/** 1차 저역 필터 한 걸음: value가 target으로 시상수 tauMs만큼 다가갑니다 */
export function blendToward(value: number, target: number, deltaMs: number, tauMs: number): number {
  if (!(deltaMs > 0)) return value;
  return value + (target - value) * (1 - Math.exp(-deltaMs / tauMs));
}

/** 마지막 600m가 시작되는 진행률 */
export function finalStretchFrom(distanceMeters: number): number {
  return Math.max(0, 1 - FINAL_STRETCH_METERS / distanceMeters);
}

export function climaxLevel(progress: number, distanceMeters: number): ClimaxLevel {
  // 진행률 0.95 × 3,000m = 150.0000…m 같은 부동소수 오차로 경계가 밀리지 않게 1mm 여유를 둡니다
  const remaining = (1 - progress) * distanceMeters - 1e-3;
  if (remaining <= LAST_METERS) return 2;
  if (remaining <= FINAL_STRETCH_METERS) return 1;
  return 0;
}

export function slowMotionTotalMs(profile: SlowMotionProfile): number {
  return profile.inMs + profile.holdMs + profile.outMs;
}

/** 슬로모션 시작 후 elapsedMs(화면 시간)에서의 재생 배속(0~1). 끝나면 1 */
export function slowMotionScale(elapsedMs: number, profile: SlowMotionProfile): number {
  if (elapsedMs <= 0) return 1;
  if (elapsedMs < profile.inMs) return 1 - (1 - profile.scale) * (elapsedMs / profile.inMs);
  if (elapsedMs < profile.inMs + profile.holdMs) return profile.scale;
  const out = elapsedMs - profile.inMs - profile.holdMs;
  if (out < profile.outMs) return profile.scale + (1 - profile.scale) * (out / profile.outMs);
  return 1;
}

/** 주인공(focusId)이 진행률 기준점을 처음 넘은 틱에서 본 각 선수의 진행률(앞선 순) */
export function standingsAt(result: RaceResult, focusId: string, progress: number): Array<{ id: string; progress: number }> {
  const focus = result.racers.find((racer) => racer.id === focusId);
  if (!focus) return [];
  const tick = Math.max(0, focus.timeline.findIndex((value) => value >= progress));
  return [...result.racers]
    .map((racer) => ({ id: racer.id, progress: racer.timeline[Math.min(tick, racer.timeline.length - 1)] ?? 1 }))
    .sort((a, b) => b.progress - a.progress);
}

/**
 * 주인공이 마지막으로 선두를 빼앗은(이후 끝까지 지킨) 틱의 진행률.
 * 처음부터 끝까지 선두였으면 0, 끝까지 선두를 지키지 못했으면(우승 아님) 1.
 */
export function leadTakenProgress(result: RaceResult, focusId: string): number {
  const focus = result.racers.find((racer) => racer.id === focusId);
  if (!focus) return 1;
  const others = result.racers.filter((racer) => racer.id !== focusId);
  const behindAt = (tick: number) => {
    const mine = focus.timeline[Math.min(tick, focus.timeline.length - 1)] ?? 1;
    return others.some((racer) => {
      const theirs = racer.timeline[Math.min(tick, racer.timeline.length - 1)] ?? 1;
      // 둘 다 결승선을 넘은 뒤에는 기록이 빠른 쪽이 앞입니다.
      if (mine >= 1 && theirs >= 1) return racer.finishTimeMs < focus.finishTimeMs;
      return theirs > mine;
    });
  };
  for (let tick = focus.timeline.length - 1; tick >= 0; tick -= 1) {
    if (behindAt(tick)) return tick + 1 < focus.timeline.length ? focus.timeline[tick + 1] : 1;
  }
  return 0;
}

/**
 * 역전 컷인을 띄울 진행률. 주인공이 우승하고 스퍼트 구간에서 마지막으로 선두를 빼앗았을 때만 있습니다.
 * 처음부터 선두였거나 스퍼트 전에 역전한 경기는 컷인 없이 보통 중계로, 결승선 직전(99.5% 이후) 역전은 사진 판정이 맡습니다.
 */
export function overtakeCutInAt(result: RaceResult, focusId: string): number | undefined {
  const focus = result.racers.find((racer) => racer.id === focusId);
  if (!focus || focus.rank !== 1) return undefined;
  const at = leadTakenProgress(result, focusId);
  const sprintFrom = RACE_SEGMENTS.find((segment) => segment.id === 'sprint')?.from ?? 0.65;
  if (at < sprintFrom || at >= 0.995) return undefined;
  return at;
}

export type PhotoFinishRival = { racer: RacerResult; marginMs: number };

/** 주인공 바로 다음에 들어오는 선수가 PHOTO_FINISH_WINDOW_MS 안이면 사진 판정 대상(기록 차 포함) */
export function photoFinishRival(result: RaceResult, focusId: string): PhotoFinishRival | undefined {
  const focus = result.racers.find((racer) => racer.id === focusId);
  if (!focus) return undefined;
  const next = result.racers
    .filter((racer) => racer.id !== focusId && racer.finishTimeMs >= focus.finishTimeMs)
    .sort((a, b) => a.finishTimeMs - b.finishTimeMs)[0];
  if (!next) return undefined;
  const marginMs = next.finishTimeMs - focus.finishTimeMs;
  return marginMs <= PHOTO_FINISH_WINDOW_MS ? { racer: next, marginMs } : undefined;
}

/** 기록 차를 중계 자막용으로: 0.3초 → '+0.3초' */
export function formatMargin(marginMs: number): string {
  return `+${(marginMs / 1000).toFixed(1)}초`;
}
