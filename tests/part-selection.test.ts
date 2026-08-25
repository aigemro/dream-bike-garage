import { describe, expect, it } from 'vitest';
import { cancelPartSelection } from '../src/game/release/part-selection';

describe('cancelPartSelection', () => {
  it('clears a placed-piece selection without changing the piece', () => {
    const piece = { id: 7, rotation: 1 };
    const result = cancelPartSelection({
      selectedPiece: piece,
      generatorPlacementActive: false,
      pendingParcel: undefined,
    });

    expect(result.canceled).toBe('placed-piece');
    expect(result.selectedPiece).toBeUndefined();
    expect(piece).toEqual({ id: 7, rotation: 1 });
  });

  it('releases a pending parcel placement without consuming the parcel state', () => {
    const parcels = new Map([['frame', { state: 'arrived' }]]);
    const result = cancelPartSelection({
      selectedPiece: undefined,
      generatorPlacementActive: true,
      pendingParcel: 'frame',
    });

    expect(result).toMatchObject({
      canceled: 'placement',
      generatorPlacementActive: false,
      pendingParcel: undefined,
    });
    expect(parcels.get('frame')).toEqual({ state: 'arrived' });
  });

  it('keeps an idle selection state unchanged', () => {
    const result = cancelPartSelection({
      selectedPiece: undefined,
      generatorPlacementActive: false,
      pendingParcel: undefined,
    });

    expect(result.canceled).toBe('none');
    expect(result.generatorPlacementActive).toBe(false);
  });
});
