// 머지 작업대 규칙 (머지 코어 E안 · 순수 로직, Phaser 비의존)
// - 부품 상자를 열면 보드 가운데에서 바깥 순서로 정해진 다음 칸에 부품 1개가 들어옵니다.
// - 부품은 옮길 수 없고, 상하좌우로 맞닿은 같은 종류·같은 레벨 2개를 합성합니다.
// - 주문 요구 레벨 이상 부품이 생기면 바로 장착하고, 4종이 모두 장착되면 그 자리에서 납품을 확정합니다.
// - 상자는 알바 체력 1을 쓰며, 체력은 실제 시간으로 회복합니다. 연쇄 합성 보너스로 무료 상자·필수 부품 확정을 받습니다.
// 코인·Day 통계는 이 모듈이 다루지 않습니다. 호출 측이 'delivered' 이벤트를 받아 한 번만 반영합니다.

export const WORKBENCH_PART_TYPES = ['frame', 'wheel', 'drivetrain', 'handlebar'] as const;
export type WorkbenchPartType = (typeof WORKBENCH_PART_TYPES)[number];
export type WorkbenchPart = { type: WorkbenchPartType; level: number };
export type WorkbenchCell = WorkbenchPart | null;

export const WORKBENCH_COLUMNS = 6;
export const WORKBENCH_ROWS = 7;
export const WORKBENCH_CELLS = WORKBENCH_COLUMNS * WORKBENCH_ROWS;
export const WORKBENCH_MAX_LEVEL = 4;
export const ENERGY_MAX = 30;
export const ENERGY_RECOVERY_MS = 10 * 60 * 1000;
// 상자를 열지 않고 이어서 합성한 횟수(연쇄)가 기준에 닿으면 보너스를 받습니다.
export const COMBO_FREE_BOX = 3;
export const COMBO_GUARANTEE = 5;
// 미장착 부품이 이 횟수만큼 연속으로 안 나오면 다음 상자에서 미장착 부품을 보장합니다.
const MISS_LIMIT = 4;

/** 주문 1건의 부품별 요구 레벨과 납품 보상. 주문 목록은 호출 측(게임 데이터)이 넘깁니다. */
export type WorkbenchOrder = { levels: Record<WorkbenchPartType, number>; reward: number };
/**
 * 영업일 순서대로 설계된 주문표. 누적 주문 순번이 주문표 끝을 지나면 `repeatFrom` 위치부터 끝까지를 반복합니다
 * (설계가 끝난 뒤에도 후반 난이도·보상이 유지되고, 첫날 튜토리얼 주문으로 돌아가지 않습니다).
 */
export type WorkbenchSchedule = { readonly orders: readonly WorkbenchOrder[]; readonly repeatFrom: number };
/** 작업대가 받는 주문 목록. 배열이면 처음부터 끝까지 순환하고, 주문표면 `repeatFrom` 규칙으로 반복합니다. */
export type WorkbenchOrders = readonly WorkbenchOrder[] | WorkbenchSchedule;
export type Installed = Record<WorkbenchPartType, boolean>;

/** 되돌리기로 복구하는 범위. 체력·입고 기록은 되돌리지 않습니다. */
export type WorkbenchSnapshot = {
  board: WorkbenchCell[];
  installed: Installed;
  order: number;
  combo: number;
  freeBoxes: number;
  guarantees: number;
};

export type WorkbenchState = WorkbenchSnapshot & {
  version: 1;
  energy: number;
  // 체력 회복 기준 시각(ms). 가득 찬 상태에서는 현재 시각으로 옮겨 시간을 쌓지 않습니다.
  energyAnchor: number;
  misses: number;
  undo: WorkbenchSnapshot | null;
};

export type WorkbenchEvent =
  | { type: 'placed'; index: number; part: WorkbenchPart; free: boolean; guaranteed: boolean }
  | { type: 'merged'; from: number; to: number; part: WorkbenchPart; combo: number }
  | { type: 'bonus'; bonus: 'free-box' | 'guarantee'; combo: number }
  | { type: 'installed'; from: number; part: WorkbenchPart; order: number }
  // order: 납품한 주문의 순번(누적). orderIndex는 주문 목록 안의 위치입니다.
  | { type: 'delivered'; order: number; orderIndex: number; reward: number };

