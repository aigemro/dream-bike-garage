// 머지 작업대(머지 코어 E안) 규칙 단위 테스트
import { describe, expect, it } from 'vitest';
import {
  COMBO_FREE_BOX,
  COMBO_GUARANTEE,
  ENERGY_MAX,
  ENERGY_RECOVERY_MS,
  INTAKE_ORDER,
  WORKBENCH_CELLS,
  canMerge,
  createWorkbench,
  discardPart,
  mergeParts,
  mergeTargets,
  msUntilNextEnergy,
  neighbors,
  nextIntakeSlot,
  openPartBox,
  parseWorkbench,
  recoverEnergy,
  rollPart,
  supplyBlock,
  undoLast,
  type WorkbenchOrder,
  type WorkbenchState,
} from '../src/domain/merge-workbench';

// 메인 주문 3종과 같은 요구 레벨·보상
const ORDERS: WorkbenchOrder[] = [
  { levels: { frame: 2, wheel: 2, drivetrain: 1, handlebar: 1 }, reward: 1000 },
  { levels: { frame: 3, wheel: 2, drivetrain: 2, handlebar: 1 }, reward: 1400 },
  { levels: { frame: 2, wheel: 3, drivetrain: 2, handlebar: 2 }, reward: 1800 },
];
const NOW = 1_000_000;
const sequence = (...values: number[]) => { let index = 0; return () => values[index++ % values.length]; };
const clearBoard = (state: WorkbenchState) => { state.board = state.board.map(() => null); };

describe('입고 순서', () => {
  it('보드 가운데에서 바깥 고리로, 같은 고리는 12시부터 시계 방향으로 채운다', () => {
    expect(INTAKE_ORDER.slice(0, 4)).toEqual([21, 20, 15, 27]);
    expect(new Set(INTAKE_ORDER).size).toBe(WORKBENCH_CELLS);
  });

  it('다음 입고 칸은 순서상 첫 빈칸이고, 빈칸이 없으면 -1', () => {
    const board = Array(WORKBENCH_CELLS).fill(null);
    board[21] = { type: 'frame', level: 1 };
    expect(nextIntakeSlot(board)).toBe(20);
    expect(nextIntakeSlot(board.map(() => ({ type: 'frame', level: 1 })))).toBe(-1);
  });
});

describe('시작 작업대', () => {
  it('첫 주문의 Lv.1 구동계·핸들바는 시작과 함께 장착된다', () => {
    const state = createWorkbench(ORDERS, NOW);
    expect(state.installed).toEqual({ frame: false, wheel: false, drivetrain: true, handlebar: true });
    expect(state.energy).toBe(ENERGY_MAX);
  });

  it('지급 부품만 합성해 첫 주문을 납품할 수 있고, 납품은 정확히 한 번 확정된다', () => {
    const state = createWorkbench(ORDERS, NOW);
    expect(mergeParts(state, ORDERS, 0, 1)).toEqual([
      { type: 'merged', from: 0, to: 1, part: { type: 'frame', level: 2 }, combo: 1 },
      { type: 'installed', from: 1, part: { type: 'frame', level: 2 }, order: 0 },
    ]);
    const events = mergeParts(state, ORDERS, 2, 3)!;
    expect(events.filter((event) => event.type === 'delivered')).toEqual([{ type: 'delivered', order: 0, orderIndex: 0, reward: 1000 }]);
    expect(state.order).toBe(1);
    expect(state.installed).toEqual({ frame: false, wheel: false, drivetrain: false, handlebar: false });
  });

  it('이어서 시작할 주문 순번을 받으면 그 주문의 요구 레벨로 장착한다', () => {
    const state = createWorkbench(ORDERS, NOW, 4);
    expect(state.order).toBe(4);
    expect(state.installed).toEqual({ frame: false, wheel: false, drivetrain: false, handlebar: true });
  });
});

