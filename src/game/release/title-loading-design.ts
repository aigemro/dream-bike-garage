// 타이틀·로딩 화면 A안: 따뜻한 픽셀 공방 간판형 (390×810)
// 목재 간판 로고와 대표 자전거로 첫인상을 만들고, 자전거 바퀴 회전과
// 진행 바로 로딩을 표현한다. 로딩 진행률은 실제 진행률과 연결 가능한
// 형태로 두되 데모에서는 시뮬레이션한다. 앱인토스 대표 이미지 후보 겸용.
import Phaser from 'phaser';
import { drawPixelBike, makeWarmColorway } from './bike-pixel-sprite';
import { drawFieldCharacter } from './art-character-pixel';

const FONT = '"Arial Rounded MT Bold", "Noto Sans KR", sans-serif';
const INK = '#3b2531';
const CREAM = 0xfff1c6;
const BORDER = 0x3b2531;
const BROWN = 0x8e5136;

const LOADING_MS = 2600;

export type TitleLoadingHooks = {
  onEnterHome?: () => void;
  onSfx?: (event: 'tap' | 'start') => void;
};

class TitleLoadingScene extends Phaser.Scene {
  constructor(private readonly hooks: TitleLoadingHooks = {}) { super('title-loading-a'); }

  private phase: 'loading' | 'ready' | 'entering' = 'loading';
  private loadStart = 0;
  private wheel!: Phaser.GameObjects.Container;
  private barFill!: Phaser.GameObjects.Rectangle;
  private percentText!: Phaser.GameObjects.Text;
  private loadingLabel!: Phaser.GameObjects.Text;
  private startText?: Phaser.GameObjects.Text;
  private message!: Phaser.GameObjects.Text;

  create() {
    this.cameras.main.setBackgroundColor('#c78452');
    this.loadStart = this.time.now;

    // 배경: 저녁 하늘 창 + 공방 벽·바닥
    this.add.rectangle(195, 300, 390, 600, 0xc78452).setDepth(0);
    this.add.rectangle(195, 705, 390, 210, 0xa9683f).setDepth(0);
    for (let y = 626; y < 810; y += 26) this.add.rectangle(195, y, 390, 2, 0x8a5231, 0.5).setDepth(0);
    for (let x = 24; x < 390; x += 52) this.add.rectangle(x, 300, 2, 600, 0xb37246, 0.35).setDepth(0);
    this.add.rectangle(195, 74, 390, 148, 0xf4b84a, 0.25).setDepth(0);

    // 목재 간판: 사슬에 걸린 큰 로고 패널
    this.add.rectangle(120, 26, 6, 96, 0x6e3f28).setDepth(1);
    this.add.rectangle(270, 26, 6, 96, 0x6e3f28).setDepth(1);
    this.add.rectangle(195, 130, 330, 128, BROWN).setStrokeStyle(6, BORDER).setDepth(2);
    this.add.rectangle(195, 130, 306, 104, 0xa9683f).setStrokeStyle(3, 0x6e3f28).setDepth(2);
    this.add.text(195, 106, 'DREAM BIKE', { fontFamily: FONT, fontSize: '34px', color: '#fff1c6', fontStyle: 'bold' }).setOrigin(0.5).setDepth(3);
    this.add.text(195, 144, 'GARAGE', { fontFamily: FONT, fontSize: '30px', color: '#f4b84a', fontStyle: 'bold' }).setOrigin(0.5).setDepth(3);
    this.add.text(195, 174, '두리 자전거 공방', { fontFamily: FONT, fontSize: '11px', color: '#ffe6a8' }).setOrigin(0.5).setDepth(3);

    // 대표 장면: 드림 바이크 + 정비사 (스토어 대표 이미지 후보 구도)
    this.add.rectangle(195, 400, 334, 244, CREAM, 0.35).setStrokeStyle(4, BROWN).setDepth(1);
    drawPixelBike(this, 172, 408, 4, {
      category: 'road', colorway: makeWarmColorway(0xc95746), depth: 3,
    });
    drawFieldCharacter(this, 322, 492, '정비사', 4, 3);

    // 로딩: 회전하는 앞바퀴 + 진행 바
    this.wheel = this.buildLoadingWheel(195, 600);
    this.add.rectangle(195, 668, 300, 20, 0xffe6a8).setStrokeStyle(3, BORDER).setDepth(3);
    this.barFill = this.add.rectangle(48, 668, 0, 12, 0x5e9a67).setOrigin(0, 0.5).setDepth(4);
    this.percentText = this.add.text(195, 668, '0%', { fontFamily: FONT, fontSize: '10px', color: INK, fontStyle: 'bold' }).setOrigin(0.5).setDepth(5);
    this.loadingLabel = this.add.text(195, 692, '공방 문을 여는 중…', { fontFamily: FONT, fontSize: '10px', color: '#fff1c6', fontStyle: 'bold' }).setOrigin(0.5).setDepth(3);

    this.message = this.add.text(195, 730, '', { fontFamily: FONT, fontSize: '10px', color: '#ffe6a8', align: 'center', wordWrap: { width: 340 } }).setOrigin(0.5, 0).setDepth(3);
    this.add.text(195, 788, 'Dream Bike Garage Lab · v0.1.0-lab', { fontFamily: FONT, fontSize: '8px', color: '#ffe6a8' }).setOrigin(0.5).setDepth(3).setAlpha(0.8);

    this.input.on('pointerdown', () => this.enterHome());
  }

