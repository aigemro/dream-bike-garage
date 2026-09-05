// 레이스 라이더 운동 모델(바퀴·케이던스·자세·티어·IK) 단위 테스트
import { describe, expect, it } from 'vitest';
import {
  CADENCE_RPM,
  CRANK_PHASES,
  CRANK_TDC_PHASE,
  GLINT_MAX_REV_PER_SEC,
  MAX_DISPLAY_CADENCE_RPM,
  MOTION_TAU_MS,
  RIDER_POSTURES,
  SPRINT_STAND_FROM,
  STANDING_START_UNTIL,
  TARGET_CRUISE_WHEEL_REV_PER_SEC,
  WHEEL_PHASES,
  WHEEL_TIER_LIMITS,
  advanceMotion,
  bakedPoseOffsets,
  cadenceBoostFor,
  crankPhaseIndex,
  crankRevPerSec,
  createMotionState,
  glintPhaseIndex,
  groundSpeedPx,
  nextWheelTier,
  phaseAngle,
  phaseIndex,
  postureAt,
  postureForSegment,
  solveTwoBone,
  wheelPhaseIndex,
  wheelRevPerSec,
  wheelRevsPerKmForCruise,
  wheelTierFor,
  type RiderMotionState,
  type RiderPosture,
} from '../src/game/release/race-rider-motion';
import { RIVERSIDE_ENDURANCE_RACE, progressAt, simulateRace } from '../src/game/release/race-progress';

const META = RIVERSIDE_ENDURANCE_RACE;
const FRAME_MS = 1000 / 60;
const TWO_PI = Math.PI * 2;
// 기본 스탯(성능3·드림2단계) 플레이어의 속도 점수: 17 + 3×2.5 + 2×1.5 = 27.5 m/tick
const PLAYER_SPEED_SCORE = 27.5;
const TICK_MS = 600;
const REVS_PER_KM = wheelRevsPerKmForCruise(PLAYER_SPEED_SCORE, TICK_MS);
// 플레이어 순항 진행 속도(progress/s) = 27.5m / 0.6s / 3000m
const CRUISE_PROGRESS_PER_SEC = PLAYER_SPEED_SCORE / (TICK_MS / 1000) / META.distanceMeters;

function step(state: RiderMotionState, progress: number, posture: RiderPosture, extra: { speedMult?: number; coasting?: boolean; deltaMs?: number } = {}) {
  return advanceMotion(state, {
    progress, deltaMs: extra.deltaMs ?? FRAME_MS, speedMult: extra.speedMult ?? 1,
    distanceMeters: META.distanceMeters, revsPerKm: REVS_PER_KM, posture, coasting: extra.coasting,
  });
}

// 일정 진행 속도로 seconds초 동안 60fps로 전진시킵니다.
function runConstant(progressPerSec: number, seconds: number, posture: RiderPosture = 'seated', extra: { speedMult?: number; coasting?: boolean } = {}, state = createMotionState(0, posture)) {
  let progress = state.progress;
  for (let t = 0; t < seconds * 60; t += 1) {
    progress = Math.min(1, progress + (progressPerSec * FRAME_MS) / 1000);
    step(state, progress, posture, extra);
  }
  return state;
}

