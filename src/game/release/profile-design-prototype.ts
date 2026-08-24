import Phaser from 'phaser';

export type ProfileDesignMode = 'warm-id-card' | 'warm-career-board' | 'warm-stats-dashboard';
export type ProfileDesignHooks = { onHome?: () => void; onSfx?: (event: 'tap') => void };

// 홈 화면 디자인 A안(따뜻한 생활형 픽셀 Garage)과 동일한 팔레트를 사용합니다.
const P = {
  ink: 0x3b2531, cream: 0xfff1c6, paper: 0xf6d995, wood: 0x8e5136,
  darkWood: 0x573044, floor: 0xb66f45, green: 0x5e9a67, leaf: 0x86ba6f,
  sky: 0x86c9c8, blue: 0x4e8092, gold: 0xf4b84a, red: 0xc95746, tire: 0x302936,
};

// 홈 A안·수집 화면 디자인 트랙과 동일한 세계관 고정 데이터 (docs/PROFILE_SCREEN_DESIGN_REVIEW.md)
const PROFILE = {
  nickname: '정비사 두리',
  garage: 'MY LITTLE GARAGE',
  level: 12,
  levelProgress: .6,
  playDays: 12,
  rankIndex: 1,
  ranks: ['견습 알바', '견습 정비사', '정비사', '시니어 정비사', '마스터 정비사', '샵 오너'],
  rankUnlocks: [
    '기본 주문과 머지 작업대 사용',
    '수집 도감과 Garage 전시 공간 해금',
    '주문 슬롯 +1 · 고급 부품 주문 해금',
    'Tour 참가와 한정 주문 해금',
    '드림 등급 개조와 특별 전시대 해금',
    'Garage 간판 교체 · 나만의 샵 운영',
  ],
  nextRank: { name: '정비사', needLevel: 15, needDelivery: 40 },
  stats: [
    { key: '납품 완료', value: '34건', detail: '이번 주 +7건 · 승진 조건 34/40' },
    { key: '완성차 조립', value: '12대', detail: '어반 로드부터 그래블까지 12대 완성' },
    { key: '머지 횟수', value: '512회', detail: '가장 많이 만든 부품: 휠 Lv.3' },
    { key: '누적 급여', value: '18,500', detail: '코인으로 받은 누적 급여 합계' },
    { key: '연속 출근', value: '6일', detail: '내일 출근하면 7일 보너스' },
    { key: '수집 진행', value: '8 / 24', detail: '다음 목표 TRAIL MTB · 주문 2건 남음' },
  ],
  weeklyDelivery: [3, 5, 2, 6, 4, 7, 7],
  weeklyMerge: [58, 92, 40, 106, 74, 88, 54],
};

const CARD_THEMES = [
  { name: '크림 종이', fill: 0xffe6a8 },
  { name: '목재 프레임', fill: 0xdca86f },
  { name: '민트 작업복', fill: 0xa8d8c9 },
];

class ProfileDesignScene extends Phaser.Scene {
  private mode: ProfileDesignMode;
  private view: 'profile' | 'home' = 'profile';
  private toast: string;
  private cardTheme = 0;
  private chartMetric: 'delivery' | 'merge' = 'delivery';

  constructor(mode: ProfileDesignMode, private readonly hooks: ProfileDesignHooks = {}) {
    super('profile-design');
    this.mode = mode;
    this.toast =
      mode === 'warm-id-card' ? '카드 배경 변경으로 나만의 사원증을 꾸며 보세요.'
      : mode === 'warm-career-board' ? '직급 단계를 눌러 해금 기능을 확인해 보세요.'
      : '통계 타일을 눌러 상세 기록을 확인해 보세요.';
  }

  create() { this.render(); }

  private label(x: number, y: number, value: string, size = 12, color = '#3b2531', bold = false) {
    return this.add.text(x, y, value, {
      fontFamily: '"Arial Rounded MT Bold", "Noto Sans KR", sans-serif', fontSize: `${size}px`,
      color, fontStyle: bold ? 'bold' : 'normal', stroke: bold ? '#fff1c6' : undefined, strokeThickness: bold ? 1 : 0,
    });
  }

  private pixelRect(x: number, y: number, w: number, h: number, fill: number, stroke = P.ink, depth = 0) {
    return this.add.rectangle(x, y, w, h, fill).setStrokeStyle(3, stroke).setDepth(depth);
  }

