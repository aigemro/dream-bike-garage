// Day 세션 규칙 (순수 로직, Phaser·저장소 비의존)
// 하루 일정은 주문 N건(기본 3건)을 납품하면 끝나고 정산합니다(#77 C안). 플레이 제한은 작업대의 알바 체력 하나이며,
// Day에는 시간 제한이 없습니다. 활성 플레이 시간은 정산 화면의 '영업 시간' 표시용으로만 기록합니다.
// 상태: ready(준비) → active(영업 중) ⇄ paused(일시정지) → closing(마지막 납품 확정·정산 대기) → settlement(정산) → 다음 Day ready

export const DAY_ORDER_TARGET = 3;
const MAX_DAY_ORDER_TARGET = 20;
// 정산 이력은 최근 14일만 보관합니다.
export const MAX_DAY_HISTORY = 14;

export type DayStatus = 'ready' | 'active' | 'paused' | 'closing' | 'settlement';
export type DayPauseReason = 'background' | 'screen-navigation' | 'restore';

export type DayState = {
  dayNumber: number;
  status: DayStatus;
  // 오늘 납품할 주문 수. Day를 시작할 때 고정해 진행 중 설정이 바뀌어도 오늘 목표는 그대로입니다.
  orderTarget: number;
  ordersCompleted: number;
  earnings: number;
  elapsedActiveMs: number;
  startedAt: string | null;
  pauseReason: DayPauseReason | null;
};

export type DayHistoryEntry = {
  dayNumber: number;
  ordersCompleted: number;
  earnings: number;
  elapsedActiveMs: number;
  endedAt: string;
};

const STATUSES: DayStatus[] = ['ready', 'active', 'paused', 'closing', 'settlement'];
const PAUSE_REASONS: DayPauseReason[] = ['background', 'screen-navigation', 'restore'];
// 일시정지 중에 확정된 납품(예: 화면을 떠나는 순간 끝난 합성)도 잃지 않도록 함께 기록합니다.
const RECORDING_STATUSES: DayStatus[] = ['active', 'paused'];

const finite = (value: unknown, fallback: number) => (typeof value === 'number' && Number.isFinite(value) ? value : fallback);
const wholeAtLeast = (value: unknown, min: number, fallback: number) => Math.max(min, Math.floor(finite(value, fallback)));

export function normalizeOrderTarget(value: unknown): number {
  return Math.min(MAX_DAY_ORDER_TARGET, wholeAtLeast(value, 1, DAY_ORDER_TARGET));
}

export function createReadyDay(dayNumber = 1, orderTarget = DAY_ORDER_TARGET): DayState {
  return {
    dayNumber: wholeAtLeast(dayNumber, 1, 1),
    status: 'ready',
    orderTarget: normalizeOrderTarget(orderTarget),
    ordersCompleted: 0,
    earnings: 0,
    elapsedActiveMs: 0,
    startedAt: null,
    pauseReason: null,
  };
}

/** 준비 상태의 Day만 시작합니다. */
export function startDay(day: DayState, startedAt: string): DayState {
  if (day.status !== 'ready') return day;
  return { ...day, status: 'active', startedAt };
}

export function pauseDay(day: DayState, reason: DayPauseReason): DayState {
  if (day.status !== 'active') return day;
  return { ...day, status: 'paused', pauseReason: reason };
}

export function resumeDay(day: DayState): DayState {
  if (day.status !== 'paused') return day;
  return { ...day, status: 'active', pauseReason: null };
}

/** 상자 열기·합성·반품 같은 플레이 입력은 영업 중에만 받습니다. */
export function canAcceptPlayInput(day: DayState): boolean {
  return day.status === 'active';
}

/** 영업 중 플레이 시간을 기록합니다(정산 표시용, 제한에는 쓰지 않음). */
export function trackActiveTime(day: DayState, deltaMs: number): DayState {
  if (day.status !== 'active' || !(deltaMs > 0)) return day;
  return { ...day, elapsedActiveMs: day.elapsedActiveMs + deltaMs };
}

export type DayDeliveryResult = { day: DayState; counted: boolean; targetReached: boolean };

/**
 * 작업대가 확정한 납품 1건을 오늘 통계에 반영합니다. 코인 지급은 호출 측이 따로 합니다.
 * 오늘 주문 수를 채우면 closing으로 넘겨 새 입력을 막고 정산을 기다립니다.
 */
export function recordOrderDelivery(day: DayState, reward: number): DayDeliveryResult {
  if (!RECORDING_STATUSES.includes(day.status)) return { day, counted: false, targetReached: false };
  const next: DayState = {
    ...day,
    ordersCompleted: day.ordersCompleted + 1,
    earnings: day.earnings + Math.max(0, Math.floor(finite(reward, 0))),
  };
  const targetReached = next.ordersCompleted >= day.orderTarget;
  return { day: targetReached ? { ...next, status: 'closing', pauseReason: null } : next, counted: true, targetReached };
}

