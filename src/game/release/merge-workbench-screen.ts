// 머지 작업대 화면 (머지 코어 E안 · 390×810)
// 게임 화면 B안(game-screen-mobile)의 화면 구성(헤더 → 주문 카드 → 6×7 보드 → 하단 선반)과 따뜻한 픽셀 팔레트를 그대로 쓰고,
// 규칙은 domain/merge-workbench(가운데→바깥 자동 입고·이동 금지·인접 2개 합성·합성 보너스·확정 상자·알바 체력)를 사용합니다.
// 작업대 상태는 컨트롤러가 소유하며, 이 화면은 도메인 함수로 바꾼 뒤 onChange로 저장을 요청합니다.
// 납품은 행동 시점에 도메인이 확정하고, 화면은 확정된 이벤트를 순서대로 연출만 합니다.
import Phaser from 'phaser';
import { drawPixelBike, drawPixelPartIcon, makeWarmColorway, bikePartAnchorOffset, WARM_PART_COLORS } from './bike-pixel-sprite';
import { orderMetaAt } from './meta-progress';
import type { AdOfferEntry } from './ad-refill-events';
import type { ReleaseSfxEvent } from './release-audio';
import {
  BONUS_FREE_BOX_AT,
  BONUS_PICK_BOX_AT,
  ENERGY_MAX,
  LEVEL2_BOX_RATE,
  PICK_BOX_LEVEL,
  WORKBENCH_COLUMNS,
  WORKBENCH_PART_TYPES,
  WORKBENCH_ROWS,
  WORKBENCH_CELLS,
  WORKBENCH_MAX_LEVEL,
  canMerge,
  canPlacePickBox,
  discardPart,
  mergeParts,
  mergeTargets,
  msUntilNextEnergy,
  neighbors,
  nextIntakeSlot,
  openPartBox,
  orderIndexOf,
  placePickBox,
  recoverEnergy,
  settleWorkbench,
  supplyBlock,
  undoLast,
  type Installed,
  type SupplyOptions,
  type WorkbenchEvent,
  orderListOf,
  type WorkbenchOrders,
  type WorkbenchPart,
  type WorkbenchPartType,
  type WorkbenchState,
} from '../../domain/merge-workbench';
import { hasMerge, recommendMerge, shouldShowHint, type MergeHintReason } from '../../domain/merge-assist';
import { REWARDED_AD_POLICY, formatDuration, isEnergyEmpty, msUntilFullEnergy, type AdOffer } from '../../domain/energy-refill';

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
// 합성 보너스 칸(2행 오른쪽): 확정 상자가 있으면 눌러서 부품·자리를 고릅니다.
const BONUS = { x: 286, y: ROW2_Y };
const RETURN_CONFIRM_MS = 2500;
// 체력 카드(소진 안내·광고 충전): 보드 가운데에 겹쳐 띄웁니다. 높이는 보여 줄 줄 수에 따라 정합니다.
const CARD = { x: 195, y: 430, w: 330 };
// 광고가 끝났다는 신호가 오지 않을 때 '돌아가기'를 보여 주기까지의 시간
const AD_ESCAPE_MS = 60_000;
const NONE = -1;

const PART_NAMES: Record<WorkbenchPartType, string> = { frame: '프레임', wheel: '휠셋', drivetrain: '구동계', handlebar: '핸들바' };
const noneInstalled = (): Installed => ({ frame: false, wheel: false, drivetrain: false, handlebar: false });

type Point = { x: number; y: number };
type Tone = 'info' | 'error';
type Drag = { from: number; start: Point; dragging: boolean; hover: number; ghost?: Phaser.GameObjects.Container };

// 보상형 광고 충전(#92) 연결. 광고를 쓸 수 없는 환경이면 컨트롤러가 넘기지 않습니다.
export type RewardedAdWatchResult = 'rewarded' | 'dismissed' | 'failed' | 'unavailable' | 'busy';
export type WorkbenchRewardedAd = {
  offer: () => AdOffer;
  preload: () => void;
  // 광고 1회 시청(일시정지·저장·보상 반영은 컨트롤러가 함). 끝나면 결과를 돌려줍니다.
  watch: () => Promise<RewardedAdWatchResult>;
  // 광고가 끝나지 않을 때 기다림을 그만둡니다('돌아가기' 기록 포함).
  cancel: () => void;
  // 이벤트 기록(#92): 체력 카드에 광고 버튼이 '가능'으로 보임 · 부품 상자를 엶(광고 뒤 플레이 지속 확인)
  offerShown: (entry: AdOfferEntry) => void;
  boxOpened: () => void;
};

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
  // Garage 효과로 붙은 손님 팁을 돌려주면 납품 도장·안내에 함께 보여 줍니다 (#109).
  onDelivered: (delivery: { orderIndex: number; reward: number }) => { tip?: number } | void;
  // 상자 입고에 반영할 Garage 효과(Lv.2 입고 확률). 없으면 기본 확률입니다 (#109).
  supply?: () => SupplyOptions;
  onHome: () => void;
  onSfx?: (event: ReleaseSfxEvent) => void;
  rewardedAd?: WorkbenchRewardedAd;
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

// 합성 추천 안내 문구: 추천 쌍을 먼저 합치면 무엇이 좋은지
const HINT_EFFECT: Record<MergeHintReason, string> = {
  deliver: '납품까지 이어져요',
  install: '바로 장착돼요',
  pairs: '다음 합성 자리가 남아요',
  space: '칸이 하나 비어요',
};

