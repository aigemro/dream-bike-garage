// 레이스 막판 연출 규칙(race-climax) 단위 테스트: 연출 강도·슬로모션 곡선·역전 컷인 시점·사진 판정 대상
import { describe, expect, it } from 'vitest';
import {
  FINAL_STRETCH_METERS,
  LAST_METERS,
  OVERTAKE_SLOWMO,
  PHOTO_FINISH,
  PHOTO_FINISH_WINDOW_MS,
  SHOT_CAMERA,
  SHOT_FROM,
  SHOT_LABELS,
  blendToward,
  broadcastShotAt,
  climaxLevel,
  finalStretchFrom,
  formatMargin,
  leadTakenProgress,
  nearestRivalId,
  overtakeCutInAt,
  photoFinishRival,
  slowMotionScale,
  slowMotionTotalMs,
  standingsAt,
} from '../src/game/release/race-climax';
import { PROLOGUE_LEAD_TAKEN_AT, PROLOGUE_MARGIN_MS, UNCLE_ID, buildPrologueRace, checkPrologueStory } from '../src/game/release/prologue-story';
import { RACE_SEGMENTS, RIVERSIDE_ENDURANCE_RACE, simulateRace, type RaceResult, type RacerResult } from '../src/game/release/race-progress';

const TICK_MS = 600;
const SPRINT_FROM = RACE_SEGMENTS.find((segment) => segment.id === 'sprint')!.from;

function racer(id: string, timeline: number[], finishTimeMs: number, rank: number): RacerResult {
  return { id, name: id, isPlayer: id === 'me', category: 'road', frameColor: 0, speedScore: 40, rank, finishTimeMs, timeline };
}

function race(racers: RacerResult[]): RaceResult {
  const me = racers.find((entry) => entry.id === 'me')!;
  return {
    meta: { ...RIVERSIDE_ENDURANCE_RACE, distanceMeters: 3000 },
    seed: 1,
    tickMs: TICK_MS,
    totalTicks: racers[0].timeline.length - 1,
    racers,
    playerRank: me.rank,
    playerTimeMs: me.finishTimeMs,
  };
}

// 주인공이 3번째 틱(진행률 0.7)에서 선두를 빼앗아 끝까지 지키고 0.6초 차로 이기는 경기
const OVERTAKE_RACE = race([
  racer('me', [0, 0.3, 0.6, 0.7, 1, 1], 2400, 1),
  racer('rival', [0, 0.35, 0.65, 0.68, 0.9, 1], 3000, 2),
  racer('far', [0, 0.2, 0.4, 0.5, 0.6, 0.8], 3600, 3),
]);
// 처음부터 선두를 지킨 경기
const FROM_START_RACE = race([racer('me', [0, 0.4, 0.8, 1, 1], 1800, 1), racer('rival', [0, 0.3, 0.6, 0.9, 1], 2400, 2)]);
// 끝까지 선두를 빼앗지 못한 경기
const LOSER_RACE = race([racer('me', [0, 0.3, 0.6, 0.9, 1], 2400, 2), racer('rival', [0, 0.4, 0.8, 1, 1], 1800, 1)]);

describe('연출 강도', () => {
  it('3,000m 코스에서 마지막 600m는 진행률 0.8부터, 마지막 150m는 0.95부터다', () => {
    expect(finalStretchFrom(3000)).toBeCloseTo(0.8);
    expect(climaxLevel(0.79, 3000)).toBe(0);
    expect(climaxLevel(0.8, 3000)).toBe(1);
    expect(climaxLevel(0.949, 3000)).toBe(1);
    expect(climaxLevel(0.95, 3000)).toBe(2);
    // 결승 통과 뒤에도 가장 높은 강도를 유지한다
    expect(climaxLevel(1, 3000)).toBe(2);
    expect(FINAL_STRETCH_METERS).toBeGreaterThan(LAST_METERS);
  });

  it('600m보다 짧은 코스는 처음부터 마지막 승부다', () => {
    expect(finalStretchFrom(400)).toBe(0);
    expect(climaxLevel(0, 400)).toBe(1);
  });
});

