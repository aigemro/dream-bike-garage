// 머지 작업대 합성 추천 보조 (Lab #264 B안 재구현 · 순수 로직, Phaser 비의존)
// E안은 부품을 옮길 수 없고 맞닿은 쌍만 합성되므로, 어떤 쌍을 먼저 합치느냐에 따라 보드가 막힙니다.
// 막힘 직전(빈칸이 적을 때)이나 한동안 입력이 없을 때 '먼저 합칠 쌍' 1개를 골라 화면이 짚어 줄 수 있게 합니다.
// 추천은 강제가 아니며, 다른 쌍도 자유롭게 합성할 수 있습니다.
import {
  WORKBENCH_CELLS,
  mergeParts,
  mergeTargets,
  nextIntakeSlot,
  type WorkbenchCell,
  type WorkbenchOrders,
  type WorkbenchPart,
  type WorkbenchState,
} from './merge-workbench';

/** 빈칸이 이 수 이하로 남으면 막힘 직전으로 보고 추천을 바로 보여 줍니다. */
export const HINT_EMPTY_THRESHOLD = 6;
/** 이 시간(ms) 동안 아무 입력이 없으면 추천을 보여 줍니다. */
export const HINT_IDLE_MS = 8000;

export const emptyCells = (board: readonly WorkbenchCell[]) => board.filter((part) => !part).length;

/** 합성할 수 있는 쌍이 하나라도 있는지 */
export function hasMerge(board: readonly WorkbenchCell[]): boolean {
  for (let index = 0; index < WORKBENCH_CELLS; index += 1) if (mergeTargets(board, index).length > 0) return true;
  return false;
}

/** 막힘: 다음 입고 칸이 없고(꽉 참) 합성할 쌍도 없음. 반품 말고는 진행할 수 없는 상태입니다. */
export function isStuck(state: Pick<WorkbenchState, 'board'>): boolean {
  return nextIntakeSlot(state.board) < 0 && !hasMerge(state.board);
}

// 합성 가능한 쌍 수. (a, b)와 (b, a)는 같은 쌍으로 한 번만 셉니다.
function mergePairCount(board: readonly WorkbenchCell[]): number {
  let count = 0;
  for (let index = 0; index < WORKBENCH_CELLS; index += 1) for (const to of mergeTargets(board, index)) if (to > index) count += 1;
  return count;
}

// 추천 계산용 사본: 원래 상태를 건드리지 않도록 보드·장착 상태를 깊게 복사합니다.
const trialCopy = (state: WorkbenchState): WorkbenchState => ({
  ...state,
  board: state.board.map((part) => (part ? { ...part } : null)),
  installed: { ...state.installed },
  undo: null,
});

/** 추천 이유: 납품까지 이어짐 / 바로 장착됨 / 합친 뒤에도 합성 쌍이 남음 / 칸이 하나 빔 */
export type MergeHintReason = 'deliver' | 'install' | 'pairs' | 'space';

export type MergeRecommendation = { from: number; to: number; part: WorkbenchPart; reason: MergeHintReason };

/**
 * 먼저 합칠 쌍을 추천합니다. 같은 상태면 항상 같은 쌍을 고릅니다(점수가 같으면 칸 순서가 빠른 쪽).
 * 점수: 납품 × 10000 + 이번 합성으로 장착되는 부품 수 × 100 + 합성 뒤 남는 합성 가능 쌍 수 × 10
 * 합성할 쌍이 없으면 null. 넘긴 상태는 바꾸지 않습니다.
 */
export function recommendMerge(state: WorkbenchState, orders: WorkbenchOrders): MergeRecommendation | null {
  let best: MergeRecommendation | null = null;
  let bestScore = -Infinity;
  for (let from = 0; from < WORKBENCH_CELLS; from += 1) {
    for (const to of mergeTargets(state.board, from)) {
      const trial = trialCopy(state);
      const events = mergeParts(trial, orders, from, to);
      if (!events) continue;
      const delivers = events.some((event) => event.type === 'delivered');
      const installs = events.filter((event) => event.type === 'installed').length;
      const pairs = mergePairCount(trial.board);
      const score = (delivers ? 1e4 : 0) + installs * 100 + pairs * 10;
      if (score <= bestScore) continue;
      bestScore = score;
      const reason: MergeHintReason = delivers ? 'deliver' : installs > 0 ? 'install' : pairs > 0 ? 'pairs' : 'space';
      best = { from, to, part: { ...state.board[from]! }, reason };
    }
  }
  return best;
}

/** 추천을 보여 줄지: 선택 중이 아니고 합성할 쌍이 있으며, 막힘 직전이거나 한동안 입력이 없을 때 */
export function shouldShowHint(state: Pick<WorkbenchState, 'board'>, idleMs: number, selecting: boolean): boolean {
  if (selecting || !hasMerge(state.board)) return false;
  return emptyCells(state.board) <= HINT_EMPTY_THRESHOLD || idleMs >= HINT_IDLE_MS;
}
