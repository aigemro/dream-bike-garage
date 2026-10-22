// 레이스 중계 이펙트 규칙 (순수 데이터·규칙 · Phaser 비의존)
// 레이싱 게임(우마무스메·마리오 카트 등)이 쓰는 연출 문법 중 '언제·무엇을·얼마나' 띄울지를 수치 규칙으로 정리합니다.
// 그리는 쪽(race-fx-layer)은 이 값을 읽어 입자·칩·잔상·표지판을 만들기만 하고, 수치는 tests/race-fx.test.ts가 지킵니다.
// - 출발 신호등: 카운트다운 단계마다 램프 색(마리오 카트·F1 출발 신호)
// - 콜아웃: 자세가 바뀌는 순간 레이서 위로 떠오르는 칩(우마무스메 스킬 발동 팝업)
// - 먼지·바람 줄기: 자세·바퀴 티어별 입자 간격(뒷바퀴 접지점)
// - 스퍼트 오라·잔상: 마지막 600m/150m 강도와 스탠딩 스프린트 조합(우마무스메 스퍼트 오라, 소닉 잔상)
// - 남은 거리 표지판: 결승선 마커와 같은 월드 거리 계산으로 지나가는 코스 오브젝트
// - 집중선·순위 변동·골 컨페티·땀방울: 이벤트별 개수·시간
import { FINAL_STRETCH_METERS, LAST_METERS, type ClimaxLevel } from './race-climax';
import { SPRINT_STAND_FROM, STANDING_START_UNTIL, type RiderPosture, type WheelTier } from './race-rider-motion';

/** 이펙트 색 톤. 실제 색은 그리는 쪽이 UI 스타일 가이드 팔레트(GOLD·RED·SKY·GREEN·CREAM)로 바꿉니다 */
export type FxTone = 'gold' | 'red' | 'sky' | 'green' | 'cream';

// ─── 출발 신호등 ──────────────────────────────────────────────────────

export type StartLamp = 'off' | 'red' | 'green';
export const START_LAMP_COUNT = 3;

/**
 * 카운트다운 단계(stepIndex, 0부터)에서 램프 3개의 색. 마지막 단계(GO)는 전부 초록, 그 전에는 왼쪽부터 빨강이 차례로 켜집니다.
 * 단계가 램프보다 많으면 앞 단계는 모두 꺼진 채로 두고 마지막 3단계에서 켜집니다.
 */
export function startLampsAt(stepIndex: number, stepCount: number): StartLamp[] {
  if (stepCount <= 0) return Array.from({ length: START_LAMP_COUNT }, () => 'off' as StartLamp);
  if (stepIndex >= stepCount - 1) return Array.from({ length: START_LAMP_COUNT }, () => 'green' as StartLamp);
  // 빨간 단계가 램프보다 많으면 앞 단계는 꺼진 채 두고, 마지막 3단계에서 왼쪽부터 하나씩 켭니다
  const redSteps = stepCount - 1;
  const lit = Math.max(0, Math.min(START_LAMP_COUNT, stepIndex + 1 - Math.max(0, redSteps - START_LAMP_COUNT)));
  return Array.from({ length: START_LAMP_COUNT }, (_, lamp) => (lamp < lit ? 'red' : 'off'));
}

// ─── 콜아웃(스킬 발동식 칩) ──────────────────────────────────────────────

export type Callout = { label: string; tone: FxTone };

/** 자세별 콜아웃. 착좌는 평상 상태라 없고, 스프린트는 출발 대시와 라스트 스퍼트가 다릅니다 */
export const POSTURE_CALLOUTS: Record<Exclude<RiderPosture, 'seated' | 'sprint'>, Callout> = {
  climb: { label: '클라이밍!', tone: 'green' },
  tuck: { label: '에어로 턱!', tone: 'sky' },
};
export const SPRINT_CALLOUT: Callout = { label: '라스트 스퍼트!', tone: 'red' };

/**
 * 자세가 from → to로 바뀔 때 띄울 콜아웃. 같은 자세, 착좌로 돌아가기, 출발 직후의 스탠딩 스타트(진행률 3% 미만)·완주 후에는 없습니다.
 * 스프린트 콜아웃은 피니시 스퍼트 후반(SPRINT_STAND_FROM 이후)에 일어설 때만 나옵니다.
 */
