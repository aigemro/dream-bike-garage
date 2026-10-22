// 레이스 중계 이펙트 규칙(race-fx) 단위 테스트: 출발 신호등·콜아웃·먼지·오라·잔상·거리 표지판·집중선·순위 변동·컨페티·땀·예산
import { describe, expect, it } from 'vitest';
import {
  DISTANCE_POLE_METERS,
  FOCUS_LINES,
  POSTURE_CALLOUTS,
  RANK_POPUP_FROM,
  RANK_SETTLE_MS,
  SPRINT_CALLOUT,
  START_BURST_PARTICLES,
  START_LAMP_COUNT,
  auraFor,
  calloutFor,
  confettiCountFor,
  distancePoles,
  fxBudgetFor,
  ghostTrailFor,
  poleLabel,
  poleScreenX,
  poleTone,
  rankChangeFor,
  showsCalloutForOthers,
  startLampsAt,
  sweatIntervalFor,
  trailFor,
} from '../src/game/release/race-fx';
import { FINAL_STRETCH_METERS, LAST_METERS } from '../src/game/release/race-climax';
import { RIDER_POSTURES, SPRINT_STAND_FROM, STANDING_START_UNTIL } from '../src/game/release/race-rider-motion';
import { RIVERSIDE_ENDURANCE_RACE, RIVERSIDE_RACE } from '../src/game/release/race-progress';

describe('출발 신호등', () => {
  it('3·2·1·GO 카운트다운은 빨강이 하나씩 늘다가 GO에 전부 초록이다', () => {
    expect(startLampsAt(0, 4)).toEqual(['red', 'off', 'off']);
    expect(startLampsAt(1, 4)).toEqual(['red', 'red', 'off']);
    expect(startLampsAt(2, 4)).toEqual(['red', 'red', 'red']);
    expect(startLampsAt(3, 4)).toEqual(['green', 'green', 'green']);
    expect(START_LAMP_COUNT).toBe(3);
  });

  it('단계가 램프보다 많으면 앞 단계는 꺼진 채 두고, 적으면 남는 램프는 빨강이 되지 않는다', () => {
    expect(startLampsAt(0, 6)).toEqual(['off', 'off', 'off']);
    expect(startLampsAt(2, 6)).toEqual(['red', 'off', 'off']);
    expect(startLampsAt(4, 6)).toEqual(['red', 'red', 'red']);
    expect(startLampsAt(5, 6)).toEqual(['green', 'green', 'green']);
    expect(startLampsAt(0, 3)).toEqual(['red', 'off', 'off']);
    expect(startLampsAt(1, 3)).toEqual(['red', 'red', 'off']);
    expect(startLampsAt(2, 3)).toEqual(['green', 'green', 'green']);
    // 카운트다운이 없는 중계(프롤로그)는 램프가 모두 꺼져 있다
    expect(startLampsAt(0, 0)).toEqual(['off', 'off', 'off']);
  });
});

describe('콜아웃(스킬 발동식 칩)', () => {
  it('오르막·내리막 자세로 바뀌면 그 자세의 콜아웃, 착좌로 돌아가면 없음', () => {
    expect(calloutFor('seated', 'climb', 0.3)).toEqual(POSTURE_CALLOUTS.climb);
    expect(calloutFor('climb', 'tuck', 0.5)).toEqual(POSTURE_CALLOUTS.tuck);
    expect(calloutFor('tuck', 'seated', 0.7)).toBeUndefined();
    expect(calloutFor('seated', 'seated', 0.2)).toBeUndefined();
  });

  it('라스트 스퍼트 콜아웃은 스퍼트 후반에 일어설 때만, 출발 직후 스탠딩 스타트와 완주 후에는 없다', () => {
    expect(calloutFor('seated', 'sprint', SPRINT_STAND_FROM)).toEqual(SPRINT_CALLOUT);
    expect(calloutFor('seated', 'sprint', 0.5)).toBeUndefined();
    expect(calloutFor('seated', 'sprint', 0)).toBeUndefined();
    expect(calloutFor('sprint', 'climb', STANDING_START_UNTIL / 2)).toBeUndefined();
    expect(calloutFor('seated', 'sprint', 1)).toBeUndefined();
    expect(SPRINT_CALLOUT.label.length).toBeLessThanOrEqual(8);
  });

  it('다른 레이서는 라스트 스퍼트 콜아웃만 띄운다', () => {
    expect(showsCalloutForOthers(SPRINT_CALLOUT)).toBe(true);
    expect(showsCalloutForOthers(POSTURE_CALLOUTS.climb)).toBe(false);
    expect(showsCalloutForOthers(POSTURE_CALLOUTS.tuck)).toBe(false);
  });
});