  update() {
    if (this.phase === 'loading') {
      this.wheel.rotation += 0.09;
      const progress = Math.min(1, (this.time.now - this.loadStart) / LOADING_MS);
      this.barFill.width = 294 * progress;
      this.percentText.setText(`${Math.round(progress * 100)}%`);
      if (progress >= 1) this.becomeReady();
      return;
    }
    if (this.phase === 'ready') this.wheel.rotation += 0.015;
  }

  // 바퀴 로딩 인디케이터: 홈 공용 자전거 바퀴와 같은 구성 (림 + 스포크)
  private buildLoadingWheel(x: number, y: number) {
    const tire = this.add.circle(0, 0, 37, 0x000000, 0).setStrokeStyle(9, 0x302936);
    const rim = this.add.circle(0, 0, 29, 0x000000, 0).setStrokeStyle(4, 0xfff1c6);
    const spokes = [0, 45, 90, 135].map((degree) => this.add.rectangle(0, 0, 52, 4, 0xd9c197).setAngle(degree));
    const hub = this.add.circle(0, 0, 7, 0xa39985).setStrokeStyle(2, BORDER);
    return this.add.container(x, y, [tire, rim, ...spokes, hub]).setDepth(3);
  }

  private becomeReady() {
    this.phase = 'ready';
    this.percentText.setText('100%');
    this.barFill.width = 294;
    this.loadingLabel.setText('준비 완료!');
    this.startText = this.add.text(195, 724, '▶ TAP TO START', { fontFamily: FONT, fontSize: '16px', color: '#fff1c6', fontStyle: 'bold' }).setOrigin(0.5).setDepth(5);
    this.tweens.add({ targets: this.startText, alpha: { from: 1, to: 0.35 }, duration: 620, yoyo: true, repeat: -1 });
    this.message.setPosition(195, 744);
  }

  private enterHome() {
    if (this.phase !== 'ready') return;
    this.hooks.onSfx?.('tap');
    this.phase = 'entering';
    this.startText?.destroy();
    this.message.setText('같은 Garage의 홈 화면(홈 A안)으로 이어집니다.\n데모에서는 초기화로 다시 볼 수 있습니다.');
    // 셔터가 올라가듯 화면이 밝아지며 홈으로 전환되는 짧은 연출
    const shutter = this.add.rectangle(195, 405, 390, 810, 0xfff1c6, 0).setDepth(30);
    this.tweens.add({
      targets: shutter,
      fillAlpha: { from: 0, to: 0.85 },
      duration: 700,
      ease: 'Cubic.easeIn',
      onComplete: () => {
        this.hooks.onSfx?.('start');
        this.hooks.onEnterHome?.();
      },
    });
  }
}

export function startTitleLoadingPrototype(parent: string, hooks: TitleLoadingHooks = {}) {
  return new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width: 390,
    height: 810,
    backgroundColor: '#c78452',
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    scene: new TitleLoadingScene(hooks),
  });
}
