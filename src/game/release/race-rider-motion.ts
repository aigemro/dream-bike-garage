// 레이스 라이더 운동 모델 (Phaser 비의존).
// 레이스 시뮬레이션이 확정한 진행률 타임라인을 "바퀴 각속도 → 케이던스 → 자세 → 지면 스크롤"
// 하나의 물리적 연결로 바꿉니다. 모든 시간은 화면(실제) 시간 ms이며, 배속은 speedMult로 전달합니다.
// - 굴림 결합: 지면 스크롤 px/s = 바퀴 각속도 × 바퀴 반지름(px). 바퀴가 도는 만큼만 땅이 흘러갑니다.
// - 시각 회전수: 실제 자전거(≈470 rev/km)의 8~10%만 돌립니다. 플레이어 순항 속도가 1.8 rev/s가 되도록
//   레이스 시작 시 플레이어 속도 점수에서 rev/km를 역산하므로, 성장 단계와 무관하게 티어 경계가 안정됩니다.
// - 케이던스: 실제 라이더가 기어를 바꿔 케이던스를 유지하듯 자세별 목표 rpm(착좌 85 / 오르막 68 / 스퍼트 110)을
//   따르고, 출발 스핀업 동안은 바퀴 속도에 비례해 올라갑니다. 내리막·완주 후는 코스팅(크랭크 정지).
// - 관성: 각속도는 비대칭 1차 저역 필터(가속 600ms / 감속 1200ms / 완주 코스팅 1800ms)로 따라가
//   600ms 틱 노이즈(±9%)를 흡수하고 출발·완주가 급하게 보이지 않게 합니다.
// - 배속(x2/x4): 바퀴·지면은 그대로 빨라지고(blur 티어), 다리는 1.3×/1.5×만 빨라지며 150rpm에서 멈춥니다.
//   24위상 크랭크가 60fps에서 프레임당 1위상 이상 건너뛰지 않게 하는 상한입니다.
// - 위상 양자화: 바퀴 24위상(15°), 크랭크 24위상(15°). 8스포크 바퀴는 45° 대칭이라 스포크 자체는 3장만
//   고유하고, 회전 인지는 림 안쪽 골드 반사판(24위상)이 담당합니다.
// 각도 규약: 화면 좌표(y 아래 방향). 라이더는 +x(오른쪽)로 달리며, 전진 시 각도가 증가합니다
// (θ=0 근경 페달 앞, π/2 아래(하사점), π 뒤, 3π/2 위(상사점) → 화면상 시계 방향).
import { segmentAt, type RaceSegmentId } from './race-progress';

export type RiderPosture = 'seated' | 'climb' | 'tuck' | 'sprint';
export const RIDER_POSTURES: readonly RiderPosture[] = ['seated', 'climb', 'tuck', 'sprint'];

/** 플레이어 순항(스타트 직선, 배속 x1) 바퀴 회전 속도 목표. 지면 1.8×2π×18px ≈ 204px/s */
export const TARGET_CRUISE_WHEEL_REV_PER_SEC = 1.8;
export const WHEEL_PHASES = 24;
export const CRANK_PHASES = 24;
/** 자세별 목표 케이던스(rpm) */
export const CADENCE_RPM: Record<RiderPosture, number> = { seated: 85, climb: 68, tuck: 0, sprint: 110 };
/** 화면에 보이는 케이던스 상한(rpm): 24위상 × 2.5rev/s = 60 전환/s */
export const MAX_DISPLAY_CADENCE_RPM = 150;
/** 데드스폿 변조 k: 12시·6시 부근에서 살짝 느려져 '밟는' 리듬을 만듭니다 (ω(θ) = ω̄·(1 + k·cos2θ)) */
export const DEAD_SPOT_K: Record<RiderPosture, number> = { seated: 0.05, climb: 0.12, tuck: 0, sprint: 0.08 };
/** 스무딩 시상수(ms, 화면 시간) */
export const MOTION_TAU_MS = { wheelUp: 600, wheelDown: 1200, wheelFinish: 1800, crank: 450, crankStop: 300 };
/** 바퀴 표현 티어 경계(rev/s)와 히스테리시스 */
export const WHEEL_TIER_LIMITS = { crisp: 0.8, blur: 2.2, hysteresis: 0.1 };
/** blur 티어 글린트(반사 호)의 시각 회전 속도 상한 */
export const GLINT_MAX_REV_PER_SEC = 1.0;
export const GLINT_PHASES = 8;
/** 피니시 스퍼트 구간 중 이 진행률부터 안장에서 일어나 스탠딩 스프린트를 합니다. */
export const SPRINT_STAND_FROM = 0.85;
/** 출발 직후 이 진행률까지는 스탠딩 스타트(스프린트 자세)로 힘차게 출발합니다. */
export const STANDING_START_UNTIL = 0.03;
/** 크랭크 상사점 위상 인덱스(270°). 자세 전환은 다리 형태 차가 가장 작은 이 위상에서만 적용합니다. */
export const CRANK_TDC_PHASE = (CRANK_PHASES * 3) / 4;

