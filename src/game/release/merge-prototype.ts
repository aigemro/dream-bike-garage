import Phaser from 'phaser';
import {
  drawPixelBike, drawPixelPartIcon, makeWarmColorway,
  bikePartAnchorOffset, WARM_PART_COLORS,
} from './bike-pixel-sprite';

export type MergePrototypeMode = 'free' | 'order' | 'guided' | 'integrated';
export type MergePrototypeTheme = 'lab' | 'warm-pixel';

export type PartType = 'frame' | 'wheel' | 'drivetrain' | 'handlebar';
type Point = { x: number; y: number };
type Piece = {
  id: number;
  type: PartType;
  level: number;
  row: number;
  column: number;
  rotation: number;
  item: Phaser.GameObjects.Container;
};
export type Goal = { type: PartType; level: number; delivered: boolean; installing?: boolean };
// 통합 모드 택배 상태: 주문 전(idle) → 배송 중(delivering) → 개봉 대기(arrived)
type ParcelState = { state: 'idle' | 'delivering' | 'arrived'; readyAt: number };

const PARCEL_DELIVERY_MS = 1500;

// warm 테마 주문 자전거 앵커(x=가로 중앙, y=바퀴 축 높이)와 픽셀 셀 크기·프레임 색.
// drawPixelBike 렌더링과 부품 장착 연출 목표 좌표(bikeAnchor)가 같은 기준을 공유한다.
const WARM_BIKE_ANCHOR = { x: 565, y: 170 } as const;
const WARM_BIKE_CELL = 3;
const WARM_BIKE_FRAME_COLOR = 0xc95746; // warm 테마 주문 자전거 프레임 색

export const PARTS: Array<{ type: PartType; name: string; short: string; color: number; shape: Point[] }> = [
  { type: 'frame', name: '프레임', short: 'F', color: 0x55d6be, shape: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }] },
  { type: 'wheel', name: '휠셋', short: 'W', color: 0xffb35c, shape: [{ x: 0, y: 0 }, { x: 0, y: 1 }] },
  { type: 'drivetrain', name: '구동계', short: 'D', color: 0xff7185, shape: [{ x: 0, y: 0 }] },
  { type: 'handlebar', name: '핸들바', short: 'H', color: 0x8c7bff, shape: [{ x: 0, y: 0 }, { x: 1, y: 0 }] },
];

export const ORDERS: Goal[][] = [
  [
    { type: 'frame', level: 2, delivered: false },
    { type: 'wheel', level: 2, delivered: false },
    { type: 'drivetrain', level: 1, delivered: false },
    { type: 'handlebar', level: 1, delivered: false },
  ],
  [
    { type: 'frame', level: 3, delivered: false },
    { type: 'wheel', level: 2, delivered: false },
    { type: 'drivetrain', level: 2, delivered: false },
    { type: 'handlebar', level: 1, delivered: false },
  ],
  [
    { type: 'frame', level: 2, delivered: false },
    { type: 'wheel', level: 3, delivered: false },
    { type: 'drivetrain', level: 2, delivered: false },
    { type: 'handlebar', level: 2, delivered: false },
  ],
];

class MergePrototypeScene extends Phaser.Scene {
  constructor(
    private readonly mode: MergePrototypeMode,
    private readonly theme: MergePrototypeTheme = 'lab',
  ) { super(`merge-${mode}-${theme}`); }

  private get warm() { return this.theme === 'warm-pixel'; }

  private partColor(type: PartType) {
    if (!this.warm) return PARTS.find((part) => part.type === type)!.color;
    return WARM_PART_COLORS[type]; // 부품 아이콘과 같은 대표색 단일 출처
  }

  private rows = 7;
  private columns = 6;
  private pieces: Piece[] = [];
  private zones: Phaser.GameObjects.Rectangle[] = [];
  private boardObjects: Phaser.GameObjects.GameObject[] = [];
  private controls: Phaser.GameObjects.GameObject[] = [];
  private selectedPiece?: Piece;
  private selectedGenerator: PartType = 'frame';
  private generatorRotation = 0;
  private generatorPlacementActive = false;
  private placementGhost?: Phaser.GameObjects.Container;
  private nextId = 1;
  private orderIndex = 0;
  private boardLeft = 0;
  private boardTop = 0;
  private cellSize = 0;
  private gap = 4;
  private goals: Goal[] = [];
  private actions = 0;
  private merges = 0;
  private mistakes = 0;
  private startedAt = 0;
  private info!: Phaser.GameObjects.Text;
  private metrics!: Phaser.GameObjects.Text;
  private orderText?: Phaser.GameObjects.Text;
  private orderBike?: Phaser.GameObjects.Graphics;
  private goalSlots = new Map<PartType, { label: Phaser.GameObjects.Text; panel: Phaser.GameObjects.Rectangle }>();
  private orderParts = new Map<PartType, number[]>();
  private orderPartDisplays = new Map<PartType, Phaser.GameObjects.Container>();
  private guidedGoalDisplays = new Map<PartType, { panel: Phaser.GameObjects.Rectangle; status: Phaser.GameObjects.Text }>();
  private guidedOrderProgress?: Phaser.GameObjects.Text;
  private parcels = new Map<PartType, ParcelState>();
  private parcelDisplays = new Map<PartType, { button: Phaser.GameObjects.Rectangle; status: Phaser.GameObjects.Text; need: Phaser.GameObjects.Text }>();
  private pendingParcel?: PartType;
  private installQueue: Array<{ goal: Goal; from: Point; level: number }> = [];
  private installingPart = false;
  private orderCompleting = false;

  create() {
    this.cameras.main.setBackgroundColor(this.warm ? '#c78452' : '#0b1727');
    this.startedAt = this.time.now;
    this.goals = ORDERS[0].map((goal) => ({ ...goal }));
    if (this.warm) this.drawWarmWorkshopBackdrop();
    this.drawHeader();
    if (this.mode === 'order') {
      this.drawCustomOrder();
      this.drawOrderPartControls();
      this.refreshUi('오른쪽 부품을 클릭해 커스텀 주문을 완성하세요. 같은 레벨 부품 2개는 자동으로 머지됩니다.');
      return;
    }
    if (this.mode === 'guided' || this.mode === 'integrated') {
      this.drawGuidedOrder();
      this.rebuildBoard(this.mode === 'integrated'
        ? '주문에 필요한 카테고리의 택배를 주문하고, 도착한 상자를 개봉해 부품을 보드에 배치하세요.'
        : '왼쪽 주문 목표를 확인하고 오른쪽에서 필요한 부품을 선택하세요. 자유롭게 배치·회전·머지할 수 있습니다.');
    } else {
      this.drawSizeControls();
      this.rebuildBoard('열·행의 − / + 버튼을 누르면 보드 크기가 바로 변경됩니다.');
    }
  }

  update() {
    this.refreshMetrics();
    if (this.mode === 'integrated') this.tickParcels();
  }

  private drawHeader() {
    const names = { free: 'A · 자유 보드 · 2차 구현', order: 'B · 주문 중심 · 2차 구현', guided: 'C · 자유 + 가이드', integrated: 'MVP 핵심 기능 통합 · 머지 코어 C안 기반' };
    if (this.warm) {
      this.add.rectangle(560, 44, 1080, 68, 0xfff1c6).setStrokeStyle(4, 0x3b2531).setDepth(8);
      this.add.rectangle(560, 72, 1080, 8, 0x8e5136).setDepth(9);
      this.add.text(34, 17, 'WORK ORDER · WARM PIXEL GARAGE', { fontFamily: '"Arial Rounded MT Bold", "Noto Sans KR", sans-serif', fontSize: '10px', color: '#8e5136', fontStyle: 'bold' }).setDepth(10);
      this.add.text(34, 32, names[this.mode], { fontFamily: '"Arial Rounded MT Bold", "Noto Sans KR", sans-serif', fontSize: '18px', color: '#3b2531', fontStyle: 'bold' }).setDepth(10);
      this.info = this.add.text(34, 56, '', { fontFamily: '"Arial Rounded MT Bold", "Noto Sans KR", sans-serif', fontSize: '11px', color: '#6e473b', wordWrap: { width: 810 } }).setDepth(10);
      this.metrics = this.add.text(1080, 22, '', { fontFamily: '"Arial Rounded MT Bold", "Noto Sans KR", sans-serif', fontSize: '11px', color: '#6e473b', fontStyle: 'bold' }).setOrigin(1, 0).setDepth(10);
      return;
    }
    this.add.text(24, 18, names[this.mode], { fontFamily: 'Arial', fontSize: '19px', color: '#55d6be', fontStyle: 'bold' });
    this.info = this.add.text(24, 47, '', { fontFamily: 'Arial', fontSize: '12px', color: '#bfd0dc', wordWrap: { width: 1040 } });
    this.metrics = this.add.text(1096, 20, '', { fontFamily: 'Arial', fontSize: '11px', color: '#758da1' }).setOrigin(1, 0);
  }