describe('먼지·바람 줄기', () => {
  it('힘을 주는 자세는 먼지, 고속은 바람 줄기, 순항·스핀업은 없음', () => {
    expect(trailFor('sprint', 'fast')).toEqual({ kind: 'dust', intervalMs: 120 });
    expect(trailFor('climb', 'fast')?.kind).toBe('dust');
    expect(trailFor('tuck', 'blur')?.kind).toBe('wind');
    expect(trailFor('seated', 'blur')?.kind).toBe('wind');
    expect(trailFor('seated', 'fast')).toBeUndefined();
    RIDER_POSTURES.forEach((posture) => expect(trailFor(posture, 'crisp')).toBeUndefined());
  });

  it('스퍼트 먼지가 오르막 먼지보다 촘촘하고, 완주 코스팅은 고속에서만 바람 줄기가 남는다', () => {
    expect(trailFor('sprint', 'fast')!.intervalMs).toBeLessThan(trailFor('climb', 'fast')!.intervalMs);
    expect(trailFor('seated', 'blur', true)?.kind).toBe('wind');
    expect(trailFor('seated', 'fast', true)).toBeUndefined();
    expect(START_BURST_PARTICLES).toBeGreaterThan(0);
  });
});

describe('스퍼트 오라·잔상', () => {
  it('오라는 마지막 600m부터 금색, 마지막 150m는 붉고 더 빠르게 맥박치며 스파클이 붙는다', () => {
    expect(auraFor(0, false)).toBeUndefined();
    const final = auraFor(1, false)!;
    const last = auraFor(2, false)!;
    expect(final.tone).toBe('gold');
    expect(final.sparkleIntervalMs).toBeUndefined();
    expect(last.tone).toBe('red');
    expect(last.pulseMs).toBeLessThan(final.pulseMs);
    expect(last.alpha).toBeGreaterThan(final.alpha);
    expect(last.sparkleIntervalMs).toBeGreaterThan(0);
    expect(auraFor(2, true)).toBeUndefined();
  });

  it('잔상은 스탠딩 스프린트 + 마지막 600m에서만, 마지막 150m는 더 많고 촘촘하다', () => {
    expect(ghostTrailFor('sprint', 0, false)).toBeUndefined();
    expect(ghostTrailFor('seated', 1, false)).toBeUndefined();
    expect(ghostTrailFor('sprint', 2, true)).toBeUndefined();
    const final = ghostTrailFor('sprint', 1, false)!;
    const last = ghostTrailFor('sprint', 2, false)!;
    expect(last.count).toBeGreaterThan(final.count);
    expect(last.intervalMs).toBeLessThan(final.intervalMs);
    // 수명이 (최대 수 × 간격) 안에 들어와야 잔상 풀을 넘치지 않고, 간격보다는 길어야 잔상이 끊기지 않는다
    [final, last].forEach((spec) => {
      expect(spec.lifeMs).toBeGreaterThan(spec.intervalMs);
      expect(spec.lifeMs).toBeLessThanOrEqual(spec.count * spec.intervalMs);
    });
  });
});