export type WheelTier = 'crisp' | 'fast' | 'blur';

const TWO_PI = Math.PI * 2;

/** 히스테리시스 없는 순수 티어 판정(경계값 = 상위 티어) */
export function wheelTierFor(revPerSec: number): WheelTier {
  const speed = Math.abs(revPerSec);
  if (speed < WHEEL_TIER_LIMITS.crisp) return 'crisp';
  if (speed < WHEEL_TIER_LIMITS.blur) return 'fast';
  return 'blur';
}

/** 현재 티어를 유지하려는 히스테리시스 판정: 경계 ±hysteresis 안에서는 바뀌지 않습니다. */
export function nextWheelTier(current: WheelTier, revPerSec: number): WheelTier {
  const h = WHEEL_TIER_LIMITS.hysteresis;
  const speed = Math.abs(revPerSec);
  if (current === 'crisp') {
    if (speed >= WHEEL_TIER_LIMITS.blur + h) return 'blur';
    return speed >= WHEEL_TIER_LIMITS.crisp + h ? 'fast' : 'crisp';
  }
  if (current === 'fast') {
    if (speed < WHEEL_TIER_LIMITS.crisp - h) return 'crisp';
    return speed >= WHEEL_TIER_LIMITS.blur + h ? 'blur' : 'fast';
  }
  if (speed < WHEEL_TIER_LIMITS.crisp - h) return 'crisp';
  return speed < WHEEL_TIER_LIMITS.blur - h ? 'fast' : 'blur';
}

/**
 * 플레이어 속도 점수(m/tick)에서 코스 1km당 시각 회전수를 역산합니다.
 * 같은 값을 모든 레이서에 적용하므로 NPC와의 속도 차가 바퀴·지면에 그대로 드러납니다.
 */
export function wheelRevsPerKmForCruise(speedScorePerTick: number, tickMs: number, targetRevPerSec = TARGET_CRUISE_WHEEL_REV_PER_SEC): number {
  const metersPerSec = speedScorePerTick / (tickMs / 1000);
  if (!(metersPerSec > 0)) return 0;
  return (targetRevPerSec / metersPerSec) * 1000;
}

/** 배속에 따른 케이던스 압축 계수: x1=1.0, x2=1.3, x4=1.5 (선형 보간) */
export function cadenceBoostFor(speedMult: number): number {
  if (speedMult <= 1) return 1;
  if (speedMult <= 2) return 1 + 0.3 * (speedMult - 1);
  return Math.min(1.5, 1.3 + 0.1 * (speedMult - 2));
}

/** 구간 → 자세. 스퍼트 구간은 마지막 15%만 스탠딩, 그 전은 착좌 고케이던스입니다. */
export function postureForSegment(segmentId: RaceSegmentId, progress: number): RiderPosture {
  if (segmentId === 'climb') return 'climb';
  if (segmentId === 'descent') return 'tuck';
  if (segmentId === 'sprint' && progress >= SPRINT_STAND_FROM) return 'sprint';
  return 'seated';
}

/** 진행률 → 자세. 출발 직후는 스탠딩 스타트, 완주(≥1) 후에는 착좌 코스팅으로 돌아갑니다. */
export function postureAt(progress: number): RiderPosture {
  if (progress >= 1) return 'seated';
  if (progress < STANDING_START_UNTIL) return 'sprint';
  return postureForSegment(segmentAt(progress).id, progress);
}

