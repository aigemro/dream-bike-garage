import Phaser from 'phaser';
import { DuskWorkshopGarageScene } from './home-design-dusk-workshop';
import { RetroPixelGarageScene } from './home-design-retro-pixel';
import { ModernCasualGarageScene } from './home-design-modern-casual';
import { drawPixelBike, makeWarmColorway, bikeCategoryFromKorean } from './bike-pixel-sprite';
import { formatDayClock } from '../../domain/day-session';
import { RIVERSIDE_ENDURANCE_RACE } from './race-progress';

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
  race?: {
    dayNumber: number;
    heldEveryDays: number;
    daysUntil: number;
    entryFee: number;
    available: boolean;
    completed: boolean;
  };
  onPlay?: () => void;
  onCollection?: () => void;
  onShowcase?: () => void;
  onProfile?: () => void;
  onSettings?: () => void;
  onRace?: () => void;
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

// 터치 영역 최소 크기(논리 px): 시각 크기가 작은 버튼도 hitArea는 이 크기 이상으로 둔다
const MIN_HIT = 44;

// Garage 패널 가로 범위(80~310): 좌우 버튼(11~65 / 325~379)과 겹치지 않도록 폭 230으로 둔다
const PANEL_W = 230;
const PANEL_LEFT = 92;

class WarmPixelGarageScene extends Phaser.Scene {
  private playing = false;
  private toast = '오늘의 주문을 확인하고 작업을 시작해 보세요.';

  constructor(private readonly hooks: HomeDesignHooks = {}) { super('home-design-warm-pixel-garage'); }
  create() { this.render(); }

  // outline: 굵은 글자의 1px 외곽선 색. 어두운 배경 위 크림색 글자는 INK 외곽선을 써야 번지지 않고 또렷하다
  private label(x: number, y: number, value: string, size = 12, color = '#3b2531', bold = false, outline = '#fff1c6') {
    return this.add.text(x, y, value, {
      fontFamily: '"Arial Rounded MT Bold", "Noto Sans KR", sans-serif', fontSize: `${size}px`,
      color, fontStyle: bold ? 'bold' : 'normal', stroke: bold ? outline : undefined, strokeThickness: bold ? 1 : 0,
    });
  }

  // 긴 문구를 패널 안에 맞추는 보조: 폭을 넘기면 최소 크기까지 줄이고, 그래도 넘치면 줄바꿈한다
  private fitLabel(text: Phaser.GameObjects.Text, maxWidth: number, minSize: number) {
    let size = parseInt(String(text.style.fontSize), 10);
    while (text.width > maxWidth && size > minSize) { size -= 1; text.setFontSize(size); }
    if (text.width > maxWidth) text.setWordWrapWidth(maxWidth);
    return text;
  }

  private pixelRect(x: number, y: number, w: number, h: number, fill: number, stroke = P.ink, depth = 0) {
    return this.add.rectangle(x, y, w, h, fill).setStrokeStyle(3, stroke).setDepth(depth);
  }

