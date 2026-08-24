// 게임 화면 디자인 B안: 모바일 세로 따뜻한 픽셀 Garage (390×810)
// A안(1120×720 브라우저 크기)과 동일한 #114 통합 규칙·데이터(PARTS·ORDERS)를 쓰되,
// 홈 화면 디자인 A안과 같은 모바일 세로 화면 구조(주문 카드 → 머지 보드 → 택배 선반)로 재배치한다.
// 자전거·부품 색은 bike-pixel-sprite 모듈의 warm 컬러웨이·부품 대표색을 단일 출처로 사용한다.
import Phaser from 'phaser';
import { drawPixelBike, drawPixelPartIcon, makeWarmColorway, bikePartAnchorOffset, WARM_PART_COLORS, type BikeCategory } from './bike-pixel-sprite';
import { PARTS, ORDERS, type PartType, type Goal } from './merge-prototype';

type Point = { x: number; y: number };
type Piece = { id: number; type: PartType; level: number; row: number; column: number; rotation: number; item: Phaser.GameObjects.Container };
type ParcelState = { state: 'idle' | 'delivering' | 'arrived'; readyAt: number };

const PARCEL_DELIVERY_MS = 1500;
const FONT = '"Arial Rounded MT Bold", "Noto Sans KR", sans-serif';
const INK = '#3b2531';
const MUTED = '#7b5140';
const CREAM = 0xfff1c6;
const GOLD = 0xf6d995;
const BORDER = 0x3b2531;
const BROWN = 0x8e5136;
const PART_COLORS: Record<PartType, number> = WARM_PART_COLORS; // 부품 아이콘과 같은 대표색 단일 출처
const ORDER_NAMES = ['통학용 어반 로드', '트레일 MTB'];

// 주문 카드 자전거 기준점 (x=자전거 가로 중앙, y=바퀴 축 높이 · 부품 장착 연출 목표 좌표의 기준)
// 픽셀 자전거는 cell 2 기준 상단 y-38, 하단 y+20, 폭 약 108px → 카드(중심 y=138, 높이 140) 우측 절반에 들어맞는다.
const BIKE_X = 292;
const BIKE_Y = 132;
const BIKE_CELL = 2;

export type GameScreenMobileHooks = {
  orderIndex?: number;
  onOrderComplete?: (orderIndex: number) => void;
  onSfx?: (event: 'tap' | 'parcel' | 'merge' | 'install' | 'complete' | 'error') => void;
};

class GameScreenMobileScene extends Phaser.Scene {
  constructor(private readonly hooks: GameScreenMobileHooks = {}) { super('game-screen-mobile'); }

  private rows = 7;
  private columns = 6;
  private cellSize = 54;
  private gap = 4;
  private boardLeft = 0;
  private boardTop = 234;
  private pieces: Piece[] = [];
  private nextId = 1;
  private orderIndex = 0;
  private goals: Goal[] = [];
  private merges = 0;
  private startedAt = 0;
  private selectedPiece?: Piece;
  private selectedGenerator: PartType = 'frame';
  private generatorRotation = 0;
  private generatorPlacementActive = false;
  private pendingParcel?: PartType;
  private parcels = new Map<PartType, ParcelState>();
  private installQueue: Array<{ goal: Goal; from: Point; level: number }> = [];
  private installingPart = false;
  private orderCompleting = false;
  private info!: Phaser.GameObjects.Text;
  private metrics!: Phaser.GameObjects.Text;
  private orderTitle!: Phaser.GameObjects.Text;
  private orderProgress!: Phaser.GameObjects.Text;
  private orderBike?: Phaser.GameObjects.Graphics;
  private goalChips = new Map<PartType, { panel: Phaser.GameObjects.Rectangle; status: Phaser.GameObjects.Text }>();
  private parcelDisplays = new Map<PartType, { button: Phaser.GameObjects.Rectangle; status: Phaser.GameObjects.Text; need: Phaser.GameObjects.Text }>();

