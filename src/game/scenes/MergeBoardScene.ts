import Phaser from 'phaser';
import {
  BOARD_COLUMNS,
  BOARD_ROWS,
  CELL_SIZE,
  moveOrMerge,
  type BoardItem,
  type BoardPosition,
  type ItemKind,
  type ItemLevel,
} from '../../domain/board';
import {
  buildEntryBike,
  canBuildEntryBike,
  createInitialState,
  currentOrder,
  deliverCurrentOrder,
  producePart,
  type GameState,
} from '../../domain/game';

const BOARD_X = 27;
const BOARD_Y = 190;
const ITEM_SIZE = CELL_SIZE - 8;

const COLORS: Record<ItemKind, number> = {
  frame: 0x5bc0eb,
  wheel: 0xfde74c,
  drivetrain: 0x9bc53d,
  bike: 0xe55934,
};

const ICONS: Record<ItemKind, string> = {
  frame: '△',
  wheel: '◉',
  drivetrain: '⚙',
  bike: '◆',
};

const LABELS: Record<ItemKind, string> = {
  frame: 'Frame',
  wheel: 'Wheel',
  drivetrain: 'Drive',
  bike: 'Bike',
};

const BIKE_TIERS: Record<ItemLevel, string> = {
  1: 'Entry',
  2: 'Carbon',
  3: 'Flagship',
};

export class MergeBoardScene extends Phaser.Scene {
  private state: GameState = createInitialState();
  private dynamicObjects: Phaser.GameObjects.GameObject[] = [];
  private status = 'ORDER PARTS를 눌러 첫 부품을 온라인 주문하세요.';

  constructor() {
    super('merge-board');
  }

  create(): void {
    this.drawChrome();
    this.renderState();
  }

  private drawChrome(): void {
    this.add.text(24, 18, 'DREAM BIKE GARAGE', {
      color: '#f2c14e',
      fontFamily: 'system-ui, sans-serif',
      fontSize: '11px',
      fontStyle: 'bold',
      letterSpacing: 3,
    });

    this.add.text(24, 38, '오늘부터 자전거 부자', {
      color: '#f7f3e8',
      fontFamily: 'system-ui, sans-serif',
      fontSize: '22px',
      fontStyle: 'bold',
    });

    this.add.text(24, 70, '부품을 주문하고 머지해 고객의 자전거를 완성하세요.', {
      color: '#aebec7',
      fontFamily: 'system-ui, sans-serif',
      fontSize: '11px',
    });

    for (let row = 0; row < BOARD_ROWS; row += 1) {
      for (let column = 0; column < BOARD_COLUMNS; column += 1) {
        const x = BOARD_X + column * CELL_SIZE;
        const y = BOARD_Y + row * CELL_SIZE;
        this.add.rectangle(x, y, CELL_SIZE - 4, CELL_SIZE - 4, 0x20323d)
          .setOrigin(0)
          .setStrokeStyle(1, 0x4f6d7a);
      }
    }
  }

  private renderState(): void {
    this.dynamicObjects.forEach((object) => object.destroy());
    this.dynamicObjects = [];

    this.drawDashboard();
    this.state.items.forEach((item) => this.drawItem(item));
    this.drawActions();
  }

  private drawDashboard(): void {
    const order = currentOrder(this.state);
    const orderLabel = order
      ? `${order.label} · Bike T${order.level}`
      : 'All orders complete!';

    this.dynamicObjects.push(
      this.add.rectangle(24, 96, 342, 76, 0x17252e).setOrigin(0).setStrokeStyle(1, 0x35515e),
      this.add.text(38, 107, 'CURRENT ORDER', this.smallLabelStyle()),
      this.add.text(38, 126, orderLabel, {
        color: order ? '#f7f3e8' : '#9bc53d',
        fontFamily: 'system-ui, sans-serif',
        fontSize: '16px',
        fontStyle: 'bold',
      }),
      this.add.text(38, 150, `Orders ${this.state.completedOrderIds.length}/3`, this.metaStyle()),
      this.add.text(256, 150, `Garage ${this.state.garage.length}/20`, this.metaStyle()),
    );
  }

