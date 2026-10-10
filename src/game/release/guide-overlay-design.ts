// 첫 플레이 안내 오버레이 (출시 적용): 따뜻한 픽셀 정비사 말풍선형 (390×810)
// 머지 작업대(머지 코어 E안) 화면의 정적 모사 위에, 정비사 두리의 말풍선과
// 스포트라이트 강조로 첫 영업 6단계(주문 → 상자 → 합성 → 연쇄 → 장착·납품 → 하루 일정)를 안내한다.
// 안내 문구·발동 조건 규칙은 #115 담당이며 여기서는 결정하지 않는다.
import Phaser from 'phaser';
import { drawPixelBike, drawPixelPartIcon, makeWarmColorway, WARM_PART_COLORS } from './bike-pixel-sprite';
import { COMBO_FREE_BOX, COMBO_GUARANTEE, starterBoard, nextIntakeSlot, WORKBENCH_COLUMNS, WORKBENCH_ROWS } from '../../domain/merge-workbench';
import { orderMetaAt } from './meta-progress';
import { drawFieldCharacter } from './art-character-pixel';

const FONT = '"Arial Rounded MT Bold", "Noto Sans KR", sans-serif';
const INK = '#3b2531';
const MUTED = '#7b5140';
const CREAM_TEXT = '#fff1c6';
const CREAM = 0xfff1c6;
const GOLD = 0xf6d995;
const BORDER = 0x3b2531;
const BROWN = 0x8e5136;
const DARK_WOOD = 0x573044;
// 팔레트 FLOOR: 상자 아이콘 몸통 색 (작업대와 동일)
const FLOOR = 0xb66f45;
const RED = 0xc95746;
const GREEN = 0x5e9a67;
const AMBER = 0xf4b84a;

const textStyle = (size: number, color: string, bold = true): Phaser.Types.GameObjects.Text.TextStyle =>
  ({ fontFamily: FONT, fontSize: `${size}px`, color, fontStyle: bold ? 'bold' : 'normal' });

type GuideStep = { target: { x: number; y: number; w: number; h: number }; title: string; text: string; bubbleTop: boolean };

// 머지 작업대 레이아웃 기준의 강조 영역과 6단계 안내
const STEPS: GuideStep[] = [
  { target: { x: 8, y: 66, w: 374, h: 144 }, title: '1 · 주문 확인', text: '고객 주문이 도착했어요!\n필요한 부품 4종과 레벨을\n먼저 확인해 주세요.', bubbleTop: false },
  { target: { x: 14, y: 682, w: 362, h: 52 }, title: '2 · 부품 상자', text: '상자를 열면 알바 체력 1을 쓰고\n점선 칸에 부품이 들어와요.\n가운데부터 바깥으로 채워져요.', bubbleTop: true },
  { target: { x: 31, y: 226, w: 328, h: 380 }, title: '3 · 이웃 합성', text: '부품은 옮길 수 없어요.\n맞닿은 같은 부품 2개를\n차례로 누르면 합성돼요.', bubbleTop: false },
  { target: { x: 198, y: 736, w: 176, h: 52 }, title: '4 · 연쇄 보너스', text: '상자 없이 이어서 3번 합성하면\n무료 상자, 5번이면 필요한\n부품이 확정으로 나와요!', bubbleTop: true },
  { target: { x: 210, y: 80, w: 172, h: 110 }, title: '5 · 장착·납품', text: '목표 레벨이 되면 바로 장착!\n4종을 모두 달면 납품되고\n다음 주문이 이어져요.', bubbleTop: false },
  // 6단계 강조 영역은 건너뛰기 버튼(테두리 포함 y 4~28) 아래에서 시작해, 프레임 윗변(y 28~32)이 버튼에 가려지지 않게 둡니다.
  { target: { x: 4, y: 33, w: 382, h: 29 }, title: '6 · 하루 일정', text: '주문 3건을 납품하면 오늘\n영업이 끝나고 정산해요. 체력이\n떨어지면 회복 후 이어서 해요.', bubbleTop: false },
];

export type GuideOverlayHooks = {
  onFinish?: () => void;
  onSfx?: (event: 'tap' | 'complete') => void;
};

class GuideOverlayScene extends Phaser.Scene {
  constructor(private readonly hooks: GuideOverlayHooks = {}) { super('guide-overlay-a'); }

