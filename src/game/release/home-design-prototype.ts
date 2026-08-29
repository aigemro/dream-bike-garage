import Phaser from 'phaser';
import { DuskWorkshopGarageScene } from './home-design-dusk-workshop';
import { RetroPixelGarageScene } from './home-design-retro-pixel';
import { ModernCasualGarageScene } from './home-design-modern-casual';
import { drawPixelBike, makeWarmColorway, bikeCategoryFromKorean } from './bike-pixel-sprite';

export type HomeDesignPrototypeMode =
  | 'warm-pixel-garage'
  | 'dusk-workshop-garage'
  | 'retro-pixel-garage'
  | 'modern-casual-garage';

// 릴리스 통합용 실제 진행 데이터 (#205): 지정 시 홈 화면의 고정 문구·샘플 숫자를 대체합니다.
export type HomeProgressData = {
  ownedCount: number;
  catalogSize: number;
  orderName: string;
  orderCategory: 'road' | 'mtb' | 'gravel' | 'minivelo' | 'city';
  orderReward: number;
  // NEXT GOAL 표기: 제목 줄과 남은 조건 안내 줄
  nextGoalLabel: string;
  nextGoalHint: string;
  // Garage 성장 게이지 (0~100)
  growthPercent: number;
  // 컬렉션에서 선택한 대표 자전거(완성 자전거)와 성장 상태 반영 — 클릭 시 성장 화면 진입 (#223)
  heroBike: {
    id: string;
    name: string;
    category: '로드' | 'MTB' | '그래블' | '미니벨로';
    color: number;
    grade: string;
    stage: 1 | 2 | 3;
  };
  // 제작 중 자전거 (#222): 있으면 Garage에 만들기 버튼이 열린다
  craft?: {
    bikeId: string;
    bikeName: string;
    installedCount: number;
    totalParts: number;
  };
};

export type HomeDesignHooks = {
  coins?: number;
  completedOrders?: number;
  progress?: HomeProgressData;
  dayNumber?: number;
  dayRemainingMs?: number;
  dayStatusLabel?: string;
  onPlay?: () => void;
  onCollection?: () => void;
  onShowcase?: () => void;
  onProfile?: () => void;
  onSettings?: () => void;
  // 제작 중 자전거 만들기 진입 (#222)
  onCraft?: (bikeId: string) => void;
  // Garage 대표 자전거 클릭 → 성장 화면 진입 (#223)
  onHeroBike?: (bikeId: string) => void;
  onSfx?: (event: 'tap') => void;
};

const P = {
  ink: 0x3b2531, cream: 0xfff1c6, paper: 0xf6d995, wood: 0x8e5136,
  darkWood: 0x573044, floor: 0xb66f45, green: 0x5e9a67, leaf: 0x86ba6f,
  sky: 0x86c9c8, blue: 0x4e8092, gold: 0xf4b84a, red: 0xc95746, tire: 0x302936,
};

class WarmPixelGarageScene extends Phaser.Scene {
  private playing = false;
  private toast = '오늘의 주문을 확인하고 작업을 시작해 보세요.';