describe('합성', () => {
  it('상하좌우로 맞닿은 같은 종류·같은 레벨만 합성하고, 줄 끝을 넘어 이웃으로 보지 않는다', () => {
    expect(neighbors(5)).toEqual([4, 11]);
    expect(neighbors(6)).toEqual([0, 7, 12]);
    const state = createWorkbench(ORDERS, NOW);
    clearBoard(state);
    state.board[5] = { type: 'wheel', level: 1 };
    state.board[6] = { type: 'wheel', level: 1 };
    state.board[11] = { type: 'wheel', level: 1 };
    state.board[12] = { type: 'wheel', level: 2 };
    expect(canMerge(state.board, 5, 6)).toBe(false);
    expect(canMerge(state.board, 6, 12)).toBe(false);
    expect(mergeTargets(state.board, 5)).toEqual([11]);
    state.board[0] = { type: 'frame', level: 4 };
    state.board[1] = { type: 'frame', level: 4 };
    expect(canMerge(state.board, 0, 1)).toBe(false);
    expect(mergeParts(state, ORDERS, 0, 1)).toBeNull();
  });

  it('요구 레벨 이상 부품 중 가장 낮은 레벨을 먼저 장착한다', () => {
    const state = createWorkbench(ORDERS, NOW, 1);
    clearBoard(state);
    // 휠셋을 남겨 두어 장착 직후 납품·다음 주문 장착이 이어지지 않게 합니다.
    state.installed = { frame: false, wheel: false, drivetrain: true, handlebar: true };
    state.board[0] = { type: 'frame', level: 4 };
    state.board[10] = { type: 'frame', level: 2 };
    state.board[11] = { type: 'frame', level: 2 };
    const events = mergeParts(state, ORDERS, 10, 11)!;
    expect(events.find((event) => event.type === 'installed')).toMatchObject({ from: 11, part: { level: 3 } });
    expect(state.board[0]).toEqual({ type: 'frame', level: 4 });
  });

  it('상자를 열지 않고 이어 합성하면 3연쇄에 무료 상자, 5연쇄에 필수 부품 확정을 받는다', () => {
    const state = createWorkbench(ORDERS, NOW, 1);
    clearBoard(state);
    // 프레임 Lv.3만 남겨 합성 중 납품이 일어나지 않게 합니다. 구동계는 이미 장착된 상태입니다.
    state.installed = { frame: false, wheel: true, drivetrain: true, handlebar: true };
    for (let row = 0; row < 5; row += 1) {
      state.board[row * 6] = { type: 'drivetrain', level: 1 };
      state.board[row * 6 + 1] = { type: 'drivetrain', level: 1 };
    }
    const bonuses = [0, 1, 2, 3, 4].flatMap((row) => mergeParts(state, ORDERS, row * 6, row * 6 + 1)!.filter((event) => event.type === 'bonus'));
    expect(bonuses).toEqual([
      { type: 'bonus', bonus: 'free-box', combo: COMBO_FREE_BOX },
      { type: 'bonus', bonus: 'guarantee', combo: COMBO_GUARANTEE },
    ]);
    expect(state).toMatchObject({ freeBoxes: 1, guarantees: 1, combo: 5 });
  });
});