  private stepIndex = 0;
  private overlayObjects: Phaser.GameObjects.GameObject[] = [];

  create() {
    this.cameras.main.setBackgroundColor('#c78452');
    this.drawMockGameScreen();
    this.renderStep();
  }

  // 택배 상자 픽셀 아이콘 (작업대와 같은 잉크 외곽선 톤)
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

  // 머지 작업대의 정적 모사: 안내용 배경 (상호작용 없음). 실제 작업대 화면과 같은 구성·글자 크기를 유지합니다.
  private drawMockGameScreen() {
    this.add.rectangle(195, 300, 390, 600, 0xc78452).setDepth(0);
    this.add.rectangle(195, 705, 390, 210, 0xa9683f).setDepth(0);
    for (let y = 626; y < 810; y += 26) this.add.rectangle(195, y, 390, 2, 0x8a5231, 0.5).setDepth(0);
    for (let x = 24; x < 390; x += 52) this.add.rectangle(x, 300, 2, 600, 0xb37246, 0.35).setDepth(0);

    // 헤더: WORK · 공방 이름 / DAY · 오늘 주문 · 오늘 수입 / 주문 진행 막대. 우상단 홈 버튼 자리는 건너뛰기 버튼이 씁니다.
    this.add.rectangle(195, 30, 390, 60, CREAM).setStrokeStyle(4, BORDER).setDepth(2);
    this.add.rectangle(42, 16, 60, 18, RED).setStrokeStyle(2, BORDER).setDepth(3);
    this.add.text(42, 16, 'WORK', textStyle(10, CREAM_TEXT)).setOrigin(0.5).setDepth(4);
    this.add.text(80, 9, '두리 자전거 공방 · 작업대', textStyle(12, INK)).setDepth(4);
    this.add.rectangle(48, 41, 72, 22, BROWN).setStrokeStyle(2, BORDER).setDepth(3);
    this.add.text(48, 41, 'DAY 1', textStyle(12, CREAM_TEXT)).setOrigin(0.5).setDepth(4);
    this.add.rectangle(130, 41, 76, 24, AMBER).setStrokeStyle(2, BORDER).setDepth(3);
    this.add.text(130, 41, '주문 0/3', textStyle(13, INK)).setOrigin(0.5).setDepth(4);
    this.add.rectangle(276, 41, 200, 22, GOLD).setStrokeStyle(2, BROWN).setDepth(3);
    this.add.text(276, 41, '오늘 수입  0 C', textStyle(11, MUTED)).setOrigin(0.5).setDepth(4);
    this.add.rectangle(6, 56, 378, 3, DARK_WOOD).setOrigin(0, 0.5).setDepth(4);

    // 주문 카드: 첫 주문의 실제 이름·요구 레벨·보상을 그대로 보여 줍니다.
    const firstOrder = orderMetaAt(0);
    this.add.rectangle(195, 138, 374, 140, CREAM).setStrokeStyle(4, BROWN).setDepth(2);
    this.add.rectangle(64, 78, 88, 22, RED).setStrokeStyle(2, BORDER).setDepth(3);
    this.add.text(64, 78, 'NEW ORDER', textStyle(10, CREAM_TEXT)).setOrigin(0.5).setDepth(4);
    this.add.text(20, 94, firstOrder?.name ?? '주문 1', textStyle(15, INK)).setDepth(4);
    this.add.text(20, 117, '장착 2/4 · 완성 즉시 자동 장착', textStyle(11, MUTED)).setDepth(4);
    // 납품 보상 글자색은 작업대의 orderReward와 같은 보상 강조색을 씁니다.
    this.add.text(292, 186, `납품 보상 ${(firstOrder?.reward ?? 0).toLocaleString()} C`, textStyle(11, '#a16028')).setOrigin(0.5).setDepth(4);
    drawPixelBike(this, 292, 132, 2, {
      category: firstOrder?.bikeCategory ?? 'city',
      colorway: makeWarmColorway(RED),
      depth: 4,
      partAlpha: { frame: 0.5, wheel: 0.5, drivetrain: 1, handlebar: 1 },
    });
    (['frame', 'wheel', 'drivetrain', 'handlebar'] as const).forEach((type, index) => {
      const x = 42 + index * 46;
      // 시작 보드의 Lv.1 구동계·핸들바는 첫 주문에 바로 장착된 상태로 보여 줍니다.
      const done = index >= 2;
      this.add.rectangle(x, 168, 42, 40, done ? 0xdff0d0 : GOLD).setStrokeStyle(2, WARM_PART_COLORS[type]).setDepth(3);
      drawPixelPartIcon(this, x, 159, 1.5, type, { depth: 4 });
      this.add.text(x, 179, done ? '✓' : `Lv.${firstOrder?.partLevels[type] ?? 2}`, textStyle(11, done ? '#3f7851' : MUTED)).setOrigin(0.5).setDepth(4);
    });

    // 작업대 보드: 첫 영업 시작 보드(지급 부품)와 다음 입고 칸
    const cell = 52;
    const left = 39;
    const top = 234;
    this.add.rectangle(left + (WORKBENCH_COLUMNS * cell) / 2, top + (WORKBENCH_ROWS * cell) / 2, WORKBENCH_COLUMNS * cell + 16, WORKBENCH_ROWS * cell + 16, BROWN).setStrokeStyle(5, BORDER).setDepth(1);
    const board = starterBoard();
    // 시작 보드의 Lv.1 구동계·핸들바는 첫 주문에 바로 장착되므로 보드에서 뺍니다.
    board[4] = null;
    board[5] = null;
    board.forEach((part, index) => {
      const x = left + (index % WORKBENCH_COLUMNS) * cell + cell / 2;
      const y = top + Math.floor(index / WORKBENCH_COLUMNS) * cell + cell / 2;
      this.add.rectangle(x, y, cell - 4, cell - 4, 0xffe6a8).setStrokeStyle(2, 0x9c5b3c).setDepth(1);
      if (!part) return;
      this.add.rectangle(x, y, cell - 8, cell - 8, WARM_PART_COLORS[part.type]).setStrokeStyle(3, BORDER).setDepth(2);
      drawPixelPartIcon(this, x, y - 8, 2, part.type, { depth: 3, level: part.level });
      this.add.rectangle(x, y + 14, 34, 18, CREAM, 0.94).setStrokeStyle(2, BORDER, 0.8).setDepth(3);
      this.add.text(x, y + 14, `Lv.${part.level}`, textStyle(11, INK)).setOrigin(0.5).setDepth(4);
    });
    // 다음 입고 칸: 작업대와 같은 점선 테두리 + 상자 아이콘
    const slot = nextIntakeSlot(board);
    const slotX = left + (slot % WORKBENCH_COLUMNS) * cell + cell / 2;
    const slotY = top + Math.floor(slot / WORKBENCH_COLUMNS) * cell + cell / 2;
    const dashes = this.add.graphics().setDepth(2);
    dashes.fillStyle(BROWN, 1);
    for (let t = -20; t < 20; t += 8) dashes.fillRect(slotX + t, slotY - 21, 5, 3).fillRect(slotX + t, slotY + 18, 5, 3).fillRect(slotX - 21, slotY + t, 3, 5).fillRect(slotX + 18, slotY + t, 3, 5);
    this.drawBoxIcon(slotX, slotY - 6, 1.5).setDepth(3);
    this.add.text(slotX, slotY + 12, '다음 입고', textStyle(9, MUTED)).setOrigin(0.5).setDepth(3);

    // 하단 선반: 부품 상자·되돌리기·반품(1행) / 알바 체력·연쇄 합성(2행)
    this.add.rectangle(195, 734, 374, 136, CREAM).setStrokeStyle(4, BORDER).setDepth(2);
    this.add.rectangle(96, 668, 152, 22, BROWN).setDepth(3);
    this.add.text(28, 661, '부품 상자 · PARTS BOX', textStyle(10, CREAM_TEXT)).setDepth(4);
    this.add.rectangle(282, 668, 200, 22, BROWN).setStrokeStyle(2, BORDER).setDepth(3);
    this.add.text(282, 668, `${COMBO_FREE_BOX}연쇄 무료 상자 · ${COMBO_GUARANTEE}연쇄 필수 부품`, textStyle(10, CREAM_TEXT)).setOrigin(0.5).setDepth(4);
    this.add.rectangle(136, 708, 240, 48, GOLD).setStrokeStyle(3, BROWN).setDepth(3);
    this.drawBoxIcon(42, 708, 2).setDepth(4);
    this.add.text(64, 691, '부품 상자 열기', textStyle(12, INK)).setDepth(4);
    this.add.text(64, 710, '점선 칸에 자동 배치', textStyle(10, MUTED, false)).setDepth(4);
    this.add.text(248, 691, '⚡ −1', textStyle(11, '#a14a38')).setOrigin(1, 0).setDepth(4);
    // 비활성 버튼: PAPER 반투명 바탕 + INK 글자로 라벨이 읽히게 둡니다 (실제 작업대와 같은 규칙).
    [[290, '↶\n되돌리기'], [350, '↗\n반품']].forEach(([x, label]) => {
      this.add.rectangle(x as number, 708, 56, 48, GOLD, 0.6).setStrokeStyle(2, BORDER, 0.5).setDepth(3);
      this.add.text(x as number, 708, label as string, { ...textStyle(11, INK), align: 'center', lineSpacing: 2 }).setOrigin(0.5).setAlpha(0.55).setDepth(4);
    });
    this.add.rectangle(104, 762, 172, 48, GOLD).setStrokeStyle(2, BROWN).setDepth(3);
    this.add.text(24, 744, '⚡ 알바 체력 30/30', textStyle(11, INK)).setDepth(4);
    this.add.text(24, 760, '가득 참', textStyle(10, MUTED, false)).setDepth(4);
    this.add.rectangle(24, 778, 160, 5, DARK_WOOD).setOrigin(0, 0.5).setDepth(4);
    this.add.rectangle(24, 778, 160, 5, GREEN).setOrigin(0, 0.5).setDepth(5);
    this.add.rectangle(286, 762, 172, 48, GOLD).setStrokeStyle(2, BROWN).setDepth(3);
    this.add.text(206, 744, '연쇄 합성 0', textStyle(11, INK)).setDepth(4);
    this.add.text(206, 760, '무료 상자 0 · 확정 0', textStyle(10, MUTED)).setDepth(4);
    for (let i = 0; i < COMBO_GUARANTEE; i += 1) {
      const milestone = i === COMBO_FREE_BOX - 1 || i === COMBO_GUARANTEE - 1;
      this.add.rectangle(306 + i * 14, 751, milestone ? 11 : 9, milestone ? 11 : 9, CREAM).setStrokeStyle(2, BORDER).setDepth(4);
    }
  }