export type SupplyBlock = 'full' | 'energy';

const noneInstalled = (): Installed => ({ frame: false, wheel: false, drivetrain: false, handlebar: false });

const isSchedule = (orders: WorkbenchOrders): orders is WorkbenchSchedule => !Array.isArray(orders);

/** 주문 목록을 평평한 배열로 돌려줍니다. */
export function orderListOf(orders: WorkbenchOrders): readonly WorkbenchOrder[] {
  return isSchedule(orders) ? orders.orders : orders;
}

/**
 * 누적 주문 순번을 주문 목록 위치로 바꿉니다.
 * - 배열: 끝에 닿으면 처음부터 순환합니다(이전 동작).
 * - 주문표: 끝에 닿으면 `repeatFrom`부터 끝까지만 반복합니다. 설계 구간 안에서는 순번이 곧 위치입니다.
 */
export function orderIndexOf(order: number, orders: WorkbenchOrders): number {
  const list = orderListOf(orders);
  if (list.length === 0) return 0;
  if (!isSchedule(orders)) return ((order % list.length) + list.length) % list.length;
  const sequence = Math.max(0, Math.floor(order));
  if (sequence < list.length) return sequence;
  const repeatFrom = Math.min(list.length - 1, Math.max(0, Math.floor(orders.repeatFrom)));
  const span = list.length - repeatFrom;
  return repeatFrom + ((sequence - list.length) % span);
}

// 다음 입고 순서: 보드 가운데(2.5열, 3행)에서 가까운 칸부터 바깥 고리로 나갑니다.
// 같은 고리 안에서는 12시 방향부터 시계 방향으로 돌아 나선형으로 채웁니다.
export const INTAKE_ORDER: readonly number[] = Array.from({ length: WORKBENCH_CELLS }, (_, index) => {
  const dx = (index % WORKBENCH_COLUMNS) - (WORKBENCH_COLUMNS - 1) / 2;
  const dy = Math.floor(index / WORKBENCH_COLUMNS) - (WORKBENCH_ROWS - 1) / 2;
  return { index, distance: dx * dx + dy * dy, angle: (Math.atan2(dx, -dy) + 2 * Math.PI) % (2 * Math.PI) };
})
  .sort((a, b) => a.distance - b.distance || a.angle - b.angle)
  .map((cell) => cell.index);

/** 다음 입고 칸. 빈칸이 없으면 -1 */
export function nextIntakeSlot(board: readonly WorkbenchCell[]): number {
  return INTAKE_ORDER.find((index) => !board[index]) ?? -1;
}

/** 첫 주문(어반 로드: 프레임·휠셋 Lv.2, 구동계·핸들바 Lv.1)을 지급 부품만으로 마칠 수 있는 시작 보드 */
export function starterBoard(): WorkbenchCell[] {
  const board: WorkbenchCell[] = Array(WORKBENCH_CELLS).fill(null);
  [0, 1, 6].forEach((index) => { board[index] = { type: 'frame', level: 1 }; });
  [2, 3, 8].forEach((index) => { board[index] = { type: 'wheel', level: 1 }; });
  board[4] = { type: 'drivetrain', level: 1 };
  board[5] = { type: 'handlebar', level: 1 };
  return board;
}

/** 새 작업대. order는 이어서 시작할 주문 순번입니다(기존 진행이 있는 플레이어의 주문 순서를 잇습니다). */
export function createWorkbench(orders: WorkbenchOrders, now: number, order = 0): WorkbenchState {
  const state: WorkbenchState = {
    version: 1,
    board: starterBoard(),
    installed: noneInstalled(),
    order: Math.max(0, Math.floor(order)),
    combo: 0,
    freeBoxes: 0,
    guarantees: 0,
    energy: ENERGY_MAX,
    energyAnchor: now,
    misses: 0,
    undo: null,
  };
  settle(state, orders, []); // 시작 보드에 이미 요구 레벨인 부품은 바로 장착합니다.
  return state;
}

