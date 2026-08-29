// 납품·보상 정산 화면 A안: 따뜻한 픽셀 급여 봉투 개봉형 (390×810)
// 고객이 건네는 급여 봉투를 탭으로 개봉해 코인 상승과 감사 인사를 중심으로,
// 납품 → 급여 → 성장 게이지 → 다음 주문 예고의 폐곡선을 한 화면으로 잇는다.
// 보상 수치·성장 비용 규칙은 결정하지 않는다 (#19·#116 담당).
import Phaser from 'phaser';
import { drawPixelBike, makeWarmColorway, type BikeCategory } from './bike-pixel-sprite';
import { drawFieldCharacter } from './art-character-pixel';

const FONT = '"Arial Rounded MT Bold", "Noto Sans KR", sans-serif';
const INK = '#3b2531';
const MUTED = '#7b5140';
const CREAM = 0xfff1c6;
const GOLD = 0xf6d995;
const BORDER = 0x3b2531;
const BROWN = 0x8e5136;

const BASE_COINS = 2480;
const REWARD = 1000;
const GAUGE_FROM = 0.4;
const GAUGE_TO = 0.62;

export type RewardSettlementHooks = {
  initialCoins?: number;
  reward?: number;
  // 릴리스 통합용 실제 주문 데이터 (#201): 납품 주문명·자전거 종류·컬렉션 해금 결과
  orderName?: string;
  bikeCategory?: BikeCategory;
  // 납품 이해도 결과 (#221): 상승 표시, 100% 도달 시 도감 등록 배너
  understanding?: {
    bikeName: string;
    grade: string;
    before: number;
    after: number;
    registeredNow: boolean;
    alreadyRegistered: boolean;
  };
  // 다음 주문 예고 (#205): 실제 주문 순환에 맞춰 동적으로 표시
  nextOrder?: { name: string; parts: number; reward: number };
  onNext?: () => void;
  onHome?: () => void;
  onReward?: (coins: number) => void;
  onSfx?: (event: 'reward' | 'tap') => void;
};

class RewardSettlementScene extends Phaser.Scene {
  constructor(private readonly hooks: RewardSettlementHooks = {}) { super('reward-settlement-a'); }

  private phase: 'arrive' | 'counting' | 'next' = 'arrive';
  private countStart = 0;
  private coinText!: Phaser.GameObjects.Text;
  private rewardText!: Phaser.GameObjects.Text;
  private gaugeFill!: Phaser.GameObjects.Rectangle;
  private gaugeLabel!: Phaser.GameObjects.Text;
  private message!: Phaser.GameObjects.Text;
  private envelope!: Phaser.GameObjects.Container;
  private nextGroup: Phaser.GameObjects.GameObject[] = [];

