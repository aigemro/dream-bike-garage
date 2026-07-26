export const BOARD_COLUMNS = 7;
export const BOARD_ROWS = 9;
export const CELL_SIZE = 48;

export type ItemKind = 'frame' | 'wheel' | 'drivetrain';

export interface BoardItem {
  id: string;
  kind: ItemKind;
  level: 1 | 2 | 3;
  row: number;
  column: number;
}

export function canMerge(source: BoardItem, target: BoardItem): boolean {
  return source.id !== target.id
    && source.kind === target.kind
    && source.level === target.level
    && source.level < 3;
}