  private drawWarmWorkshopBackdrop() {
    this.add.rectangle(560, 270, 1120, 540, 0xd79a63).setDepth(-20);
    this.add.rectangle(560, 630, 1120, 180, 0xb66f45).setDepth(-20);
    for (let y = 96; y < 540; y += 44) this.add.line(0, 0, 0, y, 1120, y, 0x573044, .1).setOrigin(0).setDepth(-19);
    for (let y = 552; y < 720; y += 34) this.add.line(0, 0, 0, y, 1120, y, 0x573044, .34).setOrigin(0).setDepth(-19);
    for (let x = 20; x < 1120; x += 72) this.add.line(0, 0, x, 552, x - 18, 720, 0x573044, .2).setOrigin(0).setDepth(-19);

    this.add.rectangle(558, 152, 250, 116, 0x86c9c8).setStrokeStyle(8, 0x573044).setDepth(-18);
    this.add.circle(492, 126, 15, 0xf4b84a).setDepth(-17);
    this.add.ellipse(616, 128, 72, 24, 0xfff1c6, .9).setDepth(-17);
    this.add.rectangle(558, 180, 242, 48, 0x86ba6f).setDepth(-17);
    this.add.rectangle(558, 152, 8, 110, 0xfff1c6).setDepth(-16);
    this.add.rectangle(558, 152, 242, 8, 0xfff1c6).setDepth(-16);

    this.add.rectangle(112, 222, 160, 250, 0x8e5136).setStrokeStyle(5, 0x3b2531).setDepth(-18);
    for (let py = 120; py < 320; py += 24) for (let px = 52; px < 178; px += 24) this.add.circle(px, py, 2, 0x573044, .55).setDepth(-17);
    this.add.text(54, 92, 'ORDER WALL', { fontFamily: 'Arial', fontSize: '11px', color: '#fff1c6', fontStyle: 'bold' }).setDepth(-16);

    // 오른쪽 택배 패널 자체가 선반 역할을 하므로 뒤쪽 장식 선반은 두지 않는다.
    // 패널 위로 일부만 노출되면 별도 버튼이나 장치로 오인될 수 있다.
  }

  private drawGuidedOrder() {
    const panelFill = this.warm ? 0xfff1c6 : 0x0e1d2e;
    const cardFill = this.warm ? 0xf6d995 : 0x0b1929;
    const border = this.warm ? 0x3b2531 : 0x29465e;
    const ink = this.warm ? '#3b2531' : '#dce9f2';
    const muted = this.warm ? '#7b5140' : '#71899c';
    const accent = this.warm ? '#8e5136' : '#55d6be';
    const fontFamily = this.warm ? '"Arial Rounded MT Bold", "Noto Sans KR", sans-serif' : 'Arial';

    const orderPanelOffsetY = this.warm ? 4 : 0;
    const workMemoY = this.warm ? 542 : 574;
    this.add.rectangle(122, 404 + orderPanelOffsetY, 220, 520, panelFill).setStrokeStyle(this.warm ? 4 : 1, border).setDepth(this.warm ? 2 : 0);
    this.add.rectangle(122, 158 + orderPanelOffsetY, 184, 26, this.warm ? 0x8e5136 : 0x0e1d2e).setDepth(this.warm ? 3 : 0);
    this.add.text(30, 150 + orderPanelOffsetY, this.warm ? '주문 부품 · ORDER PARTS' : 'ORDER PARTS', { fontFamily, fontSize: '10px', color: this.warm ? '#fff1c6' : accent, fontStyle: 'bold' }).setDepth(this.warm ? 4 : 0);

    this.add.rectangle(500, 150, 480, 140, panelFill).setStrokeStyle(this.warm ? 4 : 1, this.warm ? 0x8e5136 : 0x55d6be, 0.9).setDepth(this.warm ? 2 : 0);
    this.add.rectangle(286, 100, 92, 24, this.warm ? 0xc95746 : 0x173b43).setStrokeStyle(this.warm ? 3 : 1, border, 0.9).setDepth(this.warm ? 3 : 0);
    this.add.text(286, 100, 'NEW ORDER', { fontFamily, fontSize: '9px', color: this.warm ? '#fff1c6' : '#9ff3e3', fontStyle: 'bold' }).setOrigin(0.5).setDepth(this.warm ? 4 : 0);
    this.add.text(270, 122, '고객 주문이 도착했습니다', { fontFamily, fontSize: '11px', color: muted }).setDepth(this.warm ? 3 : 0);
    this.orderText = this.add.text(270, 145, '', { fontFamily, fontSize: '17px', color: ink, fontStyle: 'bold' }).setDepth(this.warm ? 3 : 0);
    this.guidedOrderProgress = this.add.text(270, 174, '', { fontFamily, fontSize: '11px', color: muted, fontStyle: this.warm ? 'bold' : 'normal' }).setDepth(this.warm ? 3 : 0);
    this.add.text(270, 196, '필요 부품을 완성해 주문을 납품하세요.', { fontFamily, fontSize: '10px', color: this.warm ? '#8e5136' : '#607b8f' }).setDepth(this.warm ? 3 : 0);
    this.orderBike = this.add.graphics().setDepth(2);
    if (!this.warm) this.orderBike.setScale(0.46).setPosition(445, 6);

    this.goals.forEach((goal, index) => {
      const part = PARTS.find((item) => item.type === goal.type)!;
      const partColor = this.partColor(part.type);
      const y = 264 + orderPanelOffsetY + index * 72;
      const panel = this.add.rectangle(122, y, 184, 56, cardFill).setStrokeStyle(this.warm ? 3 : 1, partColor, this.warm ? 1 : 0.55).setDepth(this.warm ? 3 : 0);
      if (this.warm) {
        // warm: 레터 칩 대신 부품 픽셀 아이콘으로 어떤 부품인지 그림으로 인지시킨다.
        this.add.rectangle(52, y, 36, 32, 0xfff1c6).setStrokeStyle(2, border).setDepth(4);
        drawPixelPartIcon(this, 52, y, 2, part.type, { depth: 5 });
      } else {
        this.add.rectangle(52, y, 28, 28, partColor, 0.24).setStrokeStyle(1, partColor);
        this.add.text(52, y, part.short, { fontFamily, fontSize: '12px', color: '#ffffff', fontStyle: 'bold' }).setOrigin(0.5);
      }
      this.add.text(76, y - 11, part.name, { fontFamily, fontSize: '11px', color: ink, fontStyle: 'bold' }).setDepth(this.warm ? 4 : 0);
      const status = this.add.text(76, y + 7, '', { fontFamily, fontSize: '10px', color: muted }).setDepth(this.warm ? 4 : 0);
      this.guidedGoalDisplays.set(goal.type, { panel, status });
    });

    this.add.text(30, workMemoY, this.mode === 'integrated' ? (this.warm ? '오늘의 작업 메모' : '통합 검증') : 'C안 가이드', { fontFamily, fontSize: '11px', color: accent, fontStyle: 'bold' }).setDepth(this.warm ? 4 : 0);
    this.add.text(30, workMemoY + 24, this.mode === 'integrated'
      ? '부품은 택배로만 수급되며\n목표 레벨 완성 시 자전거에\n부품별로 자동 장착됩니다.'
      : '필요한 부품만 알려주며\n배치 위치와 제작 순서는\n플레이어가 자유롭게 정합니다.', {
      fontFamily, fontSize: '10px', color: muted, lineSpacing: 6,
    }).setDepth(this.warm ? 4 : 0);
    this.drawOrderBike();
  }

  private drawCustomOrder() {
    this.add.rectangle(382, 394, 704, 556, 0x0e1d2e).setStrokeStyle(1, 0x29465e);
    this.add.text(54, 136, 'CUSTOM ORDER WORKBENCH', { fontFamily: 'Arial', fontSize: '11px', color: '#55d6be', fontStyle: 'bold' });
    this.orderText = this.add.text(54, 158, '', { fontFamily: 'Arial', fontSize: '16px', color: '#dce9f2', fontStyle: 'bold' });
    this.add.text(54, 188, '완성된 부품은 주문 카드에 장착되어 표시됩니다.', { fontFamily: 'Arial', fontSize: '11px', color: '#71899c' });
    this.orderBike = this.add.graphics().setDepth(2);

    PARTS.forEach((part, index) => {
      const x = 218 + (index % 2) * 332;
      const y = 476 + Math.floor(index / 2) * 118;
      const panel = this.add.rectangle(x, y, 294, 94, 0x0b1929).setStrokeStyle(1, part.color, 0.65).setDepth(2);
      const label = this.add.text(x - 126, y - 34, '', { fontFamily: 'Arial', fontSize: '11px', color: '#dce9f2' }).setDepth(3);
      this.goalSlots.set(part.type, { label, panel });
      const display = this.add.container(x - 118, y + 12).setDepth(3);
      this.orderPartDisplays.set(part.type, display);
      this.orderParts.set(part.type, []);
    });
    this.drawOrderBike();
  }

  private drawOrderPartControls() {
    const panelWidth = 340;
    this.add.rectangle(940, 404, panelWidth, 520, 0x0e1d2e).setStrokeStyle(1, 0x29465e);
    this.add.text(794, 174, '추가할 부품', { fontFamily: 'Arial', fontSize: '12px', color: '#8fa8ba' });
    PARTS.forEach((part, index) => {
      const x = 865 + (index % 2) * 150;
      const y = 226 + Math.floor(index / 2) * 72;
      const button = this.add.rectangle(x, y, 134, 58, 0x13263b).setStrokeStyle(2, part.color).setInteractive({ useHandCursor: true });
      button.on('pointerdown', () => this.addPartToOrder(part.type));
      this.add.text(x, y, `${part.name}\nLv.1 추가`, { align: 'center', fontFamily: 'Arial', fontSize: '12px', color: '#e8f1f7', fontStyle: 'bold', lineSpacing: 4 }).setOrigin(0.5);
    });
    this.add.text(794, 354, '클릭할 때마다 Lv.1 부품이 주문에 추가됩니다.\n같은 레벨 2개는 즉시 상위 레벨로 합쳐집니다.', {
      fontFamily: 'Arial', fontSize: '11px', color: '#71899c', lineSpacing: 7, wordWrap: { width: 292 },
    });
    this.add.rectangle(940, 526, 292, 178, 0x0b1929).setStrokeStyle(1, 0x29465e);
    this.add.text(814, 455, 'B안 검증 포인트', { fontFamily: 'Arial', fontSize: '12px', color: '#55d6be', fontStyle: 'bold' });
    this.add.text(814, 482, '• 보드 없이 주문 자체가 플레이 공간이 되는가\n• 추가·머지 결과를 즉시 이해할 수 있는가\n• 완성 부품과 미완성 부품이 구분되는가', {
      fontFamily: 'Arial', fontSize: '11px', color: '#91a9bc', lineSpacing: 9,
    });
    const switchButton = this.add.rectangle(940, 640, 292, 36, 0x17324a).setStrokeStyle(1, 0x55d6be).setInteractive({ useHandCursor: true });
    switchButton.on('pointerdown', () => this.switchOrderBike());
    this.add.text(940, 640, '로드바이크 ↔ MTB 주문 비교', { fontFamily: 'Arial', fontSize: '11px', color: '#dce9f2', fontStyle: 'bold' }).setOrigin(0.5);
  }

