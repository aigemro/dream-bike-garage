import { describe, expect, it } from 'vitest';
import { findFirstAvailablePlacement } from '../src/game/release/auto-placement';

describe('findFirstAvailablePlacement', () => {
  const horizontal = [{ row: 0, column: 0 }, { row: 0, column: 1 }];
  const vertical = [{ row: 0, column: 0 }, { row: 1, column: 0 }];

  it('uses the first top-left position when it is available', () => {
    expect(findFirstAvailablePlacement(3, 3, [horizontal, vertical], []))
      .toEqual({ row: 0, column: 0, rotation: 0 });
  });

  it('tries a rotated shape before moving to the next cell', () => {
    expect(findFirstAvailablePlacement(3, 3, [horizontal, vertical], [{ row: 0, column: 1 }]))
      .toEqual({ row: 0, column: 0, rotation: 1 });
  });

  it('returns undefined when no shape can fit', () => {
    const occupied = [
      { row: 0, column: 0 }, { row: 0, column: 1 },
      { row: 1, column: 0 }, { row: 1, column: 1 },
    ];
    expect(findFirstAvailablePlacement(2, 2, [horizontal, vertical], occupied)).toBeUndefined();
  });
});