describe('국면별 자동 카메라(샷)', () => {
  it('전체 무리 → 선두 그룹 → 접전 → 마지막 600m 순서로 바뀐다', () => {
    expect(broadcastShotAt(0, 3000)).toBe('opening');
    expect(broadcastShotAt(SHOT_FROM.pack - 0.001, 3000)).toBe('opening');
    expect(broadcastShotAt(SHOT_FROM.pack, 3000)).toBe('pack');
    expect(broadcastShotAt(SHOT_FROM.rival, 3000)).toBe('rival');
    expect(broadcastShotAt(0.799, 3000)).toBe('rival');
    expect(broadcastShotAt(0.8, 3000)).toBe('final');
    expect(broadcastShotAt(1, 3000)).toBe('final');
    expect(SHOT_FROM.pack).toBeLessThan(SHOT_FROM.rival);
    expect(SHOT_FROM.rival).toBeLessThan(finalStretchFrom(3000));
  });

  it('무리 샷은 선두를 기준으로 간격을 좁히고, 접전·마지막 샷은 주인공을 기준으로 둔다', () => {
    expect(SHOT_CAMERA.opening.followLeader).toBe(true);
    expect(SHOT_CAMERA.pack.followLeader).toBe(true);
    expect(SHOT_CAMERA.rival.followLeader).toBe(false);
    expect(SHOT_CAMERA.final.followLeader).toBe(false);
    expect(SHOT_CAMERA.opening.spreadPx).toBeLessThan(SHOT_CAMERA.pack.spreadPx);
    expect(SHOT_CAMERA.pack.spreadPx).toBeLessThanOrEqual(SHOT_CAMERA.rival.spreadPx);
    // 레이서 폭(약 128px)을 고려해 앵커는 화면(390px) 안쪽에 둔다
    Object.values(SHOT_CAMERA).forEach((camera) => {
      expect(camera.anchorX).toBeGreaterThan(64);
      expect(camera.anchorX).toBeLessThan(390 - 64);
    });
    (['opening', 'pack', 'rival', 'final'] as const).forEach((shot) => expect(SHOT_LABELS[shot].length).toBeGreaterThan(0));
  });

  it('접전 상대는 진행률이 가장 가까운 다른 레이서이며, 같은 거리면 앞선 쪽이다', () => {
    const entries = [
      { id: 'me', progress: 0.5 },
      { id: 'ahead', progress: 0.52 },
      { id: 'behind', progress: 0.48 },
      { id: 'far', progress: 0.7 },
    ];
    expect(nearestRivalId(entries, 'me')).toBe('ahead');
    expect(nearestRivalId([{ id: 'me', progress: 0.5 }, { id: 'near', progress: 0.49 }, { id: 'far', progress: 0.3 }], 'me')).toBe('near');
    expect(nearestRivalId([{ id: 'me', progress: 0.5 }], 'me')).toBeUndefined();
    expect(nearestRivalId(entries, 'nobody')).toBeUndefined();
  });

  it('카메라 보간은 시상수만큼 목표로 다가가고 시간이 0이면 그대로다', () => {
    expect(blendToward(0, 100, 0, 400)).toBe(0);
    const step = blendToward(0, 100, 400, 400);
    expect(step).toBeCloseTo(100 * (1 - Math.exp(-1)));
    expect(blendToward(0, 100, 4000, 400)).toBeGreaterThan(99.9);
    expect(blendToward(100, 100, 16, 400)).toBe(100);
  });
});

describe('슬로모션 곡선', () => {
  it('느려지는 구간 → 머무는 구간 → 돌아오는 구간을 지나 1배속으로 끝난다', () => {
    const { inMs, holdMs, outMs, scale } = OVERTAKE_SLOWMO;
    expect(slowMotionScale(0, OVERTAKE_SLOWMO)).toBe(1);
    expect(slowMotionScale(inMs / 2, OVERTAKE_SLOWMO)).toBeCloseTo((1 + scale) / 2);
    expect(slowMotionScale(inMs, OVERTAKE_SLOWMO)).toBeCloseTo(scale);
    expect(slowMotionScale(inMs + holdMs / 2, OVERTAKE_SLOWMO)).toBeCloseTo(scale);
    expect(slowMotionScale(inMs + holdMs + outMs / 2, OVERTAKE_SLOWMO)).toBeCloseTo((1 + scale) / 2);
    expect(slowMotionScale(slowMotionTotalMs(OVERTAKE_SLOWMO), OVERTAKE_SLOWMO)).toBe(1);
    expect(slowMotionScale(99_999, OVERTAKE_SLOWMO)).toBe(1);
    expect(slowMotionTotalMs(OVERTAKE_SLOWMO)).toBe(inMs + holdMs + outMs);
  });

  it('배속은 0보다 크고 1 이하다(정지는 사진 판정 전용)', () => {
    for (let ms = 0; ms <= slowMotionTotalMs(OVERTAKE_SLOWMO); ms += 10) {
      const value = slowMotionScale(ms, OVERTAKE_SLOWMO);
      expect(value).toBeGreaterThan(0);
      expect(value).toBeLessThanOrEqual(1);
    }
    expect(PHOTO_FINISH.slowScale).toBeGreaterThan(0);
    expect(PHOTO_FINISH.freezeMs).toBeGreaterThan(0);
  });
});

describe('순위 스냅샷과 선두 교체 시점', () => {
  it('주인공이 기준 진행률을 처음 넘은 틱에서 앞선 순서로 본다', () => {
    const atSprint = standingsAt(OVERTAKE_RACE, 'me', 0.6);
    expect(atSprint.map((entry) => entry.id)).toEqual(['rival', 'me', 'far']);
    expect(standingsAt(OVERTAKE_RACE, 'nobody', 0.5)).toEqual([]);
  });

  it('마지막으로 선두를 빼앗은 틱의 진행률을 돌려준다', () => {
    expect(leadTakenProgress(OVERTAKE_RACE, 'me')).toBeCloseTo(0.7);
  });

  it('처음부터 선두면 0, 끝까지 선두를 지키지 못했으면 1', () => {
    expect(leadTakenProgress(FROM_START_RACE, 'me')).toBe(0);
    expect(leadTakenProgress(LOSER_RACE, 'me')).toBe(1);
  });
});