  private switchOrderBike() {
    this.orderIndex = this.orderIndex === 1 ? 0 : 1;
    this.goals = ORDERS[this.orderIndex].map((goal) => ({ ...goal }));
    PARTS.forEach((part) => this.orderParts.set(part.type, []));
    this.actions = 0;
    this.merges = 0;
    this.startedAt = this.time.now;
    this.refreshUi(this.orderIndex === 1 ? '트레일 MTB 주문으로 변경했습니다. 굵은 타이어와 플랫바 형상을 확인하세요.' : '에어로 로드바이크 주문으로 변경했습니다. 얇은 휠과 드롭바 형상을 확인하세요.');
  }

  private addPartToOrder(type: PartType) {
    this.actions += 1;
    const levels = [...(this.orderParts.get(type) ?? []), 1];
    let merged = true;
    while (merged) {
      merged = false;
      for (let level = 1; level < 4; level += 1) {
        const matches = levels.filter((value) => value === level);
        if (matches.length < 2) continue;
        levels.splice(levels.indexOf(level), 1);
        levels.splice(levels.indexOf(level), 1);
        levels.push(level + 1);
        this.merges += 1;
        merged = true;
        break;
      }
    }
    levels.sort((a, b) => b - a);
    this.orderParts.set(type, levels);
    const goal = this.goals.find((item) => item.type === type);
    if (goal && levels.some((level) => level >= goal.level)) goal.delivered = true;
    this.refreshUi(`${this.partName(type)} 추가 · 현재 ${levels.map((level) => `Lv.${level}`).join(' + ')}`);
  }

  private drawSizeControls() {
    this.add.text(24, 88, '보드 크기', { fontFamily: 'Arial', fontSize: '12px', color: '#8fa8ba' }).setOrigin(0, 0.5);
    this.makeSizeStepper(154, 94, '열', 'columns');
    this.makeSizeStepper(304, 94, '행', 'rows');
    this.add.text(394, 78, '4~10칸 · 누르면 즉시 변경\n부품 선택 → 같은 부품을 다시 눌러 회전\n빈 칸 이동 · 같은 종류와 레벨끼리 머지', {
      fontFamily: 'Arial', fontSize: '10px', color: '#71899c', lineSpacing: 3, wordWrap: { width: 360 },
    });
  }

  private makeSizeStepper(x: number, y: number, label: string, field: 'columns' | 'rows') {
    this.add.text(x - 68, y, label, { fontFamily: 'Arial', fontSize: '11px', color: '#7990a2' }).setOrigin(0.5);
    const minus = this.add.rectangle(x - 34, y, 30, 32, 0x101f31).setStrokeStyle(1, 0x395a72).setInteractive({ useHandCursor: true });
    const valueBox = this.add.rectangle(x, y, 38, 32, 0x101f31).setStrokeStyle(1, 0x395a72);
    const plus = this.add.rectangle(x + 38, y, 30, 32, 0x101f31).setStrokeStyle(1, 0x395a72).setInteractive({ useHandCursor: true });
    this.add.text(x - 34, y, '−', { fontFamily: 'Arial', fontSize: '18px', color: '#dce8f0' }).setOrigin(0.5);
    this.add.text(x + 38, y, '+', { fontFamily: 'Arial', fontSize: '18px', color: '#dce8f0' }).setOrigin(0.5);
    const text = this.add.text(x, y, String(field === 'columns' ? this.columns : this.rows), { fontFamily: 'Arial', fontSize: '14px', color: '#55d6be', fontStyle: 'bold' }).setOrigin(0.5);
    text.setData('sizeField', field);
    minus.on('pointerdown', () => this.changeBoardSize(field, -1));
    plus.on('pointerdown', () => this.changeBoardSize(field, 1));
    void valueBox;
  }

  private refreshSizeFields() {
    this.children.list.filter((object): object is Phaser.GameObjects.Text => object instanceof Phaser.GameObjects.Text && Boolean(object.getData('sizeField')))
      .forEach((text) => {
        const field = text.getData('sizeField') as 'columns' | 'rows';
        text.setText(String(field === 'columns' ? this.columns : this.rows));
      });
  }

  private changeBoardSize(field: 'columns' | 'rows', amount: number) {
    const current = field === 'columns' ? this.columns : this.rows;
    const next = Phaser.Math.Clamp(current + amount, 4, 10);
    if (next === current) {
      this.refreshUi(`보드 ${field === 'columns' ? '열' : '행'}은 4~10 사이에서 변경할 수 있습니다.`);
      return;
    }
    if (field === 'columns') this.columns = next;
    else this.rows = next;
    this.rebuildBoard(`보드를 ${this.columns}열 × ${this.rows}행으로 변경했습니다. 배치된 부품은 초기화됩니다.`);
  }

  private rebuildBoard(message: string) {
    this.columns = Phaser.Math.Clamp(this.columns || 4, 4, 10);
    this.rows = Phaser.Math.Clamp(this.rows || 4, 4, 10);
    this.selectedPiece = undefined;
    this.clearPlacementGhost();
    this.pieces.forEach((piece) => piece.item.destroy());
    this.pieces = [];
    this.boardObjects.forEach((object) => object.destroy());
    this.controls.forEach((object) => this.destroySceneObject(object));
    this.boardObjects = [];
    this.controls = [];
    this.zones = [];
    const guidedLayout = this.mode === 'guided' || this.mode === 'integrated';
    const boardWidth = guidedLayout ? 460 : 680;
    const boardHeight = guidedLayout ? 402 : 520;
    this.cellSize = Math.floor(Math.min(boardWidth / this.columns, boardHeight / this.rows, 76));
    this.gap = Math.max(2, Math.min(5, Math.floor(this.cellSize * 0.08)));
    const width = this.columns * this.cellSize;
    this.boardLeft = guidedLayout ? 250 + (500 - width) / 2 : 32 + (704 - width) / 2;
    this.boardTop = guidedLayout
      ? 256 + (410 - this.rows * this.cellSize) / 2
      : 142 + (536 - this.rows * this.cellSize) / 2;
    this.drawBoard();
    this.drawPartControls();
    this.refreshSizeFields();
    this.refreshUi(message);
  }

  private drawBoard() {
    if (this.warm) {
      const width = this.columns * this.cellSize + 18;
      const height = this.rows * this.cellSize + 18;
      this.boardObjects.push(
        this.add.rectangle(this.boardLeft + (this.columns * this.cellSize) / 2, this.boardTop + (this.rows * this.cellSize) / 2, width, height, 0x8e5136)
          .setStrokeStyle(5, 0x3b2531).setDepth(0),
      );
    }
    for (let row = 0; row < this.rows; row += 1) {
      for (let column = 0; column < this.columns; column += 1) {
        const { x, y } = this.cellCenter(row, column);
        const zone = this.add.rectangle(x, y, this.cellSize - this.gap, this.cellSize - this.gap, this.warm ? 0xffe6a8 : 0x13263b)
          .setStrokeStyle(this.warm ? 2 : 1, this.warm ? 0x9c5b3c : 0x28455f).setInteractive({ useHandCursor: true }).setDepth(this.warm ? 1 : 0);
        zone.on('pointerover', () => this.showPlacementGhost(row, column));
        zone.on('pointerout', () => this.clearPlacementGhost());
        zone.on('pointerdown', () => this.handleCell(row, column));
        this.zones.push(zone);
        this.boardObjects.push(zone);
      }
    }
  }

  private drawPartControls() {
    if (this.mode === 'integrated') {
      this.drawParcelControls();
      return;
    }
    this.drawDesktopPartControls();
  }

  private drawDesktopPartControls() {
    const panelLeft = 770;
    const panelWidth = 340;
    const panelPadding = 24;
    const columnGap = 16;
    const buttonWidth = (panelWidth - panelPadding * 2 - columnGap) / 2;
    const controlsLeft = panelLeft + panelPadding;
    const controlsTop = 174;
    const panel = this.add.rectangle(panelLeft + panelWidth / 2, 404, panelWidth, 520, 0x0e1d2e).setStrokeStyle(1, 0x29465e).setDepth(0);
    const label = this.add.text(controlsLeft, controlsTop, '추가할 부품', { fontFamily: 'Arial', fontSize: '12px', color: '#8fa8ba' });
    this.controls.push(panel, label);

    PARTS.forEach((part, index) => {
      const x = controlsLeft + buttonWidth / 2 + (index % 2) * (buttonWidth + columnGap);
      const y = controlsTop + 52 + Math.floor(index / 2) * 72;
      const button = this.add.rectangle(x, y, buttonWidth, 58, 0x13263b).setStrokeStyle(2, part.color).setInteractive({ useHandCursor: true });
      button.setData('part', part.type);
      button.on('pointerdown', () => this.selectGenerator(part.type));
      const text = this.add.text(x, y, `${part.name}\n${part.short} · ${part.shape.length}칸`, { align: 'center', fontFamily: 'Arial', fontSize: '12px', color: '#e8f1f7', fontStyle: 'bold', lineSpacing: 4 }).setOrigin(0.5);
      this.controls.push(button, text);
    });

    const modeGuide = this.mode === 'order'
      ? '주문에서 다음으로 필요한 부품이 자동 선택됩니다.\n배치된 부품은 선택·이동·회전·머지할 수 있습니다.'
      : this.mode === 'guided'
        ? '원하는 부품을 선택하고 같은 버튼을 다시 눌러 회전합니다.\n아래 주문 가이드로 필요한 목표를 확인합니다.'
        : '부품 버튼을 다시 누르면 90° 회전합니다.\n보드 위에서 배치 모양을 미리 확인하고,\n같은 부품 위에 놓으면 바로 머지됩니다.\n배치된 부품은 선택 후 이동·회전할 수 있습니다.';
    const guide = this.add.text(controlsLeft, controlsTop + 210, modeGuide, { fontFamily: 'Arial', fontSize: '11px', color: '#71899c', lineSpacing: 6, wordWrap: { width: panelWidth - panelPadding * 2 } });
    this.controls.push(guide);

    this.drawPartPreviews(panelLeft, panelWidth, panelPadding, controlsTop + 340);
    this.refreshControls();
  }