export function calloutFor(from: RiderPosture, to: RiderPosture, progress: number): Callout | undefined {
  if (from === to || progress >= 1) return undefined;
  if (to === 'seated') return undefined;
  if (to === 'sprint') return progress >= SPRINT_STAND_FROM ? SPRINT_CALLOUT : undefined;
  if (progress < STANDING_START_UNTIL) return undefined;
  return POSTURE_CALLOUTS[to];
}

/** 주인공이 아닌 레이서는 라스트 스퍼트 콜아웃만 띄웁니다(우마무스메가 라이벌 스킬 발동을 작게 보여 주는 범위) */
export function showsCalloutForOthers(callout: Callout): boolean {
  return callout === SPRINT_CALLOUT;
}

// ─── 먼지·바람 줄기 ──────────────────────────────────────────────────────

export type TrailKind = 'dust' | 'wind';
export type TrailSpec = { kind: TrailKind; intervalMs: number };

/**
 * 뒷바퀴 접지점 입자. 힘을 주는 자세(스퍼트·오르막)는 먼지, 고속(blur 티어·내리막)은 바람 줄기, 평상 순항·정지는 없음.
 * 간격이 짧을수록 입자가 많습니다.
 */
export function trailFor(posture: RiderPosture, tier: WheelTier, coasting = false): TrailSpec | undefined {
  if (tier === 'crisp') return undefined;
  if (coasting) return tier === 'blur' ? { kind: 'wind', intervalMs: 150 } : undefined;
  if (posture === 'sprint') return { kind: 'dust', intervalMs: 120 };
  if (posture === 'climb') return { kind: 'dust', intervalMs: 220 };
  if (tier === 'blur') return { kind: 'wind', intervalMs: 110 };
  return undefined;
}

/** 출발 대시: GO 순간 레이서 한 명당 먼지 뭉치 입자 수 */
export const START_BURST_PARTICLES = 10;

// ─── 스퍼트 오라·잔상 ─────────────────────────────────────────────────────

export type AuraSpec = { tone: FxTone; alpha: number; pulseMs: number; sparkleIntervalMs?: number };

/**
 * 주인공 스퍼트 오라. 마지막 600m(강도 1)부터 금색, 마지막 150m(강도 2)는 붉게 강해지고 스파클이 위로 흩어집니다.
 * 완주 후에는 꺼집니다.
 */
export function auraFor(climax: ClimaxLevel, finished: boolean): AuraSpec | undefined {
  if (finished || climax === 0) return undefined;
  if (climax === 1) return { tone: 'gold', alpha: 0.32, pulseMs: 520 };
  return { tone: 'red', alpha: 0.42, pulseMs: 360, sparkleIntervalMs: 120 };
}

/** count: 동시에 남아 있는 잔상 최대 수(lifeMs ≤ count × intervalMs가 되게 둡니다) */
export type GhostSpec = { count: number; intervalMs: number; lifeMs: number; tone: FxTone };

/**
 * 잔상: 스탠딩 스프린트 중 마지막 600m부터. 마지막 150m는 더 많고 촘촘합니다. 완주·착좌에서는 없습니다.
 * 간격·수명은 경기 재생 시간(timeScale 적용) 기준이라 역전 슬로모션·사진 판정 정지에서는 잔상도 함께 느려지고 멈춥니다.
 * 잔상은 지면 속도(스퍼트 약 250px/s)로 뒤로 흘러가므로 간격 150ms ≈ 38px씩 떨어져 레이서 폭(128px) 안에서 겹겹이 쌓입니다.
 * 색은 갈색 도로·하늘 어디서나 읽히는 크림(밝은 실루엣)입니다.
 */
export function ghostTrailFor(posture: RiderPosture, climax: ClimaxLevel, finished: boolean): GhostSpec | undefined {
  if (finished || posture !== 'sprint' || climax === 0) return undefined;
  return climax === 1
    ? { count: 3, intervalMs: 150, lifeMs: 450, tone: 'cream' }
    : { count: 4, intervalMs: 110, lifeMs: 440, tone: 'cream' };
}

// ─── 남은 거리 표지판·출발선 ──────────────────────────────────────────────

/** 결승까지 남은 거리(m) 표지판 후보. 1km 단위 표지 + 막판 연출 경계(600m·300m·150m) */
export const DISTANCE_POLE_METERS: readonly number[] = [FINAL_STRETCH_METERS, 300, LAST_METERS];