describe('역전 컷인', () => {
  it('우승자가 스퍼트 구간에서 마지막으로 선두를 빼앗았을 때만 그 진행률을 돌려준다', () => {
    expect(SPRINT_FROM).toBeLessThanOrEqual(0.7);
    expect(overtakeCutInAt(OVERTAKE_RACE, 'me')).toBeCloseTo(0.7);
  });

  it('처음부터 선두였거나, 스퍼트 전에 역전했거나, 우승하지 못했으면 컷인이 없다', () => {
    expect(overtakeCutInAt(FROM_START_RACE, 'me')).toBeUndefined();
    const early = race([racer('me', [0, 0.2, 0.5, 0.8, 1], 2400, 1), racer('rival', [0, 0.3, 0.45, 0.7, 0.95, 1], 3000, 2)]);
    expect(leadTakenProgress(early, 'me')).toBeCloseTo(0.5);
    expect(overtakeCutInAt(early, 'me')).toBeUndefined();
    expect(overtakeCutInAt(LOSER_RACE, 'me')).toBeUndefined();
  });

  it('결승선 직전(99.5% 이후) 역전은 사진 판정이 맡으므로 컷인이 없다', () => {
    const lastMoment = race([racer('me', [0, 0.5, 0.9, 0.998, 1], 2400, 1), racer('rival', [0, 0.52, 0.92, 0.997, 1], 2500, 2)]);
    expect(leadTakenProgress(lastMoment, 'me')).toBeCloseTo(0.998);
    expect(overtakeCutInAt(lastMoment, 'me')).toBeUndefined();
  });
});

describe('사진 판정', () => {
  it('주인공 다음에 들어오는 선수가 1.5초 안이면 그 선수와 기록 차를 돌려준다', () => {
    const rival = photoFinishRival(OVERTAKE_RACE, 'me');
    expect(rival?.racer.id).toBe('rival');
    expect(rival?.marginMs).toBe(600);
  });

  it('1.5초보다 늦게 들어오거나 뒤에 아무도 없으면 대상이 없다', () => {
    const wide = race([racer('me', [0, 0.5, 1, 1, 1], 1200, 1), racer('rival', [0, 0.3, 0.6, 0.9, 1], 1200 + PHOTO_FINISH_WINDOW_MS + 1, 2)]);
    expect(photoFinishRival(wide, 'me')).toBeUndefined();
    const last = race([racer('rival', [0, 0.5, 1, 1, 1], 1200, 1), racer('me', [0, 0.3, 0.6, 0.9, 1], 2400, 2)]);
    expect(photoFinishRival(last, 'me')).toBeUndefined();
  });

  it('기록 차는 소수 첫째 자리 초 단위로 표기한다', () => {
    expect(formatMargin(316)).toBe('+0.3초');
    expect(formatMargin(1500)).toBe('+1.5초');
  });
});

describe('프롤로그·대회일 레이스와의 연결', () => {
  it('프롤로그 대본 경기는 스퍼트 후반 역전 컷인과 루카의 사진 판정으로 끝난다', () => {
    const prologue = buildPrologueRace();
    const check = checkPrologueStory(prologue);
    expect(overtakeCutInAt(prologue, UNCLE_ID)).toBeCloseTo(check.leadTakenAt);
    const rival = photoFinishRival(prologue, UNCLE_ID);
    expect(rival?.racer.id).toBe('luka');
    expect(rival?.marginMs).toBe(check.marginMs);
    // 대본 조건 범위가 연출 규칙 안에 들어온다: 역전은 스퍼트 구간, 격차는 사진 판정 범위
    expect(PROLOGUE_LEAD_TAKEN_AT.min).toBeGreaterThanOrEqual(SPRINT_FROM);
    expect(PROLOGUE_LEAD_TAKEN_AT.max).toBeLessThan(0.995);
    expect(PROLOGUE_MARGIN_MS.max).toBeLessThanOrEqual(PHOTO_FINISH_WINDOW_MS);
  });

  it('대회일 레이스 결과에도 같은 규칙을 적용할 수 있다(컷인은 스퍼트 구간 안, 격차는 창 안)', () => {
    for (let seed = 1; seed <= 40; seed += 1) {
      const result = simulateRace({ seed, playerStats: { 성능: 4, 스타일: 3, 희귀도: 3 }, meta: RIVERSIDE_ENDURANCE_RACE });
      const cutIn = overtakeCutInAt(result, 'player');
      if (cutIn !== undefined) {
        expect(result.playerRank).toBe(1);
        expect(cutIn).toBeGreaterThanOrEqual(SPRINT_FROM);
        expect(cutIn).toBeLessThan(0.995);
      }
      const rival = photoFinishRival(result, 'player');
      if (rival) {
        expect(rival.marginMs).toBeGreaterThanOrEqual(0);
        expect(rival.marginMs).toBeLessThanOrEqual(PHOTO_FINISH_WINDOW_MS);
        expect(rival.racer.finishTimeMs).toBeGreaterThanOrEqual(result.playerTimeMs);
      }
    }
  });
});