  private drawPartPreviews(panelLeft: number, panelWidth: number, panelPadding: number, previewTop: number) {
    const previewLabel = this.add.text(panelLeft + panelPadding, previewTop, '선택 부품 미리보기', { fontFamily: this.warm ? '"Arial Rounded MT Bold", "Noto Sans KR", sans-serif' : 'Arial', fontSize: '12px', color: this.warm ? '#6e473b' : '#8fa8ba', fontStyle: 'bold' }).setDepth(this.warm ? 4 : 0);
    const previewPanel = this.add.rectangle(panelLeft + panelWidth / 2, previewTop + 76, panelWidth - panelPadding * 2, 118, this.warm ? 0xffe6a8 : 0x0b1929).setStrokeStyle(this.warm ? 3 : 1, this.warm ? 0x8e5136 : 0x29465e).setDepth(this.warm ? 3 : 0);
    this.controls.push(previewLabel, previewPanel);

    PARTS.forEach((part) => {
      const previewCell = 25;
      [0, 1, 2, 3].forEach((rotation) => {
        const partColor = this.partColor(part.type);
        const previewShape = this.shape(part.type, rotation);
        const maxX = Math.max(...previewShape.map((point) => point.x));
        const maxY = Math.max(...previewShape.map((point) => point.y));
        const shapeWidth = (maxX + 1) * previewCell;
        const shapeHeight = (maxY + 1) * previewCell;
        // warm: footprint 블록 위 아이콘 공간을 확보하기 위해 컨테이너를 살짝 아래로 내린다.
        const preview = this.add.container(
          panelLeft + panelWidth / 2,
          previewTop + (this.warm ? 78 : 66),
        ).setData('previewPart', part.type).setData('previewRotation', rotation);
        const blocks = previewShape.map((point) => this.add.rectangle(
          point.x * previewCell - shapeWidth / 2 + previewCell / 2,
          point.y * previewCell - shapeHeight / 2 + previewCell / 2,
          previewCell - 3,
          previewCell - 3,
          partColor,
        ).setStrokeStyle(this.warm ? 2 : 1, this.warm ? 0x3b2531 : 0x07111f));
        const caption = this.add.text(0, 42, `${part.name} · ${part.shape.length}칸 · ${rotation * 90}°`, {
          fontFamily: this.warm ? '"Arial Rounded MT Bold", "Noto Sans KR", sans-serif' : 'Arial', fontSize: '10px', color: this.warm ? '#3b2531' : '#bfd0dc', align: 'center',
        }).setOrigin(0.5);
        // warm: footprint 블록 위 중앙에 부품 픽셀 아이콘을 함께 표시 (컨테이너 상대 좌표로 동작)
        if (this.warm) preview.add(drawPixelPartIcon(this, 0, -44, 2, part.type));
        preview.add([...blocks, caption]).setDepth(this.warm ? 4 : 0);
        this.controls.push(preview);
      });
    });
  }

  // 통합 모드 전용: 즉시 생성 버튼 대신 카테고리별 택배 주문·개봉으로 부품을 수급한다.
  private drawParcelControls() {
    const panelLeft = 770;
    const panelWidth = 340;
    const panelPadding = 24;
    const controlsLeft = panelLeft + panelPadding;
    const controlsTop = 150;
    const fontFamily = this.warm ? '"Arial Rounded MT Bold", "Noto Sans KR", sans-serif' : 'Arial';
    const panel = this.add.rectangle(panelLeft + panelWidth / 2, 404, panelWidth, 520, this.warm ? 0xfff1c6 : 0x0e1d2e).setStrokeStyle(this.warm ? 4 : 1, this.warm ? 0x3b2531 : 0x29465e).setDepth(this.warm ? 2 : 0);
    const label = this.add.text(controlsLeft, controlsTop, this.warm ? '택배 선반 · PARTS DELIVERY' : '부품 택배 수급', { fontFamily, fontSize: '12px', color: this.warm ? '#6e473b' : '#8fa8ba', fontStyle: this.warm ? 'bold' : 'normal' }).setDepth(this.warm ? 4 : 0);
    this.controls.push(panel, label);
    this.parcelDisplays.clear();

    PARTS.forEach((part, index) => {
      const y = controlsTop + 54 + index * 64;
      const partColor = this.partColor(part.type);
      const button = this.add.rectangle(panelLeft + panelWidth / 2, y, panelWidth - panelPadding * 2, 56, this.warm ? 0xf6d995 : 0x13263b)
        .setStrokeStyle(this.warm ? 3 : 2, partColor).setInteractive({ useHandCursor: true }).setDepth(this.warm ? 3 : 0);
      button.on('pointerdown', () => this.handleParcelButton(part.type));
      // warm: '▣' 문자 대신 버튼 왼쪽에 부품 픽셀 아이콘을 배치하고 텍스트 시작점을 아이콘만큼 민다.
      // 아이콘은 controls에 넣어 보드 재구성 시 버튼과 함께 정리되므로 중복 생성이 없다.
      const textLeft = controlsLeft + (this.warm ? 52 : 14);
      if (this.warm) {
        const icon = drawPixelPartIcon(this, controlsLeft + 28, y, 1.75, part.type, { depth: 5 });
        this.controls.push(icon);
      }
      const name = this.add.text(textLeft, y - 20, `${part.name} · ${part.short} · ${part.shape.length}칸`, { fontFamily, fontSize: '12px', color: this.warm ? '#3b2531' : '#e8f1f7', fontStyle: 'bold' }).setDepth(this.warm ? 4 : 0);
      const status = this.add.text(textLeft, y + 2, '', { fontFamily, fontSize: '10px', color: this.warm ? '#7b5140' : '#8fa8ba' }).setDepth(this.warm ? 4 : 0);
      const need = this.add.text(panelLeft + panelWidth - panelPadding - 14, y - 20, '주문 필요', { fontFamily, fontSize: '9px', color: this.warm ? '#a14a38' : '#ffd37a', fontStyle: 'bold' }).setOrigin(1, 0).setDepth(this.warm ? 4 : 0);
      this.parcelDisplays.set(part.type, { button, status, need });
      this.controls.push(button, name, status, need);
    });

    const guide = this.add.text(controlsLeft, controlsTop + 316, '택배 주문 → 배송 → 상자 개봉 → 보드 배치 순서로\n부품을 수급합니다. 개봉 후 같은 버튼을 다시 누르면\n부품이 90° 회전합니다.', {
      fontFamily, fontSize: '10px', color: this.warm ? '#7b5140' : '#71899c', lineSpacing: 5, wordWrap: { width: panelWidth - panelPadding * 2 },
    }).setDepth(this.warm ? 4 : 0);
    this.controls.push(guide);
    this.drawPartPreviews(panelLeft, panelWidth, panelPadding, controlsTop + 372);
    this.refreshControls();
  }

  private handleParcelButton(type: PartType) {
    const parcel = this.parcels.get(type) ?? { state: 'idle' as const, readyAt: 0 };
    if (parcel.state === 'delivering') {
      this.refreshUi(`${this.partName(type)} 택배가 배송 중입니다. 도착하면 같은 버튼으로 개봉하세요.`);
      return;
    }
    if (parcel.state === 'arrived') {
      if (this.pendingParcel && this.pendingParcel !== type && this.generatorPlacementActive) {
        this.refreshUi(`먼저 개봉한 ${this.partName(this.pendingParcel)} 부품을 보드에 배치하세요.`);
        return;
      }
      const repeated = this.pendingParcel === type && this.generatorPlacementActive;
      this.pendingParcel = type;
      this.selectedGenerator = type;
      this.selectedPiece = undefined;
      this.generatorPlacementActive = true;
      this.generatorRotation = repeated ? (this.generatorRotation + 1) % 4 : 0;
      this.clearPlacementGhost();
      this.refreshControls();
      this.refreshUi(repeated
        ? `${this.partName(type)}을 ${this.generatorRotation * 90}°로 회전했습니다. 보드에서 배치 위치를 선택하세요.`
        : `${this.partName(type)} 상자를 개봉했습니다. 보드에서 Lv.1 부품의 배치 위치를 선택하세요. 같은 Lv.1 부품 위에 놓으면 바로 머지됩니다.`);
      return;
    }
    this.actions += 1;
    this.parcels.set(type, { state: 'delivering', readyAt: this.time.now + PARCEL_DELIVERY_MS });
    this.refreshUi(`${this.partName(type)} 택배를 주문했습니다. ${(PARCEL_DELIVERY_MS / 1000).toFixed(1)}초 뒤 도착합니다.`);
  }

