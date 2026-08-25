// 자전거 수집 화면 디자인 A/B/C안 비교 프로토타입 (도감 · 전시 · 드림 성장).
// 자전거 그림은 자체 선 드로잉 대신 공용 픽셀 스프라이트 모듈(bike-pixel-sprite)을 사용합니다.
import Phaser from 'phaser';
import { drawPixelBike, addPixelBikeImage, makeWarmColorway, bikeCategoryFromKorean } from './bike-pixel-sprite';

export type BikeCollectionDesignMode = 'warm-catalog' | 'warm-showcase' | 'warm-dream-growth';

export type BikeCollectionDesignHooks = {
  coins?: number;
  initialBikeId?: string;
  onHome?: () => void;
  onCatalog?: () => void;
  onShowcase?: () => void;
  onDreamGrowth?: () => void;
  onBikeDetail?: (bikeId: string) => void;
  onCoinsChange?: (coins: number) => void;
  onSfx?: (event: 'tap' | 'reward' | 'error') => void;
};

// 홈 화면 디자인 A안(따뜻한 생활형 픽셀 Garage)과 동일한 팔레트를 사용합니다.
const P = {
  ink: 0x3b2531, cream: 0xfff1c6, paper: 0xf6d995, wood: 0x8e5136,
  darkWood: 0x573044, floor: 0xb66f45, green: 0x5e9a67, leaf: 0x86ba6f,
  sky: 0x86c9c8, blue: 0x4e8092, gold: 0xf4b84a, red: 0xc95746,
};

type DesignBike = {
  id: string;
  name: string;
  category: '로드' | 'MTB' | '그래블' | '미니벨로';
  grade: '입문' | '중급' | '고급' | '드림';
  color: number;
  owned: boolean;
  hint: string;
};

// 홈 A안과 동일한 수집 데이터: 24종 중 8종 보유, 다음 목표 TRAIL MTB
const DESIGN_BIKES: DesignBike[] = [
  { id: 'dream-road', name: '나의 드림 로드바이크', category: '로드', grade: '중급', color: P.red, owned: true, hint: 'Garage 대표 자전거' },
  { id: 'urban-road', name: '어반 로드', category: '로드', grade: '입문', color: P.blue, owned: true, hint: '첫 주문 납품 보상' },
  { id: 'classic-randonneur', name: '클래식 랜도너', category: '로드', grade: '중급', color: P.green, owned: true, hint: '주문 납품 보상' },
  { id: 'touring-road', name: '투어링 로드', category: '로드', grade: '입문', color: P.leaf, owned: false, hint: '주문 납품 보상으로 발견' },
  { id: 'aero-sprinter', name: '에어로 스프린터', category: '로드', grade: '고급', color: P.gold, owned: false, hint: '고급 주문 보상으로 발견' },
  { id: 'dream-machine', name: '드림 머신', category: '로드', grade: '드림', color: P.gold, owned: false, hint: '드림 등급 승급 보상' },
  { id: 'trail-mtb', name: '트레일 MTB', category: 'MTB', grade: '중급', color: P.green, owned: false, hint: 'NEXT GOAL · 주문 2건 남음' },
  { id: 'hardtail-mtb', name: '하드테일 MTB', category: 'MTB', grade: '입문', color: P.blue, owned: true, hint: '주문 납품 보상' },
  { id: 'xc-mtb', name: '크로스컨트리 MTB', category: 'MTB', grade: '중급', color: P.red, owned: true, hint: '주문 납품 보상' },
  { id: 'fat-bike', name: '팻바이크', category: 'MTB', grade: '중급', color: P.wood, owned: false, hint: '겨울 주문 보상으로 발견' },
  { id: 'enduro-mtb', name: '엔듀로 MTB', category: 'MTB', grade: '고급', color: P.blue, owned: false, hint: '고급 주문 보상으로 발견' },
  { id: 'downhill-mtb', name: '다운힐 MTB', category: 'MTB', grade: '고급', color: P.red, owned: false, hint: '고급 주문 보상으로 발견' },
  { id: 'gravel-explorer', name: '그래블 익스플로러', category: '그래블', grade: '중급', color: P.gold, owned: true, hint: '주문 납품 보상' },
  { id: 'allroad-gravel', name: '올로드 그래블', category: '그래블', grade: '입문', color: P.green, owned: true, hint: '주문 납품 보상' },
  { id: 'singlespeed-gravel', name: '싱글스피드 그래블', category: '그래블', grade: '입문', color: P.blue, owned: false, hint: '주문 납품 보상으로 발견' },
  { id: 'bikepacking-gravel', name: '백패킹 그래블', category: '그래블', grade: '중급', color: P.leaf, owned: false, hint: '연속 주문 보상으로 발견' },
  { id: 'adventure-gravel', name: '어드벤처 그래블', category: '그래블', grade: '고급', color: P.wood, owned: false, hint: '고급 주문 보상으로 발견' },
  { id: 'expedition-gravel', name: '익스페디션 그래블', category: '그래블', grade: '드림', color: P.red, owned: false, hint: '드림 등급 승급 보상' },
  { id: 'city-mini', name: '시티 미니벨로', category: '미니벨로', grade: '입문', color: P.red, owned: true, hint: '주문 납품 보상' },
  { id: 'folding-mini', name: '폴딩 미니벨로', category: '미니벨로', grade: '입문', color: P.gold, owned: false, hint: '주문 납품 보상으로 발견' },
  { id: 'cargo-mini', name: '카고 미니벨로', category: '미니벨로', grade: '중급', color: P.green, owned: false, hint: '배달 주문 보상으로 발견' },
  { id: 'classic-mini', name: '클래식 미니벨로', category: '미니벨로', grade: '중급', color: P.blue, owned: false, hint: '주문 납품 보상으로 발견' },
  { id: 'tour-mini', name: '투어 미니벨로', category: '미니벨로', grade: '고급', color: P.leaf, owned: false, hint: '고급 주문 보상으로 발견' },
  { id: 'dream-mini', name: '드림 미니벨로', category: '미니벨로', grade: '드림', color: P.gold, owned: false, hint: '드림 등급 승급 보상' },
];