  private button(x: number, y: number, w: number, h: number, text: string, action: () => void, primary = false) {
    const shadow = this.add.rectangle(x + 3, y + 4, w, h, P.darkWood).setDepth(20);
    const box = this.add.rectangle(x, y, w, h, primary ? P.gold : P.paper)
      .setStrokeStyle(3, P.ink).setDepth(21).setInteractive({ useHandCursor: true }).on('pointerdown', action);
    this.label(x, y, text, primary ? 13 : 10, '#3b2531', true).setOrigin(.5).setAlign('center').setDepth(22)
      .setInteractive({ useHandCursor: true }).on('pointerdown', action);
    void shadow;
    return box;
  }

  private notify(message: string) { this.toast = message; this.render(); }

  private render() {
    this.children.removeAll();
    this.add.rectangle(195, 405, 390, 810, P.cream);
    this.view === 'home' ? this.renderHomePreview() : this.renderProfile();
  }

  private renderTopBar() {
    this.pixelRect(195, 39, 366, 54, P.paper, P.ink, 15);
    this.label(28, 20, 'ENERGY', 8, '#795044', true).setDepth(16);
    this.label(28, 37, '72 / 100', 14, '#3f7851', true).setDepth(16);
    this.add.rectangle(112, 43, 72, 8, P.darkWood).setDepth(16).setOrigin(0, .5);
    this.add.rectangle(112, 43, 52, 8, P.green).setDepth(17).setOrigin(0, .5);
    this.label(274, 20, 'COIN', 8, '#795044', true).setDepth(16);
    this.label(274, 37, '2,480', 14, '#a16028', true).setDepth(16);
  }

  private renderProfile() {
    const heads = {
      'warm-id-card': ['MY PROFILE · A안', '정비사 사원증'],
      'warm-career-board': ['MY PROFILE · B안', '커리어 승진 보드'],
      'warm-stats-dashboard': ['MY PROFILE · C안', '작업 기록'],
    } as const;
    const [eyebrow, title] = heads[this.mode];
    this.renderTopBar();
    this.button(57, 99, 84, 40, '← HOME', () => { this.hooks.onSfx?.('tap'); if (this.hooks.onHome) this.hooks.onHome(); else { this.view = 'home'; this.render(); } });
    this.label(112, 82, eyebrow, 8, '#6e473b', true).setDepth(16);
    this.label(112, 96, title, 15, '#3b2531', true).setDepth(16);
    this.pixelRect(348, 99, 66, 40, 0xffe6a8, P.wood, 15);
    this.label(348, 92, '레벨', 8, '#7b5140', true).setOrigin(.5).setDepth(16);
    this.label(348, 106, `Lv.${PROFILE.level}`, 12, '#3b2531', true).setOrigin(.5).setDepth(16);

    if (this.mode === 'warm-id-card') this.renderIdCard();
    if (this.mode === 'warm-career-board') this.renderCareerBoard();
    if (this.mode === 'warm-stats-dashboard') this.renderStatsDashboard();

    this.pixelRect(195, 744, 366, 44, 0xfff1c6, P.wood, 14);
    this.label(195, 744, this.toast, 10, '#5d3b34', true).setOrigin(.5).setDepth(15);
    this.pixelRect(195, 787, 366, 32, P.wood, P.ink, 18);
    this.label(195, 787, 'DREAM BIKE GARAGE · WARM PIXEL PROFILE', 8, '#fff1c6', true).setOrigin(.5).setDepth(19);
  }

  // 홈 A안의 정비사 캐릭터를 단순화한 픽셀 초상: 모자·얼굴·작업복
  private drawMechanic(x: number, y: number, scale: number, depth: number) {
    this.add.rectangle(x, y + 44 * scale, 66 * scale, 40 * scale, P.blue).setStrokeStyle(2, P.ink).setDepth(depth);
    this.add.rectangle(x, y + 40 * scale, 20 * scale, 26 * scale, 0xffe6a8).setStrokeStyle(2, P.wood).setDepth(depth + 1);
    this.add.circle(x, y, 26 * scale, 0xf2c894).setStrokeStyle(2, P.ink).setDepth(depth);
    this.add.circle(x - 9 * scale, y + 2 * scale, 2.5 * scale, P.ink).setDepth(depth + 1);
    this.add.circle(x + 9 * scale, y + 2 * scale, 2.5 * scale, P.ink).setDepth(depth + 1);
    this.add.rectangle(x, y + 13 * scale, 12 * scale, 3 * scale, P.wood).setDepth(depth + 1);
    this.add.rectangle(x, y - 22 * scale, 54 * scale, 14 * scale, P.red).setStrokeStyle(2, P.ink).setDepth(depth + 1);
    this.add.rectangle(x + 18 * scale, y - 15 * scale, 26 * scale, 6 * scale, P.red).setStrokeStyle(2, P.ink).setDepth(depth + 1);
  }