  private tickParcels() {
    let arrivedNow: PartType | undefined;
    this.parcels.forEach((parcel, type) => {
      if (parcel.state === 'delivering' && this.time.now >= parcel.readyAt) {
        parcel.state = 'arrived';
        arrivedNow = type;
      }
    });
    if (arrivedNow) this.info.setText(`${this.partName(arrivedNow)} 택배가 도착했습니다. 오른쪽 버튼을 눌러 상자를 개봉하세요.`);
    this.refreshParcelDisplays();
  }

  private refreshParcelDisplays() {
    this.parcelDisplays.forEach((display, type) => {
      if (!display.button.active) return;
      const part = PARTS.find((item) => item.type === type)!;
      const partColor = this.partColor(part.type);
      const parcel = this.parcels.get(type);
      const needed = this.goals.some((goal) => goal.type === type && !goal.delivered && !goal.installing);
      const placing = this.pendingParcel === type && this.generatorPlacementActive;
      display.need.setVisible(needed);
      let statusText = '탭하면 택배를 주문합니다';
      let statusColor = this.warm ? '#7b5140' : '#8fa8ba';
      if (parcel?.state === 'delivering') {
        statusText = `배송 중… ${Math.max(0, (parcel.readyAt - this.time.now) / 1000).toFixed(1)}초`;
        statusColor = this.warm ? '#a16028' : '#ffd37a';
      } else if (placing) {
        statusText = `배치 중 · ${this.generatorRotation * 90}° · 다시 누르면 회전`;
        statusColor = this.warm ? '#3f7851' : '#9ff3e3';
      } else if (parcel?.state === 'arrived') {
        statusText = '📦 도착 · 탭해서 개봉';
        statusColor = this.warm ? '#a16028' : '#ffd37a';
      }
      display.status.setText(statusText).setColor(statusColor);
      display.button.setFillStyle(this.warm
        ? placing ? 0xffe6a8 : parcel?.state === 'arrived' ? 0xf4c86a : 0xf6d995
        : placing ? 0x21445a : parcel?.state === 'arrived' ? 0x1a3a50 : 0x13263b);
      display.button.setStrokeStyle(needed ? 3 : 1.5, partColor, needed ? 1 : 0.4);
    });
  }

  // 배치가 끝난 시점에만 택배가 소비된다. 배치를 취소하면 상자는 개봉 대기 상태로 남는다.
  private consumePendingParcel() {
    if (this.mode !== 'integrated' || !this.pendingParcel) return;
    this.parcels.set(this.pendingParcel, { state: 'idle', readyAt: 0 });
    this.pendingParcel = undefined;
    this.refreshParcelDisplays();
  }

  private handleCell(row: number, column: number) {
    this.actions += 1;
    this.clearPlacementGhost();
    const clicked = this.pieceAt(row, column);
    if (clicked && this.generatorPlacementActive && !this.selectedPiece && clicked.type === this.selectedGenerator && clicked.level === 1) {
      this.mergeGeneratedPiece(clicked);
      return;
    }
    if (clicked) {
      if (!this.selectedPiece) {
        this.selectedPiece = clicked;
        this.generatorPlacementActive = false;
        this.pendingParcel = undefined;
        this.refreshControls();
        this.refreshUi(`${this.partName(clicked.type)} Lv.${clicked.level} 선택 · 빈 칸으로 이동하거나 같은 부품에 머지하세요.`);
        return;
      }
      if (clicked.id === this.selectedPiece.id) { this.rotateSelected(); return; }
      if (clicked.type === this.selectedPiece.type && clicked.level === this.selectedPiece.level && clicked.level < 4) {
        this.mergePieces(this.selectedPiece, clicked);
        return;
      }
      this.mistakes += 1;
      this.refreshUi('같은 종류·같은 레벨끼리만 머지할 수 있습니다.');
      return;
    }

    if (this.selectedPiece) {
      if (this.canPlace(this.selectedPiece.type, row, column, this.selectedPiece.rotation, this.selectedPiece.id)) {
        this.selectedPiece.row = row;
        this.selectedPiece.column = column;
        this.positionPiece(this.selectedPiece);
        this.refreshUi(`${this.partName(this.selectedPiece.type)}을 이동했습니다.`);
        this.selectedPiece = undefined;
        this.refreshControls();
      } else { this.mistakes += 1; this.refreshUi('부품 모양이 보드 밖으로 나가거나 다른 부품과 겹칩니다.'); }
      return;
    }

    if (this.mode !== 'order' && !this.generatorPlacementActive) {
      this.refreshUi(this.mode === 'integrated'
        ? '먼저 오른쪽에서 택배를 주문하고, 도착한 상자를 개봉해 부품을 수급하세요.'
        : '먼저 오른쪽에서 추가할 부품을 선택하세요.');
      return;
    }
    const type = this.mode === 'order' ? this.recommendedPart() : this.selectedGenerator;
    const placementRotation = this.mode === 'order' ? (this.findPlacementRotation(type, row, column) ?? 0) : this.generatorRotation;
    if (!this.canPlace(type, row, column, placementRotation)) {
      this.mistakes += 1;
      this.refreshUi('미리보기 방향으로 배치할 공간이 부족합니다. 부품 버튼을 다시 눌러 회전하거나 다른 위치를 선택하세요.');
      return;
    }
    const piece = this.makePiece(type, row, column, placementRotation, 1);
    this.pieces.push(piece);
    this.generatorPlacementActive = false;
    this.consumePendingParcel();
    const rotationMessage = placementRotation === 0 ? '' : ` · ${placementRotation * 90}° 회전`;
    this.refreshUi(`${this.partName(type)} Lv.1을 ${this.shape(type, placementRotation).length}칸 크기로 배치했습니다${rotationMessage}.`);
  }

  private selectGenerator(type: PartType) {
    const repeated = this.selectedGenerator === type && !this.selectedPiece;
    this.selectedGenerator = type;
    this.selectedPiece = undefined;
    this.generatorPlacementActive = true;
    this.generatorRotation = repeated ? (this.generatorRotation + 1) % 4 : 0;
    this.clearPlacementGhost();
    this.refreshControls();
    const part = PARTS.find((item) => item.type === type)!;
    this.refreshUi(`${part.name} ${this.generatorRotation * 90}° 선택 · 보드 위에서 배치 모양을 확인하세요. 같은 부품 위에 놓으면 바로 머지됩니다.`);
  }

  private showPlacementGhost(row: number, column: number) {
    this.clearPlacementGhost();
    if (this.selectedPiece || !this.generatorPlacementActive) return;
    const clicked = this.pieceAt(row, column);
    const mergeTarget = clicked?.type === this.selectedGenerator && clicked.level === 1 ? clicked : undefined;
    const rotation = mergeTarget?.rotation ?? this.generatorRotation;
    const anchorRow = mergeTarget?.row ?? row;
    const anchorColumn = mergeTarget?.column ?? column;
    const canMerge = Boolean(mergeTarget);
    const valid = canMerge || (!clicked && this.canPlace(this.selectedGenerator, anchorRow, anchorColumn, rotation));
    const part = PARTS.find((item) => item.type === this.selectedGenerator)!;
    const color = valid ? this.partColor(part.type) : 0xff5d73;
    const blocks = this.shape(this.selectedGenerator, rotation).map((point) => this.add.rectangle(
      point.x * this.cellSize,
      point.y * this.cellSize,
      this.cellSize - this.gap * 2,
      this.cellSize - this.gap * 2,
      color,
      canMerge ? 0.48 : 0.3,
    ).setStrokeStyle(2, valid ? 0xffffff : 0xffa0ad, 0.85));
    const origin = this.cellCenter(anchorRow, anchorColumn);
    this.placementGhost = this.add.container(origin.x, origin.y, blocks).setDepth(4);
  }

  private clearPlacementGhost() {
    this.placementGhost?.destroy(true);
    this.placementGhost = undefined;
  }

  private mergeGeneratedPiece(target: Piece) {
    target.item.destroy(true);
    this.pieces = this.pieces.filter((piece) => piece.id !== target.id);
    const merged = this.makePiece(target.type, target.row, target.column, target.rotation, 2);
    this.pieces.push(merged);
    this.generatorPlacementActive = false;
    this.consumePendingParcel();
    this.merges += 1;
    this.refreshControls();
    this.refreshUi(`${this.partName(target.type)} Lv.1을 같은 위치에 놓아 Lv.2로 머지했습니다.`);
  }