const GRADE_COLOR: Record<DesignBike['grade'], number> = { 입문: P.leaf, 중급: P.blue, 고급: P.gold, 드림: P.red };

class BikeCollectionDesignScene extends Phaser.Scene {
  private mode: BikeCollectionDesignMode;
  private view: 'collection' | 'home' = 'collection';
  private bikes = DESIGN_BIKES.map((bike) => ({ ...bike }));
  private selected = 'trail-mtb';
  private coins = 2480;
  private toast: string;
  private showcaseSlots: Array<string | null> = ['dream-road', 'urban-road', null];
  private dreamStats = { 성능: 1, 스타일: 1, 희귀도: 1 };

  constructor(mode: BikeCollectionDesignMode, private readonly hooks: BikeCollectionDesignHooks = {}) {
    super('bike-collection-design');
    this.mode = mode;
    this.coins = hooks.coins ?? this.coins;
    if (hooks.initialBikeId && this.bikes.some((bike) => bike.id === hooks.initialBikeId)) this.selected = hooks.initialBikeId;
    this.toast =
      mode === 'warm-catalog' ? '도감 칸을 눌러 자전거 정보를 확인해 보세요.'
      : mode === 'warm-showcase' ? '보관 선반에서 자전거를 고른 뒤 전시대를 눌러 배치하세요.'
      : '파츠를 강화해 드림 바이크의 등급을 키워 보세요.';
  }

  create() { this.render(); }