describe('부품 상자', () => {
  it('체력 1을 쓰고 다음 입고 칸에 부품을 넣으며, 연쇄와 되돌리기 기록을 끊는다', () => {
    const state = createWorkbench(ORDERS, NOW);
    state.combo = 2;
    discardPart(state, 6);
    const events = openPartBox(state, ORDERS, NOW, sequence(0.9, 0.6, 0.5))!;
    expect(events[0]).toEqual({ type: 'placed', index: 21, part: { type: 'drivetrain', level: 1 }, free: false, guaranteed: false });
    expect(state).toMatchObject({ energy: ENERGY_MAX - 1, combo: 0, undo: null });
  });

  it('무료 상자가 있으면 체력 대신 쓰고, 확정 보너스는 미장착 부품을 보장한다', () => {
    const state = createWorkbench(ORDERS, NOW);
    state.freeBoxes = 1;
    state.guarantees = 1;
    const events = openPartBox(state, ORDERS, NOW, sequence(0.99, 0.5))!;
    expect(events[0]).toMatchObject({ type: 'placed', free: true, guaranteed: true });
    expect(['frame', 'wheel']).toContain((events[0] as { part: { type: string } }).part.type);
    expect(state).toMatchObject({ energy: ENERGY_MAX, freeBoxes: 0, guarantees: 0 });
  });

  it('보드가 가득 차거나 체력이 없으면 열지 않는다', () => {
    const state = createWorkbench(ORDERS, NOW);
    state.energy = 0;
    state.energyAnchor = NOW;
    expect(supplyBlock(state)).toBe('energy');
    expect(openPartBox(state, ORDERS, NOW)).toBeNull();
    state.energy = 5;
    state.board = state.board.map(() => ({ type: 'frame', level: 4 }));
    expect(supplyBlock(state)).toBe('full');
    expect(openPartBox(state, ORDERS, NOW)).toBeNull();
  });

  it('미장착 부품이 4번 연속 안 나오면 다음 상자에서 보장한다', () => {
    const installed = { frame: true, wheel: true, drivetrain: true, handlebar: false };
    expect(rollPart(installed, 0, sequence(0.9, 0.3, 0.5), false)).toMatchObject({ part: { type: 'wheel', level: 1 }, misses: 1 });
    expect(rollPart(installed, 4, sequence(0.1, 0.1), false)).toMatchObject({ part: { type: 'handlebar', level: 2 }, misses: 0 });
  });
});

describe('되돌리기·반품', () => {
  it('직전 합성·반품을 장착까지 함께 되돌린다', () => {
    const state = createWorkbench(ORDERS, NOW);
    mergeParts(state, ORDERS, 0, 1);
    expect(state.installed.frame).toBe(true);
    expect(undoLast(state)).toBe(true);
    expect(state.installed.frame).toBe(false);
    expect(state.board[0]).toEqual({ type: 'frame', level: 1 });
    expect(undoLast(state)).toBe(false);
    expect(discardPart(state, 6)).toBe(true);
    expect(state.board[6]).toBeNull();
    undoLast(state);
    expect(state.board[6]).toEqual({ type: 'frame', level: 1 });
    expect(discardPart(state, 30)).toBe(false);
  });

  it('납품이 확정된 행동은 되돌릴 수 없다', () => {
    const state = createWorkbench(ORDERS, NOW);
    mergeParts(state, ORDERS, 0, 1);
    mergeParts(state, ORDERS, 2, 3);
    expect(state.order).toBe(1);
    expect(undoLast(state)).toBe(false);
  });
});

describe('알바 체력', () => {
  it('10분마다 1 회복하고, 가득 찬 뒤 시간은 쌓지 않으며, 시계가 뒤로 가면 기준만 옮긴다', () => {
    const state = createWorkbench(ORDERS, NOW);
    state.energy = 10;
    state.energyAnchor = NOW;
    recoverEnergy(state, NOW + ENERGY_RECOVERY_MS * 2 + 5000);
    expect(state.energy).toBe(12);
    expect(msUntilNextEnergy(state, NOW + ENERGY_RECOVERY_MS * 2 + 5000)).toBe(ENERGY_RECOVERY_MS - 5000);
    recoverEnergy(state, NOW + ENERGY_RECOVERY_MS * 100);
    expect(state.energy).toBe(ENERGY_MAX);
    expect(msUntilNextEnergy(state, NOW)).toBe(0);
    state.energy = 3;
    recoverEnergy(state, NOW);
    expect(state).toMatchObject({ energy: 3, energyAnchor: NOW });
  });

  it('가득 찬 상태에서 상자를 열면 그 시점부터 회복 시간을 잰다', () => {
    const state = createWorkbench(ORDERS, NOW);
    openPartBox(state, ORDERS, NOW + 50_000, sequence(0.5));
    expect(state).toMatchObject({ energy: ENERGY_MAX - 1, energyAnchor: NOW + 50_000 });
  });
});