  private makePiece(type: PartType, row: number, column: number, rotation: number, level: number) {
    const part = PARTS.find((item) => item.type === type)!;
    const partColor = this.partColor(part.type);
    const cells = this.shape(type, rotation);
    const blocks = cells.map((point) => this.add.rectangle(point.x * this.cellSize, point.y * this.cellSize, this.cellSize - this.gap * 2, this.cellSize - this.gap * 2, partColor).setStrokeStyle(this.warm ? 3 : 2, this.warm ? 0x3b2531 : 0x07111f));
    const center = cells.reduce((sum, point) => ({ x: sum.x + point.x, y: sum.y + point.y }), { x: 0, y: 0 });
    center.x /= cells.length;
    center.y /= cells.length;
    const badgeCell = cells.reduce((closest, point) => {
      const distance = (point.x - center.x) ** 2 + (point.y - center.y) ** 2;
      const closestDistance = (closest.x - center.x) ** 2 + (closest.y - center.y) ** 2;
      return distance < closestDistance ? point : closest;
    });
    const badgeX = badgeCell.x * this.cellSize;
    const badgeY = badgeCell.y * this.cellSize;
    const badgeWidth = Math.max(24, Math.min(52, this.cellSize - this.gap * 4));
    const badgeHeight = Math.max(18, Math.min(28, this.cellSize - this.gap * 4, this.cellSize * 0.48));
    // warm: badgeCell 위쪽에 부품 픽셀 아이콘을 얹고, Lv 배지는 아이콘과 겹치지 않게 아래로 내린다.
    const badgeOffsetY = this.warm ? 14 : 0;
    const badge = this.add.rectangle(badgeX, badgeY + badgeOffsetY, badgeWidth, badgeHeight, this.warm ? 0xfff1c6 : 0x07111f, 0.94).setStrokeStyle(this.warm ? 2 : 1, this.warm ? 0x3b2531 : 0xffffff, 0.8);
    const tag = this.add.text(badgeX, badgeY + badgeOffsetY, `Lv.${level}`, { align: 'center', fontFamily: this.warm ? '"Arial Rounded MT Bold", "Noto Sans KR", sans-serif' : 'Arial', fontSize: `${Math.max(10, Math.min(15, badgeHeight * 0.58))}px`, color: this.warm ? '#3b2531' : '#ffffff', fontStyle: 'bold' }).setOrigin(0.5);
    const children: Phaser.GameObjects.GameObject[] = [...blocks];
    if (this.warm) children.push(drawPixelPartIcon(this, badgeX, badgeY - 8, 2, type, { level }));
    children.push(badge, tag);
    const item = this.add.container(0, 0, children).setDepth(2);
    const piece: Piece = { id: this.nextId++, type, level, row, column, rotation, item };
    this.positionPiece(piece);
    return piece;
  }

  private positionPiece(piece: Piece) {
    const origin = this.cellCenter(piece.row, piece.column);
    piece.item.setPosition(origin.x, origin.y);
  }

  private rotateSelected() {
    if (!this.selectedPiece) { this.refreshUi('먼저 보드의 부품을 선택하세요.'); return; }
    const next = (this.selectedPiece.rotation + 1) % 4;
    if (!this.canPlace(this.selectedPiece.type, this.selectedPiece.row, this.selectedPiece.column, next, this.selectedPiece.id)) {
      this.mistakes += 1;
      this.refreshUi('현재 위치에서는 회전할 공간이 부족합니다. 먼저 넓은 곳으로 이동하세요.');
      return;
    }
    const old = this.selectedPiece;
    old.item.destroy(true);
    const replacement = this.makePiece(old.type, old.row, old.column, next, old.level);
    replacement.id = old.id;
    this.pieces[this.pieces.findIndex((piece) => piece.id === old.id)] = replacement;
    this.selectedPiece = replacement;
    this.refreshControls();
    this.refreshUi(`${this.partName(replacement.type)}을 90° 회전했습니다.`);
  }

  private mergePieces(source: Piece, target: Piece) {
    source.item.destroy(true);
    target.item.destroy(true);
    this.pieces = this.pieces.filter((piece) => piece.id !== source.id && piece.id !== target.id);
    const merged = this.makePiece(target.type, target.row, target.column, target.rotation, target.level + 1);
    this.pieces.push(merged);
    this.selectedPiece = undefined;
    this.merges += 1;
    this.refreshControls();
    this.refreshUi(`${this.partName(target.type)} Lv.${merged.level} 머지 성공!`);
  }

  private shape(type: PartType, rotation: number) {
    let points = PARTS.find((part) => part.type === type)!.shape.map((point) => ({ ...point }));
    for (let turn = 0; turn < rotation; turn += 1) points = points.map((point) => ({ x: -point.y, y: point.x }));
    const minX = Math.min(...points.map((point) => point.x));
    const minY = Math.min(...points.map((point) => point.y));
    return points.map((point) => ({ x: point.x - minX, y: point.y - minY }));
  }

  private occupied(piece: Piece) { return this.shape(piece.type, piece.rotation).map((point) => ({ row: piece.row + point.y, column: piece.column + point.x })); }

  private findPlacementRotation(type: PartType, row: number, column: number) {
    return [0, 1, 2, 3].find((rotation) => this.canPlace(type, row, column, rotation));
  }

  private canPlace(type: PartType, row: number, column: number, rotation: number, ignoredId?: number) {
    const occupied = this.pieces.filter((piece) => piece.id !== ignoredId).flatMap((piece) => this.occupied(piece));
    return this.shape(type, rotation).every((point) => {
      const targetRow = row + point.y;
      const targetColumn = column + point.x;
      return targetRow >= 0 && targetRow < this.rows && targetColumn >= 0 && targetColumn < this.columns
        && !occupied.some((cell) => cell.row === targetRow && cell.column === targetColumn);
    });
  }

  private pieceAt(row: number, column: number) {
    return this.pieces.find((piece) => this.occupied(piece).some((cell) => cell.row === row && cell.column === column));
  }

  private cellCenter(row: number, column: number) { return { x: this.boardLeft + column * this.cellSize + this.cellSize / 2, y: this.boardTop + row * this.cellSize + this.cellSize / 2 }; }

  private refreshControls() {
    this.controls.filter((object): object is Phaser.GameObjects.Rectangle => object instanceof Phaser.GameObjects.Rectangle && Boolean(object.getData('part')))
      .forEach((button) => button.setFillStyle(button.getData('part') === this.selectedGenerator && !this.selectedPiece && this.generatorPlacementActive
        ? (this.warm ? 0xffe6a8 : 0x21445a)
        : (this.warm ? 0xf6d995 : 0x13263b)));
    this.controls.filter((object): object is Phaser.GameObjects.Container => object instanceof Phaser.GameObjects.Container && Boolean(object.getData('previewPart')))
      .forEach((preview) => preview.setVisible(preview.getData('previewPart') === this.selectedGenerator && preview.getData('previewRotation') === this.generatorRotation
        && (this.mode !== 'integrated' || this.generatorPlacementActive)));
    this.pieces.forEach((piece) => piece.item.setScale(piece.id === this.selectedPiece?.id ? 1.06 : 1));
    if (this.mode === 'integrated') this.refreshParcelDisplays();
  }

  private refreshUi(message: string) {
    this.info.setText(message);
    if (this.mode === 'guided') this.checkDelivery();
    if (this.mode === 'integrated') this.checkIntegratedDelivery();
    this.refreshOrder();
    this.refreshMetrics();
  }

  // 통합 모드: 목표 레벨 부품을 보드에서 소비하고 부품별 장착 연출을 거쳐 주문에 반영한다.
  private checkIntegratedDelivery() {
    this.goals.forEach((goal) => {
      if (goal.delivered || goal.installing) return;
      const match = this.pieces.find((piece) => piece.type === goal.type && piece.level >= goal.level);
      if (!match) return;
      goal.installing = true;
      const from = this.cellCenter(match.row, match.column);
      match.item.destroy(true);
      this.pieces = this.pieces.filter((piece) => piece.id !== match.id);
      if (this.selectedPiece?.id === match.id) this.selectedPiece = undefined;
      this.installQueue.push({ goal, from, level: match.level });
    });
    this.processInstallQueue();
  }

  // 장착 연출은 한 번에 한 부품씩 순차 진행한다 (#151 자동 순차 장착 기준).
  private processInstallQueue() {
    if (this.installingPart) return;
    const next = this.installQueue.shift();
    if (!next) {
      if (this.goals.length > 0 && this.goals.every((goal) => goal.delivered)) this.completeIntegratedOrder();
      return;
    }
    this.installingPart = true;
    const part = PARTS.find((item) => item.type === next.goal.type)!;
    const partColor = this.partColor(part.type);
    const target = this.bikeAnchor(next.goal.type);
    this.info.setText(`${part.name} Lv.${next.level} 완성 · 고객 자전거로 이동해 장착합니다.`);
    this.refreshOrder();
    const marker = this.add.rectangle(next.from.x, next.from.y, this.warm ? 28 : 30, this.warm ? 28 : 30, partColor).setDepth(30).setStrokeStyle(this.warm ? 4 : 2, this.warm ? 0xfff1c6 : 0xffffff, 0.9);
    this.tweens.add({
      targets: marker,
      x: target.x,
      y: target.y,
      scale: { from: 0.9, to: 1.5 },
      alpha: { from: 1, to: 0.3 },
      duration: 520,
      ease: 'Cubic.easeInOut',
      onComplete: () => {
        marker.destroy();
        next.goal.installing = false;
        next.goal.delivered = true;
        this.installingPart = false;
        const installed = this.goals.filter((goal) => goal.delivered).length;
        this.info.setText(`${part.name} 장착 완료 · 조립 ${installed}/${this.goals.length}`);
        this.drawOrderBike();
        this.refreshOrder();
        this.refreshParcelDisplays();
        this.processInstallQueue();
      },
    });
  }

  // 주문 패널 자전거의 부품별 장착 위치. 따뜻한 안은 픽셀 자전거 그리드의 실제 부품 오프셋을 사용한다.
  private bikeAnchor(type: PartType): Point {
    if (this.warm) {
      const category = this.orderIndex === 1 ? 'mtb' : 'road';
      const { dx, dy } = bikePartAnchorOffset(category, type, WARM_BIKE_CELL);
      return { x: WARM_BIKE_ANCHOR.x + dx, y: WARM_BIKE_ANCHOR.y + dy };
    }
    const local: Record<PartType, Point> = {
      frame: { x: 380, y: 275 },
      wheel: { x: 546, y: 350 },
      drivetrain: { x: 356, y: 364 },
      handlebar: { x: 500, y: 212 },
    };
    return { x: 445 + local[type].x * 0.46, y: 6 + local[type].y * 0.46 };
  }