  create() {
    this.cameras.main.setBackgroundColor('#c78452');
    this.drawBackdrop();

    // 상단 배너: 납품 완료
    this.add.rectangle(195, 46, 374, 64, CREAM).setStrokeStyle(4, BORDER).setDepth(8);
    this.add.rectangle(70, 30, 104, 22, 0x5e9a67).setStrokeStyle(2, BORDER).setDepth(9);
    this.add.text(70, 30, 'DELIVERY DONE', { fontFamily: FONT, fontSize: '9px', color: '#fff1c6', fontStyle: 'bold' }).setOrigin(0.5).setDepth(10);
    this.add.text(24, 44, `${this.hooks.orderName ?? '통학용 어반 로드'} 납품 완료!`, { fontFamily: FONT, fontSize: '15px', color: INK, fontStyle: 'bold' }).setDepth(10);
    this.add.text(24, 64, '고객이 급여 봉투를 건넸습니다.', { fontFamily: FONT, fontSize: '10px', color: MUTED }).setDepth(10);

    // 중앙: 완성 자전거 + 고객 + 말풍선
    this.add.rectangle(195, 208, 374, 214, 0xd79a63, 0.7).setStrokeStyle(4, BROWN).setDepth(1);
    drawPixelBike(this, 150, 218, 3, {
      category: this.hooks.bikeCategory ?? 'road', colorway: makeWarmColorway(0xc95746), depth: 3,
    });
    drawFieldCharacter(this, 312, 288, '고객', 4, 3);
    this.add.rectangle(300, 138, 150, 44, CREAM).setStrokeStyle(3, BORDER).setDepth(4);
    this.add.triangle(300, 168, 0, 0, 16, 0, 8, 12, CREAM).setStrokeStyle(2, BORDER).setDepth(4);
    this.add.text(300, 138, '고마워요!\n덕분에 통학이 편해져요', { fontFamily: FONT, fontSize: '9px', color: INK, align: 'center', lineSpacing: 3 }).setOrigin(0.5).setDepth(5);

    // 급여 봉투 (탭 대상)
    this.envelope = this.buildEnvelope(195, 402);
    this.tweens.add({ targets: this.envelope, y: 394, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

    // 정산 패널: 코인 · 성장 게이지
    this.add.rectangle(195, 540, 374, 150, CREAM).setStrokeStyle(4, BORDER).setDepth(2);
    this.add.text(28, 480, '이번 납품 정산', { fontFamily: FONT, fontSize: '11px', color: MUTED, fontStyle: 'bold' }).setDepth(3);
    this.add.text(28, 508, '보유 코인', { fontFamily: FONT, fontSize: '10px', color: MUTED }).setDepth(3);
    this.coinText = this.add.text(362, 504, (this.hooks.initialCoins ?? BASE_COINS).toLocaleString(), { fontFamily: FONT, fontSize: '18px', color: INK, fontStyle: 'bold' }).setOrigin(1, 0).setDepth(3);
    this.rewardText = this.add.text(362, 486, '', { fontFamily: FONT, fontSize: '11px', color: '#3f7851', fontStyle: 'bold' }).setOrigin(1, 0).setDepth(3);
    this.add.text(28, 546, '드림 바이크 성장 게이지', { fontFamily: FONT, fontSize: '10px', color: MUTED }).setDepth(3);
    this.add.rectangle(195, 578, 334, 18, 0xffe6a8).setStrokeStyle(2, BORDER).setDepth(3);
    this.gaugeFill = this.add.rectangle(28 + 334 * GAUGE_FROM * 0.5, 578, 334 * GAUGE_FROM, 12, 0x5e9a67).setOrigin(0.5).setDepth(4);
    this.gaugeFill.setPosition(28 + (334 * GAUGE_FROM) / 2, 578);
    this.gaugeLabel = this.add.text(362, 594, '급여는 드림 바이크 성장에 사용됩니다', { fontFamily: FONT, fontSize: '9px', color: MUTED }).setOrigin(1, 0).setDepth(3);

    this.message = this.add.text(195, 634, '급여 봉투를 탭해서 열어보세요.', { fontFamily: FONT, fontSize: '11px', color: '#fff1c6', fontStyle: 'bold', align: 'center', wordWrap: { width: 360 } }).setOrigin(0.5, 0).setDepth(10);
  }

  update() {
    if (this.phase !== 'counting') return;
    const progress = Math.min(1, (this.time.now - this.countStart) / 1100);
    const eased = 1 - (1 - progress) ** 3;
    const initialCoins = this.hooks.initialCoins ?? BASE_COINS;
    const reward = this.hooks.reward ?? REWARD;
    this.coinText.setText(Math.round(initialCoins + reward * eased).toLocaleString());
    const gauge = GAUGE_FROM + (GAUGE_TO - GAUGE_FROM) * eased;
    this.gaugeFill.width = 334 * gauge;
    this.gaugeFill.setPosition(28 + (334 * gauge) / 2, 578);
    if (progress >= 1) {
      this.phase = 'next';
      this.gaugeLabel.setText('성장 게이지가 올랐습니다 · 다음 목표를 확인하세요');
      this.showNextOrder();
    }
  }

  private drawBackdrop() {
    this.add.rectangle(195, 300, 390, 600, 0xc78452).setDepth(0);
    this.add.rectangle(195, 705, 390, 210, 0xa9683f).setDepth(0);
    for (let y = 626; y < 810; y += 26) this.add.rectangle(195, y, 390, 2, 0x8a5231, 0.5).setDepth(0);
    for (let x = 24; x < 390; x += 52) this.add.rectangle(x, 300, 2, 600, 0xb37246, 0.35).setDepth(0);
  }

  private buildEnvelope(x: number, y: number) {
    const body = this.add.rectangle(0, 0, 148, 92, GOLD).setStrokeStyle(4, BORDER);
    const flap = this.add.triangle(0, -18, 0, 0, 148, 0, 74, 46, 0xf4c86a).setOrigin(0.5, 0.28).setStrokeStyle(3, BORDER);
    const seal = this.add.rectangle(0, 8, 34, 34, 0xc95746).setStrokeStyle(3, BORDER);
    const sealText = this.add.text(0, 8, '급여', { fontFamily: FONT, fontSize: '11px', color: '#fff1c6', fontStyle: 'bold' }).setOrigin(0.5);
    const hint = this.add.text(0, 62, 'TAP!', { fontFamily: FONT, fontSize: '10px', color: '#fff1c6', fontStyle: 'bold' }).setOrigin(0.5);
    const container = this.add.container(x, y, [body, flap, seal, sealText, hint]).setDepth(6).setSize(160, 130);
    container.setInteractive({ useHandCursor: true });
    container.on('pointerdown', () => this.openEnvelope(flap, hint));
    return container;
  }

  private openEnvelope(flap: Phaser.GameObjects.Triangle, hint: Phaser.GameObjects.Text) {
    if (this.phase !== 'arrive') return;
    this.hooks.onSfx?.('reward');
    this.phase = 'counting';
    this.countStart = this.time.now;
    this.tweens.killTweensOf(this.envelope);
    hint.setVisible(false);
    this.tweens.add({ targets: flap, scaleY: -0.8, duration: 260, ease: 'Cubic.easeOut' });
    const reward = this.hooks.reward ?? REWARD;
    this.message.setText(`급여 ${reward.toLocaleString()}코인을 받았습니다!`);
    this.rewardText.setText(`+${reward.toLocaleString()}`);
    this.hooks.onReward?.((this.hooks.initialCoins ?? BASE_COINS) + reward);
    this.showUnlockBanner();
    // 봉투에서 코인 조각이 정산 패널로 날아가는 짧은 픽셀 연출
    for (let i = 0; i < 5; i += 1) {
      const coin = this.add.rectangle(195 + (i - 2) * 10, 392, 12, 12, 0xe7a942).setStrokeStyle(2, BORDER).setDepth(20);
      this.tweens.add({ targets: coin, x: 340 + (i % 2) * 10, y: 512, alpha: { from: 1, to: 0.2 }, duration: 480 + i * 90, ease: 'Cubic.easeIn', onComplete: () => coin.destroy() });
    }
  }

  // 납품 이해도 배너 (#221): 상승 중이면 진행률, 100% 도달이면 도감 등록 강조, 등록 후 반복이면 안내만 표시
  private showUnlockBanner() {
    const result = this.hooks.understanding;
    if (!result) return;
    const highlight = result.registeredNow;
    const message = result.registeredNow
      ? `도감 등록! ${result.bikeName} (${result.grade}) 이해도 100% · 제작 가능`
      : result.alreadyRegistered
        ? `${result.bikeName}은(는) 이미 도감에 등록된 자전거입니다`
        : `${result.bikeName} 이해도 ${result.before}% → ${result.after}%`;
    const banner = this.add.rectangle(195, 300, 342, 34, highlight ? 0xf4b84a : CREAM)
      .setStrokeStyle(3, BORDER).setDepth(6).setAlpha(0);
    const text = this.add.text(195, 300, message,
      { fontFamily: FONT, fontSize: '11px', color: INK, fontStyle: 'bold' }).setOrigin(0.5).setDepth(7).setAlpha(0);
    this.tweens.add({ targets: [banner, text], alpha: 1, y: '-=8', duration: 360, ease: 'Cubic.easeOut' });
    // 이해도 진행 게이지 (등록 반복 납품 시에는 표시하지 않음)
    if (!result.alreadyRegistered) {
      this.add.rectangle(195, 322, 342, 8, 0x6a4a3a).setStrokeStyle(2, BORDER).setDepth(6);
      this.add.rectangle(24 + (342 * result.after / 100) / 2, 322, 342 * result.after / 100, 6, highlight ? 0xf4b84a : 0x5e9a67).setDepth(7);
    }
  }

  private showNextOrder() {
    const card = this.add.rectangle(195, 706, 374, 116, CREAM).setStrokeStyle(4, BROWN).setDepth(8).setAlpha(0);
    const tag = this.add.rectangle(64, 662, 88, 22, 0xc95746).setStrokeStyle(2, BORDER).setDepth(9).setAlpha(0);
    const tagText = this.add.text(64, 662, 'NEXT ORDER', { fontFamily: FONT, fontSize: '9px', color: '#fff1c6', fontStyle: 'bold' }).setOrigin(0.5).setDepth(10).setAlpha(0);
    const next = this.hooks.nextOrder;
    const title = this.add.text(24, 672, next?.name ?? '트레일 MTB', { fontFamily: FONT, fontSize: '14px', color: INK, fontStyle: 'bold' }).setDepth(9).setAlpha(0);
    const detail = this.add.text(24, 692, `부품 ${next?.parts ?? 4}종 · 예상 급여 ${(next?.reward ?? 1400).toLocaleString()}코인`, { fontFamily: FONT, fontSize: '10px', color: MUTED }).setDepth(9).setAlpha(0);
    const nextButton = this.add.rectangle(286, 736, 156, 40, 0x5e9a67).setStrokeStyle(3, BORDER).setInteractive({ useHandCursor: true }).setDepth(9).setAlpha(0);
    const nextText = this.add.text(286, 736, '▶ 다음 주문 시작', { fontFamily: FONT, fontSize: '12px', color: '#fff1c6', fontStyle: 'bold' }).setOrigin(0.5).setDepth(10).setAlpha(0);
    const homeButton = this.add.rectangle(104, 736, 140, 40, GOLD).setStrokeStyle(3, BORDER).setInteractive({ useHandCursor: true }).setDepth(9).setAlpha(0);
    const homeText = this.add.text(104, 736, '← HOME', { fontFamily: FONT, fontSize: '12px', color: INK, fontStyle: 'bold' }).setOrigin(0.5).setDepth(10).setAlpha(0);
    this.nextGroup = [card, tag, tagText, title, detail, nextButton, nextText, homeButton, homeText];
    this.tweens.add({ targets: this.nextGroup, alpha: 1, duration: 320, ease: 'Cubic.easeOut' });
    nextButton.on('pointerdown', () => { this.hooks.onSfx?.('tap'); this.hooks.onNext ? this.hooks.onNext() : this.message.setText('다음 주문 화면(게임 화면 B안)으로 이동합니다. 데모에서는 초기화로 다시 볼 수 있습니다.'); });
    homeButton.on('pointerdown', () => { this.hooks.onSfx?.('tap'); this.hooks.onHome ? this.hooks.onHome() : this.message.setText('Garage 홈으로 돌아갑니다. 데모에서는 초기화로 다시 볼 수 있습니다.'); });
    this.message.setText('정산이 끝났습니다. 다음 주문을 시작하거나 홈으로 돌아가세요.');
  }
}

export function startRewardSettlementPrototype(parent: string, hooks: RewardSettlementHooks = {}) {
  return new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width: 390,
    height: 810,
    backgroundColor: '#c78452',
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    scene: new RewardSettlementScene(hooks),
  });
}