export type RiderMotionState = {
  wheelAngle: number;
  wheelRadPerSec: number;
  crankAngle: number;
  crankRadPerSec: number;
  /** blur 티어 글린트 호의 각도(속도 상한 적용) */
  glintAngle: number;
  progress: number;
  tier: WheelTier;
  /** 현재 프레임에 적용된 자세 */
  posture: RiderPosture;
  /** 상사점에서 적용을 기다리는 자세 */
  pendingPosture?: RiderPosture;
  /** 자세 전환 대기 시간(ms). 너무 오래 기다리면 강제 적용 */
  pendingMs: number;
  /** 코스팅 정착 목표를 한 번만 잡아 잔여 각속도로 다시 회전하지 않게 합니다. */
  coastTarget?: number;
  coastStart?: number;
  coastElapsedMs?: number;
};

export function createMotionState(crankAngle = 0, posture: RiderPosture = 'seated'): RiderMotionState {
  return { wheelAngle: 0, wheelRadPerSec: 0, crankAngle, crankRadPerSec: 0, glintAngle: 0, progress: 0, tier: 'crisp', posture, pendingMs: 0 };
}

export type MotionInput = {
  /** 이번 프레임의 진행률(0~1) */
  progress: number;
  /** 화면(실제) 시간 경과 ms — 배속을 곱하지 않은 값 */
  deltaMs: number;
  /** 중계 배속(x1/x2/x4). 진행률은 이미 배속으로 빨리 흐르므로 케이던스 압축·스핀업 기준에만 씁니다 */
  speedMult?: number;
  distanceMeters: number;
  /** 코스 1km당 시각 바퀴 회전수 (wheelRevsPerKmForCruise) */
  revsPerKm: number;
  /** 요청 자세(상사점에서 적용) */
  posture: RiderPosture;
  /** 완주 등으로 페달을 멈추고 굴러가는 상태 */
  coasting?: boolean;
};

const COAST_SETTLE_REV_PER_SEC = 0.25;
const COAST_SETTLE_MS = 250;
const PENDING_POSTURE_MAX_MS = 900;
/** 이보다 느린 각속도는 화면에서 구별되지 않으므로 목표가 0일 때 0으로 스냅합니다(0.003 rev/s) */
const MIN_VISIBLE_RAD_PER_SEC = 0.02;

function normalizeAngle(angle: number): number {
  return ((angle % TWO_PI) + TWO_PI) % TWO_PI;
}

function smooth(current: number, target: number, deltaMs: number, tauMs: number): number {
  return current + (target - current) * (1 - Math.exp(-deltaMs / tauMs));
}

/**
 * 한 프레임 진행. state를 갱신하고 그대로 돌려줍니다. deltaMs가 0 이하이면 아무 것도 바꾸지 않습니다.
 */