/** 실제 시간 ENERGY_RECOVERY_MS마다 체력 1 회복. 가득 찬 뒤의 시간은 쌓지 않고, 시계가 뒤로 가면 기준만 옮깁니다. */
export function recoverEnergy(state: WorkbenchState, now: number) {
  if (now < state.energyAnchor || state.energy >= ENERGY_MAX) {
    state.energyAnchor = now;
    return;
  }
  const ticks = Math.floor((now - state.energyAnchor) / ENERGY_RECOVERY_MS);
  state.energy = Math.min(ENERGY_MAX, state.energy + ticks);
  state.energyAnchor = state.energy === ENERGY_MAX ? now : state.energyAnchor + ticks * ENERGY_RECOVERY_MS;
}

/** 다음 체력 +1까지 남은 시간(ms). 가득 차 있으면 0 */
export function msUntilNextEnergy(state: WorkbenchState, now: number): number {
  if (state.energy >= ENERGY_MAX) return 0;
  return Math.max(0, ENERGY_RECOVERY_MS - (now - state.energyAnchor));
}

/**
 * 입고 부품 추첨: Lv.1 80%·Lv.2 20%, 70%는 아직 장착하지 않은 부품에서 고릅니다.
 * 미장착 부품이 MISS_LIMIT회 연속 안 나왔거나 확정 보너스가 있으면 미장착 부품을 보장합니다.
 */
export function rollPart(installed: Installed, misses: number, rng: () => number, guaranteed: boolean) {
  const needs = WORKBENCH_PART_TYPES.filter((type) => !installed[type]);
  const applied = guaranteed && needs.length > 0;
  const focus = needs.length > 0 && (applied || misses >= MISS_LIMIT || rng() < 0.7);
  const pool = focus ? needs : WORKBENCH_PART_TYPES;
  const type = pool[Math.min(pool.length - 1, Math.floor(rng() * pool.length))];
  const level = rng() < 0.2 ? 2 : 1;
  return { part: { type, level }, misses: needs.includes(type) ? 0 : misses + 1, guaranteed: applied };
}

// 요구 레벨 이상 부품 중 가장 낮은 레벨을 먼저 쓰고, 레벨이 같으면 칸 순서가 빠른 부품을 씁니다.
function pickInstall(board: readonly WorkbenchCell[], type: WorkbenchPartType, level: number): number {
  let best = -1;
  board.forEach((part, index) => {
    if (part && part.type === type && part.level >= level && (best < 0 || part.level < board[best]!.level)) best = index;
  });
  return best;
}

// 장착 → 납품 → 다음 주문 장착을 더 진행할 수 없을 때까지 정리합니다.
// 한 행동에서는 납품을 1건만 확정합니다. 이월 부품으로 다음 주문까지 바로 완성되면 장착까지만 하고,
// 그 납품은 다음 행동의 첫 정리에서 확정합니다(급여·Day 집계가 행동마다 1건씩 반영되고, 하루 마감 뒤 주문이 밀리지 않게).
// 납품마다 부품 4개가 소비되므로 반복은 반드시 끝나며, 안전장치로 횟수를 제한합니다.
function settle(state: WorkbenchState, orders: WorkbenchOrders, events: WorkbenchEvent[]) {
  const list = orderListOf(orders);
  if (list.length === 0) return;
  let delivered = 0;
  for (let guard = 0; guard <= WORKBENCH_CELLS; guard += 1) {
    const orderIndex = orderIndexOf(state.order, orders);
    const spec = list[orderIndex];
    for (const type of WORKBENCH_PART_TYPES) {
      if (state.installed[type]) continue;
      const from = pickInstall(state.board, type, spec.levels[type]);
      if (from < 0) continue;
      const part = state.board[from]!;
      state.board[from] = null;
      state.installed[type] = true;
      events.push({ type: 'installed', from, part: { ...part }, order: state.order });
    }
    if (!WORKBENCH_PART_TYPES.every((type) => state.installed[type])) return;
    if (delivered >= 1) return;
    events.push({ type: 'delivered', order: state.order, orderIndex, reward: spec.reward });
    delivered += 1;
    state.order += 1;
    state.installed = noneInstalled();
    state.misses = 0;
  }
}