  // 스포트라이트: 강조 영역만 남기고 사방을 어둡게 덮는다 (핵심 UI를 가리지 않음)
  private renderStep() {
    this.overlayObjects.forEach((object) => object.destroy());
    this.overlayObjects = [];
    const step = STEPS[this.stepIndex];
    const { x, y, w, h } = step.target;
    const dim = 0x1d1016;
    const alpha = 0.62;
    const zones = [
      this.add.rectangle(195, y / 2, 390, y, dim, alpha),
      this.add.rectangle(195, y + h + (810 - y - h) / 2, 390, 810 - y - h, dim, alpha),
      this.add.rectangle(x / 2, y + h / 2, x, h, dim, alpha),
      this.add.rectangle(x + w + (390 - x - w) / 2, y + h / 2, 390 - x - w, h, dim, alpha),
    ];
    zones.forEach((zone) => zone.setDepth(20));
    const frame = this.add.rectangle(x + w / 2, y + h / 2, w + 6, h + 6).setStrokeStyle(4, AMBER).setDepth(21);
    this.tweens.add({ targets: frame, alpha: { from: 1, to: 0.45 }, duration: 520, yoyo: true, repeat: -1 });

    // 정비사 두리 + 말풍선: 강조 영역 반대편에 배치해 대상을 가리지 않는다
    const bubbleY = step.bubbleTop ? 150 : 560;
    const characterY = step.bubbleTop ? 236 : 646;
    const character = drawFieldCharacter(this, 66, characterY, '정비사', 4, 22);
    const bubble = this.add.rectangle(232, bubbleY, 288, 116, CREAM).setStrokeStyle(4, BORDER).setDepth(22);
    const pointer = this.add.triangle(120, bubbleY + 58, 0, 0, 18, 0, 9, 16, CREAM).setStrokeStyle(2, BORDER).setDepth(22);
    const title = this.add.text(100, bubbleY - 44, step.title, textStyle(12, '#a14a38')).setDepth(23);
    const text = this.add.text(100, bubbleY - 24, step.text, { ...textStyle(12, INK, false), lineSpacing: 5 }).setDepth(23);
    const counter = this.add.text(356, bubbleY - 44, `${this.stepIndex + 1}/${STEPS.length}`, textStyle(10, MUTED)).setOrigin(1, 0).setDepth(23);

    // 다음·시작하기 버튼: 시각 크기는 108×32지만 터치 영역은 108×44로 넓힙니다 (말풍선 하단 bubbleY+58 안에 들어감).
    const nextButton = this.add.rectangle(318, bubbleY + 34, 108, 32, GREEN).setStrokeStyle(3, BORDER).setDepth(23)
      .setInteractive({ hitArea: new Phaser.Geom.Rectangle(0, -6, 108, 44), hitAreaCallback: Phaser.Geom.Rectangle.Contains, useHandCursor: true });
    const nextText = this.add.text(318, bubbleY + 34, this.stepIndex === STEPS.length - 1 ? '시작하기 ▶' : '다음 →', textStyle(11, CREAM_TEXT)).setOrigin(0.5).setDepth(24);
    nextButton.on('pointerdown', () => this.advance());
    // 건너뛰기: 실제 작업대의 홈 버튼 자리(헤더 우상단). 시각 크기는 80×22, 터치 영역은 88×44로 넓힙니다.
    // hitArea는 버튼 좌상단 기준 로컬 좌표라, y −5부터 44px이면 월드 y 0~44가 되어 캔버스 위로 잘리지 않습니다.
    const skipButton = this.add.rectangle(340, 16, 80, 22, GOLD).setStrokeStyle(2, BORDER).setDepth(23)
      .setInteractive({ hitArea: new Phaser.Geom.Rectangle(-4, -5, 88, 44), hitAreaCallback: Phaser.Geom.Rectangle.Contains, useHandCursor: true });
    const skipText = this.add.text(340, 16, '건너뛰기 ✕', textStyle(11, INK)).setOrigin(0.5).setDepth(24);
    skipButton.on('pointerdown', () => this.finish('안내를 건너뛰었습니다.'));

    this.overlayObjects = [...zones, frame, character, bubble, pointer, title, text, counter, nextButton, nextText, skipButton, skipText];
  }