  create() {
    this.cameras.main.setBackgroundColor('#c78452');
    this.startedAt = this.time.now;
    this.orderIndex = Math.abs(this.hooks.orderIndex ?? 0) % ORDERS.length;
    this.goals = ORDERS[this.orderIndex].map((goal) => ({ ...goal }));
    this.cellSize = Math.floor(Math.min(368 / this.columns, 364 / this.rows));
    this.boardLeft = Math.floor((390 - this.columns * this.cellSize) / 2);
    this.drawBackdrop();
    this.drawHeader();
    this.drawOrderCard();
    this.drawBoard();
    this.drawParcelShelf();
    this.refreshUi('주문에 필요한 카테고리의 택배를 주문하고, 도착한 상자를 개봉해 부품을 보드에 배치하세요.');
  }

  update() {
    this.metrics.setText(`${((this.time.now - this.startedAt) / 1000).toFixed(0)}s · 머지 ${this.merges}`);
    this.tickParcels();
  }

  // 홈 A안과 같은 목재 공방 배경: 벽·바닥·판자 라인
  private drawBackdrop() {
    this.add.rectangle(195, 300, 390, 600, 0xc78452).setDepth(0);
    this.add.rectangle(195, 705, 390, 210, 0xa9683f).setDepth(0);
    for (let y = 626; y < 810; y += 26) this.add.rectangle(195, y, 390, 2, 0x8a5231, 0.5).setDepth(0);
    for (let x = 24; x < 390; x += 52) this.add.rectangle(x, 300, 2, 600, 0xb37246, 0.35).setDepth(0);
  }

  private drawHeader() {
    this.add.rectangle(195, 30, 390, 60, CREAM).setStrokeStyle(4, BORDER).setDepth(8);
    this.add.rectangle(56, 30, 76, 24, 0xc95746).setStrokeStyle(2, BORDER).setDepth(9);
    this.add.text(56, 30, 'WORK', { fontFamily: FONT, fontSize: '11px', color: '#fff1c6', fontStyle: 'bold' }).setOrigin(0.5).setDepth(10);
    this.add.text(104, 22, '두리 자전거 공방 · 작업대', { fontFamily: FONT, fontSize: '13px', color: INK, fontStyle: 'bold' }).setDepth(10);
    this.metrics = this.add.text(382, 39, '', { fontFamily: FONT, fontSize: '10px', color: MUTED }).setOrigin(1, 0.5).setDepth(10);
    this.add.text(104, 40, 'MVP 통합 · 모바일 세로 B안', { fontFamily: FONT, fontSize: '9px', color: MUTED }).setDepth(10);
  }

  private drawOrderCard() {
    this.add.rectangle(195, 138, 374, 140, CREAM).setStrokeStyle(4, BROWN).setDepth(2);
    this.add.rectangle(64, 78, 88, 22, 0xc95746).setStrokeStyle(2, BORDER).setDepth(3);
    this.add.text(64, 78, 'NEW ORDER', { fontFamily: FONT, fontSize: '9px', color: '#fff1c6', fontStyle: 'bold' }).setOrigin(0.5).setDepth(4);
    this.orderTitle = this.add.text(20, 94, '', { fontFamily: FONT, fontSize: '15px', color: INK, fontStyle: 'bold' }).setDepth(4);
    this.orderProgress = this.add.text(20, 117, '', { fontFamily: FONT, fontSize: '10px', color: MUTED, fontStyle: 'bold' }).setDepth(4);

    this.goals.forEach((goal, index) => {
      const x = 42 + index * 46;
      const y = 168;
      const panel = this.add.rectangle(x, y, 42, 40, GOLD).setStrokeStyle(2, PART_COLORS[goal.type]).setDepth(3);
      // 칩 위쪽은 부품 픽셀 아이콘, 아래쪽은 상태 텍스트
      drawPixelPartIcon(this, x, y - 9, 1.5, goal.type, { depth: 4 });
      const status = this.add.text(x, y + 11, '', { fontFamily: FONT, fontSize: '9px', color: MUTED, fontStyle: 'bold' }).setOrigin(0.5).setDepth(4);
      this.goalChips.set(goal.type, { panel, status });
    });
    this.drawOrderBike();
    this.refreshOrder();
  }