  // A안: 정비사 사원증 카드 + 통계 요약 + 승진 진행
  private renderIdCard() {
    const theme = CARD_THEMES[this.cardTheme];
    this.pixelRect(195, 162, 350, 36, P.wood, P.ink, 5);
    this.label(195, 162, 'MECHANIC ID CARD', 10, '#fff1c6', true).setOrigin(.5).setDepth(6);
    this.pixelRect(195, 296, 350, 228, theme.fill, P.wood, 5);

    this.pixelRect(107, 268, 118, 128, P.sky, P.ink, 6);
    this.drawMechanic(107, 258, 1, 7);

    this.label(180, 216, PROFILE.garage, 8, '#7b5140', true).setDepth(6);
    this.label(180, 232, PROFILE.nickname, 17, '#3b2531', true).setDepth(6);
    this.label(180, 260, `Lv.${PROFILE.level}`, 12, '#3f7851', true).setDepth(6);
    this.add.rectangle(228, 268, 118, 8, P.darkWood).setDepth(6).setOrigin(0, .5);
    this.add.rectangle(228, 268, 118 * PROFILE.levelProgress, 8, P.green).setDepth(7).setOrigin(0, .5);
    this.label(180, 280, `다음 레벨까지 ${Math.round(PROFILE.levelProgress * 100)}%`, 8, '#7b5140', true).setDepth(6);
    this.label(180, 294, `플레이 ${PROFILE.playDays}일차`, 8, '#7b5140', true).setDepth(6);

    this.add.circle(316, 336, 34, theme.fill).setStrokeStyle(3, P.red).setDepth(6);
    this.label(316, 328, '현재 직급', 7, '#a14a38', true).setOrigin(.5).setDepth(7);
    this.label(316, 341, PROFILE.ranks[PROFILE.rankIndex], 9, '#a14a38', true).setOrigin(.5).setDepth(7);
    this.label(112, 384, 'DREAM BIKE GARAGE · 오늘부터 자전거 부자', 8, '#7b5140', true).setDepth(6);

    PROFILE.stats.forEach((stat, index) => {
      const x = 75 + (index % 3) * 120;
      const y = 462 + Math.floor(index / 3) * 66;
      this.pixelRect(x, y, 112, 58, 0xffe6a8, P.wood, 5);
      this.label(x, y - 14, stat.key, 8, '#7b5140', true).setOrigin(.5).setDepth(6);
      this.label(x, y + 8, stat.value, 13, '#3b2531', true).setOrigin(.5).setDepth(6);
    });

    this.pixelRect(195, 586, 350, 54, P.paper, P.ink, 5);
    this.label(30, 566, `다음 직급 ${PROFILE.nextRank.name} · Lv.${PROFILE.level}/${PROFILE.nextRank.needLevel} · 납품 34/${PROFILE.nextRank.needDelivery}`, 10, '#5d3b34', true).setDepth(6);
    this.add.rectangle(30, 596, 330, 8, P.darkWood).setDepth(6).setOrigin(0, .5);
    this.add.rectangle(30, 596, 330 * (34 / PROFILE.nextRank.needDelivery), 8, P.gold).setDepth(7).setOrigin(0, .5);

    this.button(195, 678, 170, 44, `카드 배경 변경 · ${theme.name}`, () => {
      this.cardTheme = (this.cardTheme + 1) % CARD_THEMES.length;
      this.notify(`카드 배경을 '${CARD_THEMES[this.cardTheme].name}'로 바꿨습니다.`);
    });
  }