describe('남은 거리 표지판', () => {
  it('3,000m 코스는 2km·1km·600m·300m·150m 표지판이 먼 것부터 나온다', () => {
    expect(distancePoles(RIVERSIDE_ENDURANCE_RACE.distanceMeters)).toEqual([2000, 1000, FINAL_STRETCH_METERS, 300, LAST_METERS]);
    expect(DISTANCE_POLE_METERS).toContain(FINAL_STRETCH_METERS);
    expect(DISTANCE_POLE_METERS).toContain(LAST_METERS);
  });

  it('1,200m 코스는 1km·600m·300m·150m, 코스보다 긴 표지판·출발선·결승선은 없다', () => {
    const poles = distancePoles(RIVERSIDE_RACE.distanceMeters);
    expect(poles).toEqual([1000, FINAL_STRETCH_METERS, 300, LAST_METERS]);
    poles.forEach((meters) => {
      expect(meters).toBeGreaterThan(0);
      expect(meters).toBeLessThan(RIVERSIDE_RACE.distanceMeters);
    });
    expect(distancePoles(100)).toEqual([]);
  });

  it('글자는 km·m 표기이고 마지막 600m 안쪽 표지판은 빨강이다', () => {
    expect(poleLabel(2000)).toBe('2km');
    expect(poleLabel(600)).toBe('600m');
    expect(poleLabel(1500)).toBe('1500m');
    expect(poleTone(1000)).toBe('cream');
    expect(poleTone(FINAL_STRETCH_METERS)).toBe('red');
    expect(poleTone(LAST_METERS)).toBe('red');
  });

  it('표지판 화면 x는 결승선에서 남은 거리 비율만큼 왼쪽이다(결승선 마커와 같은 월드 거리 계산)', () => {
    expect(poleScreenX(150, 12_000, 600, 3000)).toBeCloseTo(150 - 2400);
    expect(poleScreenX(150, 12_000, 0, 3000)).toBe(150);
    expect(poleScreenX(150, 12_000, 3000, 3000)).toBeCloseTo(150 - 12_000);
  });
});

describe('집중선·순위 변동·골 컨페티·땀방울', () => {
  it('역전 컷인 집중선이 사진 판정보다 많고 진하다', () => {
    expect(FOCUS_LINES.overtake.count).toBeGreaterThan(FOCUS_LINES['photo-finish'].count);
    expect(FOCUS_LINES.overtake.alpha).toBeGreaterThan(FOCUS_LINES['photo-finish'].alpha);
    Object.values(FOCUS_LINES).forEach((spec) => {
      expect(spec.durationMs).toBeGreaterThan(0);
      expect(spec.alpha).toBeLessThanOrEqual(1);
    });
  });

  it('순위가 오르면 ▲ 초록, 떨어지면 ▼ 빨강, 같으면 없음', () => {
    expect(rankChangeFor(4, 3)).toEqual({ direction: 'up', label: '▲ 3위', tone: 'green' });
    expect(rankChangeFor(2, 5)).toEqual({ direction: 'down', label: '▼ 5위', tone: 'red' });
    expect(rankChangeFor(3, 3)).toBeUndefined();
    // 접전 깜빡임 방지 유지 시간과 출발 직후 유예 진행률
    expect(RANK_SETTLE_MS).toBeGreaterThan(0);
    expect(RANK_POPUP_FROM).toBeGreaterThan(0);
    expect(RANK_POPUP_FROM).toBeLessThan(0.12);
  });

  it('컨페티는 포디움만, 1위가 가장 많다', () => {
    expect(confettiCountFor(1)).toBeGreaterThan(confettiCountFor(2));
    expect(confettiCountFor(2)).toBeGreaterThan(confettiCountFor(3));
    expect(confettiCountFor(3)).toBeGreaterThan(0);
    expect(confettiCountFor(4)).toBe(0);
    expect(confettiCountFor(8)).toBe(0);
  });

  it('땀방울은 오르막·스퍼트에서만, 완주 후에는 없다', () => {
    expect(sweatIntervalFor('climb', false)).toBe(700);
    expect(sweatIntervalFor('sprint', false)).toBeLessThan(sweatIntervalFor('climb', false)!);
    expect(sweatIntervalFor('seated', false)).toBeUndefined();
    expect(sweatIntervalFor('tuck', false)).toBeUndefined();
    expect(sweatIntervalFor('sprint', true)).toBeUndefined();
  });
});

describe('이펙트 예산', () => {
  it('모션 축소에서는 입자·잔상·집중선·오라를 끈다', () => {
    expect(fxBudgetFor(false)).toEqual({ particles: true, ghosts: true, focusLines: true, aura: true });
    expect(fxBudgetFor(true)).toEqual({ particles: false, ghosts: false, focusLines: false, aura: false });
  });
});