  // 현재 주문에 맞는 자전거 카테고리 ('통학용 어반 로드' → city, '트레일 MTB' → mtb)
  private orderCategory(): BikeCategory {
    return this.orderIndex === 1 ? 'mtb' : 'city';
  }

  private drawOrderBike() {
    this.orderBike?.destroy();
    const delivered = (type: PartType) => this.goals.find((goal) => goal.type === type)?.delivered ?? false;
    this.orderBike = drawPixelBike(this, BIKE_X, BIKE_Y, BIKE_CELL, {
      category: this.orderCategory(),
      colorway: makeWarmColorway(0xc95746),
      depth: 4,
      partAlpha: {
        frame: delivered('frame') ? 1 : 0.5,
        wheel: delivered('wheel') ? 1 : 0.5,
        drivetrain: delivered('drivetrain') ? 1 : 0.5,
        handlebar: delivered('handlebar') ? 1 : 0.5,
      },
    });
  }

  // 픽셀 스프라이트 앵커(x=중앙, y=축) 기준 부품 위치 오프셋을 월드 좌표로 환산 (장착 연출 목표)
  private bikeAnchor(type: PartType): Point {
    const { dx, dy } = bikePartAnchorOffset(this.orderCategory(), type, BIKE_CELL);
    return { x: BIKE_X + dx, y: BIKE_Y + dy };
  }

  private drawBoard() {
    const width = this.columns * this.cellSize;
    const height = this.rows * this.cellSize;
    this.add.rectangle(this.boardLeft + width / 2, this.boardTop + height / 2, width + 16, height + 16, BROWN).setStrokeStyle(5, BORDER).setDepth(0);
    for (let row = 0; row < this.rows; row += 1) {
      for (let column = 0; column < this.columns; column += 1) {
        const { x, y } = this.cellCenter(row, column);
        const zone = this.add.rectangle(x, y, this.cellSize - this.gap, this.cellSize - this.gap, 0xffe6a8)
          .setStrokeStyle(2, 0x9c5b3c).setInteractive({ useHandCursor: true }).setDepth(1);
        zone.on('pointerdown', () => this.handleCell(row, column));
      }
    }
    this.info = this.add.text(195, this.boardTop + height + 18, '', { fontFamily: FONT, fontSize: '10px', color: '#fff1c6', align: 'center', wordWrap: { width: 366 }, lineSpacing: 3 }).setOrigin(0.5, 0).setDepth(10);
  }

  private drawParcelShelf() {
    const shelfTop = 668;
    this.add.rectangle(195, shelfTop + 66, 374, 136, CREAM).setStrokeStyle(4, BORDER).setDepth(2);
    this.add.rectangle(96, shelfTop, 152, 22, BROWN).setDepth(3);
    this.add.text(28, shelfTop - 7, '택배 선반 · DELIVERY', { fontFamily: FONT, fontSize: '10px', color: '#fff1c6', fontStyle: 'bold' }).setDepth(4);

    PARTS.forEach((part, index) => {
      const x = 104 + (index % 2) * 182;
      const y = shelfTop + 40 + Math.floor(index / 2) * 54;
      const button = this.add.rectangle(x, y, 172, 48, GOLD).setStrokeStyle(3, PART_COLORS[part.type]).setInteractive({ useHandCursor: true }).setDepth(3);
      button.on('pointerdown', () => this.handleParcelButton(part.type));
      // 버튼 왼쪽에 부품 픽셀 아이콘, 텍스트는 아이콘 오른쪽으로 밀어 배치
      drawPixelPartIcon(this, x - 72, y, 1.5, part.type, { depth: 4 });
      this.add.text(x - 56, y - 17, `${part.name} · ${part.shape.length}칸`, { fontFamily: FONT, fontSize: '11px', color: INK, fontStyle: 'bold' }).setDepth(4);
      const status = this.add.text(x - 56, y + 2, '', { fontFamily: FONT, fontSize: '9px', color: MUTED }).setDepth(4);
      const need = this.add.text(x + 80, y - 17, '주문 필요', { fontFamily: FONT, fontSize: '8px', color: '#a14a38', fontStyle: 'bold' }).setOrigin(1, 0).setDepth(4);
      this.parcelDisplays.set(part.type, { button, status, need });
    });
  }