// 납품은 급여 지급과 함께 확정되므로, 납품이 포함된 행동은 되돌리기 대상에서 뺍니다.
function closeUndoIfDelivered(state: WorkbenchState, events: WorkbenchEvent[]) {
  if (events.some((event) => event.type === 'delivered')) state.undo = null;
}

export function supplyBlock(state: WorkbenchState): SupplyBlock | null {
  if (nextIntakeSlot(state.board) < 0) return 'full';
  if (state.freeBoxes < 1 && state.energy < 1) return 'energy';
  return null;
}

/** 부품 상자를 열어 다음 입고 칸에 부품 1개를 넣습니다. 무료 상자가 있으면 체력 대신 씁니다. 열 수 없으면 null */
export function openPartBox(state: WorkbenchState, orders: WorkbenchOrders, now: number, rng: () => number = Math.random): WorkbenchEvent[] | null {
  recoverEnergy(state, now);
  const index = nextIntakeSlot(state.board);
  if (supplyBlock(state)) return null;
  const roll = rollPart(state.installed, state.misses, rng, state.guarantees > 0);
  const free = state.freeBoxes > 0;
  if (free) state.freeBoxes -= 1;
  else {
    if (state.energy >= ENERGY_MAX) state.energyAnchor = now;
    state.energy -= 1;
  }
  if (roll.guaranteed) state.guarantees -= 1;
  state.misses = roll.misses;
  state.board[index] = roll.part;
  state.combo = 0;
  state.undo = null;
  const events: WorkbenchEvent[] = [{ type: 'placed', index, part: { ...roll.part }, free, guaranteed: roll.guaranteed }];
  settle(state, orders, events);
  return events;
}

const validCell = (index: number) => Number.isInteger(index) && index >= 0 && index < WORKBENCH_CELLS;

/** 상하좌우로 맞닿은 칸 */
export function neighbors(index: number): number[] {
  if (!validCell(index)) return [];
  const row = Math.floor(index / WORKBENCH_COLUMNS);
  const column = index % WORKBENCH_COLUMNS;
  return [
    row > 0 ? index - WORKBENCH_COLUMNS : -1,
    column > 0 ? index - 1 : -1,
    column < WORKBENCH_COLUMNS - 1 ? index + 1 : -1,
    row < WORKBENCH_ROWS - 1 ? index + WORKBENCH_COLUMNS : -1,
  ].filter((cell) => cell >= 0);
}

export function canMerge(board: readonly WorkbenchCell[], from: number, to: number): boolean {
  const source = board[from];
  const target = board[to];
  return neighbors(from).includes(to) && !!source && !!target
    && source.type === target.type && source.level === target.level && source.level < WORKBENCH_MAX_LEVEL;
}

/** 선택한 칸과 합성할 수 있는 이웃 칸 */
export function mergeTargets(board: readonly WorkbenchCell[], from: number): number[] {
  return neighbors(from).filter((to) => canMerge(board, from, to));
}

function snapshot(state: WorkbenchSnapshot): WorkbenchSnapshot {
  return {
    board: state.board.map((part) => (part ? { ...part } : null)),
    installed: { ...state.installed },
    order: state.order,
    combo: state.combo,
    freeBoxes: state.freeBoxes,
    guarantees: state.guarantees,
  };
}

