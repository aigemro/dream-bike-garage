// 첫 플레이 안내 오버레이 A안: 따뜻한 픽셀 정비사 말풍선형 (390×810)
// 게임 화면 B안(#177)의 정적 모사 화면 위에, 정비사 두리의 말풍선과
// 스포트라이트 강조로 첫 주문 6단계를 안내하는 '표현'을 검증한다.
// 안내 문구·발동 조건 규칙은 #115 담당이며 여기서는 결정하지 않는다.
import Phaser from 'phaser';
import { drawPixelBike, makeWarmColorway } from './bike-pixel-sprite';
import { drawFieldCharacter } from './art-character-pixel';

const FONT = '"Arial Rounded MT Bold", "Noto Sans KR", sans-serif';
const INK = '#3b2531';
const MUTED = '#7b5140';
const CREAM = 0xfff1c6;
const GOLD = 0xf6d995;
const BORDER = 0x3b2531;
const BROWN = 0x8e5136;

type GuideStep = { target: { x: number; y: number; w: number; h: number }; title: string; text: string; bubbleTop: boolean };

// 게임 화면 B안 레이아웃 기준의 강조 영역과 6단계 안내
const STEPS: GuideStep[] = [
  { target: { x: 8, y: 66, w: 374, h: 144 }, title: '1 · 주문 확인', text: '고객 주문이 도착했어요!\n필요한 부품 4종과 레벨을\n먼저 확인해 주세요.', bubbleTop: false },
  { target: { x: 8, y: 646, w: 374, h: 140 }, title: '2 · 택배 주문', text: '부품은 택배로만 와요.\n필요한 카테고리 버튼을 눌러\n택배를 주문해 주세요.', bubbleTop: true },
  { target: { x: 33, y: 226, w: 324, h: 380 }, title: '3 · 상자 개봉·배치', text: '도착한 상자를 개봉하고\n보드의 빈 칸을 눌러\nLv.1 부품을 배치해요.', bubbleTop: false },
  { target: { x: 33, y: 226, w: 324, h: 380 }, title: '4 · 2-to-1 머지', text: '같은 종류·같은 레벨 2개를\n겹치면 한 단계 위 부품이\n돼요. Lv.2를 만들어 보세요!', bubbleTop: false },
  { target: { x: 210, y: 80, w: 172, h: 110 }, title: '5 · 자동 장착', text: '목표 레벨 부품이 완성되면\n고객 자전거에 자동으로\n장착돼요.', bubbleTop: false },
  { target: { x: 8, y: 66, w: 374, h: 144 }, title: '6 · 납품 완료', text: '부품 4종을 모두 장착하면\n납품 완료! 급여를 받고\n다음 주문이 이어져요.', bubbleTop: false },
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

  // 게임 화면 B안의 정적 모사: 안내 '표현' 검증용 배경 (상호작용 없음)
  private drawMockGameScreen() {
    this.add.rectangle(195, 300, 390, 600, 0xc78452).setDepth(0);
    this.add.rectangle(195, 705, 390, 210, 0xa9683f).setDepth(0);
    for (let y = 626; y < 810; y += 26) this.add.rectangle(195, y, 390, 2, 0x8a5231, 0.5).setDepth(0);
    for (let x = 24; x < 390; x += 52) this.add.rectangle(x, 300, 2, 600, 0xb37246, 0.35).setDepth(0);

    this.add.rectangle(195, 30, 390, 60, CREAM).setStrokeStyle(4, BORDER).setDepth(2);
    this.add.rectangle(56, 30, 76, 24, 0xc95746).setStrokeStyle(2, BORDER).setDepth(3);
    this.add.text(56, 30, 'WORK', { fontFamily: FONT, fontSize: '11px', color: '#fff1c6', fontStyle: 'bold' }).setOrigin(0.5).setDepth(4);
    this.add.text(104, 22, '두리 자전거 공방 · 작업대', { fontFamily: FONT, fontSize: '13px', color: INK, fontStyle: 'bold' }).setDepth(4);
    this.add.text(104, 40, '첫 플레이 안내 · A안 말풍선형', { fontFamily: FONT, fontSize: '9px', color: MUTED }).setDepth(4);

    // 주문 카드
    this.add.rectangle(195, 138, 374, 140, CREAM).setStrokeStyle(4, BROWN).setDepth(2);
    this.add.rectangle(64, 78, 88, 22, 0xc95746).setStrokeStyle(2, BORDER).setDepth(3);
    this.add.text(64, 78, 'NEW ORDER', { fontFamily: FONT, fontSize: '9px', color: '#fff1c6', fontStyle: 'bold' }).setOrigin(0.5).setDepth(4);
    this.add.text(20, 94, '통학용 어반 로드', { fontFamily: FONT, fontSize: '15px', color: INK, fontStyle: 'bold' }).setDepth(4);
    this.add.text(20, 117, '장착 0/4 · 부품별 자동 장착', { fontFamily: FONT, fontSize: '10px', color: MUTED }).setDepth(4);
    drawPixelBike(this, 292, 132, 2, {
      category: 'road',
      colorway: makeWarmColorway(0xc95746),
      depth: 4,
      partAlpha: { frame: 0.5, wheel: 0.5, drivetrain: 0.5, handlebar: 0.5 },
    });
    ['F', 'W', 'D', 'H'].forEach((short, index) => {
      const x = 42 + index * 46;
      this.add.rectangle(x, 168, 42, 40, GOLD).setStrokeStyle(2, [0xc95746, 0xe7a942, 0x5e9a67, 0x4e8092][index]).setDepth(3);
      this.add.text(x, 159, short, { fontFamily: FONT, fontSize: '11px', color: INK, fontStyle: 'bold' }).setOrigin(0.5).setDepth(4);
      this.add.text(x, 177, `Lv.${index < 2 ? 2 : 1}`, { fontFamily: FONT, fontSize: '9px', color: MUTED, fontStyle: 'bold' }).setOrigin(0.5).setDepth(4);
    });

    // 머지 보드 (부품 2개 배치 상태)
    this.add.rectangle(195, 416, 340, 380, BROWN).setStrokeStyle(5, BORDER).setDepth(1);
    const cell = 52;
    for (let row = 0; row < 7; row += 1) {
      for (let column = 0; column < 6; column += 1) {
        this.add.rectangle(33 + column * cell + cell / 2, 226 + row * cell + cell / 2, cell - 4, cell - 4, 0xffe6a8).setStrokeStyle(2, 0x9c5b3c).setDepth(1);
      }
    }
    [[6, 0, 0xc95746, 'F'], [6, 1, 0xc95746, 'F']].forEach(([row, column, color, short]) => {
      const x = 33 + (column as number) * cell + cell / 2;
      const y = 226 + (row as number) * cell + cell / 2;
      this.add.rectangle(x, y, cell - 8, cell - 8, color as number).setStrokeStyle(3, BORDER).setDepth(2);
      this.add.text(x, y, `${short}1`, { fontFamily: FONT, fontSize: '11px', color: '#fff1c6', fontStyle: 'bold' }).setOrigin(0.5).setDepth(3);
    });

    // 택배 선반
    this.add.rectangle(195, 716, 374, 136, CREAM).setStrokeStyle(4, BORDER).setDepth(2);
    this.add.rectangle(96, 650, 152, 22, BROWN).setDepth(3);
    this.add.text(28, 643, '택배 선반 · DELIVERY', { fontFamily: FONT, fontSize: '10px', color: '#fff1c6', fontStyle: 'bold' }).setDepth(4);
    ['프레임', '휠셋', '구동계', '핸들바'].forEach((name, index) => {
      const x = 104 + (index % 2) * 182;
      const y = 690 + Math.floor(index / 2) * 54;
      this.add.rectangle(x, y, 172, 48, GOLD).setStrokeStyle(3, [0xc95746, 0xe7a942, 0x5e9a67, 0x4e8092][index]).setDepth(3);
      this.add.text(x - 78, y - 8, `▣ ${name} · 탭하면 주문`, { fontFamily: FONT, fontSize: '10px', color: INK, fontStyle: 'bold' }).setDepth(4);
    });
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
      this.finish('안내 끝! 이제 직접 첫 주문을 진행해 보세요.');
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