  private completeIntegratedOrder() {
    if (this.orderCompleting) return;
    this.orderCompleting = true;
    this.info.setText(`주문 완료! 모든 부품이 장착되어 자전거를 납품했습니다. 잠시 후 다음 주문이 도착합니다.`);
    this.time.delayedCall(1600, () => {
      this.orderCompleting = false;
      this.orderIndex = (this.orderIndex + 1) % 2;
      this.goals = ORDERS[this.orderIndex].map((goal) => ({ ...goal }));
      this.startedAt = this.time.now;
      this.drawOrderBike();
      this.refreshControls();
      this.refreshUi('새 주문이 도착했습니다. 보드에 남은 부품은 그대로 사용할 수 있으며, 필요한 카테고리 택배를 주문하세요.');
    });
  }

  private checkDelivery() {
    this.goals.forEach((goal) => {
      if (goal.delivered) return;
      const match = this.pieces.find((piece) => piece.type === goal.type && piece.level >= goal.level);
      if (!match) return;
      goal.delivered = true;
      match.item.destroy(true);
      this.pieces = this.pieces.filter((piece) => piece.id !== match.id);
    });
    if (this.goals.every((goal) => goal.delivered)) {
      this.info.setText(`주문 ${this.orderIndex + 1} 완료 · 급여를 획득했습니다! 다음 주문을 시작합니다.`);
      this.orderIndex = (this.orderIndex + 1) % 2;
      this.goals = ORDERS[this.orderIndex].map((goal) => ({ ...goal }));
      this.pieces.forEach((piece) => piece.item.destroy(true));
      this.pieces = [];
      this.selectedPiece = undefined;
      this.generatorPlacementActive = false;
      this.clearPlacementGhost();
      this.startedAt = this.time.now;
      this.drawOrderBike();
      this.refreshControls();
    }
  }

  private refreshOrder() {
    if (!this.orderText) return;
    if (this.mode === 'order') {
      const completed = this.goals.filter((goal) => goal.delivered).length;
      const bikeName = this.orderIndex === 1 ? '트레일 MTB' : this.orderIndex === 2 ? '엔듀런스 로드바이크' : '에어로 로드바이크';
      this.orderText.setText(`CUSTOMER ORDER ${this.orderIndex + 1}/3  ·  ${bikeName}  ·  완성 ${completed}/4`);
      this.drawOrderBike();
      this.goals.forEach((goal) => {
        const slot = this.goalSlots.get(goal.type);
        if (!slot) return;
        const part = PARTS.find((item) => item.type === goal.type)!;
        const partColor = this.partColor(part.type);
        slot.panel.setFillStyle(goal.delivered ? partColor : (this.warm ? 0xf6d995 : 0x0b1929), goal.delivered ? 0.28 : 1);
        slot.panel.setStrokeStyle(goal.delivered ? 2 : 1, partColor, goal.delivered ? 1 : 0.65);
        const levels = this.orderParts.get(goal.type) ?? [];
        slot.label.setText(`${goal.delivered ? '✓ 완성' : part.name}  ·  목표 Lv.${goal.level}`).setColor(goal.delivered ? (this.warm ? '#3b2531' : '#ffffff') : (this.warm ? '#3b2531' : '#dce9f2'));
        const display = this.orderPartDisplays.get(goal.type);
        if (display) {
          display.removeAll(true);
          if (levels.length === 0) {
            const ghost = this.add.rectangle(22, 12, 44, 28, partColor, 0.08).setStrokeStyle(1, partColor, 0.45);
            const ghostText = this.add.text(22, 12, `Lv.${goal.level}`, { fontFamily: 'Arial', fontSize: '10px', color: '#6f8799', fontStyle: 'bold' }).setOrigin(0.5);
            const hint = this.add.text(54, 12, '필요 부품 고스트', { fontFamily: 'Arial', fontSize: '10px', color: '#536b80' }).setOrigin(0, 0.5);
            display.add([ghost, ghostText, hint]);
          } else {
            levels.slice(0, 5).forEach((level, index) => {
              const complete = level >= goal.level;
              const chip = this.add.rectangle(index * 52 + 20, 12, 44, 28, partColor, complete ? 0.9 : 0.28).setStrokeStyle(1, partColor);
              const text = this.add.text(index * 52 + 20, 12, `Lv.${level}`, { fontFamily: 'Arial', fontSize: '10px', color: '#ffffff', fontStyle: 'bold' }).setOrigin(0.5);
              display.add([chip, text]);
            });
          }
        }
      });
      if (completed === this.goals.length) this.info.setText('커스텀 주문의 모든 부품이 완성되었습니다. 완성 상태와 부품 구성을 확인하세요.');
      return;
    }
    const completed = this.goals.filter((goal) => goal.delivered).length;
    const bikeName = this.orderIndex === 1 ? '트레일 MTB' : '에어로 로드';
    this.orderText.setText(`${bikeName} #${this.orderIndex + 1}`);
    this.guidedOrderProgress?.setText(this.mode === 'integrated' ? `장착 ${completed}/4 · 부품별 자동 장착` : `완성 ${completed}/4 · 목표 부품 가이드`);
    this.drawOrderBike();
    this.goals.forEach((goal) => {
      const display = this.guidedGoalDisplays.get(goal.type);
      if (!display) return;
      const part = PARTS.find((item) => item.type === goal.type)!;
      const partColor = this.partColor(part.type);
      const current = this.pieces.filter((piece) => piece.type === goal.type).reduce((max, piece) => Math.max(max, piece.level), 0);
      const active = goal.delivered || Boolean(goal.installing);
      display.panel.setFillStyle(active ? partColor : (this.warm ? 0xf6d995 : 0x0b1929), goal.delivered ? (this.warm ? 0.36 : 0.22) : goal.installing ? 0.18 : 1);
      display.panel.setStrokeStyle(active ? (this.warm ? 3 : 2) : (this.warm ? 2 : 1), partColor, active ? 1 : 0.55);
      display.status.setText(goal.delivered
        ? `✓ Lv.${goal.level} ${this.mode === 'integrated' ? '장착 완료' : '납품 완료'}`
        : goal.installing
          ? `Lv.${goal.level} 장착 중…`
          : `현재 Lv.${current || '-'}  →  목표 Lv.${goal.level}`)
        .setColor(this.warm
          ? goal.delivered ? '#3f7851' : goal.installing ? '#a16028' : current > 0 ? '#a14a38' : '#7b5140'
          : goal.delivered ? '#ffffff' : goal.installing ? '#9ff3e3' : current > 0 ? '#ffd37a' : '#71899c');
    });
  }