class MergeWorkbenchScene extends Phaser.Scene {
  constructor(private readonly hooks: MergeWorkbenchScreenHooks) { super('merge-workbench'); }

  private alive = false;
  private reducedMotion = false;
  private selected = NONE;
  private drag?: Drag;
  private returnConfirmUntil = 0;
  // 합성 추천(Lab #264 B안): 마지막 입력 시각과 지금 보여 주는 중인지
  private lastInputAt = 0;
  private hintShown = false;
  // 체력 카드: 열려 있는 동안 뒤쪽 입력을 막고, 회복 시간·광고 버튼을 1초마다 갱신합니다.
  private energyCard?: Phaser.GameObjects.Container;
  private energyCardEmpty = false;
  // 카드를 연 경로와, 이번에 연 카드에서 광고 제안 노출을 이미 기록했는지
  private energyCardEntry: AdOfferEntry = 'energy';
  private energyCardOfferLogged = false;
  private energyCardTag?: Phaser.GameObjects.Text;
  private energyCardNext?: Phaser.GameObjects.Text;
  private energyCardFull?: Phaser.GameObjects.Text;
  private energyCardAd?: { button: Phaser.GameObjects.Rectangle; label: Phaser.GameObjects.Text };
  // 광고 재생 중 막: 광고가 끝날 때까지 작업대 입력을 막습니다.
  private adOverlay?: Phaser.GameObjects.Container;
  private energyAdTag!: Phaser.GameObjects.Container;
  // 확정 상자: 부품 종류 고르기 카드 → 고른 종류를 놓을 빈칸 고르기
  private pickCard?: Phaser.GameObjects.Container;
  private pickType: WorkbenchPartType | null = null;
  // 연출 순서: 상태는 즉시 바뀌고, 주문 카드는 이벤트 연출을 따라 늦게 바뀝니다.
  private queue: Promise<void> = Promise.resolve();
  private generation = 0;
  private shownOrder = 0;
  private shownInstalled = noneInstalled();
  private arriving = new Set<number>();
  private fx = new Set<Phaser.GameObjects.GameObject>();
  private pieces = new Map<number, Phaser.GameObjects.Container>();
  // 납품 순번별로 붙은 손님 팁(연출 표시용, #109)
  private tipByOrder = new Map<number, number>();

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
  private mergeHint!: Phaser.GameObjects.Graphics;
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
  private bonusPanel!: Phaser.GameObjects.Rectangle;
  private bonusTitle!: Phaser.GameObjects.Text;
  private bonusSub!: Phaser.GameObjects.Text;
  private bonusDots: Phaser.GameObjects.Rectangle[] = [];

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
    // 어떤 입력이든 들어오면 합성 추천을 지우고 무입력 시간을 다시 셉니다.
    this.input.on('pointerdown', () => this.markInput());
    this.lastInputAt = performance.now();
    // 체력 회복 표시와 합성 추천 시점 확인은 1초마다 합니다.
    this.time.addEvent({ delay: 1000, loop: true, callback: () => { this.tickEnergy(); this.maybeHint(); } });
    this.events.once('shutdown', () => this.shutdown());
    this.events.once('destroy', () => this.shutdown());
    this.renderAll();
    this.setInfo(this.hooks.canPlay()
      ? '점선 칸이 다음 입고 자리예요. 상하좌우로 맞닿은 같은 부품을 눌러 합성하세요.'
      : '오늘 주문을 모두 납품했어요. 정산을 준비하고 있어요.');
    // 납품 직후 화면을 떠났거나 새 영업일로 들어온 경우, 보드에 남은 부품을 지금 주문에 이어서 장착합니다.
    this.continueWithLeftovers(this.generation);
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
    this.mergeHint = this.add.graphics().setDepth(7);