  // B안: 6단계 직급 사다리 + 다음 승진 조건 진행
  private renderCareerBoard() {
    this.pixelRect(195, 178, 350, 72, P.paper, P.ink, 5);
    this.label(30, 150, `NEXT RANK · ${PROFILE.nextRank.name}`, 9, '#a14a38', true).setDepth(6);
    this.label(30, 166, `레벨 ${PROFILE.level} / ${PROFILE.nextRank.needLevel}`, 9, '#5d3b34', true).setDepth(6);
    this.add.rectangle(150, 172, 210, 8, P.darkWood).setDepth(6).setOrigin(0, .5);
    this.add.rectangle(150, 172, 210 * (PROFILE.level / PROFILE.nextRank.needLevel), 8, P.green).setDepth(7).setOrigin(0, .5);
    this.label(30, 186, `납품 34 / ${PROFILE.nextRank.needDelivery}건`, 9, '#5d3b34', true).setDepth(6);
    this.add.rectangle(150, 192, 210, 8, P.darkWood).setDepth(6).setOrigin(0, .5);
    this.add.rectangle(150, 192, 210 * (34 / PROFILE.nextRank.needDelivery), 8, P.gold).setDepth(7).setOrigin(0, .5);

    [...PROFILE.ranks].reverse().forEach((rank, index) => {
      const rankIdx = PROFILE.ranks.length - 1 - index;
      const y = 250 + index * 66;
      const state = rankIdx < PROFILE.rankIndex ? '완료' : rankIdx === PROFILE.rankIndex ? '현재' : '잠금';
      const fill = state === '현재' ? 0xffe6a8 : state === '완료' ? 0xd9e8c9 : 0xe8d3ac;
      this.pixelRect(195, y, 330, 56, fill, state === '현재' ? P.gold : P.wood, 5)
        .setInteractive({ useHandCursor: true })
        .on('pointerdown', () => this.notify(`${rank}: ${PROFILE.rankUnlocks[rankIdx]}`));
      this.add.circle(58, y, 14, state === '잠금' ? 0xc9a98c : state === '현재' ? P.gold : P.green).setStrokeStyle(2, P.ink).setDepth(6);
      this.label(58, y, `${rankIdx + 1}`, 11, '#3b2531', true).setOrigin(.5).setDepth(7);
      this.label(84, y - 9, rank, 13, state === '잠금' ? '#8a6a50' : '#3b2531', true).setDepth(6);
      this.pixelRect(316, y, 54, 24, state === '현재' ? P.red : fill, P.wood, 6);
      this.label(316, y, state, 9, state === '현재' ? '#fff1c6' : '#5d3b34', true).setOrigin(.5).setDepth(7);
    });

    this.label(195, 672, '납품 34건 · 조립 12대 · 머지 512회가 승진 조건에 반영됩니다', 9, '#7b5140', true).setOrigin(.5).setDepth(6);
  }

  // C안: 통계 6타일 + 주간 기록 픽셀 그래프
  private renderStatsDashboard() {
    this.pixelRect(195, 166, 350, 48, 0xffe6a8, P.wood, 5);
    this.drawMechanic(48, 158, .5, 6);
    this.label(80, 148, PROFILE.nickname, 13, '#3b2531', true).setDepth(6);
    this.label(80, 168, `Lv.${PROFILE.level} · ${PROFILE.ranks[PROFILE.rankIndex]} · 플레이 ${PROFILE.playDays}일차`, 9, '#7b5140', true).setDepth(6);

    PROFILE.stats.forEach((stat, index) => {
      const x = 105 + (index % 2) * 180;
      const y = 236 + Math.floor(index / 2) * 74;
      this.pixelRect(x, y, 172, 66, P.paper, P.wood, 5)
        .setInteractive({ useHandCursor: true })
        .on('pointerdown', () => this.notify(`${stat.key} ${stat.value} · ${stat.detail}`));
      this.label(x - 76, y - 24, stat.key, 9, '#7b5140', true).setDepth(6);
      this.label(x - 76, y - 6, stat.value, 17, '#3b2531', true).setDepth(6);
    });

    const metricDelivery = this.chartMetric === 'delivery';
    const data = metricDelivery ? PROFILE.weeklyDelivery : PROFILE.weeklyMerge;
    const max = Math.max(...data);
    this.pixelRect(195, 570, 350, 176, 0xffe6a8, P.wood, 5);
    this.label(36, 494, metricDelivery ? '주간 납품 기록' : '주간 머지 기록', 12, '#3b2531', true).setDepth(6);
    this.button(300, 502, 110, 30, metricDelivery ? '머지 기록 보기' : '납품 기록 보기', () => {
      this.chartMetric = metricDelivery ? 'merge' : 'delivery';
      this.notify(metricDelivery ? '주간 머지 기록으로 전환했습니다.' : '주간 납품 기록으로 전환했습니다.');
    });
    ['월', '화', '수', '목', '금', '토', '일'].forEach((day, index) => {
      const x = 62 + index * 45;
      const h = Math.max(8, 92 * data[index] / max);
      this.add.rectangle(x, 622 - h / 2, 26, h, index >= 5 ? P.gold : P.green).setStrokeStyle(2, P.wood).setDepth(6);
      this.label(x, 610 - h, `${data[index]}`, 8, '#5d3b34', true).setOrigin(.5).setDepth(7);
      this.label(x, 634, day, 8, '#7b5140', true).setOrigin(.5).setDepth(6);
    });
  }

