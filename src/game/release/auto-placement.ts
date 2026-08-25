export type PlacementCell = { row: number; column: number };
export type AutoPlacement = PlacementCell & { rotation: number };

export function findFirstAvailablePlacement(
  rows: number,
  columns: number,
  rotatedShapes: PlacementCell[][],
  occupiedCells: PlacementCell[],
): AutoPlacement | undefined {
  const occupied = new Set(occupiedCells.map((cell) => `${cell.row}:${cell.column}`));

  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      for (let rotation = 0; rotation < rotatedShapes.length; rotation += 1) {
        const valid = rotatedShapes[rotation].every((cell) => {
          const targetRow = row + cell.row;
          const targetColumn = column + cell.column;
          return targetRow >= 0 && targetRow < rows
            && targetColumn >= 0 && targetColumn < columns
            && !occupied.has(`${targetRow}:${targetColumn}`);
        });
        if (valid) return { row, column, rotation };
      }
    }
  }

  return undefined;
}