describe('자세 선택', () => {
  it('구간별 자세: 직선 착좌 / 오르막 climb / 내리막 tuck / 스퍼트 후반 sprint', () => {
    expect(postureAt(0.1)).toBe('seated');
    expect(postureAt(0.3)).toBe('climb');
    expect(postureAt(0.5)).toBe('tuck');
    expect(postureAt(0.7)).toBe('seated');
    expect(postureAt(SPRINT_STAND_FROM)).toBe('sprint');
    expect(postureAt(0.95)).toBe('sprint');
  });

  it('출발 직후는 스탠딩 스타트(sprint), 완주 후에는 착좌로 돌아온다', () => {
    expect(postureAt(0)).toBe('sprint');
    expect(postureAt(STANDING_START_UNTIL - 0.001)).toBe('sprint');
    expect(postureAt(STANDING_START_UNTIL)).toBe('seated');
    expect(postureAt(1)).toBe('seated');
    expect(postureAt(1.2)).toBe('seated');
  });

  it('스퍼트 구간이라도 기준 진행률 전에는 착좌를 유지한다', () => {
    expect(postureForSegment('sprint', SPRINT_STAND_FROM - 0.01)).toBe('seated');
    expect(postureForSegment('sprint', SPRINT_STAND_FROM)).toBe('sprint');
  });

  it('자세별 목표 케이던스: tuck만 0, sprint > seated > climb', () => {
    RIDER_POSTURES.forEach((posture) => expect(CADENCE_RPM[posture]).toBeGreaterThanOrEqual(0));
    expect(CADENCE_RPM.tuck).toBe(0);
    expect(CADENCE_RPM.sprint).toBeGreaterThan(CADENCE_RPM.seated);
    expect(CADENCE_RPM.seated).toBeGreaterThan(CADENCE_RPM.climb);
  });
});

describe('순항 회전수 역산', () => {
  it('기본 스탯 플레이어가 x1 순항하면 바퀴가 목표 rev/s로 돈다', () => {
    const state = runConstant(CRUISE_PROGRESS_PER_SEC, 6);
    expect(wheelRevPerSec(state)).toBeCloseTo(TARGET_CRUISE_WHEEL_REV_PER_SEC, 2);
  });

  it('속도 점수가 다르면 rev/km가 반비례해 순항 rev/s는 같다', () => {
    const slow = wheelRevsPerKmForCruise(21, TICK_MS);
    const fast = wheelRevsPerKmForCruise(31.5, TICK_MS);
    expect(slow).toBeGreaterThan(fast);
    expect(slow * 21).toBeCloseTo(fast * 31.5, 6);
  });

  it('속도 0이면 0을 돌려준다(0으로 나누기 방지)', () => {
    expect(wheelRevsPerKmForCruise(0, TICK_MS)).toBe(0);
  });
});

describe('바퀴 각속도와 굴림 결합', () => {
  it('가속은 τ=600ms로 지연되어 올라간다 (스핀업)', () => {
    const state = createMotionState();
    const progress = CRUISE_PROGRESS_PER_SEC * (MOTION_TAU_MS.wheelUp / 1000);
    step(state, progress, 'seated', { deltaMs: MOTION_TAU_MS.wheelUp });
    const target = TARGET_CRUISE_WHEEL_REV_PER_SEC * TWO_PI;
    expect(state.wheelRadPerSec / target).toBeCloseTo(1 - Math.exp(-1), 2);
  });

  it('감속은 가속보다 느리고, 완주 코스팅은 더 느리다', () => {
    const decel = runConstant(CRUISE_PROGRESS_PER_SEC, 4);
    const coast = runConstant(CRUISE_PROGRESS_PER_SEC, 4);
    const before = decel.wheelRadPerSec;
    for (let t = 0; t < 60; t += 1) {
      step(decel, decel.progress, 'seated');
      step(coast, coast.progress, 'seated', { coasting: true });
    }
    expect(decel.wheelRadPerSec).toBeLessThan(before);
    expect(coast.wheelRadPerSec).toBeGreaterThan(decel.wheelRadPerSec);
    // 1초 뒤 감속 잔량이 exp(-1000/1200)≈0.43, 코스팅은 exp(-1000/1800)≈0.57
    expect(decel.wheelRadPerSec / before).toBeCloseTo(Math.exp(-1000 / MOTION_TAU_MS.wheelDown), 1);
    expect(coast.wheelRadPerSec / before).toBeCloseTo(Math.exp(-1000 / MOTION_TAU_MS.wheelFinish), 1);
  });

  it('진행이 멈추면 각속도가 0으로 수렴하고 각도는 더 늘지 않는다', () => {
    const state = runConstant(CRUISE_PROGRESS_PER_SEC, 3);
    for (let t = 0; t < 600; t += 1) step(state, state.progress, 'seated');
    expect(state.wheelRadPerSec).toBe(0);
    const angle = state.wheelAngle;
    for (let t = 0; t < 60; t += 1) step(state, state.progress, 'seated');
    expect(state.wheelAngle).toBe(angle);
  });

  it('진행률이 뒤로 가도 각속도는 음수가 되지 않는다', () => {
    const state = runConstant(CRUISE_PROGRESS_PER_SEC, 1);
    step(state, 0, 'seated');
    expect(state.wheelRadPerSec).toBeGreaterThanOrEqual(0);
  });

  it('deltaMs가 0 이하이면 상태를 바꾸지 않는다', () => {
    const state = runConstant(CRUISE_PROGRESS_PER_SEC, 1);
    const snapshot = { ...state };
    step(state, 0.9, 'seated', { deltaMs: 0 });
    step(state, 0.9, 'seated', { deltaMs: -5 });
    expect(state).toEqual(snapshot);
  });

  it('지면 속도는 각속도 × 바퀴 반지름이다 (굴림 무슬립)', () => {
    const state = runConstant(CRUISE_PROGRESS_PER_SEC, 6);
    expect(groundSpeedPx(state, 18)).toBeCloseTo(state.wheelRadPerSec * 18, 6);
    // 순항 지면 속도 ≈ 1.8 × 2π × 18 ≈ 204 px/s
    expect(groundSpeedPx(state, 18)).toBeCloseTo(TARGET_CRUISE_WHEEL_REV_PER_SEC * TWO_PI * 18, 0);
  });

  it('x2 배속은 바퀴를 두 배로 돌린다(진행률이 두 배로 빨라짐)', () => {
    const x1 = runConstant(CRUISE_PROGRESS_PER_SEC, 4);
    const x2 = runConstant(CRUISE_PROGRESS_PER_SEC * 2, 4, 'seated', { speedMult: 2 });
    expect(wheelRevPerSec(x2)).toBeCloseTo(wheelRevPerSec(x1) * 2, 1);
  });
});