describe('저장·복구', () => {
  it('저장한 작업대를 그대로 복구하고, 저장 이후 흐른 시간만큼 체력을 회복한다', () => {
    const state = createWorkbench(ORDERS, NOW, 2);
    state.energy = 5;
    state.energyAnchor = NOW;
    state.board[7] = { type: 'frame', level: 1 };
    mergeParts(state, ORDERS, 6, 7);
    const restored = parseWorkbench(JSON.stringify(state), ORDERS, NOW + ENERGY_RECOVERY_MS);
    expect(restored.board).toEqual(state.board);
    expect(restored.undo).toEqual(state.undo);
    expect(restored).toMatchObject({ order: 2, energy: 6 });
  });

  it('저장이 없거나 손상됐으면 이어갈 주문부터 새 작업대로 시작한다', () => {
    expect(parseWorkbench(null, ORDERS, NOW, 5).order).toBe(5);
    expect(parseWorkbench(undefined, ORDERS, NOW, 2).order).toBe(2);
    expect(parseWorkbench(createWorkbench(ORDERS, NOW, 8), ORDERS, NOW).order).toBe(8);
    expect(parseWorkbench('{broken', ORDERS, NOW).order).toBe(0);
    const tampered = createWorkbench(ORDERS, NOW, 1) as unknown as Record<string, unknown>;
    tampered.energy = 999;
    expect(parseWorkbench(JSON.stringify(tampered), ORDERS, NOW, 7).order).toBe(7);
    const badPart = createWorkbench(ORDERS, NOW) as unknown as { board: unknown[] };
    badPart.board[0] = { type: 'saddle', level: 1 };
    expect(parseWorkbench(JSON.stringify(badPart), ORDERS, NOW, 3).order).toBe(3);
  });
});

describe('한 행동 납품 1건', () => {
  it('이월 부품으로 다음 주문까지 완성돼도 납품은 다음 행동의 첫 정리에서 확정한다', () => {
    const EASY: WorkbenchOrder[] = [
      { levels: { frame: 2, wheel: 1, drivetrain: 1, handlebar: 1 }, reward: 100 },
      { levels: { frame: 1, wheel: 1, drivetrain: 1, handlebar: 1 }, reward: 200 },
    ];
    const state = createWorkbench(EASY, NOW);
    clearBoard(state);
    state.installed = { frame: false, wheel: true, drivetrain: true, handlebar: true };
    // 합성할 프레임 Lv.1 2개 + 다음 주문을 바로 채우는 Lv.1 4종
    state.board[0] = { type: 'frame', level: 1 };
    state.board[1] = { type: 'frame', level: 1 };
    state.board[12] = { type: 'frame', level: 1 };
    state.board[13] = { type: 'wheel', level: 1 };
    state.board[14] = { type: 'drivetrain', level: 1 };
    state.board[15] = { type: 'handlebar', level: 1 };
    const events = mergeParts(state, EASY, 0, 1)!;
    expect(events.filter((event) => event.type === 'delivered')).toEqual([{ type: 'delivered', order: 0, orderIndex: 0, reward: 100 }]);
    // 다음 주문은 장착까지만 되고 납품은 보류된다
    expect(state.order).toBe(1);
    expect(state.installed).toEqual({ frame: true, wheel: true, drivetrain: true, handlebar: true });
    const next = openPartBox(state, EASY, NOW, sequence(0.5))!;
    expect(next.find((event) => event.type === 'delivered')).toMatchObject({ order: 1, orderIndex: 1, reward: 200 });
    expect(state.order).toBe(2);
  });
});