export function advanceMotion(state: RiderMotionState, input: MotionInput): RiderMotionState {
  const dt = input.deltaMs / 1000;
  if (!(dt > 0)) return state;
  const speedMult = input.speedMult ?? 1;
  const moved = Math.max(0, input.progress - state.progress);
  state.progress = input.progress;

  // ─ 바퀴: 이동 거리(km) × rev/km × 2π ÷ 시간 → 비대칭 스무딩
  const targetWheel = (moved * (input.distanceMeters / 1000) * input.revsPerKm * TWO_PI) / dt;
  const wheelTau = input.coasting ? MOTION_TAU_MS.wheelFinish : targetWheel >= state.wheelRadPerSec ? MOTION_TAU_MS.wheelUp : MOTION_TAU_MS.wheelDown;
  state.wheelRadPerSec = smooth(state.wheelRadPerSec, targetWheel, input.deltaMs, wheelTau);
  if (targetWheel === 0 && state.wheelRadPerSec < MIN_VISIBLE_RAD_PER_SEC) state.wheelRadPerSec = 0;
  state.wheelAngle += state.wheelRadPerSec * dt;
  state.glintAngle += Math.min(state.wheelRadPerSec, GLINT_MAX_REV_PER_SEC * TWO_PI) * dt;
  state.tier = nextWheelTier(state.tier, state.wheelRadPerSec / TWO_PI);

  // ─ 자세 전환: 요청이 바뀌면 상사점(또는 정지·타임아웃)에서 적용
  const previousAngle = state.crankAngle;
  if (input.posture !== state.posture) {
    if (state.pendingPosture !== input.posture) {
      state.pendingPosture = input.posture;
      state.pendingMs = 0;
    }
  } else {
    state.pendingPosture = undefined;
    state.pendingMs = 0;
  }

  // ─ 크랭크: 자세별 목표 rpm × 배속 압축 × 스핀업 램프
  const cadence = input.coasting ? 0 : CADENCE_RPM[state.posture];
  const boosted = Math.min(MAX_DISPLAY_CADENCE_RPM, cadence * cadenceBoostFor(speedMult));
  const cruiseRad = TARGET_CRUISE_WHEEL_REV_PER_SEC * TWO_PI * speedMult;
  const ramp = cruiseRad > 0 ? Math.min(1, state.wheelRadPerSec / (0.6 * cruiseRad)) : 0;
  const targetCrank = (boosted / 60) * TWO_PI * ramp;
  const crankTau = targetCrank === 0 ? MOTION_TAU_MS.crankStop : MOTION_TAU_MS.crank;
  state.crankRadPerSec = smooth(state.crankRadPerSec, targetCrank, input.deltaMs, crankTau);
  if (targetCrank === 0 && state.crankRadPerSec < MIN_VISIBLE_RAD_PER_SEC) state.crankRadPerSec = 0;
  const k = DEAD_SPOT_K[state.posture];
  const maxCrankRad = MAX_DISPLAY_CADENCE_RPM / 60 * TWO_PI;
  if (targetCrank > 0) {
    state.coastTarget = undefined;
    state.coastStart = undefined;
    state.coastElapsedMs = undefined;
  }
  if (state.coastTarget === undefined) {
    state.crankAngle += Math.min(maxCrankRad, state.crankRadPerSec * (1 + k * Math.cos(2 * state.crankAngle))) * dt;
  }

  // ─ 코스팅 정착: 거의 멈추면 진행 방향의 다음 수평 위상(0 또는 π)으로 250ms에 걸쳐 이동(역회전 없음)
  if (targetCrank === 0 && state.crankRadPerSec < COAST_SETTLE_REV_PER_SEC * TWO_PI) {
    if (state.coastTarget === undefined) {
      state.coastStart = state.crankAngle;
      state.coastTarget = Math.ceil((state.crankAngle - 1e-9) / Math.PI) * Math.PI;
      state.coastElapsedMs = 0;
    }
    state.coastElapsedMs = Math.min(COAST_SETTLE_MS, (state.coastElapsedMs ?? 0) + input.deltaMs);
    const fraction = state.coastElapsedMs / COAST_SETTLE_MS;
    state.crankAngle = state.coastStart! + (state.coastTarget - state.coastStart!) * fraction;
    if (fraction === 1) state.crankRadPerSec = 0;
  }

  // ─ 대기 중인 자세 적용
  if (state.pendingPosture) {
    state.pendingMs += input.deltaMs;
    const tdc = TWO_PI * CRANK_TDC_PHASE / CRANK_PHASES;
    const crossedTdc = Math.floor((state.crankAngle - tdc) / TWO_PI) > Math.floor((previousAngle - tdc) / TWO_PI);
    const stopped = state.crankRadPerSec < 1e-3;
    if (crossedTdc || stopped || state.pendingMs >= PENDING_POSTURE_MAX_MS) {
      state.posture = state.pendingPosture;
      state.pendingPosture = undefined;
      state.pendingMs = 0;
    }
  }
  return state;
}

export function wheelRevPerSec(state: RiderMotionState): number {
  return state.wheelRadPerSec / TWO_PI;
}

export function crankRevPerSec(state: RiderMotionState): number {
  return state.crankRadPerSec / TWO_PI;
}

/** 굴림 조건: 지면이 흘러가는 속도(px/s) */
export function groundSpeedPx(state: RiderMotionState, wheelRadiusPx: number): number {
  return state.wheelRadPerSec * wheelRadiusPx;
}

/** 각도 → 위상 인덱스(0 ≤ i < phases). 음수·2π 초과 각도도 정규화합니다. */
export function phaseIndex(angle: number, phases: number): number {
  const normalized = normalizeAngle(angle);
  return Math.min(phases - 1, Math.floor((normalized / TWO_PI) * phases));
}

export function wheelPhaseIndex(state: RiderMotionState): number {
  return phaseIndex(state.wheelAngle, WHEEL_PHASES);
}

export function crankPhaseIndex(state: RiderMotionState): number {
  return phaseIndex(state.crankAngle, CRANK_PHASES);
}

export function glintPhaseIndex(state: RiderMotionState): number {
  return phaseIndex(state.glintAngle, GLINT_PHASES);
}

/** 위상 인덱스 → 대표 각도(위상 구간의 중앙) */
export function phaseAngle(index: number, phases: number): number {
  return ((index + 0.5) / phases) * TWO_PI;
}