/** 코스 길이에 맞는 표지판 남은 거리 목록(먼 것부터). 코스보다 짧은 것만, 출발선(=코스 길이)과 결승선(0)은 제외 */
export function distancePoles(distanceMeters: number): number[] {
  const poles = new Set<number>();
  for (let km = 1000; km < distanceMeters; km += 1000) poles.add(km);
  DISTANCE_POLE_METERS.forEach((meters) => { if (meters < distanceMeters) poles.add(meters); });
  return [...poles].sort((a, b) => b - a);
}

/** 표지판 글자: 1,000m 단위는 'n km', 그 외는 'n m' */
export function poleLabel(remainingMeters: number): string {
  if (remainingMeters >= 1000 && remainingMeters % 1000 === 0) return `${remainingMeters / 1000}km`;
  return `${remainingMeters}m`;
}

/** 표지판 색: 마지막 600m 안쪽은 승부처라 빨강, 그 밖은 크림 */
export function poleTone(remainingMeters: number): FxTone {
  return remainingMeters <= FINAL_STRETCH_METERS ? 'red' : 'cream';
}

/** 결승선 화면 x와 코스 전체 월드 길이(px)에서 남은 거리 r(m) 표지판의 화면 x */
export function poleScreenX(lineX: number, courseWorldPx: number, remainingMeters: number, distanceMeters: number): number {
  return lineX - (remainingMeters / distanceMeters) * courseWorldPx;
}

// ─── 집중선·순위 변동·골 컨페티·땀방울 ──────────────────────────────────────

export type FocusLinesSpec = { count: number; durationMs: number; alpha: number };

/** 집중선: 역전 컷인은 슬로모션 내내 진하게, 사진 판정 정지는 짧고 옅게 */
export const FOCUS_LINES: Record<'overtake' | 'photo-finish', FocusLinesSpec> = {
  overtake: { count: 28, durationMs: 900, alpha: 0.5 },
  'photo-finish': { count: 20, durationMs: 520, alpha: 0.35 },
};

export type RankChange = { direction: 'up' | 'down'; label: string; tone: FxTone };

/** 순위 변동 팝업은 새 순위가 이 시간(ms) 동안 유지된 뒤에만 띄웁니다(접전에서 순위가 프레임마다 흔들릴 때의 깜빡임 방지) */
export const RANK_SETTLE_MS = 500;
/** 출발 직후 무리가 갈리는 동안(이 진행률 미만)은 순위 변동 팝업을 띄우지 않습니다 */
export const RANK_POPUP_FROM = 0.05;

/** 주인공 순위가 바뀌면 '▲ 3위'(초록) / '▼ 5위'(빨강). 같으면 없음 */
export function rankChangeFor(previousRank: number, nextRank: number): RankChange | undefined {
  if (previousRank === nextRank) return undefined;
  const up = nextRank < previousRank;
  return { direction: up ? 'up' : 'down', label: `${up ? '▲' : '▼'} ${nextRank}위`, tone: up ? 'green' : 'red' };
}

/** 골 컨페티 개수: 1위 36 · 2위 20 · 3위 12 · 그 밖은 없음 */
export function confettiCountFor(rank: number): number {
  if (rank === 1) return 36;
  if (rank === 2) return 20;
  if (rank === 3) return 12;
  return 0;
}

/** 주인공 땀방울 간격(ms): 오르막·스퍼트에서만 */
export function sweatIntervalFor(posture: RiderPosture, finished: boolean): number | undefined {
  if (finished) return undefined;
  if (posture === 'climb') return 700;
  if (posture === 'sprint') return 450;
  return undefined;
}

/**
 * 이펙트 예산: 모션 축소(prefers-reduced-motion)에서는 움직임이 큰 연출(잔상·집중선·입자·오라 맥박)을 끄고
 * 정보성 연출(신호등·표지판·콜아웃·순위 변동)만 남깁니다.
 */
export type FxBudget = { particles: boolean; ghosts: boolean; focusLines: boolean; aura: boolean };
export function fxBudgetFor(reducedMotion: boolean): FxBudget {
  return reducedMotion
    ? { particles: false, ghosts: false, focusLines: false, aura: false }
    : { particles: true, ghosts: true, focusLines: true, aura: true };
}