  private drawActions(): void {
    this.makeButton(24, 640, 106, 44, 'ORDER PARTS', () => {
      const next = producePart(this.state);
      this.status = next === this.state
        ? '보드가 가득 찼습니다. 아이템을 합쳐 공간을 만드세요.'
        : '온라인으로 새 부품을 주문했습니다.';
      this.state = next;
      this.renderState();
    }, true);

    this.makeButton(142, 640, 106, 44, 'BUILD BIKE', () => {
      const next = buildEntryBike(this.state);
      this.status = next === this.state
        ? 'T3 Frame·Wheel·Drive가 각각 1개 필요합니다.'
        : 'Entry Bike 조립 완료!';
      this.state = next;
      this.renderState();
    }, canBuildEntryBike(this.state.items));

    const order = currentOrder(this.state);
    const canDeliver = Boolean(order && this.state.items.some(
      (item) => item.kind === 'bike' && item.level === order.level,
    ));
    this.makeButton(260, 640, 106, 44, 'DELIVER', () => {
      const before = this.state;
      this.state = deliverCurrentOrder(this.state);
      this.status = before === this.state
        ? '현재 주문과 같은 등급의 Bike가 필요합니다.'
        : currentOrder(this.state)
          ? '주문 납품 완료! 다음 자전거에 도전하세요.'
          : 'MVP 완료! 세 주문을 모두 납품했습니다.';
      this.renderState();
    }, canDeliver);

    this.dynamicObjects.push(
      this.add.text(24, 699, this.status, {
        color: '#dce7ec',
        fontFamily: 'system-ui, sans-serif',
        fontSize: '12px',
        wordWrap: { width: 342 },
      }),
      this.add.text(24, 733, 'Merge: 같은 종류·티어 2개 → 상위 티어 1개', this.metaStyle()),
      this.add.text(24, 752, 'Build: T3 부품 3종 → Entry Bike', this.metaStyle()),
    );

    const reset = this.add.text(342, 785, 'RESET', {
      color: '#7f98a4',
      fontFamily: 'system-ui, sans-serif',
      fontSize: '10px',
      fontStyle: 'bold',
    }).setOrigin(1, 0.5).setInteractive({ useHandCursor: true });
    reset.on('pointerdown', () => {
      this.state = createInitialState();
      this.status = '새 게임을 시작했습니다.';
      this.renderState();
    });
    this.dynamicObjects.push(reset);
  }

  private drawItem(item: BoardItem): void {
    const x = BOARD_X + item.column * CELL_SIZE + (CELL_SIZE - 4) / 2;
    const y = BOARD_Y + item.row * CELL_SIZE + (CELL_SIZE - 4) / 2;
    const color = COLORS[item.kind];

    const container = this.add.container(x, y);
    const tile = this.add.rectangle(0, 0, ITEM_SIZE, ITEM_SIZE, color, 0.95)
      .setStrokeStyle(item.level === 3 ? 3 : 1, item.level === 3 ? 0xf7f3e8 : 0x0b151a);
    const icon = this.add.text(0, -6, ICONS[item.kind], {
      color: '#0b151a',
      fontFamily: 'system-ui, sans-serif',
      fontSize: item.kind === 'bike' ? '20px' : '18px',
      fontStyle: 'bold',
    }).setOrigin(0.5);
    const name = item.kind === 'bike' ? BIKE_TIERS[item.level] : LABELS[item.kind];
    const label = this.add.text(0, 11, `${name} T${item.level}`, {
      color: '#0b151a',
      fontFamily: 'system-ui, sans-serif',
      fontSize: '8px',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    container.add([tile, icon, label]);
    container.setSize(ITEM_SIZE, ITEM_SIZE).setInteractive({ useHandCursor: true });
    this.input.setDraggable(container);
    container.setData('itemId', item.id);
    container.setData('startX', x);
    container.setData('startY', y);

    container.on('dragstart', () => {
      container.setDepth(10);
      this.tweens.add({ targets: container, scale: 1.08, duration: 80 });
    });

    container.on('drag', (_pointer: Phaser.Input.Pointer, dragX: number, dragY: number) => {
      container.setPosition(dragX, dragY);
    });

    container.on('dragend', () => {
      const destination = this.pointToBoardPosition(container.x, container.y);
      const result = destination
        ? moveOrMerge(this.state.items, item.id, destination)
        : { items: this.state.items, outcome: 'blocked' as const };

      this.state = { ...this.state, items: result.items };
      this.status = result.outcome === 'merged'
        ? `${name} 합성 성공!`
        : result.outcome === 'moved'
          ? '아이템을 이동했습니다.'
          : '그 위치에는 놓을 수 없습니다.';
      this.renderState();
    });

    this.dynamicObjects.push(container);
  }

  private pointToBoardPosition(x: number, y: number): BoardPosition | undefined {
    const column = Math.floor((x - BOARD_X) / CELL_SIZE);
    const row = Math.floor((y - BOARD_Y) / CELL_SIZE);
    if (row < 0 || row >= BOARD_ROWS || column < 0 || column >= BOARD_COLUMNS) {
      return undefined;
    }
    return { row, column };
  }

  private makeButton(
    x: number,
    y: number,
    width: number,
    height: number,
    label: string,
    action: () => void,
    enabled: boolean,
  ): void {
    const fill = enabled ? 0xf2c14e : 0x2d3d45;
    const textColor = enabled ? '#101820' : '#71858f';
    const button = this.add.rectangle(x, y, width, height, fill)
      .setOrigin(0)
      .setStrokeStyle(1, enabled ? 0xffd96a : 0x40545e);
    const text = this.add.text(x + width / 2, y + height / 2, label, {
      color: textColor,
      fontFamily: 'system-ui, sans-serif',
      fontSize: '10px',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    if (enabled) {
      button.setInteractive({ useHandCursor: true }).on('pointerdown', action);
      text.setInteractive({ useHandCursor: true }).on('pointerdown', action);
    }
    this.dynamicObjects.push(button, text);
  }

  private smallLabelStyle(): Phaser.Types.GameObjects.Text.TextStyle {
    return {
      color: '#f2c14e',
      fontFamily: 'system-ui, sans-serif',
      fontSize: '9px',
      fontStyle: 'bold',
    };
  }

  private metaStyle(): Phaser.Types.GameObjects.Text.TextStyle {
    return {
      color: '#8ea4ae',
      fontFamily: 'system-ui, sans-serif',
      fontSize: '10px',
    };
  }
}