  private button(x: number, y: number, w: number, h: number, text: string, action: () => void, primary = false) {
    const shadow = this.add.rectangle(x + 3, y + 4, w, h, P.darkWood).setDepth(20);
    // 터치 영역은 논리 44×44 이상: 시각 크기가 작아도 hitArea를 키운다 (hitArea 좌표는 도형의 좌상단 기준)
    const hitW = Math.max(w, MIN_HIT);
    const hitH = Math.max(h, MIN_HIT);
    const box = this.add.rectangle(x, y, w, h, primary ? P.gold : P.paper)
      .setStrokeStyle(3, P.ink).setDepth(21)
      .setInteractive({
        hitArea: new Phaser.Geom.Rectangle((w - hitW) / 2, (h - hitH) / 2, hitW, hitH),
        hitAreaCallback: Phaser.Geom.Rectangle.Contains,
        useHandCursor: true,
      })
      .on('pointerdown', action);
    this.label(x, y, text, primary ? 16 : 11, '#3b2531', true).setOrigin(.5).setAlign('center').setDepth(22)
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

    // 오늘의 주문 카드: Garage 패널과 같은 폭(80~310), y 95~155
    this.pixelRect(195, 125, PANEL_W, 60, P.paper, P.ink, 10);
    this.label(PANEL_LEFT, 101, 'TODAY\'S ORDER', 9, '#6e473b', true).setDepth(11);
    this.label(PANEL_LEFT, 118, progress?.orderName ?? '통학용 어반 바이크', 14, '#3b2531', true).setDepth(11);
    this.label(PANEL_LEFT, 139, `완료 ${this.hooks.completedOrders ?? 0}건  ·  보상 ${(progress?.orderReward ?? 1000).toLocaleString()}`, 11, '#8e5136', true).setDepth(11);
    // 주문 미리보기: 오늘의 주문 카테고리에 맞춘 자전거 픽셀 스프라이트.
    // 카드(중심 y=125, 높이 60 → 95~155) 안에 들어오도록 cell 1.2 사용: 세로 107~145px,
    // 가로 약 237~305px(그리드 4~60열)로 카드 우측 테두리 안쪽(308.5)과 3px 여백을 둔다
    drawPixelBike(this, 270, 131, 1.2, { category: this.hooks.progress?.orderCategory ?? 'city', colorway: makeWarmColorway(P.red), depth: 12 });

    // 좌측 대회 버튼: 대회일에는 RACE GO!, 그 외에는 D-n (훅이 있을 때만)
    if (progress && this.hooks.race) {
      const race = this.hooks.race;
      const label = race.completed ? '대회\n완료' : race.available ? 'RACE\nGO!' : `대회\nD-${race.daysUntil}`;
      this.button(38, 205, 54, 48, label, () => {
        this.hooks.onSfx?.('tap');
        if (race.available) this.hooks.onRace?.();
        else this.notify(race.completed ? '오늘 대회는 이미 완주했습니다.' : `대회까지 ${race.daysUntil}일 남았습니다.`);
      }, race.available);
    }
    this.button(352, 205, 54, 48, '전시\n보기', () => {
      this.hooks.onSfx?.('tap');
      this.hooks.onShowcase ? this.hooks.onShowcase() : this.notify('Garage 전시 화면');
    });
    // 제작 중 자전거가 있으면 Garage에 만들기 버튼이 열린다 (#222)
    if (progress?.craft) {
      const craft = progress.craft;
      this.button(352, 263, 54, 48, `만들기\n${craft.installedCount}/${craft.totalParts}`, () => {
        this.hooks.onSfx?.('tap');
        this.hooks.onCraft ? this.hooks.onCraft(craft.bikeId) : this.notify(`${craft.bikeName} 제작 중`);
      }, true);
    }

    // Garage 패널: y 168~560. 좌우 버튼과 겹치지 않는 폭 230.
    // 상단을 168까지 올려 등급 배지(174~199)가 테두리·대표 자전거 이름(202~)과 3px 이상 떨어지게 한다
    this.pixelRect(195, 364, PANEL_W, 392, 0xf2c77e, P.ink, 7).setAlpha(.88);
    this.label(PANEL_LEFT, 183, 'MY LITTLE GARAGE', 10, '#6e473b', true).setDepth(13);
    this.fitLabel(this.label(PANEL_LEFT, 202, progress?.heroBike.name ?? '나의 드림 로드바이크', 17, '#3b2531', true).setDepth(13), 206, 14);
    this.label(PANEL_LEFT, 226, progress ? `${progress.heroBike.grade} 등급 · 급여로 한 단계씩 성장 중` : '햇살 아래 한 단계씩 완성 중', 11, '#7b5140').setDepth(13);
    // 정비 매트 + 그림자 위에 64×40 그리드 픽셀 스프라이트 로드바이크를 배치
    // (cell 4 → 폭 약 216px, 바퀴 하단 = y + 10*cell = 412로 매트 상단(410)에 닿음)
    this.add.rectangle(195, 416, 220, 12, 0x9c5b3c).setStrokeStyle(2, P.darkWood).setDepth(12);
    this.add.ellipse(195, 419, 200, 26, 0x6e473b, .28).setDepth(12);
    const heroCategory = progress ? bikeCategoryFromKorean(progress.heroBike.category) : 'road';
    const heroColor = progress?.heroBike.color ?? P.red;
    // 드림 등급(3단계) 달성 시 골드 링, 2단계부터 강화 반짝임을 표시해 성장 상태를 홈에서도 보여준다
    // 링(중심 358, r 98 → 테두리 포함 258.5~457.5)은 '▼ 자전거를 눌러 성장' 라벨(~253) 아래에서 시작한다
    if (progress && progress.heroBike.stage >= 3) this.add.circle(195, 358, 98, P.gold, .14).setStrokeStyle(3, P.gold).setDepth(12);
    drawPixelBike(this, 195, 372, 4, { category: heroCategory, colorway: makeWarmColorway(heroColor), depth: 13 });
    if (progress && progress.heroBike.stage >= 2) {
      [[112, 300], [270, 286], [252, 392]].forEach(([sx, sy]) => this.add.rectangle(sx, sy, 5, 5, P.gold).setDepth(14));
    }
    if (progress) {
      // 등급 배지는 패널 안쪽(222~300) 소제목 줄 오른쪽에 둔다. 높이 22(테두리 포함 173.5~198.5)로
      // 패널 상단 테두리(169.5)와 4px, 대표 자전거 이름(202~)과 3.5px 여백
      this.pixelRect(261, 186, 78, 22, progress.heroBike.stage >= 3 ? P.gold : 0xffe6a8, P.wood, 13);
      this.label(261, 186, `${progress.heroBike.grade} 등급`, 11, progress.heroBike.stage >= 3 ? '#a14a38' : '#5d3b34', true).setOrigin(.5).setDepth(14);
      // 대표 자전거 클릭 → 성장 화면 진입 (#223)
      this.label(195, 247, '▼ 자전거를 눌러 성장', 10, '#a14a38', true).setOrigin(.5).setDepth(14);
      this.add.rectangle(195, 350, 226, 150, 0xffffff, 0.001)
        .setDepth(15).setInteractive({ useHandCursor: true })
        .on('pointerdown', () => {
          this.hooks.onSfx?.('tap');
          this.hooks.onHeroBike ? this.hooks.onHeroBike(progress.heroBike.id) : this.notify(`${progress.heroBike.name} 성장 화면`);
        });
    }

    // 컬렉션·다음 목표 카드: y 438~518. 오른쪽 열(166~296)은 긴 목표 문구를 줄여 맞춘다
    this.pixelRect(195, 478, 214, 80, 0xffe6a8, P.wood, 13);
    this.label(96, 446, 'COLLECTION', 9, '#7b5140', true).setDepth(14);
    this.label(96, 461, progress ? `${progress.ownedCount} / ${progress.catalogSize}` : '0 / 24', 17, '#3b2531', true).setDepth(14);
    this.label(166, 446, 'NEXT GOAL', 9, '#7b5140', true).setDepth(14);
    const goalLabel = this.fitLabel(this.label(166, 461, progress?.nextGoalLabel ?? '다음 자전거', 12, '#3b2531', true).setDepth(14), 130, 11);
    this.fitLabel(this.label(166, goalLabel.y + goalLabel.height + 2, progress?.nextGoalHint ?? '주문을 납품해 보세요', 10, '#a14a38', true).setDepth(14), 130, 10);

    const growthPercent = progress ? Math.max(0, Math.min(100, progress.growthPercent)) : 0;
    this.add.rectangle(195, 528, 212, 10, P.darkWood).setDepth(13);
    if (growthPercent > 0) this.add.rectangle(89 + 212 * growthPercent / 100 / 2, 528, 212 * growthPercent / 100, 10, P.green).setDepth(14);
    this.label(195, 546, `Garage 성장 ${growthPercent}%`, 11, '#5d3b34', true).setOrigin(.5).setDepth(14);

    if (this.hooks.race) this.renderRaceCalendar(this.hooks.race);
    // 안내 바: 대회 패널(570~650) 아래 658~690, 하단 바(703~)와 겹치지 않게
    const toastY = this.hooks.race ? 674 : 600;
    this.pixelRect(195, toastY, 296, this.hooks.race ? 32 : 50, 0xfff1c6, P.wood, 14);
    this.label(195, toastY, this.toast, 11, '#5d3b34', true).setOrigin(.5).setAlign('center').setWordWrapWidth(280).setDepth(15);

    this.pixelRect(195, 744, 366, 82, P.wood, P.ink, 18);
    this.button(67, 741, 80, 48, '프로필', () => { this.hooks.onSfx?.('tap'); this.hooks.onProfile ? this.hooks.onProfile() : this.notify('견습 정비사 프로필'); });
    this.button(195, 738, 150, 58, '▶  PLAY', () => { this.hooks.onSfx?.('tap'); if (this.hooks.onPlay) this.hooks.onPlay(); else { this.playing = true; this.render(); } }, true);
    this.button(323, 741, 80, 48, progress ? `자전거\n${progress.ownedCount}/${progress.catalogSize}` : '자전거', () => { this.hooks.onSfx?.('tap'); this.hooks.onCollection ? this.hooks.onCollection() : this.notify('자전거 도감'); });
  }