export type DaySettlementResult = { day: DayState; history: DayHistoryEntry[]; settled: boolean };

/** 마감된 Day를 정산합니다. 같은 Day 번호의 이력은 한 번만 남깁니다. */
export function settleDay(day: DayState, history: readonly DayHistoryEntry[], endedAt: string): DaySettlementResult {
  if (day.status !== 'closing') return { day, history: [...history], settled: false };
  const settled: DayState = { ...day, status: 'settlement', pauseReason: null };
  if (history.some((entry) => entry.dayNumber === day.dayNumber)) return { day: settled, history: [...history], settled: true };
  const entry: DayHistoryEntry = {
    dayNumber: day.dayNumber,
    ordersCompleted: day.ordersCompleted,
    earnings: day.earnings,
    elapsedActiveMs: day.elapsedActiveMs,
    endedAt,
  };
  return { day: settled, history: [...history, entry].slice(-MAX_DAY_HISTORY), settled: true };
}

/** 정산을 마친 뒤에만 다음 Day 준비로 넘어갑니다. */
export function prepareNextDay(day: DayState, orderTarget = DAY_ORDER_TARGET): DayState {
  if (day.status !== 'settlement') return day;
  return createReadyDay(day.dayNumber + 1, orderTarget);
}

/**
 * 저장된 Day를 다시 열 때의 안전 규칙: 영업 중이던 Day는 일시정지로 엽니다.
 * closing은 호출 측이 바로 정산하고, settlement는 호출 측이 다음 Day로 넘깁니다(코인은 납품 때 이미 반영됨).
 */
export function normalizeRestoredDay(day: DayState): DayState {
  return day.status === 'active' ? { ...day, status: 'paused', pauseReason: 'restore' } : day;
}

export type DaySessionSave = { current: DayState; history: DayHistoryEntry[] };

/** 저장 데이터를 안전한 값으로 보정합니다. 손상됐으면 fallbackDayNumber의 준비 상태로 시작합니다. */
export function parseDaySession(value: unknown, fallbackDayNumber = 1): DaySessionSave {
  const fallback = { current: createReadyDay(fallbackDayNumber), history: [] };
  if (!value || typeof value !== 'object') return fallback;
  const save = value as Partial<DaySessionSave>;
  const current = save.current as Partial<DayState> | undefined;
  if (!current || typeof current !== 'object') return fallback;
  return {
    current: {
      dayNumber: wholeAtLeast(current.dayNumber, 1, fallbackDayNumber),
      status: STATUSES.includes(current.status as DayStatus) ? current.status as DayStatus : 'ready',
      orderTarget: normalizeOrderTarget(current.orderTarget),
      ordersCompleted: wholeAtLeast(current.ordersCompleted, 0, 0),
      earnings: wholeAtLeast(current.earnings, 0, 0),
      elapsedActiveMs: Math.max(0, finite(current.elapsedActiveMs, 0)),
      startedAt: typeof current.startedAt === 'string' ? current.startedAt : null,
      pauseReason: PAUSE_REASONS.includes(current.pauseReason as DayPauseReason) ? current.pauseReason as DayPauseReason : null,
    },
    history: Array.isArray(save.history)
      ? save.history
        .filter((entry): entry is DayHistoryEntry => !!entry && typeof entry === 'object' && finite((entry as DayHistoryEntry).dayNumber, 0) >= 1)
        .map((entry) => ({
          dayNumber: Math.floor(entry.dayNumber),
          ordersCompleted: wholeAtLeast(entry.ordersCompleted, 0, 0),
          earnings: wholeAtLeast(entry.earnings, 0, 0),
          elapsedActiveMs: Math.max(0, finite(entry.elapsedActiveMs, 0)),
          endedAt: typeof entry.endedAt === 'string' ? entry.endedAt : new Date(0).toISOString(),
        }))
        .slice(-MAX_DAY_HISTORY)
      : [],
  };
}

// 화면 공용 시간 표기(mm:ss). 1분 이상도 그대로 표기하고, 1초 미만은 올림해 보여 줍니다.
export function formatDayClock(milliseconds: number): string {
  const totalSeconds = Math.max(0, Math.ceil(milliseconds / 1000));
  return `${String(Math.floor(totalSeconds / 60)).padStart(2, '0')}:${String(totalSeconds % 60).padStart(2, '0')}`;
}

// 종료 임박 강조 기준: Day 길이의 10% (최소 3초)
export function isDayUrgent(remainingMs: number, durationMs: number): boolean {
  return remainingMs <= Math.max(3000, durationMs * 0.1);
}
