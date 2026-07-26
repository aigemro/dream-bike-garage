import { describe, expect, it } from 'vitest';
import { canMerge, type BoardItem } from '../src/domain/board';

const item = (overrides: Partial<BoardItem> = {}): BoardItem => ({
  id: 'a',
  kind: 'frame',
  level: 1,
  row: 0,
  column: 0,
  ...overrides,
});

describe('canMerge', () => {
  it('allows two different items with the same kind and level', () => {
    expect(canMerge(item(), item({ id: 'b' }))).toBe(true);
  });

  it('rejects different kinds and max-level items', () => {
    expect(canMerge(item(), item({ id: 'b', kind: 'wheel' }))).toBe(false);
    expect(canMerge(item({ level: 3 }), item({ id: 'b', level: 3 }))).toBe(false);
  });
});