  private handleParcelButton(type: PartType) {
    this.hooks.onSfx?.('tap');
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
      this.refreshControls();
      this.refreshUi(repeated
        ? `${this.partName(type)}을 ${this.generatorRotation * 90}°로 회전했습니다. 보드에서 배치 위치를 선택하세요.`
        : `${this.partName(type)} 상자를 개봉했습니다. 보드에서 Lv.1 부품의 배치 위치를 선택하세요. 같은 Lv.1 부품 위에 놓으면 바로 머지됩니다.`);
      return;
    }
    this.hooks.onSfx?.('parcel');
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
    if (arrivedNow) this.info.setText(`${this.partName(arrivedNow)} 택배가 도착했습니다. 아래 버튼을 눌러 상자를 개봉하세요.`);
    this.refreshParcelDisplays();
  }

  private refreshParcelDisplays() {
    this.parcelDisplays.forEach((display, type) => {
      if (!display.button.active) return;
      const parcel = this.parcels.get(type);
      const needed = this.goals.some((goal) => goal.type === type && !goal.delivered && !goal.installing);
      const placing = this.pendingParcel === type && this.generatorPlacementActive;
      display.need.setVisible(needed);
      let statusText = '탭하면 택배를 주문합니다';
      let statusColor = MUTED;
      if (parcel?.state === 'delivering') {
        statusText = `배송 중… ${Math.max(0, (parcel.readyAt - this.time.now) / 1000).toFixed(1)}초`;
        statusColor = '#a16028';
      } else if (placing) {
        statusText = `배치 중 · ${this.generatorRotation * 90}° · 다시 누르면 회전`;
        statusColor = '#3f7851';
      } else if (parcel?.state === 'arrived') {
        statusText = '📦 도착 · 탭해서 개봉';
        statusColor = '#a16028';
      }
      display.status.setText(statusText).setColor(statusColor);
      display.button.setFillStyle(placing ? 0xffe6a8 : parcel?.state === 'arrived' ? 0xf4c86a : GOLD);
      display.button.setStrokeStyle(needed ? 3 : 2, PART_COLORS[type], needed ? 1 : 0.45);
    });
  }

  private consumePendingParcel() {
    if (!this.pendingParcel) return;
    this.parcels.set(this.pendingParcel, { state: 'idle', readyAt: 0 });
    this.pendingParcel = undefined;
    this.refreshParcelDisplays();
  }

  private handleCell(row: number, column: number) {
    const clicked = this.pieceAt(row, column);
    if (clicked && this.generatorPlacementActive && !this.selectedPiece && clicked.type === this.selectedGenerator && clicked.level === 1) {
      clicked.item.destroy(true);
      this.pieces = this.pieces.filter((piece) => piece.id !== clicked.id);
      this.pieces.push(this.makePiece(clicked.type, clicked.row, clicked.column, clicked.rotation, 2));
      this.generatorPlacementActive = false;
      this.consumePendingParcel();
      this.merges += 1;
      this.hooks.onSfx?.('merge');
      this.refreshControls();
      this.refreshUi(`${this.partName(clicked.type)} Lv.1을 같은 위치에 놓아 Lv.2로 머지했습니다.`);
      return;
    }
    if (clicked) {
      if (!this.selectedPiece) {
        this.selectedPiece = clicked;
        this.generatorPlacementActive = false;
        this.pendingParcel = undefined;
        this.refreshControls();
        this.refreshUi(`${this.partName(clicked.type)} Lv.${clicked.level} 선택 · 빈 칸으로 이동하거나 같은 부품에 머지하세요. 같은 부품을 다시 누르면 회전합니다.`);
        return;
      }
      if (clicked.id === this.selectedPiece.id) { this.rotateSelected(); return; }
      if (clicked.type === this.selectedPiece.type && clicked.level === this.selectedPiece.level && clicked.level < 4) {
        this.mergePieces(this.selectedPiece, clicked);
        return;
      }
      this.refreshUi('같은 종류·같은 레벨끼리만 머지할 수 있습니다.');
      this.hooks.onSfx?.('error');
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
      } else { this.refreshUi('부품 모양이 보드 밖으로 나가거나 다른 부품과 겹칩니다.'); }
      return;
    }
    if (!this.generatorPlacementActive) {
      this.refreshUi('먼저 아래 택배 선반에서 택배를 주문하고, 도착한 상자를 개봉해 부품을 수급하세요.');
      return;
    }
    if (!this.canPlace(this.selectedGenerator, row, column, this.generatorRotation)) {
      this.refreshUi('현재 방향으로 배치할 공간이 부족합니다. 부품 버튼을 다시 눌러 회전하거나 다른 위치를 선택하세요.');
      return;
    }
    this.pieces.push(this.makePiece(this.selectedGenerator, row, column, this.generatorRotation, 1));
    this.generatorPlacementActive = false;
    this.consumePendingParcel();
    this.refreshUi(`${this.partName(this.selectedGenerator)} Lv.1을 배치했습니다.`);
  }

  private rotateSelected() {
    if (!this.selectedPiece) return;
    const next = (this.selectedPiece.rotation + 1) % 4;
    if (!this.canPlace(this.selectedPiece.type, this.selectedPiece.row, this.selectedPiece.column, next, this.selectedPiece.id)) {
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
    this.pieces.push(this.makePiece(target.type, target.row, target.column, target.rotation, target.level + 1));
    this.selectedPiece = undefined;
    this.merges += 1;
    this.hooks.onSfx?.('merge');
    this.refreshControls();
    this.refreshUi(`${this.partName(target.type)} Lv.${target.level + 1} 머지 성공!`);
  }

  private makePiece(type: PartType, row: number, column: number, rotation: number, level: number) {
    const cells = this.shape(type, rotation);
    const partColor = PART_COLORS[type];
    const blocks = cells.map((point) => this.add.rectangle(point.x * this.cellSize, point.y * this.cellSize, this.cellSize - this.gap * 2, this.cellSize - this.gap * 2, partColor).setStrokeStyle(3, BORDER));
    const center = cells.reduce((sum, point) => ({ x: sum.x + point.x, y: sum.y + point.y }), { x: 0, y: 0 });
    center.x /= cells.length;
    center.y /= cells.length;
    const badgeCell = cells.reduce((closest, point) => {
      const distance = (point.x - center.x) ** 2 + (point.y - center.y) ** 2;
      const closestDistance = (closest.x - center.x) ** 2 + (closest.y - center.y) ** 2;
      return distance < closestDistance ? point : closest;
    });
    // 중앙 칸 위쪽엔 부품 픽셀 아이콘, 아래쪽엔 Lv 배지를 배치해 서로 겹치지 않게 한다
    const icon = drawPixelPartIcon(this, badgeCell.x * this.cellSize, badgeCell.y * this.cellSize - 8, 2, type, { level });
    const badge = this.add.rectangle(badgeCell.x * this.cellSize, badgeCell.y * this.cellSize + 14, 32, 18, CREAM, 0.94).setStrokeStyle(2, BORDER, 0.8);
    const tag = this.add.text(badgeCell.x * this.cellSize, badgeCell.y * this.cellSize + 14, `Lv.${level}`, { fontFamily: FONT, fontSize: '10px', color: INK, fontStyle: 'bold' }).setOrigin(0.5);
    const item = this.add.container(0, 0, [...blocks, icon, badge, tag]).setDepth(2);
    const piece: Piece = { id: this.nextId++, type, level, row, column, rotation, item };
    this.positionPiece(piece);
    return piece;
  }

  private positionPiece(piece: Piece) {
    const origin = this.cellCenter(piece.row, piece.column);
    piece.item.setPosition(origin.x, origin.y);
  }

  // 통합 규칙: 목표 레벨 부품이 보드에 생기면 소비 후 자전거로 순차 자동 장착
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

  private processInstallQueue() {
    if (this.installingPart) return;
    const next = this.installQueue.shift();
    if (!next) {
      if (this.goals.length > 0 && this.goals.every((goal) => goal.delivered)) this.completeOrder();
      return;
    }
    this.installingPart = true;
    const part = PARTS.find((item) => item.type === next.goal.type)!;
    const target = this.bikeAnchor(next.goal.type);
    this.info.setText(`${part.name} Lv.${next.level} 완성 · 고객 자전거로 이동해 장착합니다.`);
    this.refreshOrder();
    const marker = this.add.rectangle(next.from.x, next.from.y, 24, 24, PART_COLORS[next.goal.type]).setDepth(30).setStrokeStyle(3, CREAM, 0.9);
    this.tweens.add({
      targets: marker,
      x: target.x,
      y: target.y,
      scale: { from: 0.9, to: 1.4 },
      alpha: { from: 1, to: 0.3 },
      duration: 520,
      ease: 'Cubic.easeInOut',
      onComplete: () => {
        marker.destroy();
        next.goal.installing = false;
        next.goal.delivered = true;
        this.hooks.onSfx?.('install');
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

  private completeOrder() {
    if (this.orderCompleting) return;
    this.orderCompleting = true;
    this.hooks.onSfx?.('complete');
    this.info.setText('주문 완료! 모든 부품이 장착되어 자전거를 납품했습니다. 정산 화면으로 이동합니다.');
    if (this.hooks.onOrderComplete) {
      this.time.delayedCall(900, () => this.hooks.onOrderComplete?.(this.orderIndex));
      return;
    }
    this.time.delayedCall(1600, () => {
      this.orderCompleting = false;
      this.orderIndex = (this.orderIndex + 1) % 2;
      this.goals = ORDERS[this.orderIndex].map((goal) => ({ ...goal }));
      this.startedAt = this.time.now;
      this.drawOrderBike();
      this.refreshOrder();
      this.refreshParcelDisplays();
      this.refreshUi('새 주문이 도착했습니다. 보드에 남은 부품은 그대로 사용할 수 있으며, 필요한 카테고리 택배를 주문하세요.');
    });
  }

  private refreshOrder() {
    const installed = this.goals.filter((goal) => goal.delivered).length;
    this.orderTitle.setText(ORDER_NAMES[this.orderIndex]);
    this.orderProgress.setText(`장착 ${installed}/${this.goals.length} · 부품별 자동 장착`);
    this.goals.forEach((goal) => {
      const chip = this.goalChips.get(goal.type);
      if (!chip) return;
      chip.status.setText(goal.delivered ? '✓' : `Lv.${goal.level}`).setColor(goal.delivered ? '#3f7851' : MUTED);
      chip.panel.setFillStyle(goal.delivered ? 0xdff0d0 : GOLD);
      chip.panel.setStrokeStyle(goal.delivered ? 2 : 3, PART_COLORS[goal.type], goal.delivered ? 0.5 : 1);
    });
  }

  private refreshControls() {
    this.pieces.forEach((piece) => piece.item.setScale(piece.id === this.selectedPiece?.id ? 1.06 : 1));
    this.refreshParcelDisplays();
  }

  private refreshUi(message: string) {
    this.info.setText(message);
    this.checkIntegratedDelivery();
    this.refreshOrder();
  }

  private shape(type: PartType, rotation: number) {
    let points = PARTS.find((part) => part.type === type)!.shape.map((point) => ({ ...point }));
    for (let turn = 0; turn < rotation; turn += 1) points = points.map((point) => ({ x: -point.y, y: point.x }));
    const minX = Math.min(...points.map((point) => point.x));
    const minY = Math.min(...points.map((point) => point.y));
    return points.map((point) => ({ x: point.x - minX, y: point.y - minY }));
  }

  private occupied(piece: Piece) { return this.shape(piece.type, piece.rotation).map((point) => ({ row: piece.row + point.y, column: piece.column + point.x })); }

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

  private partName(type: PartType) { return PARTS.find((part) => part.type === type)!.name; }
}

export function startGameScreenMobilePrototype(parent: string, hooks: GameScreenMobileHooks = {}) {
  return new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width: 390,
    height: 810,
    backgroundColor: '#c78452',
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    scene: new GameScreenMobileScene(hooks),
  });
}
