// 릴리스 진행 저장 상태 (순수 로직 · Phaser 비의존)
// v4: 머지 코어 E안 작업대와 Day 세션(주문 3건 = 하루 일정, #77 C안)을 같은 저장 항목에 둡니다.
// 납품 1건의 코인·Day 통계·작업대 변화가 한 번의 저장으로 함께 기록됩니다.
import { createWorkbench, orderIndexOf, parseWorkbench, type WorkbenchState } from '../../domain/merge-workbench';
import { createReadyDay, normalizeRestoredDay, parseDaySession, prepareNextDay, type DayHistoryEntry, type DayState } from '../../domain/day-session';
import { firstSequenceOfDay } from '../../domain/progression';
import { WORKBENCH_SCHEDULE } from './workbench-orders';

export const RELEASE_STORAGE_KEY = 'dbg-lab-mvp-release-integration-v1';

export type ReleaseState = {
  version: 4;
  coins: number;
  completedOrders: number;
  // 현재 주문의 주문 목록 위치 (작업대 주문 순번에서 계산해 홈·정산 표시에 씁니다)
  orderIndex: number;
  tutorialDone: boolean;
  bgm: boolean;
  sfx: boolean;
  vibration: boolean;
  lastRaceDay: number | null;
  raceEntryDay: number | null;
  day: DayState;
  dayHistory: DayHistoryEntry[];
  workbench: WorkbenchState;
};

// v2: 시작 코인을 0으로 바꿔 첫 주문 급여 → 드림 바이크 강화의 인과관계가 보이게 한다
export function createReleaseState(now = Date.now()): ReleaseState {
  return {
    version: 4,
    coins: 0,
    completedOrders: 0,
    orderIndex: 0,
    tutorialDone: false,
    bgm: true,
    sfx: true,
    vibration: false,
    lastRaceDay: null,
    raceEntryDay: null,
    day: createReadyDay(1),
    dayHistory: [],
    workbench: createWorkbench(WORKBENCH_SCHEDULE, now),
  };
}

/**
 * Day 상태가 가리키는 누적 주문 순번: 영업 d일차의 첫 주문 + 오늘 납품 수.
 * 주문표는 영업일 기준으로 설계되므로, 작업대 순번은 항상 이 값과 같아야 합니다.
 */
export function expectedOrderSequence(day: DayState): number {
  return firstSequenceOfDay(day.dayNumber) + day.ordersCompleted;
}

/**
 * 작업대 순번을 Day 상태에 맞춥니다. 작업대는 한 행동에 납품 1건만 확정하므로 정상 플레이에서는 항상 같고,
 * 이전 저장 형식이나 손상된 저장에서 순번이 어긋났을 때만 다음 영업일의 주문표가 밀리지 않게 바로잡습니다.
 * 순번이 바뀌면 장착 상태(이전 주문 사양 기준)와 되돌리기 기록을 비워 다음 행동에서 보드 부품으로 다시 장착합니다.
 */
export function alignWorkbenchToDay(workbench: WorkbenchState, day: DayState): boolean {
  const expected = expectedOrderSequence(day);
  if (workbench.order === expected) return false;
  workbench.order = expected;
  workbench.installed = { frame: false, wheel: false, drivetrain: false, handlebar: false };
  workbench.undo = null;
  return true;
}

const optionalDay = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? Math.max(1, Math.floor(value)) : null);
const flag = (value: unknown, fallback: boolean) => (typeof value === 'boolean' ? value : fallback);
const whole = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0);

/**
 * 저장된 진행을 v4로 복구합니다.
 * - v2·v3(주문 1건 = 1 Day): 코인·납품 수·Day 번호·대회 기록을 그대로 잇고, 그 영업일의 주문표 첫 주문부터 새 작업대를 지급합니다.
 * - 영업 중이던 Day는 일시정지로 열고, 정산까지 끝난 Day는 다음 Day 준비로 엽니다(급여는 납품 때 이미 받음).
 * - 마감(closing) 상태는 그대로 두어 다음 플레이 진입 때 정산합니다.
 * - 작업대 순번은 Day 상태(영업일·오늘 납품 수)에 맞춥니다(주문표가 영업일 기준이므로).
 */
export function restoreReleaseState(raw: string | null, now = Date.now()): ReleaseState {
  let saved: Record<string, unknown> | null;
  try { saved = JSON.parse(raw ?? 'null') as Record<string, unknown> | null; } catch { return createReleaseState(now); }
  if (!saved || typeof saved !== 'object' || ![2, 3, 4].includes(saved.version as number)) return createReleaseState(now);
  const legacyDayNumber = Math.max(1, whole(saved.dayNumber));
  const v4 = saved.version === 4;
  const session = parseDaySession(v4 ? { current: saved.day, history: saved.dayHistory } : null, legacyDayNumber);
  let day = normalizeRestoredDay(session.current);
  if (day.status === 'settlement') day = prepareNextDay(day);
  const workbench = parseWorkbench(v4 ? saved.workbench : null, WORKBENCH_SCHEDULE, now, expectedOrderSequence(day));
  alignWorkbenchToDay(workbench, day);
  return {
    version: 4,
    coins: whole(saved.coins),
    completedOrders: whole(saved.completedOrders),
    orderIndex: orderIndexOf(workbench.order, WORKBENCH_SCHEDULE),
    tutorialDone: flag(saved.tutorialDone, false),
    bgm: flag(saved.bgm, true),
    sfx: flag(saved.sfx, true),
    vibration: flag(saved.vibration, false),
    lastRaceDay: optionalDay(saved.lastRaceDay),
    raceEntryDay: optionalDay(saved.raceEntryDay),
    day,
    dayHistory: session.history,
    workbench,
  };
}
