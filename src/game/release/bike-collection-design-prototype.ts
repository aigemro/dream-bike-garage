// 자전거 수집 화면 (도감 · 전시 · 드림 성장) — 출시 적용 화면.
// 자전거 그림은 자체 선 드로잉 대신 공용 픽셀 스프라이트 모듈(bike-pixel-sprite)을 사용합니다.
import Phaser from 'phaser';
import { drawPixelBike, addPixelBikeImage, makeWarmColorway, bikeCategoryFromKorean } from './bike-pixel-sprite';
import { CATALOG_BIKES } from './bike-catalog';
import { CRAFT_PARTS, craftPartCost, dreamUpgradeCost, type CraftPartType } from './meta-progress';

export type BikeCollectionDesignMode = 'warm-catalog' | 'warm-showcase' | 'warm-dream-growth';

export type BikeCollectionDesignHooks = {
  coins?: number;
  initialBikeId?: string;
  // 상단 HUD (출시 공통 규칙): 홈과 같은 DAY 번호·상태 문구. 통합 컨트롤러가 넘겨 주며, 없으면 중립값(DAY 1 / 0)으로 표시합니다.
  dayNumber?: number;
  dayStatusLabel?: string;
  // 릴리스 통합용 실제 진행 데이터 (#201): 지정 시 샘플 보유 상태(8/24) 대신 이 목록으로 잠금을 결정합니다.
  // ownedBikeIds = 완성(보유) 자전거. 등록·이해도(#221)는 도감 상태 표시에 사용합니다.
  ownedBikeIds?: string[];
  registeredBikeIds?: string[];
  understandingByBikeId?: Record<string, number>;
  newBikeIds?: string[];
  showcaseSlots?: Array<string | null>;
  onShowcaseChange?: (slots: Array<string | null>) => void;
  onBikeSeen?: (bikeId: string) => void;
  // 자전거 만들기 연동 (#222): 등록·미완성 자전거의 장착 부품과 제작 처리(코인 차감+장착 원자 처리)
  craftPartsByBikeId?: Record<string, CraftPartType[]>;
  onCraftPart?: (bikeId: string, part: CraftPartType) => {
    ok: boolean;
    reason?: 'coins' | 'not-registered' | 'already-crafted' | 'already-installed' | 'unknown';
    coins: number;
    installedParts: CraftPartType[];
    completed: boolean;
  };
  // 드림 바이크 성장 연동 (#203): 지정 시 강화 수치와 코인 차감을 컨트롤러가 원자적으로 처리합니다.
  dreamStats?: Record<'성능' | '스타일' | '희귀도', number>;
  onDreamUpgrade?: (stat: '성능' | '스타일' | '희귀도') => {
    ok: boolean;
    reason?: 'coins' | 'max' | 'not-crafted';
    coins: number;
    stats: Record<'성능' | '스타일' | '희귀도', number>;
    stageUp?: boolean;
    // 이번 강화로 승급 보상으로 도감 등록된 드림 등급 자전거 이름 (레벨 디자인 규칙)
    dreamUnlockedBikeNames?: string[];
  };
  onHome?: () => void;
  onCatalog?: () => void;
  onShowcase?: () => void;
  onDreamGrowth?: () => void;
  onBikeDetail?: (bikeId: string) => void;
  onCoinsChange?: (coins: number) => void;
  onSfx?: (event: 'tap' | 'reward' | 'error') => void;
};

// 홈 화면(따뜻한 생활형 픽셀 Garage)과 동일한 팔레트를 사용합니다.
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

// 카탈로그 데이터는 bike-catalog 단일 출처를 사용합니다.
// 독립 데모는 샘플 보유 상태(8/24 · 다음 목표 TRAIL MTB), 릴리스 통합은 hooks.ownedBikeIds로 대체합니다.
const DESIGN_BIKES: DesignBike[] = CATALOG_BIKES.map(({ sampleOwned, ...bike }) => ({ ...bike, owned: sampleOwned }));

const GRADE_COLOR: Record<DesignBike['grade'], number> = { 입문: P.leaf, 중급: P.blue, 고급: P.gold, 드림: P.red };