describe('실제 시뮬레이션 재생', () => {
  const result = simulateRace({ seed: 20260903, playerStats: { 성능: 3, 스타일: 2, 희귀도: 2 }, meta: META });
  const player = result.racers[0];
  const revsPerKm = wheelRevsPerKmForCruise(player.speedScore, result.tickMs);

  function replay(from: number, to: number, speedMult = 1) {
    const state = createMotionState();
    const samples: Array<{ progress: number; wheel: number; crank: number; tier: string; posture: RiderPosture }> = [];
    let playMs = 0;
    const totalMs = result.tickMs * result.totalTicks;
    while (playMs < totalMs && progressAt(player.timeline, playMs / result.tickMs) < 1) {
      playMs += FRAME_MS * speedMult;
      const progress = progressAt(player.timeline, playMs / result.tickMs);
      advanceMotion(state, { progress, deltaMs: FRAME_MS, speedMult, distanceMeters: META.distanceMeters, revsPerKm, posture: postureAt(progress) });
      if (progress >= from && progress < to) samples.push({ progress, wheel: wheelRevPerSec(state), crank: crankRevPerSec(state), tier: state.tier, posture: state.posture });
    }
    return samples;
  }

  it('x1 스타트 직선 순항은 fast 티어이고 케이던스는 착좌 85rpm 근처다', () => {
    const samples = replay(0.08, 0.24);
    const meanWheel = samples.reduce((a, s) => a + s.wheel, 0) / samples.length;
    expect(meanWheel).toBeGreaterThan(WHEEL_TIER_LIMITS.crisp);
    expect(meanWheel).toBeLessThan(WHEEL_TIER_LIMITS.blur);
    expect(meanWheel).toBeCloseTo(TARGET_CRUISE_WHEEL_REV_PER_SEC, 0);
    samples.forEach((s) => expect(s.tier).toBe('fast'));
    const meanCrank = samples.reduce((a, s) => a + s.crank, 0) / samples.length;
    expect(meanCrank * 60).toBeCloseTo(CADENCE_RPM.seated, -1);
  });

  it('내리막은 바퀴가 더 빨라져 blur 티어에 들어가고 크랭크는 멈춘다', () => {
    const samples = replay(0.52, 0.64);
    const meanWheel = samples.reduce((a, s) => a + s.wheel, 0) / samples.length;
    expect(meanWheel).toBeGreaterThan(WHEEL_TIER_LIMITS.blur);
    expect(samples.filter((s) => s.tier === 'blur').length).toBeGreaterThan(samples.length * 0.8);
    expect(samples[samples.length - 1].crank).toBe(0);
    expect(samples[samples.length - 1].posture).toBe('tuck');
  });

  it('오르막은 순항보다 느리고 fast 티어를 유지한다', () => {
    const cruise = replay(0.08, 0.24);
    const climb = replay(0.3, 0.44);
    const mean = (arr: typeof cruise) => arr.reduce((a, s) => a + s.wheel, 0) / arr.length;
    expect(mean(climb)).toBeLessThan(mean(cruise));
    expect(mean(climb)).toBeGreaterThan(WHEEL_TIER_LIMITS.crisp);
    climb.forEach((s) => expect(s.tier).toBe('fast'));
  });

  it('출발 스핀업 동안은 crisp 티어가 잠깐 보인다', () => {
    const samples = replay(0, 0.05);
    expect(samples.some((s) => s.tier === 'crisp')).toBe(true);
  });

  it('x4에서는 바퀴는 4배지만 표시 케이던스는 상한 150rpm을 넘지 않는다', () => {
    const samples = replay(0.08, 0.24, 4);
    samples.forEach((s) => expect(s.crank * 60).toBeLessThanOrEqual(MAX_DISPLAY_CADENCE_RPM + 1e-6));
    const meanWheel = samples.reduce((a, s) => a + s.wheel, 0) / samples.length;
    expect(meanWheel).toBeGreaterThan(TARGET_CRUISE_WHEEL_REV_PER_SEC * 3);
  });
});