  private ownedCount() { return this.bikes.filter((bike) => bike.owned).length; }

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
    this.view === 'home' ? this.renderHomePreview() : this.renderCollection();
  }

  private renderTopBar() {
    this.pixelRect(195, 39, 366, 54, P.paper, P.ink, 15);
    this.label(28, 20, 'ENERGY', 8, '#795044', true).setDepth(16);
    this.label(28, 37, '72 / 100', 14, '#3f7851', true).setDepth(16);
    this.add.rectangle(112, 43, 72, 8, P.darkWood).setDepth(16).setOrigin(0, .5);
    this.add.rectangle(112, 43, 52, 8, P.green).setDepth(17).setOrigin(0, .5);
    this.label(274, 20, 'COIN', 8, '#795044', true).setDepth(16);
    this.label(274, 37, this.coins.toLocaleString(), 14, '#a16028', true).setDepth(16);
  }

  private renderCollection() {
    const heads = {
      'warm-catalog': ['BIKE COLLECTION · A안', '자전거 도감'],
      'warm-showcase': ['BIKE COLLECTION · B안', '내 Garage 전시'],
      'warm-dream-growth': ['BIKE COLLECTION · C안', '드림 바이크'],
    } as const;
    const [eyebrow, title] = heads[this.mode];
    this.renderTopBar();
    this.button(57, 99, 84, 40, '← HOME', () => { this.hooks.onSfx?.('tap'); if (this.hooks.onHome) this.hooks.onHome(); else { this.view = 'home'; this.render(); } });
    this.label(112, 82, eyebrow, 8, '#6e473b', true).setDepth(16);
    this.label(112, 96, title, 15, '#3b2531', true).setDepth(16);
    this.pixelRect(348, 99, 66, 40, 0xffe6a8, P.wood, 15);
    this.label(348, 92, '수집', 8, '#7b5140', true).setOrigin(.5).setDepth(16);
    this.label(348, 106, `${this.ownedCount()} / 24`, 12, '#3b2531', true).setOrigin(.5).setDepth(16);

    if (this.mode === 'warm-catalog') this.renderCatalog();
    if (this.mode === 'warm-showcase') this.renderShowcase();
    if (this.mode === 'warm-dream-growth') this.renderDreamGrowth();

    this.pixelRect(195, 720, 366, 28, 0xfff1c6, P.wood, 14);
    this.label(195, 720, this.toast, 8, '#5d3b34', true).setOrigin(.5).setDepth(15);
    this.button(72, 754, 112, 30, 'A · 도감', () => this.openCollectionMode('warm-catalog'), this.mode === 'warm-catalog');
    this.button(195, 754, 112, 30, 'B · 전시', () => this.openCollectionMode('warm-showcase'), this.mode === 'warm-showcase');
    this.button(318, 754, 112, 30, 'C · 상세·성장', () => this.openCollectionMode('warm-dream-growth'), this.mode === 'warm-dream-growth');
    this.pixelRect(195, 793, 366, 24, P.wood, P.ink, 18);
    this.label(195, 793, 'DREAM BIKE GARAGE · WARM PIXEL COLLECTION', 8, '#fff1c6', true).setOrigin(.5).setDepth(19);
  }

  private openCollectionMode(mode: BikeCollectionDesignMode) {
    this.hooks.onSfx?.('tap');
    const callback = mode === 'warm-catalog' ? this.hooks.onCatalog
      : mode === 'warm-showcase' ? this.hooks.onShowcase
      : this.hooks.onDreamGrowth;
    if (callback) callback();
    else { this.mode = mode; this.render(); }
  }

  // A안: 24칸 도감 그리드 + 하단 상세 카드
  private renderCatalog() {
    const owned = this.ownedCount();
    this.label(24, 128, 'COLLECTION', 8, '#7b5140', true);
    this.label(24, 142, `${owned} / 24`, 14, '#3b2531', true);
    this.add.rectangle(120, 150, 246, 10, P.darkWood).setOrigin(0, .5);
    this.add.rectangle(120, 150, 246 * owned / 24, 10, P.green).setOrigin(0, .5);

    this.bikes.forEach((bike, index) => {
      const x = 60 + (index % 4) * 90;
      const y = 196 + Math.floor(index / 4) * 76;
      const isSelected = this.selected === bike.id;
      const isNextGoal = bike.id === 'trail-mtb' && !bike.owned;
      this.add.rectangle(x, y, 86, 68, bike.owned ? 0xffe6a8 : 0x6a4a3a)
        .setStrokeStyle(3, isSelected ? P.gold : isNextGoal ? P.red : bike.owned ? P.wood : 0x4a3328)
        .setDepth(isSelected ? 6 : 5)
        .setInteractive({ useHandCursor: true })
        .on('pointerdown', () => { this.selected = bike.id; this.render(); });
      this.add.circle(x - 33, y - 24, 4, GRADE_COLOR[bike.grade]).setStrokeStyle(1, P.ink).setDepth(7);
      // 보유: 카테고리별 픽셀 스프라이트, 미보유: 실루엣 표시.
      // 24칸을 동시에 그리므로 Graphics 대신 텍스처 캐시 경로(addPixelBikeImage)를 사용합니다.
      if (bike.owned) {
        addPixelBikeImage(this, x, y + 4, 1, {
          category: bikeCategoryFromKorean(bike.category), colorway: makeWarmColorway(bike.color), depth: 7,
        });
      } else {
        addPixelBikeImage(this, x, y + 4, 1, {
          category: bikeCategoryFromKorean(bike.category), silhouette: { body: 0x8a6a52, ink: 0x4a3328 }, depth: 7,
        });
      }
      if (!bike.owned) this.label(x, y + 21, isNextGoal ? 'NEXT' : '?', 9, isNextGoal ? '#f4b84a' : '#c9a98c', true).setOrigin(.5).setDepth(7);
    });

    const target = this.bikes.find((bike) => bike.id === this.selected)!;
    this.pixelRect(195, 682, 366, 74, P.paper, P.ink, 8);
    this.label(28, 656, `${target.category} · ${target.grade}`, 9, '#8e5136', true).setDepth(9);
    this.label(28, 671, target.owned ? target.name : `??? ${target.name}`, 14, target.owned ? '#3b2531' : '#7b5140', true).setDepth(9);
    this.label(28, 693, target.owned ? `보유 중 · ${target.hint}` : target.hint, 10, target.owned ? '#3f7851' : '#a14a38', true).setDepth(9);
    if (target.owned) {
      this.button(322, 682, 108, 42, '상세·성장\n보기', () => {
        this.hooks.onSfx?.('tap');
        if (this.hooks.onBikeDetail) this.hooks.onBikeDetail(target.id);
        else { this.mode = 'warm-dream-growth'; this.render(); }
      }, true);
    } else {
      this.button(322, 665, 108, 28, '상세 보기', () => {
        this.hooks.onSfx?.('tap');
        if (this.hooks.onBikeDetail) this.hooks.onBikeDetail(target.id);
        else { this.mode = 'warm-dream-growth'; this.render(); }
      });
      this.button(322, 700, 108, 28, '획득 미리보기', () => {
        target.owned = true;
        this.hooks.onSfx?.('reward');
        this.notify(`${target.name} 획득! 도감 ${this.ownedCount()} / 24 달성.`);
      });
    }
  }

  // B안: 전시대 배치 + 보관 선반
  private renderShowcase() {
    this.add.rectangle(195, 302, 390, 344, 0xd79a63);
    this.add.rectangle(195, 500, 390, 52, P.floor);
    for (let x = 30; x < 390; x += 72) this.add.line(0, 0, x, 474, x - 8, 526, P.darkWood, .22).setOrigin(0);

    // cell: 픽셀 스프라이트 한 칸 px (메인 전시대는 크게, 보조 전시대는 작게)
    const stands = [
      { x: 195, y: 268, scale: .68, cell: 2.5, deckY: 322, deckW: 196, tag: 'MAIN DISPLAY' },
      { x: 100, y: 428, scale: .4, cell: 1.5, deckY: 462, deckW: 124, tag: 'DISPLAY 02' },
      { x: 290, y: 428, scale: .4, cell: 1.5, deckY: 462, deckW: 124, tag: 'DISPLAY 03' },
    ];
    stands.forEach((stand, index) => {
      const bikeId = this.showcaseSlots[index];
      const bike = bikeId ? this.bikes.find((item) => item.id === bikeId)! : undefined;
      this.label(stand.x, stand.y - 92 * stand.scale - 26, stand.tag, 8, '#fff1c6', true).setOrigin(.5).setDepth(3);
      this.add.ellipse(stand.x, stand.deckY + 12, stand.deckW * .86, 14, 0x6e473b, .3).setDepth(2);
      this.add.rectangle(stand.x, stand.deckY, stand.deckW, 10, P.darkWood).setStrokeStyle(2, P.ink).setDepth(3);
      if (bike) {
        // 바퀴 하단(y + 10*cell)이 deckY에 닿도록 y를 역산해 배치
        drawPixelBike(this, stand.x, stand.deckY - 10 * stand.cell, stand.cell, {
          category: bikeCategoryFromKorean(bike.category), colorway: makeWarmColorway(bike.color), depth: 4,
        });
        this.label(stand.x, stand.deckY + 20, `${bike.name} · ${bike.grade}`, 9, '#fff1c6', true).setOrigin(.5).setDepth(4);
      } else {
        this.label(stand.x, stand.y + 8, '+', 26, '#fff1c6', true).setOrigin(.5).setDepth(4).setAlpha(.8);
        this.label(stand.x, stand.deckY + 20, '빈 전시대', 9, '#ffe6a8', true).setOrigin(.5).setDepth(4);
      }
      this.add.rectangle(stand.x, stand.y + 10, stand.deckW, 130 * stand.scale + 70, 0xffffff, .001)
        .setDepth(5).setInteractive({ useHandCursor: true }).on('pointerdown', () => {
          const chosen = this.bikes.find((item) => item.id === this.selected);
          if (!chosen?.owned) { this.notify('보관 선반에서 보유 자전거를 먼저 선택하세요.'); return; }
          this.showcaseSlots[index] = chosen.id;
          this.notify(`${chosen.name}을(를) ${stand.tag}에 전시했습니다.`);
        });
    });

    this.label(24, 548, '보관 선반 · 보유 8종', 11, '#5d3b34', true);
    this.bikes.filter((bike) => bike.owned).forEach((bike, index) => {
      const x = 60 + (index % 4) * 90;
      const y = 602 + Math.floor(index / 4) * 70;
      const active = this.selected === bike.id;
      this.add.rectangle(x, y, 86, 62, active ? P.gold : 0xffe6a8)
        .setStrokeStyle(3, active ? P.ink : P.wood).setDepth(5)
        .setInteractive({ useHandCursor: true })
        .on('pointerdown', () => { this.selected = bike.id; this.notify(`${bike.name} 선택 · 전시대를 눌러 배치하세요.`); });
      // 보관 선반은 보유 자전거만 표시하므로 실루엣 없이 컬러 스프라이트로 그림 (다수 표시라 텍스처 캐시 경로)
      addPixelBikeImage(this, x, y, 1, {
        category: bikeCategoryFromKorean(bike.category), colorway: makeWarmColorway(bike.color), depth: 6,
      });
      this.label(x, y + 17, bike.name.length > 8 ? bike.name.slice(0, 8) : bike.name, 8, '#3b2531', true).setOrigin(.5).setDepth(6);
    });
  }

  // C안: 한 대 집중 성장 + 파츠 강화
  private renderDreamGrowth() {
    const total = Object.values(this.dreamStats).reduce((sum, value) => sum + value, 0);
    const stage = total >= 10 ? 3 : total >= 7 ? 2 : 1;
    const gradeName = stage === 3 ? '드림' : stage === 2 ? '고급' : '중급';
    const dream = this.bikes.find((bike) => bike.id === this.selected) ?? this.bikes.find((bike) => bike.id === 'dream-road')!;

    this.label(24, 130, 'MY DREAM BIKE', 8, '#6e473b', true);
    this.label(24, 144, dream.name, 15, '#3b2531', true);
    this.pixelRect(340, 150, 84, 30, stage === 3 ? P.gold : 0xffe6a8, stage === 3 ? P.red : P.wood, 5);
    this.label(340, 150, `${gradeName} 등급`, 10, stage === 3 ? '#a14a38' : '#5d3b34', true).setOrigin(.5).setDepth(6);

    if (stage >= 3) this.add.circle(195, 268, 118, P.gold, .16).setStrokeStyle(3, P.gold).setDepth(1);
    this.add.ellipse(195, 344, 220, 28, 0x6e473b, .28).setDepth(1);
    // 바퀴 하단(y + 10*cell = 330)이 그림자 타원(y=344) 위에 얹히도록 배치
    drawPixelBike(this, 195, 300, 3, { category: 'road', colorway: makeWarmColorway(dream.color), depth: 2 });
    if (stage >= 2) {
      this.label(195, 200, '★ 파츠 강화 반영', 9, '#a16028', true).setOrigin(.5).setDepth(3);
      // 강화 반영 시각화: 자전거 주변 골드 반짝임 픽셀
      [[118, 238], [270, 220], [248, 318]].forEach(([sx, sy]) => {
        this.add.rectangle(sx, sy, 4, 4, P.gold).setDepth(3);
      });
    }

    const growth = Math.round((total - 3) / 9 * 100);
    this.label(24, 372, `드림 등급까지 성장 ${growth}%`, 10, '#5d3b34', true);
    this.add.rectangle(24, 394, 342, 10, P.darkWood).setOrigin(0, .5);
    this.add.rectangle(24, 394, 342 * Math.min(1, (total - 3) / 9), 10, P.green).setOrigin(0, .5);

    (Object.keys(this.dreamStats) as Array<keyof typeof this.dreamStats>).forEach((key, index) => {
      const level = this.dreamStats[key];
      const y = 450 + index * 78;
      const cost = 350 * level;
      this.pixelRect(195, y, 350, 64, 0xffe6a8, P.wood, 5);
      this.label(40, y - 22, key, 12, '#3b2531', true).setDepth(6);
      for (let dot = 0; dot < 4; dot++) {
        this.add.circle(48 + dot * 26, y + 12, 8, dot < level ? dream.color : 0xd8b98a).setStrokeStyle(2, P.wood).setDepth(6);
      }
      this.label(160, y + 5, `Lv.${level} / 4`, 9, level === 4 ? '#a16028' : '#7b5140', true).setDepth(6);
      if (level < 4) this.button(300, y, 104, 40, `강화 ${cost}`, () => {
        if (this.coins < cost) { this.hooks.onSfx?.('error'); this.notify('코인이 부족합니다. 주문을 완료해 급여를 받으세요.'); return; }
        this.coins -= cost;
        this.hooks.onCoinsChange?.(this.coins);
        this.hooks.onSfx?.('reward');
        this.dreamStats[key] += 1;
        const nextTotal = Object.values(this.dreamStats).reduce((sum, value) => sum + value, 0);
        this.notify(nextTotal >= 10 && total < 10 ? '드림 등급 달성! 나만의 드림 바이크 완성.' : nextTotal >= 7 && total < 7 ? '고급 등급 달성! 외형 강조가 추가됐습니다.' : `${key} 강화 완료 · 남은 코인 ${this.coins.toLocaleString()}`);
      });
      else this.label(300, y, 'MAX', 12, '#a16028', true).setOrigin(.5).setDepth(6);
    });

    this.label(195, 696, `COLLECTION ${this.ownedCount()} / 24 · A 도감과 B 전시로 언제든 이동할 수 있습니다`, 8, '#7b5140', true).setOrigin(.5);
  }

  // 홈 A안 축약 프리뷰: 자전거 탭 → 수집 화면 진입 흐름만 검증
  private renderHomePreview() {
    this.renderTopBar();
    this.label(195, 82, 'HOME A안 축약 프리뷰 · 자전거 탭 진입 흐름 검증용', 9, '#8e5136', true).setOrigin(.5).setDepth(16);

    this.add.rectangle(195, 320, 390, 420, 0xd79a63);
    this.add.rectangle(195, 560, 390, 60, P.floor);
    this.pixelRect(195, 250, 184, 150, P.sky, P.cream, 1);
    this.add.triangle(160, 285, 105, 325, 160, 258, 215, 325, 0x5e9a67).setDepth(2);
    this.add.triangle(240, 286, 192, 325, 242, 252, 292, 325, 0x4f8060).setDepth(2);
    this.add.rectangle(195, 250, 8, 150, P.cream).setDepth(3);

    this.label(82, 355, 'MY LITTLE GARAGE', 10, '#6e473b', true).setDepth(13);
    this.label(82, 374, '나의 드림 로드바이크', 17, '#3b2531', true).setDepth(13);
    this.add.ellipse(195, 520, 218, 30, 0x6e473b, .28).setDepth(12);
    // 바퀴 하단(y + 10*cell = 510)이 그림자 타원(y=520) 근처에 오도록 배치
    drawPixelBike(this, 195, 480, 3, { category: 'road', colorway: makeWarmColorway(P.red), depth: 13 });

    this.pixelRect(195, 600, 222, 56, 0xffe6a8, P.wood, 13);
    this.label(98, 582, 'COLLECTION', 8, '#7b5140', true).setDepth(14);
    this.label(98, 598, `${this.ownedCount()} / 24`, 15, '#3b2531', true).setDepth(14);
    this.label(192, 582, 'NEXT GOAL', 8, '#7b5140', true).setDepth(14);
    this.label(192, 598, 'TRAIL MTB', 11, '#3b2531', true).setDepth(14);

    this.label(323, 688, '▼ 자전거 탭으로 수집 화면 진입', 9, '#a14a38', true).setOrigin(.5).setDepth(19);
    this.pixelRect(195, 744, 366, 82, P.wood, P.ink, 18);
    this.button(67, 741, 80, 48, '프로필\nLv.12', () => this.notify('이 데모는 자전거 탭 → 수집 화면 흐름만 검증합니다.'));
    this.button(195, 741, 110, 48, '▶ PLAY', () => this.notify('이 데모는 자전거 탭 → 수집 화면 흐름만 검증합니다.'));
    this.button(323, 738, 84, 56, `자전거\n${this.ownedCount()}/24`, () => { this.view = 'collection'; this.render(); }, true);

    this.pixelRect(195, 655, 310, 40, 0xfff1c6, P.wood, 14);
    this.label(195, 655, this.toast, 9, '#5d3b34', true).setOrigin(.5).setDepth(15);
  }
}

export function startBikeCollectionDesignPrototype(parent: string, mode: BikeCollectionDesignMode, hooks: BikeCollectionDesignHooks = {}) {
  return new Phaser.Game({
    type: Phaser.AUTO, parent, width: 390, height: 810, backgroundColor: '#fff1c6',
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    scene: new BikeCollectionDesignScene(mode, hooks),
    render: { antialias: false, pixelArt: true, roundPixels: true },
  });
}