class BikeCollectionDesignScene extends Phaser.Scene {
  private mode: BikeCollectionDesignMode;
  private view: 'collection' | 'home' = 'collection';
  private bikes = DESIGN_BIKES.map((bike) => ({ ...bike }));
  // 아직 도감에서 확인하지 않은 신규 등록 자전거 (#201·#221) — 확인 시 onBikeSeen으로 컨트롤러에 알림
  private newIds = new Set<string>();
  // 도감 등록(제작 가능) 자전거와 자전거별 이해도 (#221) — 독립 데모는 샘플 보유와 동일하게 취급
  private registeredIds = new Set<string>();
  private understanding: Record<string, number> = {};
  // 제작 중 자전거별 장착 부품 (#222)
  private craftParts: Record<string, CraftPartType[]> = {};
  private selected = 'trail-mtb';
  // 훅이 없을 때는 가짜 잔액 대신 중립값 0으로 표시합니다 (출시 공통 규칙).
  private coins = 0;
  private toast: string;
  private showcaseSlots: Array<string | null> = ['dream-road', 'urban-road', null];
  // 전시 모드 보관 선반 페이지(8대 단위). 보유 자전거가 8대를 넘으면 `+n대 더 ▸` 표시로 넘깁니다.
  private shelfPage = 0;
  private dreamStats = { 성능: 1, 스타일: 1, 희귀도: 1 };