describe('케이던스와 코스팅', () => {
  it('착좌 순항 케이던스는 목표 rpm에 수렴한다', () => {
    const state = runConstant(CRUISE_PROGRESS_PER_SEC, 6);
    expect(crankRevPerSec(state) * 60).toBeCloseTo(CADENCE_RPM.seated, 0);
  });

  it('배속 압축 계수: x1=1, x2=1.3, x4=1.5', () => {
    expect(cadenceBoostFor(1)).toBe(1);
    expect(cadenceBoostFor(2)).toBeCloseTo(1.3, 6);
    expect(cadenceBoostFor(4)).toBeCloseTo(1.5, 6);
    expect(cadenceBoostFor(8)).toBeCloseTo(1.5, 6);
  });

  it('tuck(내리막)에서는 바퀴는 돌지만 크랭크는 멈춘다', () => {
    const state = runConstant(CRUISE_PROGRESS_PER_SEC * 1.3, 4, 'tuck');
    expect(wheelRevPerSec(state)).toBeGreaterThan(1);
    expect(state.crankRadPerSec).toBe(0);
  });

  it('코스팅으로 멈춘 크랭크는 역회전 없이 수평 위상(0 또는 π)에 정착한다', () => {
    const state = runConstant(CRUISE_PROGRESS_PER_SEC, 3);
    let previous = state.crankAngle;
    for (let t = 0; t < 240; t += 1) {
      step(state, state.progress + CRUISE_PROGRESS_PER_SEC * (FRAME_MS / 1000), 'seated', { coasting: true });
      expect(state.crankAngle).toBeGreaterThanOrEqual(previous - 1e-9);
      previous = state.crankAngle;
    }
    const normalized = ((state.crankAngle % TWO_PI) + TWO_PI) % TWO_PI;
    const distanceToHorizontal = Math.min(normalized, Math.abs(normalized - Math.PI), Math.abs(normalized - TWO_PI));
    expect(distanceToHorizontal).toBeLessThan(0.02);
  });

  it('출발 직후(바퀴가 느릴 때) 케이던스는 바퀴 속도에 비례해 올라간다', () => {
    const state = createMotionState();
    step(state, CRUISE_PROGRESS_PER_SEC * (FRAME_MS / 1000), 'seated');
    expect(crankRevPerSec(state) * 60).toBeLessThan(CADENCE_RPM.seated * 0.2);
  });
});