// ─── 2-본 IK (다리·팔) ─────────────────────────────────────────────────

export type Vec2 = { x: number; y: number };
export type BendPreference = 'forward' | 'backward' | 'down' | 'up';

export type TwoBoneSolution = {
  /** 무릎·팔꿈치 */
  joint: Vec2;
  /** 실제 끝점(도달 불가 시 한계 지점) */
  end: Vec2;
  /** 목표 거리 / 두 마디 합. 1 이하면 자연 길이로 도달 */
  reach: number;
  reachable: boolean;
  /** 관절 내각(라디안). π = 완전히 펴짐 */
  jointAngle: number;
};

/**
 * 뿌리(root)에서 목표(target)까지 길이 l1·l2의 두 마디를 놓습니다. 마디는 절대 늘리지 않습니다.
 * 목표가 멀면 끝점을 도달 한계(펴진 상태)에 두고 reachable=false를 돌려줍니다(리그 정합 테스트가 잡습니다).
 * 두 해 중 prefer 방향(화면 좌표: forward=+x, down=+y)으로 관절이 놓이는 쪽을 고릅니다.
 */
export function solveTwoBone(root: Vec2, target: Vec2, l1: number, l2: number, prefer: BendPreference): TwoBoneSolution {
  const dx = target.x - root.x;
  const dy = target.y - root.y;
  const distance = Math.hypot(dx, dy);
  const total = l1 + l2;
  const reach = distance / total;
  let end: Vec2 = { ...target };
  if (distance > total) end = { x: root.x + (dx / distance) * total, y: root.y + (dy / distance) * total };
  const ex = end.x - root.x;
  const ey = end.y - root.y;
  const d = Math.max(1e-6, Math.hypot(ex, ey));
  const ux = ex / d;
  const uy = ey / d;
  // 코사인 법칙: 뿌리에서 관절 투영 거리 a, 수직 높이 h
  const a = Math.min(l1, Math.max(-l1, (l1 * l1 - l2 * l2 + d * d) / (2 * d)));
  const h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  const baseX = root.x + ux * a;
  const baseY = root.y + uy * a;
  const candidates: Vec2[] = [
    { x: baseX - uy * h, y: baseY + ux * h },
    { x: baseX + uy * h, y: baseY - ux * h },
  ];
  const score = (p: Vec2) => {
    if (prefer === 'forward') return p.x;
    if (prefer === 'backward') return -p.x;
    if (prefer === 'down') return p.y;
    return -p.y;
  };
  const joint = score(candidates[0]) >= score(candidates[1]) ? candidates[0] : candidates[1];
  const cosAngle = Math.min(1, Math.max(-1, (l1 * l1 + l2 * l2 - d * d) / (2 * l1 * l2)));
  return { joint, end, reach, reachable: distance <= total + 1e-9, jointAngle: Math.acos(cosAngle) };
}

// ─── 프레임에 베이크하는 노력 표현 ─────────────────────────────────────

export type BakedPoseOffsets = {
  /** 힙 y 오프셋(셀, 음수 = 위). 스탠딩 스프린트에서 크랭크 수평일 때 가장 높고 사점에서 가장 낮음 */
  hipDy: number;
  /** 어깨 x 오프셋(셀). 스프린트는 2θ, 오르막은 θ 주기로 좌우 번갈아 당김 */
  shoulderDx: number;
};

/**
 * 크랭크 각도에 따른 자세별 베이크 오프셋. 컨테이너 회전·바운스 없이 프레임 안에서 몸만 요동치게 하여
 * 픽셀 격자와 접지(바퀴·그림자)를 유지합니다. 정수 셀 단위입니다.
 */
export function bakedPoseOffsets(posture: RiderPosture, crankAngle: number): BakedPoseOffsets {
  if (posture === 'sprint') {
    // 크랭크 수평(θ=0, π)에서 cos2θ=1 → 힙 -1(위), 사점(θ=π/2, 3π/2)에서 cos2θ=-1 → 힙 +1(아래)
    return { hipDy: Math.round(-0.7 * Math.cos(2 * crankAngle)), shoulderDx: Math.round(Math.sin(2 * crankAngle)) };
  }
  if (posture === 'climb') {
    return { hipDy: 0, shoulderDx: Math.round(Math.sin(crankAngle)) };
  }
  return { hipDy: 0, shoulderDx: 0 };
}
