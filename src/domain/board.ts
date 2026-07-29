export const BOARD_COLUMNS = 7;
export const BOARD_ROWS = 9;
export const CELL_SIZE = 48;
export const BOARD_CAPACITY = BOARD_COLUMNS * BOARD_ROWS;

export type PartKind = 'frame' | 'wheel' | 'drivetrain';
export type ItemKind = PartKind | 'bike';
export type ItemLevel = 1 | 2 | 3;

export interface BoardItem {
  id: string;
  kind: ItemKind;
  level: ItemLevel;
  row: number;
  column: number;
}

export interface BoardPosition {
  row: number;
  column: number;
}

export const PART_KINDS: PartKind[] = ['frame', 'wheel', 'drivetrain'];

export function isInsideBoard(position: BoardPosition): boolean {
  return position.row >= 0
    && position.row < BOARD_ROWS
    && position.column >= 0
    && position.column < BOARD_COLUMNS;
}

export function findItemAt(items: BoardItem[], position: BoardPosition): BoardItem | undefined {
  return items.find(
    (item) => item.row === position.row && item.column === position.column,
  );
}

export function firstEmptyPosition(items: BoardItem[]): BoardPosition | undefined {
  for (let row = 0; row < BOARD_ROWS; row += 1) {
    for (let column = 0; column < BOARD_COLUMNS; column += 1) {
      if (!findItemAt(items, { row, column })) {
        return { row, column };
      }
    }
  }

  return undefined;
}

export function canMerge(source: BoardItem, target: BoardItem): boolean {
  return source.id !== target.id
    && source.kind === target.kind
    && source.level === target.level
    && source.level < 3;
}

export function moveOrMerge(
  items: BoardItem[],
  itemId: string,
  destination: BoardPosition,
): { items: BoardItem[]; outcome: 'moved' | 'merged' | 'blocked' } {
  const source = items.find((item) => item.id === itemId);
  if (!source || !isInsideBoard(destination)) {
    return { items, outcome: 'blocked' };
  }

  const target = findItemAt(items, destination);
  if (!target) {
    return {
      items: items.map((item) => (
        item.id === itemId ? { ...item, ...destination } : item
      )),
      outcome: 'moved',
    };
  }

  if (!canMerge(source, target)) {
    return { items, outcome: 'blocked' };
  }

  return {
    items: items
      .filter((item) => item.id !== source.id)
      .map((item) => (
        item.id === target.id
          ? { ...item, level: (item.level + 1) as ItemLevel }
          : item
      )),
    outcome: 'merged',
  };
}