describe('자세 전환은 상사점에서 적용된다', () => {
  it('요청이 바뀌어도 크랭크가 상사점을 지나기 전에는 이전 자세를 유지하고, 지나면 바뀐다', () => {
    const state = runConstant(CRUISE_PROGRESS_PER_SEC, 4, 'seated');
    // 상사점 직후 위상으로 맞춘다
    state.crankAngle = phaseAngle(CRANK_TDC_PHASE + 1, CRANK_PHASES);
    step(state, state.progress + CRUISE_PROGRESS_PER_SEC * (FRAME_MS / 1000), 'climb');
    expect(state.posture).toBe('seated');
    expect(state.pendingPosture).toBe('climb');
    let switchedAt = -1;
    for (let t = 0; t < 120 && switchedAt < 0; t += 1) {
      step(state, state.progress + CRUISE_PROGRESS_PER_SEC * (FRAME_MS / 1000), 'climb');
      if (state.posture === 'climb') switchedAt = crankPhaseIndex(state);
    }
    expect(switchedAt).toBe(CRANK_TDC_PHASE);
  });

  it('크랭크가 멈춘 상태에서는 즉시 바뀐다', () => {
    const state = createMotionState(0, 'seated');
    step(state, 0, 'tuck');
    expect(state.posture).toBe('tuck');
  });

  it('너무 오래 기다리면 강제로 적용된다(느린 케이던스 안전장치)', () => {
    const state = runConstant(CRUISE_PROGRESS_PER_SEC, 4, 'seated');
    state.crankAngle = phaseAngle(CRANK_TDC_PHASE + 1, CRANK_PHASES);
    // 크랭크를 거의 멈춘 것처럼 아주 느리게 돌려 상사점에 도달하지 못하게 한다
    state.crankRadPerSec = 0.05;
    for (let t = 0; t < 70; t += 1) step(state, state.progress, 'climb');
    expect(state.posture).toBe('climb');
  });
});

describe('위상 양자화', () => {
  it('각도 범위를 균등 분할하고 음수·2π 초과도 정규화한다', () => {
    expect(phaseIndex(0, WHEEL_PHASES)).toBe(0);
    expect(phaseIndex(Math.PI, WHEEL_PHASES)).toBe(WHEEL_PHASES / 2);
    expect(phaseIndex(TWO_PI, WHEEL_PHASES)).toBe(0);
    expect(phaseIndex(-0.01, WHEEL_PHASES)).toBe(WHEEL_PHASES - 1);
    expect(phaseIndex(TWO_PI - 1e-9, CRANK_PHASES)).toBe(CRANK_PHASES - 1);
  });

  it('위상 인덱스 → 대표 각도(구간 중앙) → 인덱스가 왕복한다', () => {
    for (let i = 0; i < CRANK_PHASES; i += 1) expect(phaseIndex(phaseAngle(i, CRANK_PHASES), CRANK_PHASES)).toBe(i);
  });

  it('상태에서 바퀴·크랭크·글린트 위상을 읽을 수 있다', () => {
    const state = createMotionState(Math.PI / 2);
    expect(wheelPhaseIndex(state)).toBe(0);
    expect(crankPhaseIndex(state)).toBe(CRANK_PHASES / 4);
    expect(glintPhaseIndex(state)).toBe(0);
  });

  it('글린트 각도는 상한 속도 이상으로 빨라지지 않는다', () => {
    const state = runConstant(CRUISE_PROGRESS_PER_SEC * 4, 3, 'seated', { speedMult: 4 });
    const before = state.glintAngle;
    step(state, state.progress + CRUISE_PROGRESS_PER_SEC * 4 * (FRAME_MS / 1000), 'seated', { speedMult: 4 });
    expect(state.glintAngle - before).toBeLessThanOrEqual(GLINT_MAX_REV_PER_SEC * TWO_PI * (FRAME_MS / 1000) + 1e-9);
    expect(state.wheelRadPerSec).toBeGreaterThan(GLINT_MAX_REV_PER_SEC * TWO_PI);
  });
});

