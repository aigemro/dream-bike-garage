// 머지 작업대 화면 (머지 코어 E안 · 390×810)
// 게임 화면 B안(game-screen-mobile)의 화면 구성(헤더 → 주문 카드 → 6×7 보드 → 하단 선반)과 따뜻한 픽셀 팔레트를 그대로 쓰고,
// 규칙은 domain/merge-workbench(가운데→바깥 자동 입고·이동 금지·인접 2개 합성·연쇄 보너스·알바 체력)를 사용합니다.
// 작업대 상태는 컨트롤러가 소유하며, 이 화면은 도메인 함수로 바꾼 뒤 onChange로 저장을 요청합니다.
// 납품은 행동 시점에 도메인이 확정하고, 화면은 확정된 이벤트를 순서대로 연출만 합니다.
import Phaser from 'phaser';
import { drawPixelBike, drawPixelPartIcon, makeWarmColorway, bikePartAnchorOffset, WARM_PART_COLORS } from './bike-pixel-sprite';
import { orderMetaAt } from './meta-progress';
import type { ReleaseSfxEvent } from './release-audio';
import {
  COMBO_FREE_BOX,
  COMBO_GUARANTEE,
  ENERGY_MAX,
  WORKBENCH_COLUMNS,
  WORKBENCH_PART_TYPES,
  WORKBENCH_ROWS,
  WORKBENCH_CELLS,
  WORKBENCH_MAX_LEVEL,
  canMerge,
  discardPart,
  mergeParts,
  mergeTargets,
  msUntilNextEnergy,
  nextIntakeSlot,
  openPartBox,
  orderIndexOf,
  recoverEnergy,
  supplyBlock,
  undoLast,
  type Installed,
  type WorkbenchEvent,
  orderListOf,
  type WorkbenchOrders,
  type WorkbenchPart,
  type WorkbenchPartType,
  type WorkbenchState,
} from '../../domain/merge-workbench';

const FONT = '"Arial Rounded MT Bold", "Noto Sans KR", sans-serif';
const INK = '#3b2531';
const MUTED = '#7b5140';
const CREAM_TEXT = '#fff1c6';
const SUCCESS = '#3f7851';
const ALERT = '#a14a38';
const ERROR_TEXT = '#ffd7c9';
const CREAM = 0xfff1c6;
const GOLD = 0xf6d995;
const BORDER = 0x3b2531;
const BROWN = 0x8e5136;
const DARK_WOOD = 0x573044;
// 팔레트 FLOOR: 상자 아이콘 몸통 색 (첫 플레이 안내 오버레이와 동일)
const FLOOR = 0xb66f45;
const RED = 0xc95746;
const GREEN = 0x5e9a67;
const AMBER = 0xf4b84a;
const CELL_FILL = 0xffe6a8;
const CELL_LINE = 0x9c5b3c;

// 게임 화면 B안과 같은 배치 수치 (셀 52 = floor(min(368/6, 364/7)), 보드 가운데 정렬)
const CELL = 52;
const GAP = 4;
const BOARD_LEFT = 39;
const BOARD_TOP = 234;
const BOARD_BOTTOM = BOARD_TOP + WORKBENCH_ROWS * CELL;
const BIKE_X = 292;
const BIKE_Y = 132;
const BIKE_CELL = 2;
const SHELF_TOP = 668;
const ROW1_Y = 708;
const ROW2_Y = 762;
const BOX = { x: 136, y: ROW1_Y, w: 240, h: 48 };
const RETURN_CONFIRM_MS = 2500;
const NONE = -1;

const PART_NAMES: Record<WorkbenchPartType, string> = { frame: '프레임', wheel: '휠셋', drivetrain: '구동계', handlebar: '핸들바' };
const noneInstalled = (): Installed => ({ frame: false, wheel: false, drivetrain: false, handlebar: false });

type Point = { x: number; y: number };
type Tone = 'info' | 'error';
type Drag = { from: number; start: Point; dragging: boolean; hover: number; ghost?: Phaser.GameObjects.Container };

export type WorkbenchDaySummary = { dayNumber: number; done: number; target: number; earnings: number; closing: boolean };

export type MergeWorkbenchScreenHooks = {
  workbench: WorkbenchState;
  // 영업일 순서의 주문표(또는 단순 목록). 누적 주문 순번 → 위치 변환은 도메인 orderIndexOf가 담당합니다.
  orders: WorkbenchOrders;
  getDay: () => WorkbenchDaySummary;
  // 거짓이면 상자 열기·합성·반품·되돌리기를 받지 않습니다 (하루 마감·일시정지).
  canPlay: () => boolean;
  onChange: () => void;
  // 납품 1건이 확정될 때마다 정확히 한 번 호출합니다. 코인·이해도·Day 통계는 컨트롤러가 반영합니다.
  onDelivered: (delivery: { orderIndex: number; reward: number }) => void;
  onHome: () => void;
  onSfx?: (event: ReleaseSfxEvent) => void;
};

const textStyle = (size: number, color: string, bold = true): Phaser.Types.GameObjects.Text.TextStyle =>
  ({ fontFamily: FONT, fontSize: `${size}px`, color, fontStyle: bold ? 'bold' : 'normal' });

function cellCenter(index: number): Point {
  return {
    x: BOARD_LEFT + (index % WORKBENCH_COLUMNS) * CELL + CELL / 2,
    y: BOARD_TOP + Math.floor(index / WORKBENCH_COLUMNS) * CELL + CELL / 2,
  };
}

function cellAt(x: number, y: number): number {
  const column = Math.floor((x - BOARD_LEFT) / CELL);
  const row = Math.floor((y - BOARD_TOP) / CELL);
  return column >= 0 && column < WORKBENCH_COLUMNS && row >= 0 && row < WORKBENCH_ROWS ? row * WORKBENCH_COLUMNS + column : NONE;
}