/** 이웃한 같은 부품 2개를 대상 칸(to)에서 합성합니다. 연쇄 기준에 닿으면 보너스를 지급합니다. 합성할 수 없으면 null */
export function mergeParts(state: WorkbenchState, orders: WorkbenchOrders, from: number, to: number): WorkbenchEvent[] | null {
  if (!canMerge(state.board, from, to)) return null;
  state.undo = snapshot(state);
  const part = { type: state.board[from]!.type, level: state.board[from]!.level + 1 };
  state.board[to] = part;
  state.board[from] = null;
  state.combo += 1;
  const events: WorkbenchEvent[] = [{ type: 'merged', from, to, part: { ...part }, combo: state.combo }];
  if (state.combo === COMBO_FREE_BOX) {
    state.freeBoxes += 1;
    events.push({ type: 'bonus', bonus: 'free-box', combo: state.combo });
  }
  if (state.combo === COMBO_GUARANTEE) {
    state.guarantees += 1;
    events.push({ type: 'bonus', bonus: 'guarantee', combo: state.combo });
  }
  settle(state, orders, events);
  closeUndoIfDelivered(state, events);
  return events;
}

/** 부품을 버려 자리를 만듭니다. 체력은 돌려주지 않고 연쇄는 끊지 않습니다. */
export function discardPart(state: WorkbenchState, index: number): boolean {
  if (!validCell(index) || !state.board[index]) return false;
  state.undo = snapshot(state);
  state.board[index] = null;
  return true;
}

/** 직전 합성·반품 1회를 장착·연쇄 보너스까지 함께 되돌립니다. 새 상자를 열거나 납품하면 되돌릴 수 없습니다. */
export function undoLast(state: WorkbenchState): boolean {
  if (!state.undo) return false;
  Object.assign(state, snapshot(state.undo));
  state.undo = null;
  return true;
}

// ── 저장·복구 ──
const isInteger = (value: unknown, min: number, max = Number.MAX_SAFE_INTEGER): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= min && value <= max;

function validPart(value: unknown): boolean {
  if (value === null) return true;
  if (!value || typeof value !== 'object') return false;
  const part = value as WorkbenchPart;
  return WORKBENCH_PART_TYPES.includes(part.type) && isInteger(part.level, 1, WORKBENCH_MAX_LEVEL);
}

function validSnapshot(value: unknown): value is WorkbenchSnapshot {
  if (!value || typeof value !== 'object') return false;
  const state = value as WorkbenchSnapshot;
  return Array.isArray(state.board) && state.board.length === WORKBENCH_CELLS && state.board.every(validPart)
    && !!state.installed && typeof state.installed === 'object'
    && WORKBENCH_PART_TYPES.every((type) => typeof state.installed[type] === 'boolean')
    && isInteger(state.order, 0) && isInteger(state.combo, 0) && isInteger(state.freeBoxes, 0) && isInteger(state.guarantees, 0);
}

/**
 * 저장된 작업대(JSON 문자열 또는 객체)를 복구합니다. 저장이 없거나 손상됐으면 fallbackOrder 주문부터 새 작업대로 시작합니다.
 * 체력은 저장 이후 흐른 실제 시간만큼 회복합니다.
 */
export function parseWorkbench(saved: unknown, orders: WorkbenchOrders, now: number, fallbackOrder = 0): WorkbenchState {
  try {
    const value = (typeof saved === 'string' ? JSON.parse(saved) : saved) as Partial<WorkbenchState> | null | undefined;
    if (!value || value.version !== 1 || !validSnapshot(value as unknown)
      || !isInteger(value.energy, 0, ENERGY_MAX) || !isInteger(value.energyAnchor, 0) || !isInteger(value.misses, 0)) {
      return createWorkbench(orders, now, fallbackOrder);
    }
    const state: WorkbenchState = {
      ...snapshot(value as WorkbenchSnapshot),
      version: 1,
      energy: value.energy,
      energyAnchor: value.energyAnchor,
      misses: value.misses,
      undo: validSnapshot(value.undo) ? snapshot(value.undo) : null,
    };
    recoverEnergy(state, now);
    return state;
  } catch {
    return createWorkbench(orders, now, fallbackOrder);
  }
}