describe('바퀴 티어', () => {
  it('순수 판정: 각속도 경계에 따라 crisp / fast / blur', () => {
    expect(wheelTierFor(0)).toBe('crisp');
    expect(wheelTierFor(WHEEL_TIER_LIMITS.crisp - 0.01)).toBe('crisp');
    expect(wheelTierFor(WHEEL_TIER_LIMITS.crisp)).toBe('fast');
    expect(wheelTierFor(WHEEL_TIER_LIMITS.blur - 0.01)).toBe('fast');
    expect(wheelTierFor(WHEEL_TIER_LIMITS.blur)).toBe('blur');
  });

  it('히스테리시스: 경계 근처에서는 현재 티어를 유지한다', () => {
    const { crisp, blur, hysteresis } = WHEEL_TIER_LIMITS;
    expect(nextWheelTier('crisp', crisp + hysteresis / 2)).toBe('crisp');
    expect(nextWheelTier('fast', crisp - hysteresis / 2)).toBe('fast');
    expect(nextWheelTier('crisp', crisp + hysteresis)).toBe('fast');
    expect(nextWheelTier('fast', crisp - hysteresis - 0.01)).toBe('crisp');
    expect(nextWheelTier('fast', blur + hysteresis / 2)).toBe('fast');
    expect(nextWheelTier('blur', blur - hysteresis / 2)).toBe('blur');
    expect(nextWheelTier('blur', blur - hysteresis - 0.01)).toBe('fast');
    expect(nextWheelTier('crisp', 10)).toBe('blur');
    expect(nextWheelTier('blur', 0)).toBe('crisp');
  });
});

describe('2-본 IK', () => {
  const root = { x: 0, y: 0 };

  it('닿는 거리에서는 두 마디 길이를 정확히 지키며 목표에 도달한다', () => {
    const target = { x: 6, y: 20 };
    const { joint, end, reachable, jointAngle } = solveTwoBone(root, target, 15, 14, 'forward');
    expect(reachable).toBe(true);
    expect(end).toEqual(target);
    expect(Math.hypot(joint.x - root.x, joint.y - root.y)).toBeCloseTo(15, 6);
    expect(Math.hypot(end.x - joint.x, end.y - joint.y)).toBeCloseTo(14, 6);
    expect(jointAngle).toBeGreaterThan(0);
    expect(jointAngle).toBeLessThan(Math.PI);
  });

  it('prefer=forward는 관절을 뿌리-목표 선의 +x 쪽에 둔다', () => {
    const target = { x: 0, y: 20 };
    expect(solveTwoBone(root, target, 15, 14, 'forward').joint.x).toBeGreaterThan(0);
    expect(solveTwoBone(root, target, 15, 14, 'backward').joint.x).toBeLessThan(0);
    expect(solveTwoBone(root, { x: 20, y: 0 }, 10, 11, 'down').joint.y).toBeGreaterThan(0);
    expect(solveTwoBone(root, { x: 20, y: 0 }, 10, 11, 'up').joint.y).toBeLessThan(0);
  });

  it('목표가 멀면 마디를 늘리지 않고 끝점을 펴진 한계에 두며 reachable=false', () => {
    const far = solveTwoBone(root, { x: 0, y: 40 }, 15, 14, 'forward');
    expect(far.reachable).toBe(false);
    expect(far.end.y).toBeCloseTo(29, 6);
    expect(far.joint.y).toBeCloseTo(15, 6);
    expect(far.jointAngle).toBeCloseTo(Math.PI, 6);
    expect(far.reach).toBeCloseTo(40 / 29, 6);
  });

  it('뿌리와 목표가 같아도 NaN 없이 해를 돌려준다', () => {
    const { joint, end } = solveTwoBone(root, root, 15, 14, 'forward');
    expect(Number.isFinite(joint.x)).toBe(true);
    expect(Number.isFinite(joint.y)).toBe(true);
    expect(end).toEqual(root);
  });
});

