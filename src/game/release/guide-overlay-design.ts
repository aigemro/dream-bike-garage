// 첫 플레이 안내 오버레이 A안: 따뜻한 픽셀 정비사 말풍선형 (390×810)
// 머지 작업대(머지 코어 E안) 화면의 정적 모사 위에, 정비사 두리의 말풍선과
// 스포트라이트 강조로 첫 영업 6단계(주문 → 상자 → 합성 → 연쇄 → 장착·납품 → 하루 일정)를 안내한다.
// 안내 문구·발동 조건 규칙은 #115 담당이며 여기서는 결정하지 않는다.
import Phaser from 'phaser';
import { drawPixelBike, drawPixelPartIcon, makeWarmColorway, WARM_PART_COLORS } from './bike-pixel-sprite';
import { starterBoard, nextIntakeSlot, WORKBENCH_COLUMNS, WORKBENCH_ROWS } from '../../domain/merge-workbench';
import { drawFieldCharacter } from './art-character-pixel';

const FONT = '"Arial Rounded MT Bold", "Noto Sans KR", sans-serif';
const INK = '#3b2531';
const MUTED = '#7b5140';
const CREAM = 0xfff1c6;
const GOLD = 0xf6d995;
const BORDER = 0x3b2531;
const BROWN = 0x8e5136;

type GuideStep = { target: { x: number; y: number; w: number; h: number }; title: string; text: string; bubbleTop: boolean };