  constructor(private readonly hooks: HomeDesignHooks = {}) { super('home-design-warm-pixel-garage'); }
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
    this.label(x, y, text, primary ? 16 : 10, '#3b2531', true).setOrigin(.5).setAlign('center').setDepth(22)
      .setInteractive({ useHandCursor: true }).on('pointerdown', action);
    void shadow;
    return box;
  }

  private render() {
    this.children.removeAll();
    this.add.rectangle(195, 405, 390, 810, P.cream);
    this.playing ? this.renderPlayPreview() : this.renderGarageHome();
  }

  private renderGarageHome() {
    // 실제 진행 데이터가 있으면 고정 문구·샘플 숫자 대신 메타 루프 상태를 표시한다 (#205)
    const progress = this.hooks.progress;
    this.renderWorkshop();
    this.renderTopBar();

    this.pixelRect(195, 125, 238, 60, P.paper, P.ink, 10);
    this.label(88, 101, 'TODAY\'S ORDER', 9, '#6e473b', true).setDepth(11);
    this.label(88, 119, progress?.orderName ?? '통학용 어반 바이크', 14, '#3b2531', true).setDepth(11);
    this.label(88, 140, `완료 ${this.hooks.completedOrders ?? 0}건  ·  보상 ${(progress?.orderReward ?? 1000).toLocaleString()}`, 10, '#8e5136', true).setDepth(11);
    // 주문 미리보기: 오늘의 주문 카테고리에 맞춘 자전거 픽셀 스프라이트.
    // 카드(중심 y=125, 높이 60 → 95~155) 안에 들어오도록 cell 1.2 사용: 세로 108~143px, 가로 폭 약 65px로 카드 우측 변까지 딱 맞음
    drawPixelBike(this, 282, 131, 1.2, { category: this.hooks.progress?.orderCategory ?? 'city', colorway: makeWarmColorway(P.red), depth: 12 });

    // 준비 중 스텁 버튼(이벤트·랭킹·조립·직급)은 디자인 비교용 독립 데모에서만 노출한다
    if (!progress) {
      this.button(38, 205, 54, 48, 'EVENT\n3', () => this.notify('이벤트 준비 중'));
      this.button(38, 263, 54, 48, 'RANK\n#18', () => this.notify('랭킹 준비 중'));
    }
    this.button(352, 205, 54, 48, '전시\n보기', () => {
      this.hooks.onSfx?.('tap');
      this.hooks.onShowcase ? this.hooks.onShowcase() : this.notify('Garage 전시 화면');
    });
    if (!progress) {
      this.button(352, 263, 54, 48, '조립\n2/4', () => this.notify('조립 현황'));
      this.button(352, 321, 54, 48, 'STATUS\nLv.12', () => this.notify('견습 정비사 Lv.12'));
    }
    // 제작 중 자전거가 있으면 Garage에 만들기 버튼이 열린다 (#222)
    if (progress?.craft) {
      const craft = progress.craft;
      this.button(352, 263, 54, 48, `만들기\n${craft.installedCount}/${craft.totalParts}`, () => {
        this.hooks.onSfx?.('tap');
        this.hooks.onCraft ? this.hooks.onCraft(craft.bikeId) : this.notify(`${craft.bikeName} 제작 중`);
      }, true);
    }

    this.pixelRect(195, 387, 254, 430, 0xf2c77e, P.ink, 7).setAlpha(.88);
    this.label(82, 183, 'MY LITTLE GARAGE', 10, '#6e473b', true).setDepth(13);
    this.label(82, 202, progress?.heroBike.name ?? '나의 드림 로드바이크', 17, '#3b2531', true).setDepth(13);
    this.label(82, 226, progress ? `${progress.heroBike.grade} 등급 · 급여로 한 단계씩 성장 중` : '햇살 아래 한 단계씩 완성 중', 10, '#7b5140').setDepth(13);
    // 정비 매트 + 그림자 위에 64×40 그리드 픽셀 스프라이트 로드바이크를 배치
    // (cell 4 → 폭 약 216px, 바퀴 하단 = y + 10*cell = 412로 매트 상단(410)에 닿음)
    this.add.rectangle(195, 416, 240, 12, 0x9c5b3c).setStrokeStyle(2, P.darkWood).setDepth(12);
    this.add.ellipse(195, 419, 218, 26, 0x6e473b, .28).setDepth(12);
    const heroCategory = progress ? bikeCategoryFromKorean(progress.heroBike.category) : 'road';
    const heroColor = progress?.heroBike.color ?? P.red;
    // 드림 등급(3단계) 달성 시 C안과 같은 골드 링, 2단계부터 강화 반짝임을 표시해 성장 상태를 홈에서도 보여준다
    if (progress && progress.heroBike.stage >= 3) this.add.circle(195, 350, 122, P.gold, .14).setStrokeStyle(3, P.gold).setDepth(12);
    drawPixelBike(this, 195, 372, 4, { category: heroCategory, colorway: makeWarmColorway(heroColor), depth: 13 });
    if (progress && progress.heroBike.stage >= 2) {
      [[112, 300], [270, 286], [252, 392]].forEach(([sx, sy]) => this.add.rectangle(sx, sy, 5, 5, P.gold).setDepth(14));
    }
    if (progress) {
      this.pixelRect(300, 202, 78, 26, progress.heroBike.stage >= 3 ? P.gold : 0xffe6a8, P.wood, 13);
      this.label(300, 202, `${progress.heroBike.grade} 등급`, 10, progress.heroBike.stage >= 3 ? '#a14a38' : '#5d3b34', true).setOrigin(.5).setDepth(14);
      // 대표 자전거 클릭 → 성장 화면 진입 (#223)
      this.label(195, 246, '▼ 자전거를 눌러 성장', 9, '#a14a38', true).setOrigin(.5).setDepth(14);
      this.add.rectangle(195, 350, 240, 150, 0xffffff, 0.001)
        .setDepth(15).setInteractive({ useHandCursor: true })
        .on('pointerdown', () => {
          this.hooks.onSfx?.('tap');
          this.hooks.onHeroBike ? this.hooks.onHeroBike(progress.heroBike.id) : this.notify(`${progress.heroBike.name} 성장 화면`);
        });
    }

    this.pixelRect(195, 478, 222, 72, 0xffe6a8, P.wood, 13);
    this.label(98, 454, 'COLLECTION', 8, '#7b5140', true).setDepth(14);
    this.label(98, 471, progress ? `${progress.ownedCount} / ${progress.catalogSize}` : '8 / 24', 17, '#3b2531', true).setDepth(14);
    this.label(192, 454, 'NEXT GOAL', 8, '#7b5140', true).setDepth(14);
    this.label(192, 471, progress?.nextGoalLabel ?? 'TRAIL MTB', 12, '#3b2531', true).setDepth(14);
    this.label(192, 490, progress?.nextGoalHint ?? '주문 2건 남음', 9, '#a14a38', true).setDepth(14);

    const growthPercent = progress ? Math.max(0, Math.min(100, progress.growthPercent)) : 33;
    this.add.rectangle(195, 526, 212, 10, P.darkWood).setDepth(13);
    if (growthPercent > 0) this.add.rectangle(89 + 212 * growthPercent / 100 / 2, 526, 212 * growthPercent / 100, 10, P.green).setDepth(14);
    this.label(195, 544, `Garage 성장 ${growthPercent}%`, 9, '#5d3b34', true).setOrigin(.5).setDepth(14);

    this.pixelRect(195, 592, 310, 50, 0xfff1c6, P.wood, 14);
    this.label(195, 592, this.toast, 10, '#5d3b34', true).setOrigin(.5).setDepth(15);

    this.pixelRect(195, 744, 366, 82, P.wood, P.ink, 18);
    this.button(67, 741, 80, 48, progress ? '프로필' : '프로필\nLv.12', () => { this.hooks.onSfx?.('tap'); this.hooks.onProfile ? this.hooks.onProfile() : this.notify('견습 정비사 프로필'); });
    this.button(195, 738, 150, 58, '▶  PLAY', () => { this.hooks.onSfx?.('tap'); if (this.hooks.onPlay) this.hooks.onPlay(); else { this.playing = true; this.render(); } }, true);
    this.button(323, 741, 80, 48, progress ? `자전거\n${progress.ownedCount}/${progress.catalogSize}` : '자전거\n8/24', () => { this.hooks.onSfx?.('tap'); this.hooks.onCollection ? this.hooks.onCollection() : this.notify('자전거 도감'); });
    this.label(195, 793, 'DREAM BIKE GARAGE · WARM PIXEL HOME', 8, '#fff1c6', true).setOrigin(.5).setDepth(22);
  }

  private renderWorkshop() {
    this.add.rectangle(195, 274, 390, 548, 0xd79a63);
    // 벽 판재 결: 낮은 대비의 가로선으로 목재 벽의 질감을 만듭니다
    for (let y = 96; y < 548; y += 46) this.add.line(0, 0, 0, y, 390, y, P.darkWood, .08).setOrigin(0);
    this.add.rectangle(195, 632, 390, 168, P.floor);
    for (let y = 574; y < 710; y += 34) this.add.line(0, 0, 0, y, 390, y, P.darkWood, .35).setOrigin(0);
    for (let x = 16; x < 390; x += 58) this.add.line(0, 0, x, 574, x - 14, 710, P.darkWood, .22).setOrigin(0);

    // 창: 이중 프레임 + 해·구름·나무가 있는 창밖 풍경과 창턱 화분
    this.pixelRect(195, 260, 214, 210, 0x6a3e36, P.darkWood, 1);
    this.pixelRect(195, 254, 184, 172, P.sky, P.cream, 2);
    this.add.circle(140, 208, 15, P.gold).setStrokeStyle(3, 0xffe6a8).setDepth(3);
    [[236, 196, 15], [252, 200, 12], [222, 201, 11]].forEach(([x, y, r]) => this.add.ellipse(x, y, r * 2.4, r * 1.5, P.cream, .92).setDepth(3));
    this.add.rectangle(195, 300, 180, 78, 0x8fc975).setDepth(3);
    this.add.rectangle(195, 268, 180, 10, 0xb9dd9a).setDepth(3);
    this.add.triangle(150, 292, 95, 335, 150, 266, 205, 335, 0x5e9a67).setDepth(3);
    this.add.triangle(246, 293, 198, 335, 248, 258, 300, 335, 0x4f8060).setDepth(3);
    this.add.rectangle(150, 300, 8, 26, 0x6a4a30).setDepth(3);
    this.add.rectangle(195, 254, 8, 172, P.cream).setDepth(4);
    this.add.rectangle(195, 254, 184, 8, P.cream).setDepth(4);
    this.add.rectangle(146, 352, 18, 12, P.wood).setStrokeStyle(2, P.ink).setDepth(5);
    this.add.circle(141, 342, 6, P.leaf).setStrokeStyle(2, P.ink).setDepth(5);
    this.add.circle(151, 340, 5, P.green).setStrokeStyle(2, P.ink).setDepth(5);

    // 공구 벽: 페그보드 점 + 실루엣이 다른 공구 4종(렌치·드라이버·망치·오일캔)
    this.pixelRect(54, 386, 74, 250, P.darkWood, P.ink, 4);
    for (let py = 300; py <= 490; py += 24) for (let px = 32; px <= 78; px += 23) this.add.circle(px, py, 1.6, 0x3f2231).setDepth(5);
    this.label(54, 282, 'TOOLS', 9, '#fff1c6', true).setOrigin(.5).setDepth(5);
    this.drawWrench(38, 336, 5);
    this.drawScrewdriver(70, 336, 5);
    this.drawHammer(38, 428, 5);
    this.drawOilCan(70, 430, 5);

    // 주문 게시판: 압정으로 고정된 메모, 가운데 메모는 살짝 기울임
    this.pixelRect(337, 450, 78, 120, 0x6d8b62, P.ink, 4);
    this.label(337, 411, 'ORDERS', 9, '#fff1c6', true).setOrigin(.5).setDepth(5);
    [0, 1, 2].forEach((i) => {
      const note = this.add.rectangle(337, 440 + i * 31, 54, 21, 0xffe8ad).setStrokeStyle(2, P.wood).setDepth(5);
      if (i === 1) note.setAngle(-4);
      this.add.circle(337, 432 + i * 31, 2.5, i === 2 ? P.red : P.gold).setStrokeStyle(1, P.ink).setDepth(6);
      this.add.line(0, 0, 316, 443 + i * 31, 352, 443 + i * 31, P.wood, .8).setOrigin(0).setDepth(6);
    });

    // 생활 소품: 화분, 기대 놓은 타이어, 공구 상자
    this.add.rectangle(27, 555, 26, 64, P.wood).setStrokeStyle(3, P.ink).setDepth(5);
    this.add.circle(27, 518, 28, P.leaf).setStrokeStyle(3, P.ink).setDepth(5);
    this.add.circle(45, 529, 22, P.green).setStrokeStyle(3, P.ink).setDepth(5);
    this.add.circle(30, 652, 17, 0x00000, 0).setStrokeStyle(9, P.tire).setDepth(5);
    this.add.circle(30, 652, 6, P.floor).setStrokeStyle(3, P.cream).setDepth(6);
    this.drawToolbox(360, 655, 6);
  }

  // 벽걸이 렌치: 손잡이 막대 + 홈이 파인 머리
  private drawWrench(x: number, y: number, depth: number) {
    this.add.rectangle(x, y + 10, 8, 30, 0xa39985).setStrokeStyle(2, P.ink).setDepth(depth);
    this.add.rectangle(x, y - 8, 16, 12, 0xa39985).setStrokeStyle(2, P.ink).setDepth(depth);
    this.add.rectangle(x, y - 11, 6, 7, P.darkWood).setDepth(depth + 1);
  }

  // 드라이버: 빨간 손잡이 + 금속 축
  private drawScrewdriver(x: number, y: number, depth: number) {
    this.add.rectangle(x, y - 8, 10, 18, P.red).setStrokeStyle(2, P.ink).setDepth(depth);
    this.add.rectangle(x, y + 12, 4, 22, 0xa39985).setStrokeStyle(1, P.ink).setDepth(depth);
  }

  // 망치: 나무 손잡이 + 넓은 머리
  private drawHammer(x: number, y: number, depth: number) {
    this.add.rectangle(x, y + 8, 7, 30, P.paper).setStrokeStyle(2, P.ink).setDepth(depth);
    this.add.rectangle(x, y - 10, 20, 11, P.tire).setStrokeStyle(2, P.ink).setDepth(depth);
  }

  // 오일캔: 초록 몸통 + 주둥이와 라벨
  private drawOilCan(x: number, y: number, depth: number) {
    this.add.rectangle(x, y + 4, 18, 22, P.green).setStrokeStyle(2, P.ink).setDepth(depth);
    this.add.rectangle(x - 2, y - 10, 6, 8, 0xa39985).setStrokeStyle(2, P.ink).setDepth(depth);
    this.add.rectangle(x + 7, y - 13, 10, 4, 0xa39985).setStrokeStyle(1, P.ink).setDepth(depth).setAngle(-30);
    this.add.rectangle(x, y + 5, 10, 8, P.cream).setDepth(depth + 1);
  }

  // 바닥 공구 상자: 뚜껑 라인과 금색 걸쇠
  private drawToolbox(x: number, y: number, depth: number) {
    this.add.rectangle(x, y, 42, 24, P.red).setStrokeStyle(3, P.ink).setDepth(depth);
    this.add.line(0, 0, x - 21, y - 5, x + 21, y - 5, P.ink, .9).setOrigin(0).setDepth(depth + 1);
    this.add.rectangle(x, y - 2, 8, 7, P.gold).setStrokeStyle(1, P.ink).setDepth(depth + 1);
    this.add.rectangle(x, y - 14, 16, 5, P.red).setStrokeStyle(2, P.ink).setDepth(depth);
  }

  private renderTopBar() {
    this.pixelRect(195, 39, 366, 54, P.paper, P.ink, 15);
    if (this.hooks.dayNumber) {
      const remainingSeconds = Math.max(0, Math.ceil((this.hooks.dayRemainingMs ?? 0) / 1000));
      this.label(28, 18, `DAY ${this.hooks.dayNumber}`, 9, '#795044', true).setDepth(16);
      this.label(28, 36, `${this.hooks.dayStatusLabel ?? '준비'} · 00:${String(remainingSeconds).padStart(2, '0')}`, 12, '#3f7851', true).setDepth(16);
    } else if (this.hooks.progress) {
      // 에너지 시스템은 미도입(레퍼런스 결정)이므로 통합 모드에서는 납품 실적을 표시한다
      this.label(28, 20, 'DELIVERY', 8, '#795044', true).setDepth(16);
      this.label(28, 37, `납품 ${this.hooks.completedOrders ?? 0}건`, 14, '#3f7851', true).setDepth(16);
    } else {
      this.label(28, 20, 'ENERGY', 8, '#795044', true).setDepth(16);
      this.label(28, 37, '72 / 100', 14, '#3f7851', true).setDepth(16);
      this.add.rectangle(112, 43, 72, 8, P.darkWood).setDepth(16).setOrigin(0, .5);
      this.add.rectangle(112, 43, 52, 8, P.green).setDepth(17).setOrigin(0, .5);
    }
    this.label(274, 20, 'COIN', 8, '#795044', true).setDepth(16);
    this.label(274, 37, (this.hooks.coins ?? 2480).toLocaleString(), 14, '#a16028', true).setDepth(16);
    if (this.hooks.onSettings) this.button(352, 39, 34, 34, '⚙', () => { this.hooks.onSfx?.('tap'); this.hooks.onSettings?.(); });
  }

  private renderPlayPreview() {
    this.add.rectangle(195, 405, 390, 810, 0xd79a63);
    this.renderTopBar();
    this.button(55, 102, 82, 42, '← HOME', () => { this.playing = false; this.toast = 'Garage로 돌아왔습니다. 결과가 이곳에 쌓입니다.'; this.render(); });
    this.pixelRect(234, 102, 272, 48, P.paper, P.ink, 5);
    this.label(112, 87, 'ORDER #01 · 통학용 어반 바이크', 10, '#3b2531', true).setDepth(6);
    this.label(112, 105, '조립 진행 2 / 4 · 보상 1,000', 9, '#8e5136', true).setDepth(6);

    this.pixelRect(195, 380, 340, 492, 0x7f523d, P.ink, 2);
    this.label(42, 154, 'MERGE WORKBENCH', 11, '#fff1c6', true).setDepth(3);
    const parts = [1, 1, 2, 0, 3, 0, 2, 0, 1, 0, 0, 3, 0, 2, 0, 1, 0, 0, 2, 0];
    parts.forEach((level, i) => {
      const x = 64 + (i % 5) * 66; const y = 207 + Math.floor(i / 5) * 83;
      this.add.rectangle(x, y, 56, 68, level ? 0xe8bd76 : 0x684435).setStrokeStyle(3, P.darkWood).setDepth(3);
      if (level) {
        this.add.circle(x, y - 7, 11, [0, P.green, P.blue, P.red][level]).setStrokeStyle(2, P.ink).setDepth(4);
        this.label(x, y + 16, `Lv.${level}`, 9, '#3b2531', true).setOrigin(.5).setDepth(4);
      }
    });
    this.pixelRect(195, 642, 340, 64, P.paper, P.ink, 5);
    this.label(195, 642, 'PLAY 화면은 기능 검증용 축약 미리보기입니다.', 10, '#5d3b34', true).setOrigin(.5).setDepth(6);
    this.button(195, 731, 170, 58, '부품 주문하기', () => { this.toast = '부품이 배송되었습니다.'; }, true);
    this.label(195, 789, '완료 후 HOME으로 돌아가 Garage 성장을 확인', 9, '#5d3b34', true).setOrigin(.5);
  }

  private notify(message: string) { this.toast = message; this.render(); }
}

export function startHomeDesignPrototype(parent: string, mode: HomeDesignPrototypeMode, hooks: HomeDesignHooks = {}) {
  // 방안별 씬과 기본 배경색·렌더 설정을 분기합니다. (D안만 부드러운 벡터 렌더링)
  const scene =
    mode === 'dusk-workshop-garage' ? new DuskWorkshopGarageScene()
    : mode === 'retro-pixel-garage' ? new RetroPixelGarageScene()
    : mode === 'modern-casual-garage' ? new ModernCasualGarageScene()
    : new WarmPixelGarageScene(hooks);
  const backgroundColor =
    mode === 'dusk-workshop-garage' ? '#141a2e'
    : mode === 'retro-pixel-garage' ? '#101026'
    : mode === 'modern-casual-garage' ? '#bfe9f2'
    : '#fff1c6';
  const smooth = mode === 'modern-casual-garage';
  return new Phaser.Game({
    type: Phaser.AUTO, parent, width: 390, height: 810, backgroundColor,
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    scene, render: { antialias: smooth, pixelArt: !smooth, roundPixels: !smooth },
  });
}