  private advance() {
    this.hooks.onSfx?.('tap');
    if (this.stepIndex >= STEPS.length - 1) {
      this.finish('안내 끝! 이제 직접 첫 영업을 시작해 보세요.');
      return;
    }
    this.stepIndex += 1;
    this.renderStep();
  }

  // 통합 컨트롤러 훅이 없을 때만 쓰는 대체 마무리: 안내 종료 배너와 다시 보기 버튼
  private finish(message: string) {
    this.hooks.onSfx?.('complete');
    if (this.hooks.onFinish) {
      this.hooks.onFinish();
      return;
    }
    this.overlayObjects.forEach((object) => object.destroy());
    this.overlayObjects = [];
    const banner = this.add.rectangle(195, 592, 330, 74, CREAM, 0.97).setStrokeStyle(4, BORDER).setDepth(22);
    const text = this.add.text(195, 578, message, { ...textStyle(11, INK), align: 'center', wordWrap: { width: 300 } }).setOrigin(0.5).setDepth(23);
    const replayButton = this.add.rectangle(195, 610, 140, 30, GREEN).setStrokeStyle(3, BORDER).setInteractive({ useHandCursor: true }).setDepth(23);
    const replayText = this.add.text(195, 610, '안내 다시 보기 ↺', textStyle(11, CREAM_TEXT)).setOrigin(0.5).setDepth(24);
    replayButton.on('pointerdown', () => { this.stepIndex = 0; this.overlayObjects.forEach((object) => object.destroy()); this.overlayObjects = []; this.renderStep(); });
    this.overlayObjects = [banner, text, replayButton, replayText];
  }
}

export function startGuideOverlayPrototype(parent: string, hooks: GuideOverlayHooks = {}) {
  return new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width: 390,
    height: 810,
    backgroundColor: '#c78452',
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    scene: new GuideOverlayScene(hooks),
  });
}
