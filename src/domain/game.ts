import {
  PART_KINDS,
  firstEmptyPosition,
  type BoardItem,
  type ItemLevel,
  type PartKind,
} from './board';

export interface Order {
  id: string;
  level: ItemLevel;
  label: string;
}

export interface GarageBike {
  id: string;
  level: ItemLevel;
  orderId: string;
}

export interface GameState {
  items: BoardItem[];
  orders: Order[];
  completedOrderIds: string[];
  garage: GarageBike[];
  nextId: number;
  workshopCursor: number;
}

export const MVP_ORDERS: Order[] = [
  { id: 'entry-order', level: 1, label: 'Entry Bike' },
  { id: 'carbon-order', level: 2, label: 'Carbon Bike' },
  { id: 'flagship-order', level: 3, label: 'Flagship Bike' },
];

export function createInitialState(): GameState {
  return {
    items: [],
    orders: MVP_ORDERS,
    completedOrderIds: [],
    garage: [],
    nextId: 1,
    workshopCursor: 0,
  };
}

export function currentOrder(state: GameState): Order | undefined {
  return state.orders.find((order) => !state.completedOrderIds.includes(order.id));
}

export function producePart(state: GameState): GameState {
  const position = firstEmptyPosition(state.items);
  if (!position) {
    return state;
  }

  const kind = PART_KINDS[state.workshopCursor % PART_KINDS.length];
  const item: BoardItem = {
    id: `item-${state.nextId}`,
    kind,
    level: 1,
    ...position,
  };

  return {
    ...state,
    items: [...state.items, item],
    nextId: state.nextId + 1,
    workshopCursor: state.workshopCursor + 1,
  };
}

export function canBuildEntryBike(items: BoardItem[]): boolean {
  return PART_KINDS.every((kind) => (
    items.some((item) => item.kind === kind && item.level === 3)
  ));
}

export function buildEntryBike(state: GameState): GameState {
  if (!canBuildEntryBike(state.items)) {
    return state;
  }

  const consumedIds = new Set<string>();
  for (const kind of PART_KINDS) {
    const part = state.items.find(
      (item) => item.kind === kind && item.level === 3 && !consumedIds.has(item.id),
    );
    if (part) consumedIds.add(part.id);
  }

  const remaining = state.items.filter((item) => !consumedIds.has(item.id));
  const position = firstEmptyPosition(remaining);
  if (!position) {
    return state;
  }

  return {
    ...state,
    items: [
      ...remaining,
      {
        id: `item-${state.nextId}`,
        kind: 'bike',
        level: 1,
        ...position,
      },
    ],
    nextId: state.nextId + 1,
  };
}

export function deliverCurrentOrder(state: GameState): GameState {
  const order = currentOrder(state);
  if (!order || state.garage.length >= 20) {
    return state;
  }

  const bike = state.items.find(
    (item) => item.kind === 'bike' && item.level === order.level,
  );
  if (!bike) {
    return state;
  }

  return {
    ...state,
    items: state.items.filter((item) => item.id !== bike.id),
    completedOrderIds: [...state.completedOrderIds, order.id],
    garage: [
      ...state.garage,
      { id: bike.id, level: bike.level, orderId: order.id },
    ],
  };
}

export function getPartCount(items: BoardItem[], kind: PartKind, level: ItemLevel): number {
  return items.filter((item) => item.kind === kind && item.level === level).length;
}
