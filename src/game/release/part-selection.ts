export type PartSelectionState<TPiece, TPart extends string> = {
  selectedPiece?: TPiece;
  generatorPlacementActive: boolean;
  pendingParcel?: TPart;
};

export type PartSelectionCancelResult<TPiece, TPart extends string> =
  PartSelectionState<TPiece, TPart> & {
    canceled: 'placed-piece' | 'placement' | 'none';
  };

/**
 * 선택 취소는 보드 조각이나 택배 자체를 소비하지 않고 입력 포인터만 해제한다.
 * pendingParcel을 비우더라도 택배의 arrived 상태는 호출 측 parcels Map에 남는다.
 */
export function cancelPartSelection<TPiece, TPart extends string>(
  state: PartSelectionState<TPiece, TPart>,
): PartSelectionCancelResult<TPiece, TPart> {
  const canceled = state.selectedPiece
    ? 'placed-piece'
    : state.generatorPlacementActive
      ? 'placement'
      : 'none';

  if (canceled === 'none') return { ...state, canceled };

  return {
    selectedPiece: undefined,
    generatorPlacementActive: false,
    pendingParcel: undefined,
    canceled,
  };
}
