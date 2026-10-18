// 머지 작업대 합성 추천 보조 규칙 단위 테스트 (Lab #264 B안)
import { describe, expect, it } from 'vitest';
import {
  WORKBENCH_CELLS,
  WORKBENCH_COLUMNS,
  WORKBENCH_PART_TYPES,
  createWorkbench,
  type WorkbenchOrder,
  type WorkbenchState,
} from '../src/domain/merge-workbench';
import { HINT_EMPTY_THRESHOLD, HINT_IDLE_MS, hasMerge, isStuck, recommendMerge, shouldShowHint } from '../src/domain/merge-assist';

const ORDERS: WorkbenchOrder[] = [
  { levels: { frame: 2, wheel: 2, drivetrain: 1, handlebar: 1 }, reward: 1000 },
  { levels: { frame: 3, wheel: 2, drivetrain: 2, handlebar: 1 }, reward: 1400 },
];
const NOW = 1_000_000;

// 상하좌우로 같은 부품이 맞닿지 않게 채운 꽉 찬 보드: 종류 = (열 + 2 × 행) % 4, 모두 Lv.1
function stuckWorkbench(): WorkbenchState {
  const state = createWorkbench(ORDERS, NOW);
  state.board = Array.from({ length: WORKBENCH_CELLS }, (_, index) => ({
    type: WORKBENCH_PART_TYPES[(index % WORKBENCH_COLUMNS + 2 * Math.floor(index / WORKBENCH_COLUMNS)) % 4],
    level: 1,
  }));
  return state;
}

// 빈 보드에 구동계·핸들바만 장착된 첫 주문 상태
function emptyWorkbench(): WorkbenchState {
  const state = createWorkbench(ORDERS, NOW);
  state.board = state.board.map(() => null);
  state.installed = { frame: false, wheel: false, drivetrain: true, handlebar: true };
  return state;
}

describe('막힘 판정', () => {
  it('꽉 찼고 합성할 쌍이 없을 때만 막힘이다', () => {
    const state = stuckWorkbench();
    expect(hasMerge(state.board)).toBe(false);
    expect(isStuck(state)).toBe(true);
    state.board[1] = { type: 'frame', level: 1 }; // 0번 칸(프레임 Lv.1)과 맞닿은 같은 부품
    expect(isStuck(state)).toBe(false);
    const open = stuckWorkbench();
    open.board[20] = null;
    expect(isStuck(open)).toBe(false);
  });
});

describe('합성 추천', () => {
  it('합성할 쌍이 없으면 추천하지 않는다', () => {
    expect(recommendMerge(stuckWorkbench(), ORDERS)).toBeNull();
  });

  it('납품이 일어나는 쌍을 먼저 추천하고, 같은 상태면 항상 같은 쌍을 고른다', () => {
    const state = emptyWorkbench();
    state.installed.frame = true; // 휠셋만 남은 상태
    state.board[0] = { type: 'drivetrain', level: 1 }; // 이미 장착된 구동계 쌍(합쳐도 납품 없음)
    state.board[1] = { type: 'drivetrain', level: 1 };
    state.board[20] = { type: 'wheel', level: 1 }; // 합치면 휠셋 Lv.2 장착 → 납품
    state.board[21] = { type: 'wheel', level: 1 };
    const pick = recommendMerge(state, ORDERS);
    expect(pick).toMatchObject({ from: 20, to: 21, reason: 'deliver', part: { type: 'wheel', level: 1 } });
    expect(recommendMerge(state, ORDERS)).toEqual(pick);
  });

  it('추천 계산은 작업대 상태를 바꾸지 않는다', () => {
    const state = emptyWorkbench();
    state.board[0] = { type: 'frame', level: 1 };
    state.board[1] = { type: 'frame', level: 1 };
    const before = JSON.stringify(state);
    recommendMerge(state, ORDERS);
    expect(JSON.stringify(state)).toBe(before);
  });

  it('납품이 없으면 바로 장착되는 쌍을 먼저 추천한다', () => {
    const state = emptyWorkbench();
    state.board[0] = { type: 'frame', level: 1 }; // 합치면 프레임 Lv.2 장착
    state.board[1] = { type: 'frame', level: 1 };
    [12, 13, 14, 18, 19, 20].forEach((index) => { state.board[index] = { type: 'drivetrain', level: 1 }; }); // 장착이 끝난 종류
    expect(recommendMerge(state, ORDERS)).toMatchObject({ from: 0, to: 1, reason: 'install' });
  });

  it('장착도 없으면 합성 뒤에 합성 쌍이 더 많이 남는 쌍을 추천한다', () => {
    const state = emptyWorkbench();
    [12, 13, 14].forEach((index) => { state.board[index] = { type: 'drivetrain', level: 1 }; }); // 한 줄 3개: 하나를 합치면 쌍이 사라짐
    state.board[30] = { type: 'handlebar', level: 1 }; // 떨어진 한 쌍: 합쳐도 구동계 쌍 2개가 남음
    state.board[31] = { type: 'handlebar', level: 1 };
    expect(recommendMerge(state, ORDERS)).toMatchObject({ from: 30, to: 31, reason: 'pairs' });
  });
});

describe('추천 시점', () => {
  it('선택 중이 아니고, 빈칸이 기준 이하이거나 한동안 입력이 없을 때만 보여 준다', () => {
    const state = emptyWorkbench();
    state.board[0] = { type: 'frame', level: 1 };
    state.board[1] = { type: 'frame', level: 1 };
    expect(shouldShowHint(state, 0, false)).toBe(false);
    expect(shouldShowHint(state, HINT_IDLE_MS, false)).toBe(true);
    expect(shouldShowHint(state, HINT_IDLE_MS, true)).toBe(false);

    const crowded = stuckWorkbench();
    crowded.board[1] = { type: 'frame', level: 1 };
    Array.from({ length: HINT_EMPTY_THRESHOLD }, (_, i) => 41 - i).forEach((index) => { crowded.board[index] = null; });
    expect(shouldShowHint(crowded, 0, false)).toBe(true);
    crowded.board[35] = null; // 빈칸이 기준보다 하나 많아지면 무입력 시간이 필요
    expect(shouldShowHint(crowded, 0, false)).toBe(false);
  });

  it('합성할 쌍이 없으면 무입력이어도 보여 주지 않는다', () => {
    expect(shouldShowHint(stuckWorkbench(), HINT_IDLE_MS, false)).toBe(false);
  });
});
