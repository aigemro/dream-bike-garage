import { describe, expect, it } from 'vitest';
import {
  canMerge,
  firstEmptyPosition,
  moveOrMerge,
  type BoardItem,
} from '../src/domain/board';

const item = (overrides: Partial<BoardItem> = {}): BoardItem => ({
  id: 'a',
  kind: 'frame',
  level: 1,
  row: 0,
  column: 0,
  ...overrides,
});

describe('board rules', () => {
  it('finds the first available cell', () => {
    expect(firstEmptyPosition([item()])).toEqual({ row: 0, column: 1 });
  });

  it('allows two different items with the same kind and level', () => {
    expect(canMerge(item(), item({ id: 'b' }))).toBe(true);
  });

  it('rejects different kinds and max-level items', () => {
    expect(canMerge(item(), item({ id: 'b', kind: 'wheel' }))).toBe(false);
    expect(canMerge(item({ level: 3 }), item({ id: 'b', level: 3 }))).toBe(false);
  });

  it('moves an item to an empty cell', () => {
    const result = moveOrMerge([item()], 'a', { row: 2, column: 3 });
    expect(result.outcome).toBe('moved');
    expect(result.items[0]).toMatchObject({ row: 2, column: 3 });
  });

  it('merges matching items into the target cell', () => {
    const result = moveOrMerge(
      [item(), item({ id: 'b', row: 0, column: 1 })],
      'a',
      { row: 0, column: 1 },
    );
    expect(result.outcome).toBe('merged');
    expect(result.items).toEqual([item({ id: 'b', level: 2, row: 0, column: 1 })]);
  });
});