function clockLabel(ms: number) {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

const partLabel = (part: WorkbenchPart) => `${PART_NAMES[part.type]} Lv.${part.level}`;

class MergeWorkbenchScene extends Phaser.Scene {
  constructor(private readonly hooks: MergeWorkbenchScreenHooks) { super('merge-workbench'); }

  private alive = false;
  private reducedMotion = false;
  private selected = NONE;
  private drag?: Drag;
  private returnConfirmUntil = 0;
  // 연출 순서: 상태는 즉시 바뀌고, 주문 카드는 이벤트 연출을 따라 늦게 바뀝니다.
  private queue: Promise<void> = Promise.resolve();
  private generation = 0;
  private shownOrder = 0;
  private shownInstalled = noneInstalled();
  private arriving = new Set<number>();
  private fx = new Set<Phaser.GameObjects.GameObject>();
  private pieces = new Map<number, Phaser.GameObjects.Container>();

  private dayBadge!: Phaser.GameObjects.Text;
  private dayOrders!: Phaser.GameObjects.Text;
  private dayOrdersPanel!: Phaser.GameObjects.Rectangle;
  private dayIncome!: Phaser.GameObjects.Text;
  private dayFill!: Phaser.GameObjects.Rectangle;
  private orderTitle!: Phaser.GameObjects.Text;
  private orderProgress!: Phaser.GameObjects.Text;
  private orderReward!: Phaser.GameObjects.Text;
  private orderBike?: Phaser.GameObjects.Graphics;
  private chips = new Map<WorkbenchPartType, { panel: Phaser.GameObjects.Rectangle; status: Phaser.GameObjects.Text }>();
  private nextMarker!: Phaser.GameObjects.Container;
  private highlight!: Phaser.GameObjects.Graphics;
  private dropHint!: Phaser.GameObjects.Graphics;
  private info!: Phaser.GameObjects.Text;
  private cancelButton!: Phaser.GameObjects.Rectangle;
  private cancelLabel!: Phaser.GameObjects.Text;
  private boxButton!: Phaser.GameObjects.Rectangle;
  private boxTitle!: Phaser.GameObjects.Text;
  private boxStatus!: Phaser.GameObjects.Text;
  private boxCost!: Phaser.GameObjects.Text;
  private undoButton!: Phaser.GameObjects.Rectangle;
  private undoLabel!: Phaser.GameObjects.Text;
  private returnButton!: Phaser.GameObjects.Rectangle;
  private returnLabel!: Phaser.GameObjects.Text;
  private energyTitle!: Phaser.GameObjects.Text;
  private energySub!: Phaser.GameObjects.Text;
  private energyFill!: Phaser.GameObjects.Rectangle;
  private comboTitle!: Phaser.GameObjects.Text;
  private comboSub!: Phaser.GameObjects.Text;
  private comboDots: Phaser.GameObjects.Rectangle[] = [];

  private get state() { return this.hooks.workbench; }

  create() {
    this.alive = true;
    this.reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
    this.shownOrder = this.state.order;
    this.shownInstalled = { ...this.state.installed };
    this.cameras.main.setBackgroundColor('#c78452');
    this.drawBackdrop();
    this.drawHeader();
    this.drawOrderCard();
    this.drawBoard();
    this.drawShelf();
    this.input.on('pointermove', this.onPointerMove, this);
    this.input.on('pointerup', this.onPointerUp, this);
    this.input.on('gameout', () => this.cancelDrag());
    // 체력 회복 표시는 1초마다 갱신합니다.
    this.time.addEvent({ delay: 1000, loop: true, callback: () => this.tickEnergy() });
    this.events.once('shutdown', () => this.shutdown());
    this.events.once('destroy', () => this.shutdown());
    this.renderAll();
    this.setInfo(this.hooks.canPlay()
      ? '점선 칸이 다음 입고 자리예요. 상하좌우로 맞닿은 같은 부품을 눌러 합성하세요.'
      : '오늘 주문을 모두 납품했어요. 정산을 준비하고 있어요.');
  }

  update() {
    if (!this.alive) return;
    const day = this.hooks.getDay();
    this.dayBadge.setText(`DAY ${day.dayNumber}`);
    this.dayOrders.setText(day.closing ? '마감' : `주문 ${Math.min(day.done, day.target)}/${day.target}`).setColor(day.closing ? CREAM_TEXT : INK);
    this.dayOrdersPanel.setFillStyle(day.closing ? GREEN : AMBER);
    this.dayIncome.setText(`오늘 수입  ${day.earnings.toLocaleString()} C`);
    this.dayFill.setScale(Phaser.Math.Clamp(day.done / Math.max(1, day.target), 0, 1), 1);
  }

  private shutdown() {
    if (!this.alive) return;
    this.alive = false;
    this.cancelDrag();
    recoverEnergy(this.state, Date.now());
    this.hooks.onChange();
    this.clearFx();
  }

  // ── 고정 화면 ──
  private drawBackdrop() {
    this.add.rectangle(195, 300, 390, 600, 0xc78452).setDepth(0);
    this.add.rectangle(195, 705, 390, 210, 0xa9683f).setDepth(0);
    for (let y = 626; y < 810; y += 26) this.add.rectangle(195, y, 390, 2, 0x8a5231, 0.5).setDepth(0);
    for (let x = 24; x < 390; x += 52) this.add.rectangle(x, 300, 2, 600, 0xb37246, 0.35).setDepth(0);
  }

  // 작업대 헤더 60px: 1행 WORK·공방 이름·홈, 2행 DAY·오늘 주문 진행·오늘 수입, 맨 아래 주문 진행 막대
  private drawHeader() {
    this.add.rectangle(195, 30, 390, 60, CREAM).setStrokeStyle(4, BORDER).setDepth(8);
    this.add.rectangle(42, 16, 60, 18, RED).setStrokeStyle(2, BORDER).setDepth(9);
    this.add.text(42, 16, 'WORK', textStyle(10, CREAM_TEXT)).setOrigin(0.5).setDepth(10);
    this.add.text(80, 9, '두리 자전거 공방 · 작업대', textStyle(12, INK)).setDepth(10);
    // 홈 버튼: 시각 크기는 60×20이지만 터치 영역은 64×44로 넓힙니다.
    // hitArea는 버튼 좌상단 기준 로컬 좌표라, y −6부터 44px이면 월드 y 0~44가 되어 캔버스 위로 잘리지 않습니다.
    this.add.rectangle(350, 16, 60, 20, GOLD).setStrokeStyle(2, BORDER).setDepth(9)
      .setInteractive({ hitArea: new Phaser.Geom.Rectangle(-2, -6, 64, 44), hitAreaCallback: Phaser.Geom.Rectangle.Contains, useHandCursor: true })
      .on('pointerdown', () => { this.hooks.onSfx?.('tap'); this.hooks.onHome(); });
    this.add.text(350, 16, '← 홈', textStyle(11, INK)).setOrigin(0.5).setDepth(10);
    this.add.rectangle(48, 41, 72, 22, BROWN).setStrokeStyle(2, BORDER).setDepth(9);
    this.dayBadge = this.add.text(48, 41, '', textStyle(12, CREAM_TEXT)).setOrigin(0.5).setDepth(10);
    this.dayOrdersPanel = this.add.rectangle(130, 41, 76, 24, AMBER).setStrokeStyle(2, BORDER).setDepth(9);
    this.dayOrders = this.add.text(130, 41, '', textStyle(13, INK)).setOrigin(0.5).setDepth(10);
    this.add.rectangle(276, 41, 200, 22, GOLD).setStrokeStyle(2, BROWN).setDepth(9);
    this.dayIncome = this.add.text(276, 41, '', textStyle(11, MUTED)).setOrigin(0.5).setDepth(10);
    this.add.rectangle(6, 56, 378, 3, DARK_WOOD).setOrigin(0, 0.5).setDepth(10);
    this.dayFill = this.add.rectangle(6, 56, 378, 3, GREEN).setOrigin(0, 0.5).setDepth(11);
    this.update();
  }

  private drawOrderCard() {
    this.add.rectangle(195, 138, 374, 140, CREAM).setStrokeStyle(4, BROWN).setDepth(2);
    this.add.rectangle(64, 78, 88, 22, RED).setStrokeStyle(2, BORDER).setDepth(3);
    this.add.text(64, 78, 'NEW ORDER', textStyle(10, CREAM_TEXT)).setOrigin(0.5).setDepth(4);
    this.orderTitle = this.add.text(20, 94, '', textStyle(15, INK)).setDepth(4);
    this.orderProgress = this.add.text(20, 117, '', textStyle(11, MUTED)).setDepth(4);
    this.orderReward = this.add.text(BIKE_X, 186, '', textStyle(11, '#a16028')).setOrigin(0.5).setDepth(4);
    WORKBENCH_PART_TYPES.forEach((type) => {
      const { x, y } = this.chipCenter(type);
      const panel = this.add.rectangle(x, y, 42, 40, GOLD).setStrokeStyle(2, WARM_PART_COLORS[type]).setDepth(3);
      drawPixelPartIcon(this, x, y - 9, 1.5, type, { depth: 4 });
      const status = this.add.text(x, y + 11, '', textStyle(11, MUTED)).setOrigin(0.5).setDepth(4);
      this.chips.set(type, { panel, status });
    });
  }

  private chipCenter(type: WorkbenchPartType): Point {
    return { x: 42 + WORKBENCH_PART_TYPES.indexOf(type) * 46, y: 168 };
  }

  private drawBoard() {
    const width = WORKBENCH_COLUMNS * CELL;
    const height = WORKBENCH_ROWS * CELL;
    this.add.rectangle(BOARD_LEFT + width / 2, BOARD_TOP + height / 2, width + 16, height + 16, BROWN).setStrokeStyle(5, BORDER).setDepth(0);
    for (let index = 0; index < WORKBENCH_CELLS; index += 1) {
      const { x, y } = cellCenter(index);
      this.add.rectangle(x, y, CELL - GAP, CELL - GAP, CELL_FILL).setStrokeStyle(2, CELL_LINE).setDepth(1)
        .setInteractive({ useHandCursor: true })
        .on('pointerdown', (pointer: Phaser.Input.Pointer) => this.onCellDown(index, pointer));
    }
    // 다음 입고 칸: 점선 테두리 + 상자 아이콘
    const dashes = this.add.graphics();
    dashes.fillStyle(BROWN, 1);
    for (let t = -20; t < 20; t += 8) dashes.fillRect(t, -21, 5, 3).fillRect(t, 18, 5, 3).fillRect(-21, t, 3, 5).fillRect(18, t, 3, 5);
    this.nextMarker = this.add.container(0, 0, [
      dashes,
      this.drawBoxIcon(0, -6, 1.5),
      this.add.text(0, 12, '다음 입고', textStyle(9, MUTED)).setOrigin(0.5),
    ]).setDepth(3);
    if (!this.reducedMotion) this.tweens.add({ targets: this.nextMarker, alpha: { from: 1, to: 0.45 }, duration: 700, yoyo: true, repeat: -1 });
    this.highlight = this.add.graphics().setDepth(5);
    this.dropHint = this.add.graphics().setDepth(6);

    // 안내 문구 11px: 줄바꿈 폭 258은 오른쪽 '× 선택 취소' 버튼 왼쪽 가장자리(282)와 12px 이상 띄우기 위한 값이고,
    // 시작 y는 보드 테두리 아래 4px 여백을 두되 3줄까지 선반 상단(668-11)에 닿지 않도록 줄 간격 2를 유지합니다.
    this.info = this.add.text(12, BOARD_BOTTOM + 10, '', { ...textStyle(11, CREAM_TEXT, false), wordWrap: { width: 258 }, lineSpacing: 2 }).setDepth(10);
    this.cancelButton = this.add.rectangle(334, BOARD_BOTTOM + 38, 104, 44, BROWN).setStrokeStyle(2, CREAM).setDepth(10)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => this.deselect());
    this.cancelLabel = this.add.text(334, BOARD_BOTTOM + 38, '× 선택 취소', textStyle(11, CREAM_TEXT)).setOrigin(0.5).setDepth(11);
  }

  // 택배 상자 픽셀 아이콘 (부품 아이콘과 같은 잉크 외곽선 톤)
  private drawBoxIcon(x: number, y: number, cell: number) {
    const g = this.add.graphics();
    const px = (cx: number, cy: number, w: number, h: number, color: number) => g.fillStyle(color, 1).fillRect(x + cx * cell, y + cy * cell, w * cell, h * cell);
    px(-7, -5, 14, 11, BORDER);
    px(-6, -4, 12, 9, FLOOR);
    px(-6, -4, 12, 3, BROWN);
    px(-1, -4, 2, 9, GOLD);
    px(-5, 2, 3, 1, CREAM);
    return g;
  }

  // 게임 화면 B안 '택배 선반' 자리에 부품 상자·되돌리기·반품(1행)과 알바 체력·연쇄 합성(2행)을 둡니다.
  private drawShelf() {
    this.add.rectangle(195, SHELF_TOP + 66, 374, 136, CREAM).setStrokeStyle(4, BORDER).setDepth(2);
    this.add.rectangle(96, SHELF_TOP, 152, 22, BROWN).setDepth(3);
    this.add.text(28, SHELF_TOP - 7, '부품 상자 · PARTS BOX', textStyle(10, CREAM_TEXT)).setDepth(4);
    this.add.rectangle(282, SHELF_TOP, 200, 22, BROWN).setStrokeStyle(2, BORDER).setDepth(3);
    this.add.text(282, SHELF_TOP, `${COMBO_FREE_BOX}연쇄 무료 상자 · ${COMBO_GUARANTEE}연쇄 필수 부품`, textStyle(10, CREAM_TEXT)).setOrigin(0.5).setDepth(4);

    this.boxButton = this.add.rectangle(BOX.x, BOX.y, BOX.w, BOX.h, GOLD).setStrokeStyle(3, BROWN).setDepth(3)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => this.onOpenBox());
    this.drawBoxIcon(BOX.x - BOX.w / 2 + 26, BOX.y, 2).setDepth(4);
    this.boxTitle = this.add.text(BOX.x - BOX.w / 2 + 48, BOX.y - 17, '부품 상자 열기', textStyle(12, INK)).setDepth(4);
    this.boxStatus = this.add.text(BOX.x - BOX.w / 2 + 48, BOX.y + 2, '', textStyle(10, MUTED, false)).setDepth(4);
    this.boxCost = this.add.text(BOX.x + BOX.w / 2 - 8, BOX.y - 17, '', textStyle(11, ALERT)).setOrigin(1, 0).setDepth(4);

    [this.undoButton, this.undoLabel] = this.smallButton(290, '↶\n되돌리기', () => this.onUndo());
    [this.returnButton, this.returnLabel] = this.smallButton(350, '↗\n반품', () => this.onReturn());

    const energy = this.infoPanel(104);
    this.energyTitle = energy.title;
    this.energySub = energy.sub;
    this.add.rectangle(24, ROW2_Y + 16, 160, 5, DARK_WOOD).setOrigin(0, 0.5).setDepth(4);
    this.energyFill = this.add.rectangle(24, ROW2_Y + 16, 160, 5, GREEN).setOrigin(0, 0.5).setDepth(5);

    const combo = this.infoPanel(286);
    this.comboTitle = combo.title;
    this.comboSub = combo.sub.setColor(MUTED).setFontStyle('bold');
    for (let i = 0; i < COMBO_GUARANTEE; i += 1) {
      const milestone = i === COMBO_FREE_BOX - 1 || i === COMBO_GUARANTEE - 1;
      this.comboDots.push(this.add.rectangle(306 + i * 14, ROW2_Y - 11, milestone ? 11 : 9, milestone ? 11 : 9, CREAM).setStrokeStyle(2, BORDER).setDepth(4));
    }
  }

  private smallButton(x: number, label: string, handler: () => void): [Phaser.GameObjects.Rectangle, Phaser.GameObjects.Text] {
    const button = this.add.rectangle(x, ROW1_Y, 56, 48, BROWN).setStrokeStyle(2, BORDER).setDepth(3)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', handler);
    const text = this.add.text(x, ROW1_Y, label, { ...textStyle(11, CREAM_TEXT), align: 'center', lineSpacing: 2 }).setOrigin(0.5).setDepth(4);
    return [button, text];
  }

  // 작은 버튼 상태 표시: 비활성은 PAPER 반투명 바탕 + INK 글자로 라벨이 읽히게, 활성은 갈색 바탕 + 크림 글자로 대비를 줍니다.
  private styleSmallButton(button: Phaser.GameObjects.Rectangle, label: Phaser.GameObjects.Text, enabled: boolean, fill = BROWN) {
    button.setFillStyle(enabled ? fill : GOLD, enabled ? 1 : 0.6).setStrokeStyle(2, BORDER, enabled ? 1 : 0.5);
    label.setColor(enabled ? CREAM_TEXT : INK).setAlpha(enabled ? 1 : 0.55);
  }

  private infoPanel(x: number) {
    this.add.rectangle(x, ROW2_Y, 172, 48, GOLD).setStrokeStyle(2, BROWN).setDepth(3);
    return {
      title: this.add.text(x - 80, ROW2_Y - 18, '', textStyle(11, INK)).setDepth(4),
      sub: this.add.text(x - 80, ROW2_Y - 2, '', textStyle(10, MUTED, false)).setDepth(4),
    };
  }

  // ── 표시 ──
  private renderAll() {
    this.renderBoard();
    this.renderOrder();
    this.renderShelf();
  }

  private makePiece(part: WorkbenchPart, at: Point) {
    const block = this.add.rectangle(0, 0, CELL - GAP * 2, CELL - GAP * 2, WARM_PART_COLORS[part.type]).setStrokeStyle(3, BORDER);
    const icon = drawPixelPartIcon(this, 0, -8, 2, part.type, { level: part.level });
    const badge = this.add.rectangle(0, 14, 34, 18, CREAM, 0.94).setStrokeStyle(2, BORDER, 0.8);
    const tag = this.add.text(0, 14, `Lv.${part.level}`, textStyle(11, INK)).setOrigin(0.5);
    return this.add.container(at.x, at.y, [block, icon, badge, tag]).setDepth(2);
  }

  private renderBoard() {
    this.pieces.forEach((piece) => piece.destroy(true));
    this.pieces.clear();
    this.state.board.forEach((part, index) => {
      if (!part) return;
      const piece = this.makePiece(part, cellCenter(index));
      if (this.arriving.has(index)) piece.setAlpha(0);
      this.pieces.set(index, piece);
    });
    const slot = nextIntakeSlot(this.state.board);
    this.nextMarker.setVisible(slot >= 0);
    if (slot >= 0) this.nextMarker.setPosition(cellCenter(slot).x, cellCenter(slot).y);
    this.renderSelection();
  }

  private renderSelection() {
    this.highlight.clear();
    const active = this.selected !== NONE && !!this.state.board[this.selected];
    this.pieces.forEach((piece, index) => piece.setScale(active && index === this.selected ? 1.06 : 1));
    this.cancelButton.setVisible(active);
    this.cancelLabel.setVisible(active);
    if (!active) return;
    const center = cellCenter(this.selected);
    this.highlight.lineStyle(3, CREAM, 1).strokeRect(center.x - 26, center.y - 26, 52, 52);
    for (const target of mergeTargets(this.state.board, this.selected)) {
      const at = cellCenter(target);
      this.highlight.fillStyle(GREEN, 0.2).fillRect(at.x - 22, at.y - 22, 44, 44);
      this.highlight.lineStyle(4, GREEN, 1).strokeRect(at.x - 24, at.y - 24, 48, 48);
    }
  }

  private orderSpec(order: number) {
    const orderIndex = orderIndexOf(order, this.hooks.orders);
    return { orderIndex, spec: orderListOf(this.hooks.orders)[orderIndex], meta: orderMetaAt(orderIndex) };
  }

  private renderOrder() {
    const { orderIndex, spec, meta } = this.orderSpec(this.shownOrder);
    const installedCount = WORKBENCH_PART_TYPES.filter((type) => this.shownInstalled[type]).length;
    this.orderTitle.setText(meta?.name ?? `주문 ${orderIndex + 1}`);
    this.orderProgress.setText(`장착 ${installedCount}/4 · 완성 즉시 자동 장착`);
    this.orderReward.setText(`납품 보상 ${spec.reward.toLocaleString()} C`);
    WORKBENCH_PART_TYPES.forEach((type) => {
      const chip = this.chips.get(type)!;
      const done = this.shownInstalled[type];
      chip.status.setText(done ? '✓' : `Lv.${spec.levels[type]}`).setColor(done ? SUCCESS : MUTED);
      chip.panel.setFillStyle(done ? 0xdff0d0 : GOLD).setStrokeStyle(done ? 2 : 3, WARM_PART_COLORS[type], done ? 0.5 : 1);
    });
    const alpha = (type: WorkbenchPartType) => (this.shownInstalled[type] ? 1 : 0.5);
    this.orderBike?.destroy();
    this.orderBike = drawPixelBike(this, BIKE_X, BIKE_Y, BIKE_CELL, {
      category: meta?.bikeCategory ?? 'city',
      colorway: makeWarmColorway(RED),
      depth: 4,
      partAlpha: { frame: alpha('frame'), wheel: alpha('wheel'), drivetrain: alpha('drivetrain'), handlebar: alpha('handlebar') },
    });
  }

  private bikeAnchor(order: number, type: WorkbenchPartType): Point {
    const { dx, dy } = bikePartAnchorOffset(this.orderSpec(order).meta?.bikeCategory ?? 'city', type, BIKE_CELL);
    return { x: BIKE_X + dx, y: BIKE_Y + dy };
  }

  private renderShelf() {
    const now = Date.now();
    const block = supplyBlock(this.state);
    const free = this.state.freeBoxes > 0;
    const sure = this.state.guarantees > 0;
    const blocked = Boolean(block) || !this.hooks.canPlay();
    this.boxButton.setFillStyle(blocked ? 0xe8d3a6 : free ? 0xf4c86a : GOLD).setStrokeStyle(3, blocked ? 0xb08a6a : BROWN);
    this.boxTitle.setColor(blocked ? MUTED : INK);
    this.boxStatus
      .setText(block === 'full'
        ? '작업대가 가득 찼어요 · 반품으로 자리 확보'
        : block === 'energy'
          ? `체력 회복 중 · 다음 +1 ${clockLabel(msUntilNextEnergy(this.state, now))}`
          : `${free ? '무료 상자 · 체력 소모 없음' : '점선 칸에 자동 배치'}${sure ? ' · 필수 부품 확정' : ''}`)
      .setColor(block ? ALERT : free || sure ? SUCCESS : MUTED);
    this.boxCost.setText(free ? `무료 ×${this.state.freeBoxes}` : '⚡ −1').setColor(free ? SUCCESS : ALERT);

    this.styleSmallButton(this.undoButton, this.undoLabel, Boolean(this.state.undo));
    const canReturn = this.selected !== NONE && !!this.state.board[this.selected];
    const confirming = canReturn && this.time.now < this.returnConfirmUntil;
    this.styleSmallButton(this.returnButton, this.returnLabel, canReturn, confirming ? RED : BROWN);
    this.returnLabel.setText(confirming ? '한 번 더\n눌러 반품' : '↗\n반품');

    this.energyTitle.setText(`⚡ 알바 체력 ${this.state.energy}/${ENERGY_MAX}`);
    this.energySub.setText(this.state.energy >= ENERGY_MAX ? '가득 참' : `다음 +1 ${clockLabel(msUntilNextEnergy(this.state, now))}`);
    this.energyFill.setScale(this.state.energy / ENERGY_MAX, 1);
    this.comboTitle.setText(`연쇄 합성 ${this.state.combo}`);
    this.comboDots.forEach((dot, i) => dot.setFillStyle(i < this.state.combo ? (i < COMBO_FREE_BOX ? GREEN : AMBER) : CREAM));
    this.comboSub.setText(`무료 상자 ${this.state.freeBoxes} · 확정 ${this.state.guarantees}`);
  }

  private setInfo(message: string, tone: Tone = 'info') {
    this.info.setText(message).setColor(tone === 'error' ? ERROR_TEXT : CREAM_TEXT);
  }

  private say(message: string, tone: Tone = 'info') {
    this.setInfo(message, tone);
    this.hooks.onSfx?.(tone === 'error' ? 'error' : 'tap');
  }

  private tickEnergy() {
    if (!this.alive) return;
    const before = this.state.energy;
    recoverEnergy(this.state, Date.now());
    if (before !== this.state.energy) this.hooks.onChange();
    this.renderShelf();
  }

  // ── 입력: 탭 선택 → 대상 탭, 드래그 놓기도 같은 규칙 ──
  private blockedByDay() {
    if (this.hooks.canPlay()) return false;
    this.cancelDrag();
    this.say('오늘 주문을 모두 납품했어요. 정산을 준비하고 있어요.', 'error');
    return true;
  }

  private onCellDown(index: number, pointer: Phaser.Input.Pointer) {
    if (this.drag || this.blockedByDay()) return;
    this.drag = { from: index, start: { x: pointer.x, y: pointer.y }, dragging: false, hover: NONE };
  }

  private onPointerMove(pointer: Phaser.Input.Pointer) {
    const drag = this.drag;
    const part = drag ? this.state.board[drag.from] : null;
    if (!drag || !part || !pointer.isDown) return;
    if (!drag.dragging) {
      if (Phaser.Math.Distance.Between(drag.start.x, drag.start.y, pointer.x, pointer.y) < 8) return;
      drag.dragging = true;
      drag.ghost = this.makePiece(part, { x: pointer.x, y: pointer.y }).setDepth(40).setScale(1.1).setAlpha(0.92);
      this.pieces.get(drag.from)?.setAlpha(0.35);
    }
    drag.ghost?.setPosition(pointer.x, pointer.y - 10);
    const over = cellAt(pointer.x, pointer.y);
    if (over === drag.hover) return;
    drag.hover = over;
    this.dropHint.clear();
    if (over === NONE || over === drag.from) return;
    const at = cellCenter(over);
    this.dropHint.lineStyle(4, canMerge(this.state.board, drag.from, over) ? GREEN : RED, 1).strokeRect(at.x - 24, at.y - 24, 48, 48);
  }

  private onPointerUp(pointer: Phaser.Input.Pointer) {
    const drag = this.drag;
    if (!drag) return;
    this.clearDrag(drag);
    if (drag.dragging) this.dropOn(drag.from, cellAt(pointer.x, pointer.y));
    else this.tapOn(drag.from);
  }

  private cancelDrag() {
    if (this.drag) this.clearDrag(this.drag);
  }

  private clearDrag(drag: Drag) {
    this.drag = undefined;
    this.dropHint.clear();
    drag.ghost?.destroy(true);
    this.pieces.get(drag.from)?.setAlpha(this.arriving.has(drag.from) ? 0 : 1);
  }

  private select(index: number) {
    this.selected = index;
    this.returnConfirmUntil = 0;
    const part = this.state.board[index]!;
    this.say(mergeTargets(this.state.board, index).length > 0
      ? `${partLabel(part)} 선택 · 반짝이는 이웃 부품을 누르면 그 칸에서 합성돼요.`
      : `${partLabel(part)} 선택 · 맞닿은 같은 부품이 없어요. 다음 입고를 기다리거나 반품할 수 있어요.`);
    this.renderSelection();
    this.renderShelf();
  }

  private deselect(message = '선택을 취소했어요.') {
    this.selected = NONE;
    this.returnConfirmUntil = 0;
    this.say(message);
    this.renderSelection();
    this.renderShelf();
  }

  private tapOn(index: number) {
    const part = this.state.board[index];
    if (this.selected === NONE || !this.state.board[this.selected]) {
      if (part) { this.select(index); return; }
      this.say(index === nextIntakeSlot(this.state.board)
        ? '점선 칸은 다음 부품이 들어올 자리예요. 아래 부품 상자를 열어 보세요.'
        : '빈칸이에요. 부품은 상자를 열면 점선 칸에 들어와요.');
      return;
    }
    if (this.selected === index) { this.deselect(); return; }
    if (canMerge(this.state.board, this.selected, index)) { this.merge(this.selected, index); return; }
    if (part) { this.select(index); return; }
    this.say('부품은 빈칸으로 옮길 수 없어요. 맞닿은 같은 부품에 겹쳐 합성하세요.', 'error');
  }

  private dropOn(from: number, to: number) {
    if (to === NONE || to === from) { this.select(from); return; }
    if (canMerge(this.state.board, from, to)) { this.merge(from, to); return; }
    const source = this.state.board[from]!;
    const target = this.state.board[to];
    this.selected = from;
    this.renderSelection();
    this.renderShelf();
    this.say(!target
      ? '부품은 빈칸으로 옮길 수 없어요. 맞닿은 같은 부품에 겹쳐 합성하세요.'
      : target.type !== source.type || target.level !== source.level
        ? '같은 종류·같은 레벨 부품끼리만 합성할 수 있어요.'
        : source.level >= WORKBENCH_MAX_LEVEL
          ? `Lv.${WORKBENCH_MAX_LEVEL}은 최고 레벨이라 더 합성할 수 없어요.`
          : '상하좌우로 맞닿은 부품끼리만 합성할 수 있어요.', 'error');
  }

  // ── 행동 ──
  private onOpenBox() {
    if (this.blockedByDay()) return;
    this.cancelDrag();
    const events = openPartBox(this.state, this.hooks.orders, Date.now());
    if (!events) {
      this.say(supplyBlock(this.state) === 'full'
        ? '작업대에 빈칸이 없어요. 합성하거나 부품을 반품해 자리를 만드세요.'
        : `알바 체력이 부족해요. ${clockLabel(msUntilNextEnergy(this.state, Date.now()))} 뒤 1 회복돼요. 오늘 진행은 그대로 저장돼요.`, 'error');
      this.renderShelf();
      return;
    }
    if (this.selected !== NONE && !this.state.board[this.selected]) this.selected = NONE;
    this.commit(events);
  }

  private merge(from: number, to: number) {
    const events = mergeParts(this.state, this.hooks.orders, from, to);
    if (!events) return;
    this.selected = NONE;
    this.commit(events);
  }

  private onUndo() {
    if (this.blockedByDay()) return;
    this.cancelDrag();
    if (!undoLast(this.state)) {
      this.say('되돌릴 행동이 없어요. 상자를 열거나 납품하면 되돌리기 기록이 지워져요.', 'error');
      return;
    }
    this.resetQueue();
    this.selected = NONE;
    this.returnConfirmUntil = 0;
    this.shownOrder = this.state.order;
    this.shownInstalled = { ...this.state.installed };
    this.hooks.onChange();
    this.renderAll();
    this.say('직전 행동을 되돌렸어요. 자동 장착·연쇄 보너스도 함께 되돌아가요.');
  }

  private onReturn() {
    if (this.blockedByDay()) return;
    this.cancelDrag();
    const part = this.selected === NONE ? null : this.state.board[this.selected];
    if (!part) {
      this.say('반품할 부품을 먼저 눌러 선택하세요.', 'error');
      return;
    }
    if (this.time.now >= this.returnConfirmUntil) {
      this.returnConfirmUntil = this.time.now + RETURN_CONFIRM_MS;
      this.say('한 번 더 누르면 선택한 부품을 반품해요. 체력은 돌아오지 않아요.');
      this.renderShelf();
      this.time.delayedCall(RETURN_CONFIRM_MS + 50, () => { if (this.alive) this.renderShelf(); });
      return;
    }
    discardPart(this.state, this.selected);
    this.selected = NONE;
    this.returnConfirmUntil = 0;
    this.hooks.onChange();
    this.renderBoard();
    this.renderShelf();
    this.say(`${partLabel(part)} 반품 완료 · ↶ 되돌리기로 복구할 수 있어요.`);
  }

  // 상태는 이미 도메인이 확정했습니다. 저장·납품 통지를 먼저 하고 연출은 뒤따라갑니다.
  private commit(events: WorkbenchEvent[]) {
    this.returnConfirmUntil = 0;
    this.hooks.onChange();
    events.forEach((event) => {
      if (event.type === 'delivered') this.hooks.onDelivered({ orderIndex: event.orderIndex, reward: event.reward });
    });
    this.arriving = new Set(events.flatMap((event) => (event.type === 'placed' && this.state.board[event.index] ? [event.index] : [])));
    this.renderBoard();
    this.renderShelf();
    this.setInfo(this.describe(events));
    const generation = this.generation;
    this.queue = this.queue.then(() => this.play(events, generation));
  }

  private describe(events: WorkbenchEvent[]) {
    const delivered = events.filter((event): event is Extract<WorkbenchEvent, { type: 'delivered' }> => event.type === 'delivered');
    if (delivered.length > 0) {
      const total = delivered.reduce((sum, event) => sum + event.reward, 0);
      const names = delivered.map((event) => orderMetaAt(event.orderIndex)?.name ?? '주문').join(' · ');
      return this.hooks.canPlay()
        ? `${names} 납품 완료! 급여 +${total.toLocaleString()} C · 다음 주문이 이어져요.`
        : `${names} 납품 완료! 오늘 주문을 모두 마쳤어요. 정산으로 이동합니다.`;
    }
    const bonus = events.find((event) => event.type === 'bonus');
    if (bonus) return bonus.bonus === 'free-box'
      ? `${COMBO_FREE_BOX}연쇄! 다음 상자는 체력 없이 열려요.`
      : `${COMBO_GUARANTEE}연쇄! 다음 상자에서 필요한 부품이 확정으로 나와요.`;
    const installed = events.filter((event): event is Extract<WorkbenchEvent, { type: 'installed' }> => event.type === 'installed');
    if (installed.length > 0) return `${installed.map((event) => PART_NAMES[event.part.type]).join('·')} 완성 · 자전거에 바로 장착했어요.`;
    const merged = events.find((event) => event.type === 'merged');
    if (merged) return merged.combo >= 2
      ? `${partLabel(merged.part)} 합성 · ${merged.combo}연쇄 중! 상자를 열면 연쇄가 끊겨요.`
      : `${partLabel(merged.part)} 합성 완료.`;
    const placed = events.find((event) => event.type === 'placed');
    if (placed) return `${placed.free ? '무료 상자 · ' : ''}${placed.guaranteed ? '확정 상자 · ' : ''}${partLabel(placed.part)} 입고 · 점선이 다음 자리예요.`;
    return '';
  }

  // ── 연출 ──
  private resetQueue() {
    this.generation += 1;
    this.queue = Promise.resolve();
    this.arriving.clear();
    this.clearFx();
  }

  private track<T extends Phaser.GameObjects.GameObject>(object: T): T {
    this.fx.add(object);
    return object;
  }

  private untrack(object: Phaser.GameObjects.GameObject) {
    if (!this.fx.delete(object)) return;
    this.tweens.killTweensOf(object);
    object.destroy();
  }

  private clearFx() {
    this.fx.forEach((object) => { this.tweens.killTweensOf(object); object.destroy(); });
    this.fx.clear();
  }

  private tween(config: Phaser.Types.Tweens.TweenBuilderConfig) {
    const duration = this.reducedMotion ? 1 : Number(config.duration ?? 0);
    return new Promise<void>((resolve) => { this.tweens.add({ ...config, duration, onComplete: () => resolve() }); });
  }

  private wait(ms: number) {
    return new Promise<void>((resolve) => { this.time.delayedCall(this.reducedMotion ? Math.min(ms, 300) : ms, () => resolve()); });
  }

  private async play(events: WorkbenchEvent[], generation: number) {
    for (const event of events) {
      if (!this.alive || generation !== this.generation) return;
      if (event.type === 'placed') {
        this.hooks.onSfx?.('parcel');
        const ghost = this.track(this.makePiece(event.part, { x: BOX.x - BOX.w / 2 + 26, y: BOX.y }).setDepth(30).setScale(0.45));
        const to = cellCenter(event.index);
        await this.tween({ targets: ghost, x: to.x, y: to.y, scale: 1, duration: 300, ease: 'Back.easeOut' });
        this.untrack(ghost);
        if (this.arriving.delete(event.index)) this.pieces.get(event.index)?.setAlpha(1);
      } else if (event.type === 'merged') {
        this.hooks.onSfx?.('merge');
        const from = cellCenter(event.from);
        const to = cellCenter(event.to);
        const ghost = this.track(this.makePiece({ type: event.part.type, level: event.part.level - 1 }, from).setDepth(29).setAlpha(0.9));
        await this.tween({ targets: ghost, x: to.x, y: to.y, scale: 0.7, alpha: 0.2, duration: 160, ease: 'Quad.easeIn' });
        this.untrack(ghost);
        const burst = this.track(this.add.circle(to.x, to.y, 10, CREAM, 0.85).setDepth(28));
        this.tweens.add({ targets: burst, radius: 30, alpha: 0, duration: this.reducedMotion ? 1 : 260, onComplete: () => this.untrack(burst) });
        const stays = this.state.board[event.to]?.type === event.part.type && this.state.board[event.to]?.level === event.part.level;
        const piece = stays ? this.pieces.get(event.to) : undefined;
        const target = piece ?? this.track(this.makePiece(event.part, to).setDepth(29));
        target.setScale(1.28);
        await this.tween({ targets: target, scale: 1, duration: 200, ease: 'Back.easeOut' });
        if (!piece) this.untrack(target);
        if (event.combo >= 2) this.floatText(to.x, to.y - 30, `${event.combo}연쇄!`, event.combo >= COMBO_FREE_BOX ? '#dff0d0' : CREAM_TEXT);
      } else if (event.type === 'bonus') {
        this.hooks.onSfx?.('reward');
        if (event.bonus === 'free-box') this.banner(`${COMBO_FREE_BOX}연쇄! 다음 상자 무료`, GREEN, CREAM_TEXT);
        else this.banner(`${COMBO_GUARANTEE}연쇄! 다음 상자 필수 부품 확정`, AMBER, INK);
      } else if (event.type === 'installed') {
        // 게임 화면 B안과 같은 장착 연출: 부품 색 사각형이 자전거 부위로 날아갑니다.
        const from = cellCenter(event.from);
        const to = this.bikeAnchor(event.order, event.part.type);
        const marker = this.track(this.add.rectangle(from.x, from.y, 24, 24, WARM_PART_COLORS[event.part.type]).setStrokeStyle(3, CREAM, 0.9).setDepth(30));
        await this.tween({ targets: marker, x: to.x, y: to.y, scale: { from: 0.9, to: 1.4 }, alpha: { from: 1, to: 0.3 }, duration: 520, ease: 'Cubic.easeInOut' });
        this.untrack(marker);
        this.hooks.onSfx?.('install');
        if (this.shownOrder === event.order) {
          this.shownInstalled[event.part.type] = true;
          this.renderOrder();
        }
      } else {
        this.hooks.onSfx?.('complete');
        await this.deliveredStamp(orderMetaAt(event.orderIndex)?.name ?? '주문', event.reward, () => {
          this.shownOrder = event.order + 1;
          this.shownInstalled = noneInstalled();
          this.renderOrder();
          this.hooks.onSfx?.('reward');
        });
      }
    }
  }

  private async deliveredStamp(name: string, reward: number, onPeak: () => void) {
    const stamp = this.track(this.add.container(195, 138, [
      this.add.rectangle(0, 0, 232, 66, CREAM).setStrokeStyle(4, RED),
      this.add.rectangle(0, -21, 112, 20, RED).setStrokeStyle(2, BORDER),
      this.add.text(0, -21, '납품 완료', textStyle(11, CREAM_TEXT)).setOrigin(0.5),
      this.add.text(0, 10, `${name} · +${reward.toLocaleString()} C`, textStyle(13, INK)).setOrigin(0.5),
    ]).setDepth(35).setScale(0.6).setAlpha(0));
    await this.tween({ targets: stamp, scale: 1, alpha: 1, duration: 240, ease: 'Back.easeOut' });
    await this.wait(650);
    onPeak();
    await this.tween({ targets: stamp, alpha: 0, y: 120, duration: 220 });
    this.untrack(stamp);
  }

  private banner(label: string, fill: number, textColor: string) {
    const banner = this.track(this.add.container(195, 252, [
      this.add.rectangle(0, 0, 250, 30, fill).setStrokeStyle(3, BORDER),
      this.add.text(0, 0, label, textStyle(12, textColor)).setOrigin(0.5),
    ]).setDepth(32).setAlpha(0));
    this.tweens.chain({
      targets: banner,
      tweens: [
        { alpha: 1, y: 262, duration: this.reducedMotion ? 1 : 180, ease: 'Back.easeOut' },
        { alpha: 1, duration: this.reducedMotion ? 600 : 900 },
        { alpha: 0, y: 252, duration: this.reducedMotion ? 1 : 240 },
      ],
      onComplete: () => this.untrack(banner),
    });
  }

  private floatText(x: number, y: number, label: string, color: string) {
    const text = this.track(this.add.text(x, y, label, { ...textStyle(12, color), stroke: INK, strokeThickness: 3 }).setOrigin(0.5).setDepth(33));
    this.tweens.add({ targets: text, y: y - 24, alpha: 0, duration: this.reducedMotion ? 500 : 650, onComplete: () => this.untrack(text) });
  }
}

export function startMergeWorkbenchScreen(parent: string, hooks: MergeWorkbenchScreenHooks) {
  return new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width: 390,
    height: 810,
    backgroundColor: '#c78452',
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    scene: new MergeWorkbenchScene(hooks),
  });
}