describe('베이크 오프셋', () => {
  it('스프린트는 크랭크 수평에서 힙이 올라가고 사점에서 내려온다', () => {
    expect(bakedPoseOffsets('sprint', 0).hipDy).toBe(-1);
    expect(bakedPoseOffsets('sprint', Math.PI).hipDy).toBe(-1);
    expect(bakedPoseOffsets('sprint', Math.PI / 2).hipDy).toBe(1);
    expect(bakedPoseOffsets('sprint', (3 * Math.PI) / 2).hipDy).toBe(1);
  });

  it('스프린트 어깨는 2θ, 오르막 어깨는 θ 주기로 좌우 번갈아 움직인다', () => {
    expect(bakedPoseOffsets('sprint', Math.PI / 4).shoulderDx).toBe(1);
    expect(bakedPoseOffsets('sprint', (3 * Math.PI) / 4).shoulderDx).toBe(-1);
    expect(bakedPoseOffsets('climb', Math.PI / 2).shoulderDx).toBe(1);
    expect(bakedPoseOffsets('climb', (3 * Math.PI) / 2).shoulderDx).toBe(-1);
  });

  it('착좌·에어로는 프레임 오프셋이 없다', () => {
    for (let a = 0; a < TWO_PI; a += 0.3) {
      expect(bakedPoseOffsets('seated', a)).toEqual({ hipDy: 0, shoulderDx: 0 });
      expect(bakedPoseOffsets('tuck', a)).toEqual({ hipDy: 0, shoulderDx: 0 });
    }
  });
});

describe('리뷰 회귀: 프레임 경계와 정지', () => {
  it('30fps x4에서 상사점 위상을 건너뛰어도 자세가 전환된다', () => {
    const state = runConstant(CRUISE_PROGRESS_PER_SEC * 4, 5, 'sprint', { speedMult: 4 });
    state.crankAngle = Math.PI * 1.5 - 0.01;
    step(state, state.progress + CRUISE_PROGRESS_PER_SEC * 4 / 30, 'climb', { speedMult: 4, deltaMs: 1000 / 30 });
    expect(crankPhaseIndex(state)).toBeGreaterThan(CRANK_TDC_PHASE);
    expect(state.posture).toBe('climb');
    expect(state.pendingPosture).toBeUndefined();
  });

  it('x4 스프린트에서 변조를 포함한 실제 회전도 프레임당 한 위상 이하이다', () => {
    const state = runConstant(CRUISE_PROGRESS_PER_SEC * 4, 5, 'sprint', { speedMult: 4 });
    expect(crankRevPerSec(state) * 60).toBeCloseTo(MAX_DISPLAY_CADENCE_RPM, 0);
    for (let i = 0; i < 120; i++) {
      const previous = state.crankAngle;
      const previousPhase = crankPhaseIndex(state);
      step(state, state.progress + CRUISE_PROGRESS_PER_SEC * 4 / 60, 'sprint', { speedMult: 4 });
      expect(state.crankAngle - previous).toBeLessThanOrEqual(TWO_PI / CRANK_PHASES + 1e-9);
      expect((crankPhaseIndex(state) - previousPhase + CRANK_PHASES) % CRANK_PHASES).toBeLessThanOrEqual(1);
    }
  });

  it.each([30, 60, 120])('%ifps: 정착 시작 후 250ms 안에 수평으로 멈추고 다시 돌지 않는다', (fps) => {
    const state = createMotionState(Math.PI - 0.001, 'tuck');
    state.crankRadPerSec = 0.2;
    for (let i = 0; i < Math.ceil(fps / 4) + 1; i++) step(state, 0, 'tuck', { deltaMs: 1000 / fps });
    expect(state.crankRadPerSec).toBe(0);
    expect(state.crankAngle % Math.PI).toBeCloseTo(0, 8);
    const angle = state.crankAngle;
    for (let i = 0; i < fps; i++) step(state, 0, 'tuck', { deltaMs: 1000 / fps });
    expect(state.crankAngle).toBe(angle);
    step(state, 0.001, 'seated', { deltaMs: 1000 / fps });
    step(state, 0.002, 'seated', { deltaMs: 1000 / fps });
    expect(state.crankAngle).toBeGreaterThan(angle);
  });
});