    // 안내 문구 11px: 줄바꿈 폭 258은 오른쪽 '× 선택 취소' 버튼 왼쪽 가장자리(282)와 12px 이상 띄우기 위한 값이고,
    // 시작 y는 보드 테두리 아래 4px 여백을 두되 3줄까지 선반 상단(668-11)에 닿지 않도록 줄 간격 2를 유지합니다.
    this.info = this.add.text(12, BOARD_BOTTOM + 10, '', { ...textStyle(11, CREAM_TEXT, false), wordWrap: { width: 258 }, lineSpacing: 2 }).setDepth(10);
    this.cancelButton = this.add.rectangle(334, BOARD_BOTTOM + 38, 104, 44, BROWN).setStrokeStyle(2, CREAM).setDepth(10)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => (this.pickType ? this.exitPickMode('확정 상자 배치를 취소했어요. 상자는 그대로 남아 있어요.') : this.deselect()));
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

  // 게임 화면 B안 '택배 선반' 자리에 부품 상자·되돌리기·반품(1행)과 알바 체력·합성 보너스(2행)를 둡니다.
  private drawShelf() {
    this.add.rectangle(195, SHELF_TOP + 66, 374, 136, CREAM).setStrokeStyle(4, BORDER).setDepth(2);
    this.add.rectangle(96, SHELF_TOP, 152, 22, BROWN).setDepth(3);
    this.add.text(28, SHELF_TOP - 7, '부품 상자 · PARTS BOX', textStyle(10, CREAM_TEXT)).setDepth(4);
    this.add.rectangle(282, SHELF_TOP, 200, 22, BROWN).setStrokeStyle(2, BORDER).setDepth(3);
    this.add.text(282, SHELF_TOP, `합성 ${BONUS_FREE_BOX_AT}회 무료 · ${BONUS_PICK_BOX_AT}회 확정 상자`, textStyle(10, CREAM_TEXT)).setOrigin(0.5).setDepth(4);

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
    // 체력 표시를 누르면 체력 카드(회복 시간·광고 충전)를 엽니다.
    this.add.rectangle(104, ROW2_Y, 172, 48, 0xffffff, 0.001).setDepth(6)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => this.onEnergyTap());
    // 지금 광고 충전을 할 수 있으면 체력 표시 오른쪽 위에 작은 표식을 둡니다.
    this.energyAdTag = this.add.container(166, ROW2_Y - 12, [
      this.add.rectangle(0, 0, 40, 16, GREEN).setStrokeStyle(2, BORDER),
      this.add.text(0, 0, `▶+${REWARDED_AD_POLICY.amount}`, textStyle(9, CREAM_TEXT)).setOrigin(0.5),
    ]).setDepth(5).setVisible(false);

    const bonus = this.infoPanel(BONUS.x);
    this.bonusPanel = bonus.panel;
    this.bonusTitle = bonus.title;
    this.bonusSub = bonus.sub.setColor(MUTED).setFontStyle('bold');
    for (let i = 0; i < BONUS_PICK_BOX_AT; i += 1) {
      const milestone = i === BONUS_FREE_BOX_AT - 1 || i === BONUS_PICK_BOX_AT - 1;
      this.bonusDots.push(this.add.rectangle(306 + i * 14, ROW2_Y - 11, milestone ? 11 : 9, milestone ? 11 : 9, CREAM).setStrokeStyle(2, BORDER).setDepth(4));
    }
    // 합성 보너스 칸을 누르면 확정 상자를 쓰거나(있을 때) 보너스 규칙을 안내합니다.
    this.add.rectangle(BONUS.x, ROW2_Y, 172, 48, 0xffffff, 0.001).setDepth(6)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => this.onBonusTap());
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
    return {
      panel: this.add.rectangle(x, ROW2_Y, 172, 48, GOLD).setStrokeStyle(2, BROWN).setDepth(3),
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
    if (this.pickType) {
      this.renderPickTargets(this.pickType);
      return;
    }
    const active = this.selected !== NONE && !!this.state.board[this.selected];
    this.pieces.forEach((piece, index) => piece.setScale(active && index === this.selected ? 1.06 : 1));
    this.cancelButton.setVisible(active);
    this.cancelLabel.setVisible(active).setText('× 선택 취소');
    if (!active) return;
    const center = cellCenter(this.selected);
    this.highlight.lineStyle(3, CREAM, 1).strokeRect(center.x - 26, center.y - 26, 52, 52);
    for (const target of mergeTargets(this.state.board, this.selected)) {
      const at = cellCenter(target);
      this.highlight.fillStyle(GREEN, 0.2).fillRect(at.x - 22, at.y - 22, 44, 44);
      this.highlight.lineStyle(4, GREEN, 1).strokeRect(at.x - 24, at.y - 24, 48, 48);
    }
  }

  // 확정 상자를 놓을 수 있는 빈칸: 놓자마자 합성할 수 있는 칸(같은 종류 Lv.1과 맞닿음)은 초록, 나머지는 노랑
  private renderPickTargets(type: WorkbenchPartType) {
    this.pieces.forEach((piece) => piece.setScale(1));
    this.cancelButton.setVisible(true);
    this.cancelLabel.setVisible(true).setText('× 배치 취소');
    this.state.board.forEach((part, index) => {
      if (part) return;
      const at = cellCenter(index);
      const pairs = this.mergesAfterPick(type, index);
      this.highlight.fillStyle(pairs ? GREEN : AMBER, pairs ? 0.28 : 0.16).fillRect(at.x - 22, at.y - 22, 44, 44);
      this.highlight.lineStyle(pairs ? 4 : 2, pairs ? GREEN : AMBER, 1).strokeRect(at.x - 23, at.y - 23, 46, 46);
    });
  }

  private mergesAfterPick(type: WorkbenchPartType, index: number) {
    return neighbors(index).some((cell) => this.state.board[cell]?.type === type && this.state.board[cell]?.level === PICK_BOX_LEVEL);
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
    const blocked = Boolean(block) || !this.hooks.canPlay();
    this.boxButton.setFillStyle(blocked ? 0xe8d3a6 : free ? 0xf4c86a : GOLD).setStrokeStyle(3, blocked ? 0xb08a6a : BROWN);
    this.boxTitle.setColor(blocked ? MUTED : INK);
    this.boxStatus
      .setText(block === 'full'
        ? '작업대가 가득 찼어요 · 반품으로 자리 확보'
        : block === 'energy'
          ? '체력 소진 · 눌러서 회복 안내 보기'
          : free ? `무료 상자 · 체력 소모 없음${this.supplyLabel()}` : `점선 칸에 자동 배치${this.supplyLabel()}`)
      .setColor(block ? ALERT : free ? SUCCESS : MUTED);
    this.boxCost.setText(free ? `무료 ×${this.state.freeBoxes}` : '⚡ −1').setColor(free ? SUCCESS : ALERT);

    this.styleSmallButton(this.undoButton, this.undoLabel, Boolean(this.state.undo));
    const canReturn = this.selected !== NONE && !!this.state.board[this.selected];
    const confirming = canReturn && this.time.now < this.returnConfirmUntil;
    this.styleSmallButton(this.returnButton, this.returnLabel, canReturn, confirming ? RED : BROWN);
    this.returnLabel.setText(confirming ? '한 번 더\n눌러 반품' : '↗\n반품');

    this.energyTitle.setText(`⚡ 알바 체력 ${this.state.energy}/${ENERGY_MAX}`);
    this.energySub.setText(this.state.energy >= ENERGY_MAX ? '가득 참' : `다음 +1 ${clockLabel(msUntilNextEnergy(this.state, now))}`);
    this.energyFill.setScale(this.state.energy / ENERGY_MAX, 1);
    this.energyAdTag.setVisible(this.hooks.rewardedAd?.offer().available === true);
    this.renderBonus();
  }

  // Garage 효과로 Lv.2 입고 확률이 기본보다 높으면 상자 설명에 함께 보여 줍니다 (#109)
  private supplyLabel() {
    const rate = this.hooks.supply?.().level2Rate;
    return rate !== undefined && rate > LEVEL2_BOX_RATE + 1e-9 ? ` · Lv.2 입고 ${Math.round(rate * 100)}%` : '';
  }

  // 합성 보너스 칸: 진행 점 5개(3번째 무료 상자, 5번째 확정 상자). 확정 상자가 있으면 눌러서 쓰라고 강조합니다.
  private renderBonus() {
    const { bonusCount, freeBoxes, pickBoxes } = this.state;
    const ready = pickBoxes > 0 && this.hooks.canPlay();
    this.bonusPanel.setFillStyle(ready ? AMBER : GOLD).setStrokeStyle(ready ? 3 : 2, ready ? BORDER : BROWN);
    this.bonusDots.forEach((dot, i) => dot.setFillStyle(i < bonusCount ? (i < BONUS_FREE_BOX_AT ? GREEN : RED) : CREAM));
    this.bonusTitle.setText(pickBoxes > 0 ? `확정 상자 ×${pickBoxes}` : `합성 보너스 ${bonusCount}/${BONUS_PICK_BOX_AT}`);
    const next = bonusCount < BONUS_FREE_BOX_AT
      ? `무료까지 ${BONUS_FREE_BOX_AT - bonusCount}회`
      : `확정까지 ${BONUS_PICK_BOX_AT - bonusCount}회`;
    this.bonusSub
      .setText(ready ? '눌러서 부품·자리 고르기' : `무료 상자 ${freeBoxes} · ${next}`)
      .setColor(ready ? INK : MUTED);
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
    this.refreshEnergyCard();
  }

  // ── 합성 추천 (Lab #264 B안) ──
  // 선택 중이 아니고, 빈칸이 적거나 한동안 입력이 없으면 먼저 합칠 쌍 1개를 노란 테두리로 반짝입니다.
  // 추천은 강제가 아니며, 아무 입력이나 하면 사라지고 조건이 맞으면 다시 나타납니다.
  // 무입력 시간은 performance.now()로 잽니다(create 시점에는 Phaser 장면 시계가 아직 0이라 기준이 어긋남).
  private markInput() {
    this.lastInputAt = performance.now();
    this.clearHint();
  }

  private maybeHint() {
    if (!this.alive || this.hintShown || this.drag || this.energyCard || this.adOverlay || this.pickCard || this.pickType || !this.hooks.canPlay()) return;
    const selecting = this.selected !== NONE && !!this.state.board[this.selected];
    if (!shouldShowHint(this.state, performance.now() - this.lastInputAt, selecting)) return;
    const pick = recommendMerge(this.state, this.hooks.orders);
    if (!pick) return;
    this.hintShown = true;
    this.mergeHint.clear().setAlpha(1);
    for (const index of [pick.from, pick.to]) {
      const at = cellCenter(index);
      // 밝은 칸 바탕에서도 보이도록 잉크색 바깥선 안쪽에 노란 테두리를 겹칩니다.
      this.mergeHint.lineStyle(6, BORDER, 1).strokeRect(at.x - 26, at.y - 26, 52, 52);
      this.mergeHint.lineStyle(4, AMBER, 1).strokeRect(at.x - 26, at.y - 26, 52, 52);
    }
    if (!this.reducedMotion) this.tweens.add({ targets: this.mergeHint, alpha: { from: 1, to: 0.45 }, duration: 520, yoyo: true, repeat: -1 });
    this.setInfo(`추천 · 노랗게 반짝이는 ${partLabel(pick.part)} 두 개를 먼저 합치면 ${HINT_EFFECT[pick.reason]}.`);
  }

  private clearHint() {
    if (!this.hintShown) return;
    this.hintShown = false;
    this.tweens.killTweensOf(this.mergeHint);
    this.mergeHint.clear().setAlpha(1);
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
    if (this.pickType) { this.placePick(this.pickType, index); return; }
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
    this.exitPickMode();
    const events = openPartBox(this.state, this.hooks.orders, Date.now(), Math.random, this.hooks.supply?.() ?? {});
    if (!events) {
      if (supplyBlock(this.state) === 'energy') {
        this.hooks.onSfx?.('tap');
        this.openEnergyCard('box');
      } else {
        this.say('작업대에 빈칸이 없어요. 합성하거나 부품을 반품해 자리를 만드세요.', 'error');
      }
      this.renderShelf();
      return;
    }
    if (this.selected !== NONE && !this.state.board[this.selected]) this.selected = NONE;
    this.hooks.rewardedAd?.boxOpened();
    this.commit(events);
    // 마지막 체력을 쓴 순간: 납품 안내가 없으면 다음에 할 수 있는 일을 알려 줍니다.
    if (isEnergyEmpty(this.state) && !events.some((event) => event.type === 'delivered')) {
      this.setInfo('마지막 체력을 썼어요. 합성은 체력 없이 할 수 있고, 부품 상자를 누르면 회복 안내를 볼 수 있어요.');
    }
  }

  // ── 확정 상자: 합성 5번째 보너스. 부품 종류를 고르고, 놓을 빈칸을 직접 고릅니다(체력 소모 없음) ──
  private onBonusTap() {
    if (this.blockedByDay() || this.energyCard || this.adOverlay || this.pickCard) return;
    this.cancelDrag();
    if (this.state.pickBoxes < 1) {
      this.say(`합성에 성공할 때마다 보너스가 1칸 차요. ${BONUS_FREE_BOX_AT}번째에 무료 상자, ${BONUS_PICK_BOX_AT}번째에 원하는 부품을 원하는 칸에 놓는 확정 상자를 받아요.`);
      return;
    }
    if (nextIntakeSlot(this.state.board) < 0) {
      this.say('확정 상자를 놓을 빈칸이 없어요. 합성하거나 반품해 자리를 만드세요.', 'error');
      return;
    }
    this.hooks.onSfx?.('tap');
    this.openPickCard();
  }

  private openPickCard() {
    this.exitPickMode();
    this.selected = NONE;
    this.clearHint();
    this.renderSelection();
    const { spec } = this.orderSpec(this.state.order);
    const height = 300;
    const top = CARD.y - height / 2;
    const card = this.add.container(0, 0, [
      this.add.rectangle(195, 405, 390, 810, 0x1d1016, 0.55).setInteractive(),
      this.add.rectangle(CARD.x, CARD.y, CARD.w, height, CREAM).setStrokeStyle(4, BORDER),
      this.add.rectangle(CARD.x, top + 22, 108, 22, AMBER).setStrokeStyle(2, BORDER),
      this.add.text(CARD.x, top + 22, `확정 상자 ×${this.state.pickBoxes}`, textStyle(10, INK)).setOrigin(0.5),
      this.add.text(CARD.x, top + 52, '어떤 부품을 놓을까요?', textStyle(16, INK)).setOrigin(0.5),
      this.add.text(CARD.x, top + 72, `고른 부품 Lv.${PICK_BOX_LEVEL}을 원하는 빈칸에 놓아요. 체력은 쓰지 않아요.`, {
        ...textStyle(11, MUTED, false), align: 'center', wordWrap: { width: CARD.w - 44 },
      }).setOrigin(0.5, 0),
    ]).setDepth(60);
    WORKBENCH_PART_TYPES.forEach((type, i) => {
      const x = CARD.x + (i % 2 === 0 ? -76 : 76);
      const y = top + 134 + Math.floor(i / 2) * 76;
      const done = this.state.installed[type];
      const button = this.add.rectangle(x, y, 144, 66, done ? 0xe8d3a6 : GOLD).setStrokeStyle(3, done ? 0xb08a6a : WARM_PART_COLORS[type])
        .setInteractive({ useHandCursor: true })
        .on('pointerdown', () => { this.hooks.onSfx?.('tap'); this.choosePickType(type); });
      card.add([
        button,
        drawPixelPartIcon(this, x - 44, y, 2, type),
        this.add.text(x - 18, y - 18, PART_NAMES[type], textStyle(13, INK)),
        this.add.text(x - 18, y + 2, done ? '이번 주문 장착 완료' : `주문 Lv.${spec.levels[type]} 필요`, textStyle(10, done ? MUTED : SUCCESS, !done)),
      ]);
    });
    const close = this.add.rectangle(CARD.x, top + height - 26, 160, 30, CREAM).setStrokeStyle(3, BORDER)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => { this.hooks.onSfx?.('tap'); this.closePickCard(); });
    card.add([close, this.add.text(CARD.x, top + height - 26, '나중에 쓰기', textStyle(12, INK)).setOrigin(0.5)]);
    this.pickCard = card;
  }

  private closePickCard() {
    this.pickCard?.destroy(true);
    this.pickCard = undefined;
  }

  private choosePickType(type: WorkbenchPartType) {
    this.closePickCard();
    this.pickType = type;
    this.renderSelection();
    this.setInfo(`${PART_NAMES[type]} Lv.${PICK_BOX_LEVEL}을 놓을 빈칸을 누르세요. 초록 칸은 놓자마자 합성할 수 있어요.`);
  }

  private exitPickMode(message?: string) {
    if (!this.pickType) return;
    this.pickType = null;
    this.renderSelection();
    if (message) this.say(message);
  }

  private placePick(type: WorkbenchPartType, index: number) {
    if (!canPlacePickBox(this.state, index)) {
      this.say('확정 상자는 빈칸에만 놓을 수 있어요. 노랗거나 초록으로 표시된 칸을 누르세요.', 'error');
      return;
    }
    const events = placePickBox(this.state, this.hooks.orders, type, index);
    if (!events) return;
    this.pickType = null;
    this.selected = NONE;
    this.commit(events);
  }

  // ── 체력 카드: 소진 안내(Lab #263 A안) + 보상형 광고 충전(#92) ──
  // 체력 0에서 상자를 누르거나 체력 표시를 누르면 엽니다. 회복 시간과(소진이면) 체력 없이 할 수 있는 일을 알려 주고,
  // 광고를 쓸 수 있는 환경이면 광고 충전 버튼을 둡니다.
  private onEnergyTap() {
    if (this.blockedByDay() || this.adOverlay || this.pickCard) return;
    this.exitPickMode();
    this.hooks.onSfx?.('tap');
    this.openEnergyCard('energy');
  }

  private openEnergyCard(entry: AdOfferEntry) {
    if (this.energyCard || this.adOverlay) return;
    this.energyCardEntry = entry;
    this.energyCardOfferLogged = false;
    this.cancelDrag();
    this.clearHint();
    const empty = isEnergyEmpty(this.state);
    const mergeable = hasMerge(this.state.board);
    const ad = this.hooks.rewardedAd;
    // 줄 배치: 제목·설명·회복 시간 → (소진) 할 수 있는 일 → (광고) 충전 → (소진) 홈으로 → 닫기
    const height = 178 + (empty ? 48 : 0) + (ad ? 54 : 0) + (empty ? 52 : 0) + 42;
    const top = CARD.y - height / 2;
    const wrapped = (y: number, message: string, color: string) => this.add.text(CARD.x, y, message, {
      ...textStyle(11, color, false), align: 'center', wordWrap: { width: CARD.w - 44 }, lineSpacing: 2,
    }).setOrigin(0.5, 0);
    this.energyCardEmpty = empty;
    this.energyCardTag = this.add.text(CARD.x, top + 22, '', textStyle(10, CREAM_TEXT)).setOrigin(0.5);
    this.energyCardNext = this.add.text(CARD.x, top + 128, '', textStyle(14, INK)).setOrigin(0.5);
    this.energyCardFull = this.add.text(CARD.x, top + 150, '', textStyle(11, MUTED, false)).setOrigin(0.5);
    const card = this.add.container(0, 0, [
      // 화면 전체를 덮는 어두운 막: 뒤쪽 보드·버튼 입력을 막습니다.
      this.add.rectangle(195, 405, 390, 810, 0x1d1016, 0.55).setInteractive(),
      this.add.rectangle(CARD.x, CARD.y, CARD.w, height, CREAM).setStrokeStyle(4, BORDER),
      this.add.rectangle(CARD.x, top + 22, 108, 22, empty ? RED : GREEN).setStrokeStyle(2, BORDER),
      this.energyCardTag,
      this.add.text(CARD.x, top + 52, empty ? '⚡ 알바 체력이 바닥났어요' : '⚡ 알바 체력 충전', textStyle(16, INK)).setOrigin(0.5),
      wrapped(top + 70, empty ? '오늘 진행은 그대로 저장돼요. 체력이 차면 이어서 영업해요.' : '체력은 실제 시간 10분마다 1씩 회복돼요.', MUTED),
      this.add.rectangle(CARD.x, top + 139, CARD.w - 40, 54, GOLD).setStrokeStyle(2, BROWN),
      this.energyCardNext,
      this.energyCardFull,
    ]).setDepth(60);
    let y = top + 178;
    if (empty) {
      card.add(wrapped(y, this.state.pickBoxes > 0
        ? `확정 상자 ${this.state.pickBoxes}개는 체력 없이 쓸 수 있어요. 아래 보너스 칸을 눌러 보세요.`
        : mergeable
          ? `합성은 체력 없이 계속할 수 있어요. 합성 ${BONUS_FREE_BOX_AT}회마다 무료 상자를 받아요.`
          : '지금은 합성할 쌍이 없어요. 회복을 기다리는 동안 홈에서 도감과 강화를 둘러보세요.', mergeable || this.state.pickBoxes > 0 ? SUCCESS : MUTED));
      y += 48;
    }
    if (ad) {
      this.energyCardAd = this.cardButton(card, y + 22, 280, 44, GREEN, '', () => void this.watchAd());
      y += 54;
      if (ad.offer().available) ad.preload();
    }
    if (empty) {
      this.cardButton(card, y + 22, 280, 44, GOLD, '홈으로', () => { this.closeEnergyCard(); this.hooks.onHome(); });
      y += 52;
    }
    this.cardButton(card, y + 14, 160, 28, CREAM, empty && mergeable ? '작업대로 돌아가기' : '닫기', () => this.closeEnergyCard());
    this.energyCard = card;
    this.refreshEnergyCard();
  }

  private cardButton(card: Phaser.GameObjects.Container, y: number, width: number, height: number, fill: number, label: string, handler: () => void) {
    const button = this.add.rectangle(CARD.x, y, width, height, fill).setStrokeStyle(3, BORDER)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => { this.hooks.onSfx?.('tap'); handler(); });
    const text = this.add.text(CARD.x, y, label, textStyle(12, INK)).setOrigin(0.5);
    card.add([button, text]);
    return { button, label: text };
  }

  // 카드가 열려 있으면 회복 시간·광고 버튼을 갱신하고, 소진 카드는 상자를 열 수 있게 되면 닫습니다.
  private refreshEnergyCard() {
    if (!this.energyCard) return;
    if (this.energyCardEmpty && !isEnergyEmpty(this.state)) {
      this.closeEnergyCard();
      this.say('체력이 회복됐어요. 부품 상자를 열 수 있어요.');
      return;
    }
    const now = Date.now();
    const full = this.state.energy >= ENERGY_MAX;
    this.energyCardTag?.setText(`ENERGY ${this.state.energy}/${ENERGY_MAX}`);
    this.energyCardNext?.setText(full ? '체력이 가득 찼어요' : `다음 +1  ${clockLabel(msUntilNextEnergy(this.state, now))}`);
    this.energyCardFull?.setText(full ? '상자를 열면 1씩 줄어요' : `가득 참(${ENERGY_MAX})까지 ${formatDuration(msUntilFullEnergy(this.state, now))}`);
    const ad = this.hooks.rewardedAd;
    if (!ad || !this.energyCardAd) return;
    const offer = ad.offer();
    // 카드를 한 번 열 때마다, 광고 버튼이 처음 '가능'으로 보인 순간 한 번 기록합니다(1초마다 갱신해도 중복 기록하지 않음).
    if (offer.available && !this.energyCardOfferLogged) {
      this.energyCardOfferLogged = true;
      ad.offerShown(this.energyCardEntry);
    }
    const { button, label } = this.energyCardAd;
    button.setFillStyle(offer.available ? GREEN : 0xe8d3a6).setStrokeStyle(3, offer.available ? BORDER : 0xb08a6a);
    label.setColor(offer.available ? CREAM_TEXT : MUTED).setText(offer.available
      ? `▶ 광고 보고 체력 +${REWARDED_AD_POLICY.amount}`
      : `체력 ${REWARDED_AD_POLICY.maxEnergy} 이하일 때 광고로 충전할 수 있어요`);
  }

  private closeEnergyCard() {
    this.energyCard?.destroy(true);
    this.energyCard = undefined;
    this.energyCardTag = undefined;
    this.energyCardNext = undefined;
    this.energyCardFull = undefined;
    this.energyCardAd = undefined;
  }

  // 광고 1회: 카드를 닫고 재생 중 막을 띄운 뒤, 컨트롤러가 일시정지·저장·보상 반영을 마치면 결과를 알려 줍니다.
  private async watchAd() {
    const ad = this.hooks.rewardedAd;
    if (!ad || this.adOverlay) return;
    if (!ad.offer().available) { this.refreshEnergyCard(); return; }
    this.closeEnergyCard();
    this.showAdOverlay(ad);
    const result = await ad.watch();
    if (!this.alive) return;
    this.hideAdOverlay();
    this.renderShelf();
    if (result === 'rewarded') {
      this.banner(`⚡ 알바 체력 +${REWARDED_AD_POLICY.amount}`, GREEN, CREAM_TEXT);
      this.hooks.onSfx?.('reward');
      this.setInfo(`광고 보상 · 알바 체력 +${REWARDED_AD_POLICY.amount}! 이어서 부품 상자를 열 수 있어요.`);
    } else if (result === 'dismissed') {
      this.say('광고를 끝까지 보지 않아 체력을 받지 못했어요.', 'error');
    } else if (result === 'failed') {
      this.say('광고를 불러오지 못했어요. 체력은 그대로예요. 잠시 후 다시 시도해 주세요.', 'error');
    } else if (result === 'unavailable') {
      this.say('지금은 광고로 충전할 수 없어요. 체력 표시를 눌러 조건을 확인하세요.', 'error');
    }
  }

  private showAdOverlay(ad: WorkbenchRewardedAd) {
    this.cancelDrag();
    this.clearHint();
    const overlay = this.add.container(0, 0, [
      this.add.rectangle(195, 405, 390, 810, 0x1d1016, 0.8).setInteractive(),
      this.add.text(195, 392, '광고를 준비하고 있어요…', textStyle(15, CREAM_TEXT)).setOrigin(0.5),
      this.add.text(195, 418, '광고가 끝나면 작업대로 돌아와요', textStyle(11, CREAM_TEXT, false)).setOrigin(0.5),
    ]).setDepth(70);
    this.adOverlay = overlay;
    // 광고가 끝났다는 신호가 오지 않으면 직접 돌아갈 수 있게 합니다(보상은 신호를 받은 경우에만).
    this.time.delayedCall(AD_ESCAPE_MS, () => {
      if (this.adOverlay !== overlay) return;
      const button = this.add.rectangle(195, 470, 240, 40, GOLD).setStrokeStyle(3, BORDER)
        .setInteractive({ useHandCursor: true })
        .on('pointerdown', () => ad.cancel());
      overlay.add([button, this.add.text(195, 470, '광고가 끝나지 않으면 돌아가기', textStyle(12, INK)).setOrigin(0.5)]);
    });
  }

  private hideAdOverlay() {
    this.adOverlay?.destroy(true);
    this.adOverlay = undefined;
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
    this.exitPickMode();
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
    this.say('직전 행동을 되돌렸어요. 자동 장착·합성 보너스·확정 상자도 함께 되돌아가요.');
  }

  private onReturn() {
    if (this.blockedByDay()) return;
    this.cancelDrag();
    this.exitPickMode();
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

  // 납품 연출이 끝나 다음 주문 카드로 바뀐 뒤에 남은 부품을 장착합니다(4종이 차면 그 주문도 납품).
  // 하루 마감 중이면 하지 않고, 다음 영업일에 작업대로 들어올 때 이어 갑니다.
  private continueWithLeftovers(generation: number) {
    if (!this.alive || generation !== this.generation || !this.hooks.canPlay()) return;
    const events = settleWorkbench(this.state, this.hooks.orders);
    if (events.length === 0) return;
    if (this.selected !== NONE && !this.state.board[this.selected]) this.selected = NONE;
    this.commit(events, events.some((event) => event.type === 'delivered') ? undefined : '남은 부품을 다음 자전거에 이어서 장착했어요.');
  }

  // 상태는 이미 도메인이 확정했습니다. 저장·납품 통지를 먼저 하고 연출은 뒤따라갑니다.
  private commit(events: WorkbenchEvent[], info = this.describe(events)) {
    this.returnConfirmUntil = 0;
    this.hooks.onChange();
    events.forEach((event) => {
      if (event.type !== 'delivered') return;
      const tip = this.hooks.onDelivered({ orderIndex: event.orderIndex, reward: event.reward })?.tip ?? 0;
      if (tip > 0) this.tipByOrder.set(event.order, tip);
    });
    this.arriving = new Set(events.flatMap((event) => (event.type === 'placed' && this.state.board[event.index] ? [event.index] : [])));
    this.renderBoard();
    this.renderShelf();
    this.setInfo(info);
    const generation = this.generation;
    this.queue = this.queue.then(() => this.play(events, generation));
  }

  private describe(events: WorkbenchEvent[]) {
    const delivered = events.filter((event): event is Extract<WorkbenchEvent, { type: 'delivered' }> => event.type === 'delivered');
    if (delivered.length > 0) {
      const total = delivered.reduce((sum, event) => sum + event.reward, 0);
      const tips = delivered.reduce((sum, event) => sum + (this.tipByOrder.get(event.order) ?? 0), 0);
      const names = delivered.map((event) => orderMetaAt(event.orderIndex)?.name ?? '주문').join(' · ');
      const pay = `급여 +${total.toLocaleString()} C${tips > 0 ? ` · 팁 +${tips.toLocaleString()}` : ''}`;
      return this.hooks.canPlay()
        ? `${names} 납품 완료! ${pay} · 다음 주문이 이어져요.`
        : `${names} 납품 완료! ${pay} · 오늘 주문을 모두 마쳤어요. 정산으로 이동합니다.`;
    }
    const bonus = events.find((event) => event.type === 'bonus');
    if (bonus) return bonus.bonus === 'free-box'
      ? `합성 ${BONUS_FREE_BOX_AT}회! 무료 상자를 받았어요. 다음 상자는 체력 없이 열려요.`
      : `합성 ${BONUS_PICK_BOX_AT}회! 확정 상자를 받았어요. 아래 보너스 칸을 눌러 원하는 부품을 원하는 칸에 놓으세요.`;
    const installed = events.filter((event): event is Extract<WorkbenchEvent, { type: 'installed' }> => event.type === 'installed');
    if (installed.length > 0) return `${installed.map((event) => PART_NAMES[event.part.type]).join('·')} 완성 · 자전거에 바로 장착했어요.`;
    const merged = events.find((event) => event.type === 'merged');
    if (merged) return `${partLabel(merged.part)} 합성 완료 · ${merged.count < BONUS_FREE_BOX_AT
      ? `무료 상자까지 ${BONUS_FREE_BOX_AT - merged.count}회`
      : `확정 상자까지 ${BONUS_PICK_BOX_AT - merged.count}회`}`;
    const placed = events.find((event) => event.type === 'placed');
    if (placed?.picked) return `확정 상자 · ${partLabel(placed.part)}를 놓았어요. 잘못 놓았으면 ↶ 되돌리기로 무를 수 있어요.`;
    if (placed) return `${placed.free ? '무료 상자 · ' : ''}${partLabel(placed.part)} 입고 · 점선이 다음 자리예요.`;
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
        // 확정 상자는 합성 보너스 칸에서, 일반·무료 상자는 부품 상자 버튼에서 날아옵니다.
        const origin = event.picked ? BONUS : { x: BOX.x - BOX.w / 2 + 26, y: BOX.y };
        const ghost = this.track(this.makePiece(event.part, origin).setDepth(30).setScale(0.45));
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
        this.floatText(to.x, to.y - 30, `보너스 ${event.count}/${BONUS_PICK_BOX_AT}`, event.count >= BONUS_FREE_BOX_AT ? '#dff0d0' : CREAM_TEXT);
      } else if (event.type === 'bonus') {
        this.hooks.onSfx?.('reward');
        if (event.bonus === 'free-box') this.banner(`합성 ${BONUS_FREE_BOX_AT}회! 무료 상자 +1`, GREEN, CREAM_TEXT);
        else this.banner(`합성 ${BONUS_PICK_BOX_AT}회! 확정 상자 +1`, AMBER, INK);
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
        await this.deliveredStamp(orderMetaAt(event.orderIndex)?.name ?? '주문', event.reward, this.tipByOrder.get(event.order) ?? 0, () => {
          this.shownOrder = event.order + 1;
          this.shownInstalled = noneInstalled();
          this.renderOrder();
          this.hooks.onSfx?.('reward');
        });
        this.continueWithLeftovers(generation);
      }
    }
  }

  private async deliveredStamp(name: string, reward: number, tip: number, onPeak: () => void) {
    // 손님 팁이 붙으면(#109) 도장을 넓혀 급여와 팁을 한 줄에 보여 줍니다
    const pay = `+${reward.toLocaleString()} C${tip > 0 ? ` · 팁 +${tip.toLocaleString()}` : ''}`;
    const width = tip > 0 ? 320 : 232;
    const stamp = this.track(this.add.container(195, 138, [
      this.add.rectangle(0, 0, width, 66, CREAM).setStrokeStyle(4, RED),
      this.add.rectangle(0, -21, 112, 20, RED).setStrokeStyle(2, BORDER),
      this.add.text(0, -21, '납품 완료', textStyle(11, CREAM_TEXT)).setOrigin(0.5),
      this.add.text(0, 10, `${name} · ${pay}`, textStyle(tip > 0 ? 12 : 13, INK)).setOrigin(0.5),
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