  // 홈 A안 축약 프리뷰: 프로필 탭 → 프로필 화면 진입 흐름만 검증
  private renderHomePreview() {
    this.renderTopBar();
    this.label(195, 82, 'HOME A안 축약 프리뷰 · 프로필 탭 진입 흐름 검증용', 9, '#8e5136', true).setOrigin(.5).setDepth(16);

    this.add.rectangle(195, 320, 390, 420, 0xd79a63);
    this.add.rectangle(195, 560, 390, 60, P.floor);
    this.pixelRect(195, 250, 184, 150, P.sky, P.cream, 1);
    this.add.triangle(160, 285, 105, 325, 160, 258, 215, 325, 0x5e9a67).setDepth(2);
    this.add.triangle(240, 286, 192, 325, 242, 252, 292, 325, 0x4f8060).setDepth(2);
    this.add.rectangle(195, 250, 8, 150, P.cream).setDepth(3);

    this.label(82, 355, PROFILE.garage, 10, '#6e473b', true).setDepth(13);
    this.label(82, 374, '나의 드림 로드바이크', 17, '#3b2531', true).setDepth(13);
    this.add.ellipse(195, 515, 200, 26, 0x6e473b, .28).setDepth(12);
    this.drawMechanic(195, 435, 1.2, 13);

    this.pixelRect(195, 600, 222, 56, 0xffe6a8, P.wood, 13);
    this.label(98, 582, 'STATUS', 8, '#7b5140', true).setDepth(14);
    this.label(98, 598, `Lv.${PROFILE.level}`, 15, '#3b2531', true).setDepth(14);
    this.label(192, 582, 'RANK', 8, '#7b5140', true).setDepth(14);
    this.label(192, 598, PROFILE.ranks[PROFILE.rankIndex], 11, '#3b2531', true).setDepth(14);

    this.label(115, 688, '▼ 프로필 탭으로 프로필 화면 진입', 9, '#a14a38', true).setOrigin(.5).setDepth(19);
    this.pixelRect(195, 744, 366, 82, P.wood, P.ink, 18);
    this.button(67, 738, 84, 56, `프로필\nLv.${PROFILE.level}`, () => { this.view = 'profile'; this.render(); }, true);
    this.button(195, 741, 110, 48, '▶ PLAY', () => this.notify('이 데모는 프로필 탭 → 프로필 화면 흐름만 검증합니다.'));
    this.button(323, 741, 80, 48, '자전거\n8/24', () => this.notify('이 데모는 프로필 탭 → 프로필 화면 흐름만 검증합니다.'));

    this.pixelRect(195, 655, 310, 40, 0xfff1c6, P.wood, 14);
    this.label(195, 655, this.toast, 9, '#5d3b34', true).setOrigin(.5).setDepth(15);
  }
}

export function startProfileDesignPrototype(parent: string, mode: ProfileDesignMode, hooks: ProfileDesignHooks = {}) {
  return new Phaser.Game({
    type: Phaser.AUTO, parent, width: 390, height: 810, backgroundColor: '#fff1c6',
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    scene: new ProfileDesignScene(mode, hooks),
    render: { antialias: false, pixelArt: true, roundPixels: true },
  });
}