  // 대회 달력 패널: y 570~650, 폭 300(45~345). 참가비·출전 인원 줄을 패널 안에 둔다
  private renderRaceCalendar(race: NonNullable<HomeDesignHooks['race']>) {
    this.pixelRect(195, 610, 300, 80, P.darkWood, P.ink, 14);
    const cycleStart = race.dayNumber - ((race.dayNumber - 1) % race.heldEveryDays);
    const title = race.completed ? '오늘 대회 완주!' : race.available ? '오늘 리버사이드 3K 개최!' : `NEXT RACE · D-${race.daysUntil}`;
    this.label(56, 574, title, 11, '#f6d995', true, '#3b2531').setDepth(15);
    for (let index = 0; index < race.heldEveryDays; index += 1) {
      const day = cycleStart + index;
      const raceDay = index === race.heldEveryDays - 1;
      const today = day === race.dayNumber;
      const x = 91 + index * 52;
      this.add.rectangle(x, 607, 42, 34, today ? P.gold : raceDay ? P.red : P.paper)
        .setStrokeStyle(today ? 3 : 2, P.ink).setDepth(15);
      this.label(x, 600, `D${day}`, 10, today ? '#3b2531' : raceDay ? '#fff1c6' : '#795044', true, raceDay && !today ? '#3b2531' : '#fff1c6').setOrigin(.5).setDepth(16);
      // 오늘(골드 칸)은 대회일이어도 INK 글자로 두어 골드 위에서 읽히게 한다
      this.label(x, 614, raceDay ? '대회' : day < race.dayNumber ? '완료' : '영업', 9, today ? '#3b2531' : raceDay ? '#fff1c6' : '#795044', true, raceDay && !today ? '#3b2531' : '#fff1c6').setOrigin(.5).setDepth(16);
    }
    this.label(195, 637, `참가비 ${race.entryFee.toLocaleString()} 코인 · ${RIVERSIDE_ENDURANCE_RACE.racerCount}명 출전`, 11, '#fff1c6', true, '#3b2531').setOrigin(.5).setDepth(16);
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

    // 공구 벽: Garage 패널 왼쪽 띠(9~71, y 261~481)에 두어 패널에 가려지지 않게. 페그보드 점 + 공구 4종(렌치·드라이버·망치·오일캔)
    this.pixelRect(40, 371, 62, 220, P.darkWood, P.ink, 4);
    for (let py = 280; py <= 470; py += 24) for (let px = 22; px <= 58; px += 18) this.add.circle(px, py, 1.6, 0x3f2231).setDepth(5);
    this.drawWrench(28, 330, 5);
    this.drawScrewdriver(54, 330, 5);
    this.drawHammer(28, 420, 5);
    this.drawOilCan(54, 422, 5);

    // 주문 게시판: Garage 패널 오른쪽 띠(316~380, y 390~510). 압정으로 고정된 메모, 가운데 메모는 살짝 기울임.
    // 메모 3장은 간격 28로 게시판 세로 중앙에 모아(412.5~491.5) 아래 테두리(508.5) 안쪽에 둔다
    this.pixelRect(348, 450, 64, 120, 0x6d8b62, P.ink, 4);
    [0, 1, 2].forEach((i) => {
      const noteY = 424 + i * 28;
      const note = this.add.rectangle(348, noteY, 52, 21, 0xffe8ad).setStrokeStyle(2, P.wood).setDepth(5);
      if (i === 1) note.setAngle(-4);
      this.add.circle(348, noteY - 8, 2.5, i === 2 ? P.red : P.gold).setStrokeStyle(1, P.ink).setDepth(6);
      this.add.line(0, 0, 330, noteY + 3, 366, noteY + 3, P.wood, .8).setOrigin(0).setDepth(6);
    });

    // 생활 소품: 화분, 기대 놓은 타이어(대회 패널 왼쪽 45 안쪽), 공구 상자(대회 패널 오른쪽 변 346.5·안내 바 344.5에서 6px 이상 떨어진 352.5~385.5)
    this.add.rectangle(27, 555, 26, 64, P.wood).setStrokeStyle(3, P.ink).setDepth(5);
    this.add.circle(27, 518, 28, P.leaf).setStrokeStyle(3, P.ink).setDepth(5);
    this.add.circle(45, 529, 22, P.green).setStrokeStyle(3, P.ink).setDepth(5);
    this.add.circle(24, 652, 14, 0x00000, 0).setStrokeStyle(8, P.tire).setDepth(5);
    this.add.circle(24, 652, 5, P.floor).setStrokeStyle(3, P.cream).setDepth(6);
    this.drawToolbox(369, 655, 6);
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

  // 바닥 공구 상자: 뚜껑 라인과 금색 걸쇠. 폭 30(테두리 포함 33)으로 대회 패널·안내 바 오른쪽에 붙지 않게 둔다
  private drawToolbox(x: number, y: number, depth: number) {
    this.add.rectangle(x, y, 30, 24, P.red).setStrokeStyle(3, P.ink).setDepth(depth);
    this.add.line(0, 0, x - 15, y - 5, x + 15, y - 5, P.ink, .9).setOrigin(0).setDepth(depth + 1);
    this.add.rectangle(x, y - 2, 8, 7, P.gold).setStrokeStyle(1, P.ink).setDepth(depth + 1);
    this.add.rectangle(x, y - 14, 16, 5, P.red).setStrokeStyle(2, P.ink).setDepth(depth);
  }

  // 상단 HUD(공통 기준): 왼쪽 DAY n + 상태 문구, 오른쪽 COIN + 보유 코인. 훅이 없으면 중립값(DAY 1 / 영업 준비 / 0)
  private renderTopBar() {
    this.pixelRect(195, 39, 366, 54, P.paper, P.ink, 15);
    // Day 타이머가 연결된 경우에만 남은 시간을 붙입니다. 타이머가 없으면 의미 없는 '00:00'을 표시하지 않습니다.
    const remaining = this.hooks.dayRemainingMs === undefined ? '' : ` · ${formatDayClock(this.hooks.dayRemainingMs)}`;
    this.label(28, 18, `DAY ${this.hooks.dayNumber ?? 1}`, 9, '#795044', true).setDepth(16);
    this.label(28, 36, `${this.hooks.dayStatusLabel ?? '영업 준비'}${remaining}`, 12, '#3f7851', true).setDepth(16);
    this.label(274, 19, 'COIN', 9, '#795044', true).setDepth(16);
    this.label(274, 36, (this.hooks.coins ?? 0).toLocaleString(), 14, '#a16028', true).setDepth(16);
    if (this.hooks.onSettings) this.button(352, 39, 34, 34, '⚙', () => { this.hooks.onSfx?.('tap'); this.hooks.onSettings?.(); });
  }

  // PLAY 훅이 없을 때만 보이는 내부 작업대 미리보기(출시 경로에서는 실제 작업대 화면으로 이동)
  private renderPlayPreview() {
    this.add.rectangle(195, 405, 390, 810, 0xd79a63);
    this.renderTopBar();
    this.button(55, 102, 82, 42, '← 홈', () => { this.playing = false; this.toast = '홈으로 돌아왔습니다. 결과가 이곳에 쌓입니다.'; this.render(); });
    this.pixelRect(234, 102, 272, 48, P.paper, P.ink, 5);
    this.label(112, 86, 'ORDER #01 · 통학용 어반 바이크', 11, '#3b2531', true).setDepth(6);
    this.label(112, 104, '조립 진행 2 / 4 · 보상 1,000', 10, '#8e5136', true).setDepth(6);

    this.pixelRect(195, 380, 340, 492, 0x7f523d, P.ink, 2);
    this.label(42, 154, 'MERGE WORKBENCH', 11, '#fff1c6', true, '#3b2531').setDepth(3);
    const parts = [1, 1, 2, 0, 3, 0, 2, 0, 1, 0, 0, 3, 0, 2, 0, 1, 0, 0, 2, 0];
    parts.forEach((level, i) => {
      const x = 64 + (i % 5) * 66; const y = 207 + Math.floor(i / 5) * 83;
      this.add.rectangle(x, y, 56, 68, level ? 0xe8bd76 : 0x684435).setStrokeStyle(3, P.darkWood).setDepth(3);
      if (level) {
        this.add.circle(x, y - 7, 11, [0, P.green, P.blue, P.red][level]).setStrokeStyle(2, P.ink).setDepth(4);
        this.label(x, y + 16, `Lv.${level}`, 10, '#3b2531', true).setOrigin(.5).setDepth(4);
      }
    });
    this.pixelRect(195, 642, 340, 64, P.paper, P.ink, 5);
    this.label(195, 642, '작업대 미리보기 · 부품을 합쳐 주문을 완성합니다.', 11, '#5d3b34', true).setOrigin(.5).setDepth(6);
    this.button(195, 731, 170, 58, '부품 주문하기', () => { this.toast = '부품이 배송되었습니다.'; }, true);
    this.label(195, 789, '완료 후 홈으로 돌아가 Garage 성장을 확인', 10, '#5d3b34', true).setOrigin(.5);
  }

  private notify(message: string) { this.toast = message; this.render(); }
}

export function startHomeDesignPrototype(parent: string, mode: HomeDesignPrototypeMode, hooks: HomeDesignHooks = {}) {
  // 모드별 씬과 기본 배경색·렌더 설정을 분기합니다. (modern-casual 모드만 부드러운 벡터 렌더링)
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