// 머지 작업대 레이아웃 기준의 강조 영역과 6단계 안내
const STEPS: GuideStep[] = [
  { target: { x: 8, y: 66, w: 374, h: 144 }, title: '1 · 주문 확인', text: '고객 주문이 도착했어요!\n필요한 부품 4종과 레벨을\n먼저 확인해 주세요.', bubbleTop: false },
  { target: { x: 14, y: 682, w: 362, h: 52 }, title: '2 · 부품 상자', text: '상자를 열면 알바 체력 1을 쓰고\n점선 칸에 부품이 들어와요.\n가운데부터 바깥으로 채워져요.', bubbleTop: true },
  { target: { x: 31, y: 226, w: 328, h: 380 }, title: '3 · 이웃 합성', text: '부품은 옮길 수 없어요.\n맞닿은 같은 부품 2개를\n차례로 누르면 합성돼요.', bubbleTop: false },
  { target: { x: 198, y: 736, w: 176, h: 52 }, title: '4 · 연쇄 보너스', text: '상자 없이 이어서 3번 합성하면\n무료 상자, 5번이면 필요한\n부품이 확정으로 나와요!', bubbleTop: true },
  { target: { x: 210, y: 80, w: 172, h: 110 }, title: '5 · 장착·납품', text: '목표 레벨이 되면 바로 장착!\n4종을 모두 달면 납품되고\n다음 주문이 이어져요.', bubbleTop: false },
  { target: { x: 4, y: 26, w: 382, h: 36 }, title: '6 · 하루 일정', text: '주문 3건을 납품하면 오늘\n영업이 끝나고 정산해요. 체력이\n떨어지면 회복 후 이어서 해요.', bubbleTop: false },
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

  // 머지 작업대의 정적 모사: 안내 '표현' 검증용 배경 (상호작용 없음)
  private drawMockGameScreen() {
    this.add.rectangle(195, 300, 390, 600, 0xc78452).setDepth(0);
    this.add.rectangle(195, 705, 390, 210, 0xa9683f).setDepth(0);
    for (let y = 626; y < 810; y += 26) this.add.rectangle(195, y, 390, 2, 0x8a5231, 0.5).setDepth(0);
    for (let x = 24; x < 390; x += 52) this.add.rectangle(x, 300, 2, 600, 0xb37246, 0.35).setDepth(0);

    // 헤더: WORK · 공방 이름 / DAY · 오늘 주문 · 오늘 수입
    this.add.rectangle(195, 30, 390, 60, CREAM).setStrokeStyle(4, BORDER).setDepth(2);
    this.add.rectangle(42, 16, 60, 18, 0xc95746).setStrokeStyle(2, BORDER).setDepth(3);
    this.add.text(42, 16, 'WORK', { fontFamily: FONT, fontSize: '10px', color: '#fff1c6', fontStyle: 'bold' }).setOrigin(0.5).setDepth(4);
    this.add.text(80, 9, '두리 자전거 공방 · 작업대', { fontFamily: FONT, fontSize: '12px', color: INK, fontStyle: 'bold' }).setDepth(4);
    this.add.rectangle(48, 41, 72, 22, BROWN).setStrokeStyle(2, BORDER).setDepth(3);
    this.add.text(48, 41, 'DAY 1', { fontFamily: FONT, fontSize: '12px', color: '#fff1c6', fontStyle: 'bold' }).setOrigin(0.5).setDepth(4);
    this.add.rectangle(130, 41, 76, 24, 0xf4b84a).setStrokeStyle(2, BORDER).setDepth(3);
    this.add.text(130, 41, '주문 0/3', { fontFamily: FONT, fontSize: '13px', color: INK, fontStyle: 'bold' }).setOrigin(0.5).setDepth(4);
    this.add.rectangle(276, 41, 200, 22, GOLD).setStrokeStyle(2, BROWN).setDepth(3);
    this.add.text(276, 41, '오늘 수입  0 C', { fontFamily: FONT, fontSize: '11px', color: MUTED, fontStyle: 'bold' }).setOrigin(0.5).setDepth(4);

    // 주문 카드
    this.add.rectangle(195, 138, 374, 140, CREAM).setStrokeStyle(4, BROWN).setDepth(2);
    this.add.rectangle(64, 78, 88, 22, 0xc95746).setStrokeStyle(2, BORDER).setDepth(3);
    this.add.text(64, 78, 'NEW ORDER', { fontFamily: FONT, fontSize: '9px', color: '#fff1c6', fontStyle: 'bold' }).setOrigin(0.5).setDepth(4);
    this.add.text(20, 94, '통학용 어반 로드', { fontFamily: FONT, fontSize: '15px', color: INK, fontStyle: 'bold' }).setDepth(4);
    this.add.text(20, 117, '장착 2/4 · 완성 즉시 자동 장착', { fontFamily: FONT, fontSize: '10px', color: MUTED, fontStyle: 'bold' }).setDepth(4);
    drawPixelBike(this, 292, 132, 2, {
      category: 'city',
      colorway: makeWarmColorway(0xc95746),
      depth: 4,
      partAlpha: { frame: 0.5, wheel: 0.5, drivetrain: 1, handlebar: 1 },
    });
    (['frame', 'wheel', 'drivetrain', 'handlebar'] as const).forEach((type, index) => {
      const x = 42 + index * 46;
      const done = index >= 2;
      this.add.rectangle(x, 168, 42, 40, done ? 0xdff0d0 : GOLD).setStrokeStyle(2, WARM_PART_COLORS[type]).setDepth(3);
      drawPixelPartIcon(this, x, 159, 1.5, type, { depth: 4 });
      this.add.text(x, 179, done ? '✓' : 'Lv.2', { fontFamily: FONT, fontSize: '9px', color: done ? '#3f7851' : MUTED, fontStyle: 'bold' }).setOrigin(0.5).setDepth(4);
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
      this.add.rectangle(x, y + 14, 32, 18, CREAM, 0.94).setStrokeStyle(2, BORDER, 0.8).setDepth(3);
      this.add.text(x, y + 14, `Lv.${part.level}`, { fontFamily: FONT, fontSize: '10px', color: INK, fontStyle: 'bold' }).setOrigin(0.5).setDepth(4);
    });
    const slot = nextIntakeSlot(board);
    const slotX = left + (slot % WORKBENCH_COLUMNS) * cell + cell / 2;
    const slotY = top + Math.floor(slot / WORKBENCH_COLUMNS) * cell + cell / 2;
    this.add.rectangle(slotX, slotY, 42, 42).setStrokeStyle(3, BROWN).setDepth(2);
    this.add.text(slotX, slotY, '다음\n입고', { fontFamily: FONT, fontSize: '8px', color: MUTED, fontStyle: 'bold', align: 'center' }).setOrigin(0.5).setDepth(3);

    // 하단 선반: 부품 상자·되돌리기·반품 / 알바 체력·연쇄 합성
    this.add.rectangle(195, 734, 374, 136, CREAM).setStrokeStyle(4, BORDER).setDepth(2);
    this.add.rectangle(96, 668, 152, 22, BROWN).setDepth(3);
    this.add.text(28, 661, '부품 상자 · PARTS BOX', { fontFamily: FONT, fontSize: '10px', color: '#fff1c6', fontStyle: 'bold' }).setDepth(4);
    this.add.rectangle(136, 708, 240, 48, GOLD).setStrokeStyle(3, BROWN).setDepth(3);
    this.add.text(64, 691, '부품 상자 열기', { fontFamily: FONT, fontSize: '12px', color: INK, fontStyle: 'bold' }).setDepth(4);
    this.add.text(64, 710, '점선 칸에 자동 배치', { fontFamily: FONT, fontSize: '9px', color: MUTED }).setDepth(4);
    this.add.text(248, 691, '⚡ −1', { fontFamily: FONT, fontSize: '9px', color: '#a14a38', fontStyle: 'bold' }).setOrigin(1, 0).setDepth(4);
    [[290, '↶\n되돌리기'], [350, '↗\n반품']].forEach(([x, label]) => {
      this.add.rectangle(x as number, 708, 56, 48, BROWN).setStrokeStyle(2, BORDER).setDepth(3).setAlpha(0.6);
      this.add.text(x as number, 708, label as string, { fontFamily: FONT, fontSize: '9px', color: '#fff1c6', fontStyle: 'bold', align: 'center' }).setOrigin(0.5).setDepth(4);
    });
    this.add.rectangle(104, 762, 172, 48, GOLD).setStrokeStyle(2, BROWN).setDepth(3);
    this.add.text(24, 744, '⚡ 알바 체력 30/30', { fontFamily: FONT, fontSize: '11px', color: INK, fontStyle: 'bold' }).setDepth(4);
    this.add.rectangle(24, 778, 160, 5, 0x5e9a67).setOrigin(0, 0.5).setDepth(4);
    this.add.rectangle(286, 762, 172, 48, GOLD).setStrokeStyle(2, BROWN).setDepth(3);
    this.add.text(206, 744, '연쇄 합성 0', { fontFamily: FONT, fontSize: '11px', color: INK, fontStyle: 'bold' }).setDepth(4);
    this.add.text(206, 761, '무료 상자 0 · 확정 0', { fontFamily: FONT, fontSize: '9px', color: MUTED, fontStyle: 'bold' }).setDepth(4);
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
    const frame = this.add.rectangle(x + w / 2, y + h / 2, w + 6, h + 6).setStrokeStyle(4, 0xf4b84a).setDepth(21);
    this.tweens.add({ targets: frame, alpha: { from: 1, to: 0.45 }, duration: 520, yoyo: true, repeat: -1 });

    // 정비사 두리 + 말풍선: 강조 영역 반대편에 배치해 대상을 가리지 않는다
    const bubbleY = step.bubbleTop ? 150 : 560;
    const characterY = step.bubbleTop ? 236 : 646;
    const character = drawFieldCharacter(this, 66, characterY, '정비사', 4, 22);
    const bubble = this.add.rectangle(232, bubbleY, 288, 116, CREAM).setStrokeStyle(4, BORDER).setDepth(22);
    const pointer = this.add.triangle(120, bubbleY + (step.bubbleTop ? 58 : 58), 0, 0, 18, 0, 9, 16, CREAM).setStrokeStyle(2, BORDER).setDepth(22);
    const title = this.add.text(100, bubbleY - 44, step.title, { fontFamily: FONT, fontSize: '12px', color: '#a14a38', fontStyle: 'bold' }).setDepth(23);
    const text = this.add.text(100, bubbleY - 24, step.text, { fontFamily: FONT, fontSize: '12px', color: INK, lineSpacing: 5 }).setDepth(23);
    const counter = this.add.text(356, bubbleY - 44, `${this.stepIndex + 1}/${STEPS.length}`, { fontFamily: FONT, fontSize: '10px', color: MUTED, fontStyle: 'bold' }).setOrigin(1, 0).setDepth(23);

    const nextButton = this.add.rectangle(312, bubbleY + 34, 108, 32, 0x5e9a67).setStrokeStyle(3, BORDER).setInteractive({ useHandCursor: true }).setDepth(23);
    const nextText = this.add.text(312, bubbleY + 34, this.stepIndex === STEPS.length - 1 ? '시작하기 ▶' : '다음 →', { fontFamily: FONT, fontSize: '11px', color: '#fff1c6', fontStyle: 'bold' }).setOrigin(0.5).setDepth(24);
    nextButton.on('pointerdown', () => this.advance());
    const skipButton = this.add.rectangle(340, 30, 84, 26, GOLD, 0.95).setStrokeStyle(2, BORDER).setInteractive({ useHandCursor: true }).setDepth(23);
    const skipText = this.add.text(340, 30, '건너뛰기 ✕', { fontFamily: FONT, fontSize: '10px', color: INK, fontStyle: 'bold' }).setOrigin(0.5).setDepth(24);
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

  private finish(message: string) {
    this.hooks.onSfx?.('complete');
    if (this.hooks.onFinish) {
      this.hooks.onFinish();
      return;
    }
    this.overlayObjects.forEach((object) => object.destroy());
    this.overlayObjects = [];
    const banner = this.add.rectangle(195, 592, 330, 74, CREAM, 0.97).setStrokeStyle(4, BORDER).setDepth(22);
    const text = this.add.text(195, 578, message, { fontFamily: FONT, fontSize: '11px', color: INK, fontStyle: 'bold', align: 'center', wordWrap: { width: 300 } }).setOrigin(0.5).setDepth(23);
    const replayButton = this.add.rectangle(195, 610, 132, 28, 0x5e9a67).setStrokeStyle(3, BORDER).setInteractive({ useHandCursor: true }).setDepth(23);
    const replayText = this.add.text(195, 610, '안내 다시 보기 ↺', { fontFamily: FONT, fontSize: '10px', color: '#fff1c6', fontStyle: 'bold' }).setOrigin(0.5).setDepth(24);
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
