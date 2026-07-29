import { describe, expect, it } from 'vitest';
import { type BoardItem } from '../src/domain/board';
import {
  buildEntryBike,
  createInitialState,
  currentOrder,
  deliverCurrentOrder,
  producePart,
} from '../src/domain/game';

const levelThreeParts: BoardItem[] = [
  { id: 'frame', kind: 'frame', level: 3, row: 0, column: 0 },
  { id: 'wheel', kind: 'wheel', level: 3, row: 0, column: 1 },
  { id: 'drive', kind: 'drivetrain', level: 3, row: 0, column: 2 },
];

describe('MVP game loop', () => {
  it('produces parts in a predictable three-part cycle', () => {
    const first = producePart(createInitialState());
    const second = producePart(first);
    const third = producePart(second);
    expect(third.items.map((item) => item.kind)).toEqual(['frame', 'wheel', 'drivetrain']);
  });

  it('builds an Entry bike from three max-level parts', () => {
    const state = { ...createInitialState(), items: levelThreeParts };
    const result = buildEntryBike(state);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({ kind: 'bike', level: 1 });
  });

  it('delivers the bike requested by the current order', () => {
    const state = {
      ...createInitialState(),
      items: [{ id: 'bike', kind: 'bike', level: 1, row: 0, column: 0 } as BoardItem],
    };
    const result = deliverCurrentOrder(state);
    expect(result.items).toHaveLength(0);
    expect(result.garage).toHaveLength(1);
    expect(currentOrder(result)?.level).toBe(2);
  });
});