  private drawOrderBike() {
    if (!this.orderBike) return;
    const isMtb = this.orderIndex === 1;
    const delivered = (type: PartType) => this.goals.find((goal) => goal.type === type)?.delivered ?? false;
    if (this.warm) {
      this.orderBike.destroy();
      const incompleteAlpha = 0.5;
      // 주문 카드 자전거: 홈 A안 warm 팔레트 기반 픽셀 자전거 스프라이트로 그린다.
      this.orderBike = drawPixelBike(this, WARM_BIKE_ANCHOR.x, WARM_BIKE_ANCHOR.y, WARM_BIKE_CELL, {
        category: isMtb ? 'mtb' : 'road',
        colorway: makeWarmColorway(WARM_BIKE_FRAME_COLOR),
        depth: 4,
        partAlpha: {
          frame: delivered('frame') ? 1 : incompleteAlpha,
          wheel: delivered('wheel') ? 1 : incompleteAlpha,
          drivetrain: delivered('drivetrain') ? 1 : incompleteAlpha,
          handlebar: delivered('handlebar') ? 1 : incompleteAlpha,
        },
      });
      return;
    }
    const g = this.orderBike.clear();
    const alpha = (type: PartType) => delivered(type) ? 1 : (this.warm ? 0.42 : 0.16);
    const wheelColor = this.partColor('wheel');
    const frameColor = this.partColor('frame');
    const drivetrainColor = this.partColor('drivetrain');
    const handlebarColor = this.partColor('handlebar');
    const lightInk = this.warm ? 0xfff1c6 : 0xffd29a;
    const darkInk = this.warm ? 0x3b2531 : 0x07111f;

    // 실제 자전거 비율 기준점: BB(크랭크)는 허브 축보다 아래(BB 드롭), 시트튜브 상단은 BB보다 뒤쪽에 둔다.
    const rearX = 218;
    const frontX = 546;
    const groundY = 350;
    const radius = isMtb ? 55 : 49;
    const crankX = isMtb ? 352 : 356;
    const crankY = groundY + (isMtb ? 10 : 14);
    const seatX = isMtb ? 318 : 330;
    const seatY = isMtb ? 218 : 208;
    const headTopX = isMtb ? 478 : 486;
    const headTopY = isMtb ? 234 : 216;
    const headBottomX = isMtb ? 492 : 498;
    const headBottomY = isMtb ? 270 : 258;
    const frameWidth = isMtb ? 10 : 8;

    const drawWheel = (x: number) => {
      const wheelAlpha = alpha('wheel');
      // MTB는 굵고 각진 타이어, 로드는 얇은 이중 림으로 구분한다.
      g.lineStyle(isMtb ? 13 : 7, this.warm ? darkInk : wheelColor, wheelAlpha * (this.warm ? 0.72 : 1)).strokeCircle(x, groundY, radius);
      g.lineStyle(isMtb ? 5 : 4, wheelColor, wheelAlpha).strokeCircle(x, groundY, radius - (isMtb ? 7 : 4));
      g.lineStyle(2, lightInk, wheelAlpha * 0.86).strokeCircle(x, groundY, radius - (isMtb ? 12 : 9));
      if (isMtb) {
        for (let angle = 0; angle < 360; angle += 18) {
          const rad = Phaser.Math.DegToRad(angle);
          const inner = radius - 5;
          const outer = radius + 3;
          g.lineStyle(3, wheelColor, wheelAlpha)
            .lineBetween(x + Math.cos(rad) * inner, groundY + Math.sin(rad) * inner, x + Math.cos(rad) * outer, groundY + Math.sin(rad) * outer);
        }
      }
      g.lineStyle(1.5, lightInk, wheelAlpha * 0.72);
      for (let angle = 0; angle < 360; angle += (isMtb ? 30 : 20)) {
        const rad = Phaser.Math.DegToRad(angle);
        g.lineBetween(x, groundY, x + Math.cos(rad) * (radius - (isMtb ? 10 : 7)), groundY + Math.sin(rad) * (radius - (isMtb ? 10 : 7)));
      }
      g.fillStyle(wheelColor, wheelAlpha).fillCircle(x, groundY, isMtb ? 7 : 5);
      g.lineStyle(2, darkInk, wheelAlpha).strokeCircle(x, groundY, isMtb ? 7 : 5);
    };
    drawWheel(rearX);
    drawWheel(frontX);

    // 프레임: 따뜻한 안에서는 짙은 픽셀 잉크 외곽선을 먼저 그려 종이 위 도안처럼 읽히게 한다.
    if (this.warm) {
      g.lineStyle(frameWidth + 5, darkInk, alpha('frame') * 0.62);
      g.lineBetween(rearX, groundY, seatX, seatY);
      g.lineBetween(seatX, seatY, crankX, crankY);
      g.lineBetween(crankX, crankY, rearX, groundY);
      g.lineBetween(seatX, seatY, headTopX, headTopY);
      g.lineBetween(headTopX, headTopY, headBottomX, headBottomY);
      g.lineBetween(headBottomX, headBottomY, crankX, crankY);
    }
    // 프레임: 다이아몬드 구조(시트스테이·시트튜브·체인스테이·탑튜브·헤드튜브·다운튜브).
    g.lineStyle(frameWidth, frameColor, alpha('frame'));
    g.lineBetween(rearX, groundY, seatX, seatY);
    g.lineBetween(seatX, seatY, crankX, crankY);
    g.lineBetween(crankX, crankY, rearX, groundY);
    g.lineBetween(seatX, seatY, headTopX, headTopY);
    g.lineBetween(headTopX, headTopY, headBottomX, headBottomY);
    g.lineBetween(headBottomX, headBottomY, crankX, crankY);
    if (this.warm) {
      [
        [rearX, groundY], [seatX, seatY], [crankX, crankY],
        [headTopX, headTopY], [headBottomX, headBottomY], [frontX, groundY],
      ].forEach(([x, y]) => {
        g.fillStyle(darkInk, alpha('frame') * 0.72).fillRect(x - 5, y - 5, 10, 10);
        g.fillStyle(frameColor, alpha('frame')).fillRect(x - 3, y - 3, 6, 6);
      });
    }

    // 포크: MTB는 서스펜션(굵은 로워 + 밝은 스탠션), 로드는 얇은 일자 포크.
    if (isMtb) {
      g.lineStyle(11, this.warm ? 0x9e3f32 : 0x2d6f6b, alpha('frame')).lineBetween(headBottomX, headBottomY, frontX, groundY);
      g.lineStyle(4, this.warm ? 0xf6d995 : 0xc8fff5, alpha('frame')).lineBetween(
        headBottomX, headBottomY,
        headBottomX + (frontX - headBottomX) * 0.45, headBottomY + (groundY - headBottomY) * 0.45,
      );
    } else {
      g.lineStyle(6, this.warm ? 0xe87558 : 0x71e5d0, alpha('frame')).lineBetween(headBottomX, headBottomY, frontX, groundY);
    }

    // 시트포스트와 안장: 시트튜브 연장선 위에 올린다.
    const postTopX = seatX - 5;
    const postTopY = seatY - 26;
    g.lineStyle(5, this.warm ? 0xe87558 : 0x71e5d0, alpha('frame')).lineBetween(seatX, seatY, postTopX, postTopY);
    g.lineStyle(isMtb ? 8 : 6, this.warm ? 0x573044 : 0x8bf1df, alpha('frame')).lineBetween(postTopX - 26, postTopY - 5, postTopX + 18, postTopY - 5);
    if (isMtb) {
      // MTB 전용 리어 쇼크: 탑튜브와 다운튜브를 잇는 대각선으로 연결한다.
      g.lineStyle(5, this.warm ? 0xf6d995 : 0xc8fff5, alpha('frame')).lineBetween(seatX + 42, seatY + 8, crankX + 36, crankY - 26);
    }

    // 구동계: 체인링, 크랭크·페달, 체인, 리어 카세트.
    const driveAlpha = alpha('drivetrain');
    const ringRadius = isMtb ? 16 : 19;
    const cassetteRadius = isMtb ? 13 : 10;
    g.lineStyle(5, drivetrainColor, driveAlpha).strokeCircle(crankX, crankY, ringRadius);
    g.lineStyle(2, this.warm ? 0xb9dd9a : 0xffb0bd, driveAlpha).strokeCircle(crankX, crankY, ringRadius - 6);
    g.lineStyle(3, this.warm ? 0x86ba6f : 0xff9bab, driveAlpha)
      .strokeCircle(rearX, groundY, cassetteRadius)
      .lineBetween(crankX, crankY - ringRadius, rearX, groundY - cassetteRadius)
      .lineBetween(crankX, crankY + ringRadius, rearX, groundY + cassetteRadius);
    g.lineStyle(4, drivetrainColor, driveAlpha)
      .lineBetween(crankX, crankY, crankX + 24, crankY + 16)
      .lineBetween(crankX, crankY, crankX - 24, crankY - 16);
    g.lineStyle(5, this.warm ? 0xb9dd9a : 0xffb0bd, driveAlpha)
      .lineBetween(crankX + 18, crankY + 16, crankX + 32, crankY + 16)
      .lineBetween(crankX - 32, crankY - 16, crankX - 18, crankY - 16);

    // MTB는 넓은 플랫바, 로드는 스템과 드롭바를 강조한다.
    const barAlpha = alpha('handlebar');
    if (isMtb) {
      const stemTopX = headTopX + 5;
      const stemTopY = headTopY - 20;
      g.lineStyle(6, handlebarColor, barAlpha).lineBetween(headTopX, headTopY, stemTopX, stemTopY);
      g.lineStyle(7, handlebarColor, barAlpha).lineBetween(stemTopX - 44, stemTopY - 4, stemTopX + 48, stemTopY - 4);
      g.lineStyle(5, this.warm ? 0x86c9c8 : 0xb4a9ff, barAlpha)
        .lineBetween(stemTopX - 44, stemTopY - 12, stemTopX - 44, stemTopY + 4)
        .lineBetween(stemTopX + 48, stemTopY - 12, stemTopX + 48, stemTopY + 4);
      g.fillStyle(handlebarColor, barAlpha).fillCircle(stemTopX - 26, stemTopY, 3).fillCircle(stemTopX + 30, stemTopY, 3);
    } else {
      // 스티어러는 헤드튜브 기울기를 따라 올리고, 드롭바는 앞으로 뻗은 뒤 아래로 말리는 곡선으로 그린다.
      const steerX = headTopX - 4;
      const steerY = headTopY - 14;
      const barX = steerX + 30;
      const barY = steerY - 4;
      g.lineStyle(6, handlebarColor, barAlpha)
        .lineBetween(headTopX, headTopY, steerX, steerY)
        .lineBetween(steerX, steerY, barX, barY);
      // arc는 lineBetween과 체이닝하면 beginPath에 경로가 지워지므로 명시적으로 경로를 그린다.
      g.lineStyle(5, this.warm ? 0x86c9c8 : 0xb4a9ff, barAlpha);
      g.beginPath();
      g.arc(barX, barY + 14, 14, -Math.PI / 2, Math.PI * 0.65, false);
      g.strokePath();
      // 브레이크 후드.
      g.lineStyle(4, this.warm ? 0xcce6d2 : 0xd5cfff, barAlpha).lineBetween(barX + 12, barY + 8, barX + 16, barY + 18);
    }

    // 미완성 부품은 위 자전거 본체의 낮은 alpha로만 표시한다.
    // 별도 외곽 도형은 실제 부품처럼 보이지 않고 화면에 잔여 UI로 오인되어 그리지 않는다.
  }

  private destroySceneObject(object: Phaser.GameObjects.GameObject) {
    if (object instanceof Phaser.GameObjects.Container) object.destroy(true);
    else object.destroy();
  }

  private refreshMetrics() {
    if (!this.metrics) return;
    const seconds = Math.floor((this.time.now - this.startedAt) / 1000);
    if (this.mode === 'order') {
      this.metrics.setText(`${seconds}s · 클릭 ${this.actions} · 자동 머지 ${this.merges} · 완성 ${this.goals.filter((goal) => goal.delivered).length}/4`);
      return;
    }
    const occupied = this.pieces.reduce((sum, piece) => sum + this.shape(piece.type, piece.rotation).length, 0);
    this.metrics.setText(`${seconds}s · 행동 ${this.actions} · 머지 ${this.merges} · 오입력 ${this.mistakes} · 빈칸 ${this.rows * this.columns - occupied}`);
  }

  private recommendedPart() { return this.goals.find((goal) => !goal.delivered)?.type ?? this.selectedGenerator; }
  private partName(type: PartType) { return PARTS.find((part) => part.type === type)!.name; }
}

export function startMergePrototype(parent: string, mode: MergePrototypeMode, theme: MergePrototypeTheme = 'lab') {
  return new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width: 1120,
    height: 720,
    backgroundColor: theme === 'warm-pixel' ? '#c78452' : '#0b1727',
    scene: new MergePrototypeScene(mode, theme),
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    input: { activePointers: 2 },
  });
}