  constructor(mode: BikeCollectionDesignMode, private readonly hooks: BikeCollectionDesignHooks = {}) {
    super('bike-collection-design');
    this.mode = mode;
    this.coins = hooks.coins ?? this.coins;
    // 실제 진행 데이터 모드: 보유·전시 상태를 컨트롤러가 넘긴 진행 데이터로 덮어씁니다.
    if (hooks.ownedBikeIds) {
      const owned = new Set(hooks.ownedBikeIds);
      this.bikes.forEach((bike) => { bike.owned = owned.has(bike.id); });
      this.showcaseSlots = (hooks.showcaseSlots ?? this.showcaseSlots)
        .map((slot) => (slot && owned.has(slot) ? slot : null));
    }
    this.newIds = new Set(hooks.newBikeIds ?? []);
    this.registeredIds = new Set(hooks.registeredBikeIds ?? hooks.ownedBikeIds ?? this.bikes.filter((bike) => bike.owned).map((bike) => bike.id));
    this.understanding = { ...(hooks.understandingByBikeId ?? {}) };
    this.craftParts = Object.fromEntries(Object.entries(hooks.craftPartsByBikeId ?? {}).map(([id, parts]) => [id, [...parts]]));
    if (hooks.dreamStats) this.dreamStats = { ...hooks.dreamStats };
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

  // 밝은 벽·바닥 위에서도 읽히도록 진한 배경 띠를 깐 작은 태그 (전시대 이름 등). 폭은 글자 폭에 맞춰 계산합니다.
  private tag(x: number, y: number, value: string, size = 9, depth = 3, fill = P.darkWood, color = '#fff1c6') {
    const text = this.label(x, y, value, size, color, true).setOrigin(.5).setDepth(depth + 1);
    this.add.rectangle(x, y, text.width + 14, size + 9, fill).setStrokeStyle(2, P.ink).setDepth(depth);
    return text;
  }

  private button(x: number, y: number, w: number, h: number, text: string, action: () => void, primary = false) {
    const shadow = this.add.rectangle(x + 3, y + 4, w, h, P.darkWood).setDepth(20);
    const box = this.add.rectangle(x, y, w, h, primary ? P.gold : P.paper)
      .setStrokeStyle(3, P.ink).setDepth(21).setInteractive({ useHandCursor: true }).on('pointerdown', action);
    // 버튼 글자는 최소 11px (출시 공통 규칙 4)
    this.label(x, y, text, primary ? 13 : 11, '#3b2531', true).setOrigin(.5).setAlign('center').setDepth(22)
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

  // 상단 HUD: 홈과 같은 구성 (왼쪽 DAY n + 상태 문구, 오른쪽 COIN 실제 잔액). 훅이 없으면 DAY 1 / 영업 준비 / 0.
  private renderTopBar() {
    this.pixelRect(195, 39, 366, 54, P.paper, P.ink, 15);
    this.label(28, 18, `DAY ${this.hooks.dayNumber ?? 1}`, 9, '#795044', true).setDepth(16);
    this.label(28, 36, this.hooks.dayStatusLabel ?? '영업 준비', 12, '#3f7851', true).setDepth(16);
    this.label(274, 18, 'COIN', 9, '#795044', true).setDepth(16);
    this.label(274, 36, this.coins.toLocaleString(), 14, '#a16028', true).setDepth(16);
  }

  private renderCollection() {
    // 모드별 영문 소제목 + 한국어 제목 (이 게임의 태그 스타일)
    const heads = {
      'warm-catalog': ['BIKE COLLECTION', '자전거 도감'],
      'warm-showcase': ['MY GARAGE', '내 Garage 전시'],
      'warm-dream-growth': ['DREAM BIKE', '드림 바이크'],
    } as const;
    const [eyebrow, title] = heads[this.mode];
    this.renderTopBar();
    // 뒤로가기 라벨은 전 화면 공통 `← 홈`, 터치 영역 44px 이상
    this.button(57, 99, 84, 44, '← 홈', () => { this.hooks.onSfx?.('tap'); if (this.hooks.onHome) this.hooks.onHome(); else { this.view = 'home'; this.render(); } });
    this.label(112, 81, eyebrow, 9, '#6e473b', true).setDepth(16);
    this.label(112, 95, title, 15, '#3b2531', true).setDepth(16);
    this.pixelRect(348, 99, 66, 40, 0xffe6a8, P.wood, 15);
    this.label(348, 91, '수집', 9, '#7b5140', true).setOrigin(.5).setDepth(16);
    this.label(348, 106, `${this.ownedCount()} / 24`, 12, '#3b2531', true).setOrigin(.5).setDepth(16);

    if (this.mode === 'warm-catalog') this.renderCatalog();
    if (this.mode === 'warm-showcase') this.renderShowcase();
    if (this.mode === 'warm-dream-growth') this.renderDreamGrowth();

    // 하단: 안내 바(705–739) → 모드 탭(750–794, 터치 44px). 푸터는 두지 않고 그 공간을 간격으로 씁니다.
    this.pixelRect(195, 722, 366, 34, 0xfff1c6, P.wood, 14);
    // 안내 바 글자는 홈과 같은 11px (본문 최소 크기 규칙). 가장 긴 안내도 340px 안에 한 줄로 들어옵니다.
    this.label(195, 722, this.toast, 11, '#5d3b34', true).setOrigin(.5).setAlign('center').setWordWrapWidth(340).setDepth(15);
    this.button(72, 772, 112, 44, '도감', () => this.openCollectionMode('warm-catalog'), this.mode === 'warm-catalog');
    this.button(195, 772, 112, 44, '전시', () => this.openCollectionMode('warm-showcase'), this.mode === 'warm-showcase');
    this.button(318, 772, 112, 44, '성장', () => this.openCollectionMode('warm-dream-growth'), this.mode === 'warm-dream-growth');
  }

  private openCollectionMode(mode: BikeCollectionDesignMode) {
    this.hooks.onSfx?.('tap');
    const callback = mode === 'warm-catalog' ? this.hooks.onCatalog
      : mode === 'warm-showcase' ? this.hooks.onShowcase
      : this.hooks.onDreamGrowth;
    if (callback) callback();
    else { this.mode = mode; this.render(); }
  }

  // 도감 모드: 24칸 도감 그리드 + 하단 상세 카드
  private renderCatalog() {
    const owned = this.ownedCount();
    this.label(24, 127, 'COLLECTION', 9, '#7b5140', true);
    this.label(24, 142, `${owned} / 24`, 14, '#3b2531', true);
    this.add.rectangle(120, 150, 246, 10, P.darkWood).setOrigin(0, .5);
    this.add.rectangle(120, 150, 246 * owned / 24, 10, P.green).setOrigin(0, .5);

    this.bikes.forEach((bike, index) => {
      const x = 60 + (index % 4) * 90;
      const y = 196 + Math.floor(index / 4) * 76;
      const isSelected = this.selected === bike.id;
      // 샘플 데이터의 다음 목표(TRAIL MTB) 강조는 독립 실행에서만. 실제 진행 데이터 모드에서는 홈의 NEXT GOAL과 어긋나므로 표시하지 않습니다.
      const isNextGoal = !this.hooks.ownedBikeIds && bike.id === 'trail-mtb' && !bike.owned;
      this.add.rectangle(x, y, 86, 68, bike.owned ? 0xffe6a8 : 0x6a4a3a)
        .setStrokeStyle(3, isSelected ? P.gold : isNextGoal ? P.red : bike.owned ? P.wood : 0x4a3328)
        .setDepth(isSelected ? 6 : 5)
        .setInteractive({ useHandCursor: true })
        .on('pointerdown', () => {
          this.selected = bike.id;
          // 신규 해금 자전거를 확인하면 NEW 표시를 해제하고 컨트롤러에 알린다
          if (this.newIds.delete(bike.id)) this.hooks.onBikeSeen?.(bike.id);
          this.render();
        });
      // 도감 상태 3단계 (#221): 완성(보유) → 컬러, 등록(제작 가능) → 컬러+제작 태그, 미등록 → 실루엣+이해도
      const isRegistered = bike.owned || this.registeredIds.has(bike.id);
      const progress = this.understanding[bike.id] ?? (isRegistered ? 100 : 0);
      if (isRegistered && this.newIds.has(bike.id)) {
        this.add.rectangle(x + 26, y - 24, 34, 15, P.red).setStrokeStyle(2, P.ink).setDepth(8);
        this.label(x + 26, y - 24, 'NEW', 9, '#fff1c6', true).setOrigin(.5).setDepth(9);
      }
      this.add.circle(x - 33, y - 24, 4, GRADE_COLOR[bike.grade]).setStrokeStyle(1, P.ink).setDepth(7);
      // 24칸을 동시에 그리므로 Graphics 대신 텍스처 캐시 경로(addPixelBikeImage)를 사용합니다.
      if (isRegistered) {
        addPixelBikeImage(this, x, y + 4, 1, {
          category: bikeCategoryFromKorean(bike.category), colorway: makeWarmColorway(bike.color), depth: 7,
        });
      } else {
        addPixelBikeImage(this, x, y + 4, 1, {
          category: bikeCategoryFromKorean(bike.category), silhouette: { body: 0x8a6a52, ink: 0x4a3328 }, depth: 7,
        });
      }
      if (!bike.owned) {
        const cellTag = isRegistered ? '제작 가능' : progress > 0 ? `${progress}%` : isNextGoal ? 'NEXT' : '?';
        const cellColor = isRegistered ? '#a16028' : progress > 0 ? '#3f7851' : isNextGoal ? '#f4b84a' : '#c9a98c';
        this.label(x, y + 21, cellTag, 9, cellColor, true).setOrigin(.5).setDepth(7);
      }
    });

    const target = this.bikes.find((bike) => bike.id === this.selected)!;
    const targetRegistered = target.owned || this.registeredIds.has(target.id);
    const targetProgress = this.understanding[target.id] ?? (targetRegistered ? 100 : 0);
    // 상세 카드(615–689)는 그리드 마지막 줄(~610) 아래, 하단 안내 바(705~) 위에 두어 겹치지 않게 합니다.
    this.pixelRect(195, 652, 366, 74, P.paper, P.ink, 8);
    this.label(28, 626, `${target.category} · ${target.grade}`, 9, '#8e5136', true).setDepth(9);
    this.label(28, 640, targetRegistered ? target.name : `??? ${target.name}`, 14, targetRegistered ? '#3b2531' : '#7b5140', true).setDepth(9);
    // 상태별 안내 (#221): 완성=보유 중, 등록=제작 가능, 미등록=이해도 진행 표시 (실데이터 모드)
    // 실데이터 모드의 보유 문구는 카탈로그 샘플 hint(진행과 무관한 프로토타입 문구) 대신 중립 문구를 씁니다.
    // 문구는 오른쪽 버튼(x≈266~) 왼쪽 가용 폭 ≈238px 안에 11px 한 줄로 들어오도록 짧게 유지합니다.
    const targetStatus = target.owned
      ? (this.hooks.ownedBikeIds ? '보유 중 · 전시·성장이 가능합니다' : `보유 중 · ${target.hint}`)
      : targetRegistered
        ? '도감 등록 · 부품을 조립해 제작할 수 있습니다'
        : this.hooks.ownedBikeIds
          ? `이해도 ${targetProgress}% · 주문 납품으로 학습하세요`
          : target.hint;
    this.label(28, 662, targetStatus, 11, target.owned ? '#3f7851' : targetRegistered ? '#a16028' : '#a14a38', true).setDepth(9);
    if (target.owned) {
      this.button(322, 652, 108, 44, '상세·성장\n보기', () => {
        this.hooks.onSfx?.('tap');
        if (this.hooks.onBikeDetail) this.hooks.onBikeDetail(target.id);
        else { this.mode = 'warm-dream-growth'; this.render(); }
      }, true);
    } else if (targetRegistered) {
      // 등록·미완성: 제작 모드로 진입 (#222)
      this.button(322, 652, 108, 44, '제작하기', () => {
        this.hooks.onSfx?.('tap');
        if (this.hooks.onBikeDetail) this.hooks.onBikeDetail(target.id);
        else { this.mode = 'warm-dream-growth'; this.render(); }
      }, true);
    } else if (this.hooks.ownedBikeIds) {
      // 실제 진행 데이터 모드: 상세 보기 하나만 두므로 터치 영역 44px로 키웁니다.
      this.button(322, 652, 108, 44, '상세 보기', () => {
        this.hooks.onSfx?.('tap');
        if (this.hooks.onBikeDetail) this.hooks.onBikeDetail(target.id);
        else { this.mode = 'warm-dream-growth'; this.render(); }
      });
    } else {
      this.button(322, 636, 108, 28, '상세 보기', () => {
        this.hooks.onSfx?.('tap');
        if (this.hooks.onBikeDetail) this.hooks.onBikeDetail(target.id);
        else { this.mode = 'warm-dream-growth'; this.render(); }
      });
      // 독립 실행에서만 제공하는 획득 체험 버튼. 실제 진행 데이터 모드는 위 분기에서 처리되어 여기로 오지 않습니다 (#201)
      this.button(322, 669, 108, 28, '획득 미리보기', () => {
        target.owned = true;
        this.hooks.onSfx?.('reward');
        this.notify(`${target.name} 획득! 도감 ${this.ownedCount()} / 24 달성.`);
      });
    }
  }

  // 전시 모드: 전시대 배치 + 보관 선반
  private renderShowcase() {
    this.add.rectangle(195, 302, 390, 344, 0xd79a63);
    this.add.rectangle(195, 500, 390, 52, P.floor);
    for (let x = 30; x < 390; x += 72) this.add.line(0, 0, x, 474, x - 8, 526, P.darkWood, .22).setOrigin(0);

    // cell: 픽셀 스프라이트 한 칸 px (메인 전시대는 크게, 보조 전시대는 작게). name은 안내 문구용 한국어 이름.
    // tagY: 전시대 이름 태그 y — 보조 전시대는 메인 자전거 이름 태그(~356)와 붙지 않게 384에 둡니다.
    const stands = [
      { x: 195, y: 268, scale: .68, cell: 2.5, deckY: 322, deckW: 196, tagY: 180, tag: 'MAIN DISPLAY', name: '메인 전시대' },
      { x: 100, y: 428, scale: .4, cell: 1.5, deckY: 462, deckW: 124, tagY: 384, tag: 'DISPLAY 02', name: '2번 전시대' },
      { x: 290, y: 428, scale: .4, cell: 1.5, deckY: 462, deckW: 124, tagY: 384, tag: 'DISPLAY 03', name: '3번 전시대' },
    ];
    stands.forEach((stand, index) => {
      const bikeId = this.showcaseSlots[index];
      const bike = bikeId ? this.bikes.find((item) => item.id === bikeId)! : undefined;
      // 밝은 벽 위의 크림색 글자는 흐릿하므로 진한 배경 태그로 표시합니다.
      this.tag(stand.x, stand.tagY, stand.tag, 9, 3);
      this.add.ellipse(stand.x, stand.deckY + 12, stand.deckW * .86, 14, 0x6e473b, .3).setDepth(2);
      this.add.rectangle(stand.x, stand.deckY, stand.deckW, 10, P.darkWood).setStrokeStyle(2, P.ink).setDepth(3);
      if (bike) {
        // 바퀴 하단(y + 10*cell)이 deckY에 닿도록 y를 역산해 배치
        drawPixelBike(this, stand.x, stand.deckY - 10 * stand.cell, stand.cell, {
          category: bikeCategoryFromKorean(bike.category), colorway: makeWarmColorway(bike.color), depth: 4,
        });
        this.tag(stand.x, stand.deckY + 24, `${bike.name} · ${bike.grade}`, 10, 4);
      } else {
        this.label(stand.x, stand.y + 8, '+', 26, '#fff1c6', true).setOrigin(.5).setDepth(4).setAlpha(.8);
        this.tag(stand.x, stand.deckY + 24, '빈 전시대', 10, 4);
      }
      this.add.rectangle(stand.x, stand.y + 10, stand.deckW, 130 * stand.scale + 70, 0xffffff, .001)
        .setDepth(6).setInteractive({ useHandCursor: true }).on('pointerdown', () => {
          const chosen = this.bikes.find((item) => item.id === this.selected);
          if (!chosen?.owned) { this.notify('보관 선반에서 보유 자전거를 먼저 선택하세요.'); return; }
          this.showcaseSlots[index] = chosen.id;
          this.hooks.onShowcaseChange?.([...this.showcaseSlots]);
          this.notify(`${chosen.name}을(를) ${stand.name}에 전시했습니다.`);
        });
    });

    // 보관 선반은 2줄 × 4칸 = 8대까지만 그립니다 (3번째 줄은 안내 바(705)·탭 뒤에 가려지므로 두지 않음).
    // 8대를 넘는 자전거는 오른쪽 `+n대 더 ▸` 표시로 요약하고, 누르면 다음 8대로 넘어갑니다.
    const SHELF_CAPACITY = 8;
    const owned = this.bikes.filter((bike) => bike.owned);
    const pageCount = Math.max(1, Math.ceil(owned.length / SHELF_CAPACITY));
    this.shelfPage = Math.min(this.shelfPage, pageCount - 1);
    const shelf = owned.slice(this.shelfPage * SHELF_CAPACITY, (this.shelfPage + 1) * SHELF_CAPACITY);
    this.label(24, 548, `보관 선반 · 보유 ${owned.length}종`, 11, '#5d3b34', true);
    if (pageCount > 1) {
      const remaining = owned.length - (this.shelfPage + 1) * SHELF_CAPACITY;
      const pageLabel = remaining > 0 ? `+${remaining}대 더 ▸` : `◂ 처음 ${SHELF_CAPACITY}대`;
      const text = this.label(366, 554, pageLabel, 10, '#a16028', true).setOrigin(1, .5).setDepth(6);
      // 터치 영역(높이 30: 537~567)은 글자보다 넓게 두되 첫 줄 선반 칸 상단(567.5)과는 겹치지 않게 합니다.
      this.add.rectangle(366 - text.width / 2, 552, text.width + 24, 30, 0xffffff, .001).setDepth(6)
        .setInteractive({ useHandCursor: true })
        .on('pointerdown', () => { this.hooks.onSfx?.('tap'); this.shelfPage = (this.shelfPage + 1) % pageCount; this.render(); });
    }
    shelf.forEach((bike, index) => {
      const x = 60 + (index % 4) * 90;
      // 2줄(600·668, 칸 높이 62)이 안내 바 상단(705) 위에 들어오도록 간격 68
      const y = 600 + Math.floor(index / 4) * 68;
      const active = this.selected === bike.id;
      this.add.rectangle(x, y, 86, 62, active ? P.gold : 0xffe6a8)
        .setStrokeStyle(3, active ? P.ink : P.wood).setDepth(5)
        .setInteractive({ useHandCursor: true })
        .on('pointerdown', () => { this.selected = bike.id; this.notify(`${bike.name} 선택 · 전시대를 눌러 배치하세요.`); });
      // 보관 선반은 보유 자전거만 표시하므로 실루엣 없이 컬러 스프라이트로 그림 (다수 표시라 텍스처 캐시 경로)
      addPixelBikeImage(this, x, y, 1, {
        category: bikeCategoryFromKorean(bike.category), colorway: makeWarmColorway(bike.color), depth: 6,
      });
      this.label(x, y + 17, bike.name.length > 8 ? bike.name.slice(0, 8) : bike.name, 9, '#3b2531', true).setOrigin(.5).setDepth(6);
    });
  }

  // 성장 모드: 한 대 집중 성장 + 파츠 강화. 등록·미완성 자전거는 제작 모드로 전환 (#222)
  private renderDreamGrowth() {
    const selectedBike = this.bikes.find((bike) => bike.id === this.selected);
    if (this.hooks.ownedBikeIds && selectedBike && !selectedBike.owned && this.registeredIds.has(selectedBike.id)) {
      this.renderCrafting(selectedBike);
      return;
    }
    // 미등록 자전거는 성장·제작 불가: 이해도 학습 안내만 표시 (#223)
    if (this.hooks.ownedBikeIds && selectedBike && !selectedBike.owned && !this.registeredIds.has(selectedBike.id)) {
      const progress = this.understanding[selectedBike.id] ?? 0;
      this.label(24, 129, 'LOCKED BIKE', 9, '#6e473b', true);
      this.label(24, 144, `??? ${selectedBike.name}`, 15, '#7b5140', true);
      this.add.ellipse(195, 344, 220, 28, 0x6e473b, .28).setDepth(1);
      addPixelBikeImage(this, 195, 300, 3, {
        category: bikeCategoryFromKorean(selectedBike.category), silhouette: { body: 0x8a6a52, ink: 0x4a3328 }, depth: 2,
      });
      this.label(195, 400, `이해도 ${progress}%`, 14, '#3f7851', true).setOrigin(.5);
      this.add.rectangle(24, 428, 342, 10, P.darkWood).setOrigin(0, .5);
      if (progress > 0) this.add.rectangle(24, 428, 342 * progress / 100, 10, P.green).setOrigin(0, .5);
      this.label(195, 456, '주문을 납품해 이해도 100%를 달성하면 도감에 등록됩니다', 10, '#5d3b34', true).setOrigin(.5);
      return;
    }
    const total = Object.values(this.dreamStats).reduce((sum, value) => sum + value, 0);
    const stage = total >= 10 ? 3 : total >= 7 ? 2 : 1;
    const gradeName = stage === 3 ? '드림' : stage === 2 ? '고급' : '중급';
    const dream = this.bikes.find((bike) => bike.id === this.selected) ?? this.bikes.find((bike) => bike.id === 'dream-road')!;

    this.label(24, 129, 'MY DREAM BIKE', 9, '#6e473b', true);
    this.label(24, 144, dream.name, 15, '#3b2531', true);
    this.pixelRect(340, 150, 84, 30, stage === 3 ? P.gold : 0xffe6a8, stage === 3 ? P.red : P.wood, 5);
    this.label(340, 150, `${gradeName} 등급`, 11, stage === 3 ? '#a14a38' : '#5d3b34', true).setOrigin(.5).setDepth(6);

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
    this.label(24, 371, `드림 등급까지 성장 ${growth}%`, 11, '#5d3b34', true);
    this.add.rectangle(24, 394, 342, 10, P.darkWood).setOrigin(0, .5);
    this.add.rectangle(24, 394, 342 * Math.min(1, (total - 3) / 9), 10, P.green).setOrigin(0, .5);

    (Object.keys(this.dreamStats) as Array<keyof typeof this.dreamStats>).forEach((key, index) => {
      const level = this.dreamStats[key];
      const y = 450 + index * 78;
      const cost = dreamUpgradeCost(level); // 강화 비용 규칙 단일 출처 (#203)
      this.pixelRect(195, y, 350, 64, 0xffe6a8, P.wood, 5);
      this.label(40, y - 22, key, 12, '#3b2531', true).setDepth(6);
      for (let dot = 0; dot < 4; dot++) {
        this.add.circle(48 + dot * 26, y + 12, 8, dot < level ? dream.color : 0xd8b98a).setStrokeStyle(2, P.wood).setDepth(6);
      }
      this.label(160, y + 4, `Lv.${level} / 4`, 11, level === 4 ? '#a16028' : '#7b5140', true).setDepth(6);
      // 버튼 높이 44(터치 규칙): 카드 64 안에서 그림자(y+26)까지 테두리 안쪽(y+30.5)에 들어옵니다
      if (level < 4) this.button(300, y, 104, 44, `강화 ${cost}`, () => {
        // 통합 모드: 코인 차감·강화 반영·저장을 컨트롤러가 하나의 처리로 수행하고 결과만 표시한다 (#203)
        if (this.hooks.onDreamUpgrade) {
          const result = this.hooks.onDreamUpgrade(key);
          this.coins = result.coins;
          this.dreamStats = { ...result.stats };
          if (!result.ok) {
            this.hooks.onSfx?.('error');
            this.notify(result.reason === 'max' ? '이미 최대 단계입니다.'
              : result.reason === 'not-crafted' ? '부품 제작을 완료해 자전거를 완성한 뒤 성장할 수 있습니다.'
              : '코인이 부족합니다. 주문을 완료해 급여를 받으세요.');
            return;
          }
          this.hooks.onSfx?.('reward');
          const nextTotal = Object.values(this.dreamStats).reduce((sum, value) => sum + value, 0);
          const unlocked = result.dreamUnlockedBikeNames ?? [];
          this.notify(unlocked.length > 0 ? `드림 등급 달성! ${unlocked.join(' · ')} 도감 등록 · 제작할 수 있어요.`
            : result.stageUp && nextTotal >= 10 ? '드림 등급 달성! 나만의 드림 바이크 완성.'
            : result.stageUp ? '고급 등급 달성! 외형 강조가 추가됐습니다.'
            : `${key} 강화 완료 · 남은 코인 ${this.coins.toLocaleString()}`);
          return;
        }
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
  }

  // 제작 모드 (#222): 급여로 부품을 하나씩 장착해 자전거를 완성한다
  private renderCrafting(target: DesignBike) {
    const installed = this.craftParts[target.id] ?? [];
    const isInstalled = (type: CraftPartType) => installed.includes(type);

    this.label(24, 129, 'BIKE CRAFTING', 9, '#6e473b', true);
    this.label(24, 144, `${target.name} 만들기`, 15, '#3b2531', true);
    this.pixelRect(340, 150, 84, 30, 0xffe6a8, P.wood, 5);
    this.label(340, 150, `조립 ${installed.length} / ${CRAFT_PARTS.length}`, 11, '#5d3b34', true).setOrigin(.5).setDepth(6);

    // 미장착 부품은 반투명으로 표시해 무엇이 비었는지 보여준다
    this.add.ellipse(195, 344, 220, 28, 0x6e473b, .28).setDepth(1);
    drawPixelBike(this, 195, 300, 3, {
      category: bikeCategoryFromKorean(target.category),
      colorway: makeWarmColorway(target.color),
      depth: 2,
      partAlpha: {
        frame: isInstalled('frame') ? 1 : 0.3,
        wheel: isInstalled('wheel') ? 1 : 0.3,
        drivetrain: isInstalled('drivetrain') ? 1 : 0.3,
        handlebar: isInstalled('handlebar') ? 1 : 0.3,
      },
    });

    this.label(24, 371, `완성까지 부품 ${CRAFT_PARTS.length - installed.length}개 · 급여로 장착하세요`, 11, '#5d3b34', true);
    this.add.rectangle(24, 394, 342, 10, P.darkWood).setOrigin(0, .5);
    if (installed.length > 0) this.add.rectangle(24, 394, 342 * installed.length / CRAFT_PARTS.length, 10, P.green).setOrigin(0, .5);

    CRAFT_PARTS.forEach((part, index) => {
      // 카드 60 × 간격 68: 44 버튼(그림자 y+26)이 테두리 안쪽(y+28.5)에 들어오고, 마지막 카드 하단은 676
      const y = 442 + index * 68;
      const done = isInstalled(part.type);
      // 제작 비용은 자전거 등급 배수를 적용한 값(레벨 디자인 데이터)이 단일 출처
      const cost = craftPartCost(target.id, part.type);
      this.pixelRect(195, y, 350, 60, done ? 0xdff0d0 : 0xffe6a8, P.wood, 5);
      this.label(40, y - 18, part.name, 12, '#3b2531', true).setDepth(6);
      this.label(40, y + 2, done ? '장착 완료' : `비용 ${cost.toLocaleString()}코인`, 11, done ? '#3f7851' : '#7b5140', true).setDepth(6);
      if (done) {
        this.label(330, y, '✓', 16, '#3f7851', true).setOrigin(.5).setDepth(6);
        return;
      }
      this.button(300, y, 104, 44, `장착 ${cost}`, () => {
        if (!this.hooks.onCraftPart) return;
        const result = this.hooks.onCraftPart(target.id, part.type);
        this.coins = result.coins;
        this.craftParts[target.id] = [...result.installedParts];
        if (!result.ok) {
          this.hooks.onSfx?.('error');
          this.notify(result.reason === 'coins' ? '코인이 부족합니다. 주문을 완료해 급여를 받으세요.' : '지금은 장착할 수 없습니다.');
          return;
        }
        this.hooks.onSfx?.('reward');
        if (result.completed) {
          // 완성 승격: 보유 상태로 바꾸고 성장 화면으로 전환된다
          target.owned = true;
          this.notify(`${target.name} 완성! Garage에 보유되어 전시·성장이 가능합니다.`);
          return;
        }
        this.notify(`${part.name} 장착 완료 · 남은 코인 ${this.coins.toLocaleString()}`);
      });
    });

    // 마지막 부품 카드 하단(676)과 안내 바(705) 사이에 배치
    this.label(195, 690, '부품 4종을 모두 장착하면 완성되어 전시·성장이 열립니다', 10, '#7b5140', true).setOrigin(.5);
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
