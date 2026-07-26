import type { ItemKind } from '../domain/board';

export const mvpScope = {
  board: { columns: 7, rows: 9 },
  workshopCount: 1,
  itemKinds: ['frame', 'wheel', 'drivetrain'] satisfies ItemKind[],
  bikeTiers: ['Entry', 'Carbon', 'Flagship'],
  orderCount: 3,
  garageCapacity: 20,
  excluded: ['match-3', 'stamina', 'ads', 'in-app purchases'],
} as const;
