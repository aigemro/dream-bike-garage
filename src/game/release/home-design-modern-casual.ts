import Phaser from 'phaser';
import { drawDreamBike, drawDreamBikeMini } from './home-design-bike';
import type { BikePalette } from './home-design-bike';

// D안: 모던 캐주얼 모바일 Garage
// 밝고 글로시한 벡터 카드 UI로, A안(따뜻한 픽셀)과 완전히 동일한
// 정보 구조·데이터를 유지한 채 시각 언어만 비교하는 프로토타입입니다.
// 깊이 규칙: 배경 0~9 / 중앙 무대 10~19 / UI 카드·버튼 20+

const C = {
  skyTop: 0x7ec9f2, // 하늘색 (그라데이션 상단)
  skyBottom: 0xa9f0d8, // 민트 (그라데이션 하단)
  hillLight: 0xaee8a6, // 밝은 언덕
  hillDark: 0x8bd894, // 짙은 언덕
  floorWood: 0xf2dcae, // 밝은 나무톤 쇼룸 바닥
  floorLine: 0xc9a86e, // 바닥 결 라인
  pedestalTop: 0xfdf3da, // 전시 단상 윗면
  pedestalSide: 0xe3c188, // 전시 단상 옆면
  shadowInk: 0x1c3a5f, // 소프트 섀도 공용 색
  track: 0xe4ecf4, // 게이지 트랙
  yellow: 0xffd93b,
  orange: 0xff9f2e,
  green: 0x54c96e,
  mint: 0x3ecfba,
  mintDark: 0x2aa896,
  blue: 0x2f9bf0,
  purple: 0x9b6df2,
  coral: 0xff6b57,
  tireNavy: 0x27314f,
} as const;

// 중앙 드림 바이크 팔레트: 채도 높은 파랑/시안 시티 바이크
const BIKE_PALETTE: BikePalette = {
  frame: 0x2f9bf0,
  frameShadow: 0x1e6fc4,
  tire: 0x27314f,
  rim: 0xe8f1fa,
  spoke: 0xbcd2e8,
  metal: 0x5f7c9b, // 밝은 하늘 배경에서 핸들바·크랭크가 뭉개지지 않도록 어두운 스틸 톤 사용
  saddle: 0x1f3c5c,
  accent: 0x2ee6f0,
};

const FONT = '"Trebuchet MS", "Noto Sans KR", sans-serif';

interface LabelOptions {
  bold?: boolean;
  stroke?: string;
  strokeThickness?: number;
  depth?: number;
}

export class ModernCasualGarageScene extends Phaser.Scene {
  private playing = false;
  private toast = '오늘의 주문을 확인하고 작업을 시작해 보세요.';

  constructor() { super('home-design-modern-casual'); }

  create() { this.render(); }

  // ---------- 공용 헬퍼 ----------

  private label(x: number, y: number, value: string, size: number, color: string, options: LabelOptions = {}) {
    const { bold = false, stroke, strokeThickness = 0, depth = 21 } = options;
    return this.add.text(x, y, value, {
      fontFamily: FONT,
      fontSize: `${size}px`,
      color,
      fontStyle: bold ? 'bold' : 'normal',
      stroke,
      strokeThickness,
    }).setDepth(depth);
  }

  // 흰색 라운드 카드 + 아래쪽 소프트 섀도 (외곽선 없음)
  private card(cx: number, cy: number, w: number, h: number, radius: number, depth: number, fill = 0xffffff, alpha = 1) {
    const g = this.add.graphics().setDepth(depth);
    g.fillStyle(C.shadowInk, 0.16).fillRoundedRect(cx - w / 2, cy - h / 2 + 4, w, h, radius);
    g.fillStyle(fill, alpha).fillRoundedRect(cx - w / 2, cy - h / 2, w, h, radius);
    return g;
  }

  // 그라데이션 캡슐 버튼: 위 1/3 흰색 하이라이트 밴드로 글로시 표현
  private capsuleButton(
    cx: number, cy: number, w: number, h: number,
    text: string, size: number,
    topColor: number, bottomColor: number,
    textColor: string, textStroke: string,
    action: () => void, depth = 23,
  ) {
    const r = h / 2;
    const g = this.add.graphics().setDepth(depth);
    g.fillStyle(C.shadowInk, 0.22).fillRoundedRect(cx - w / 2, cy - h / 2 + 4, w, h, r);
    g.fillGradientStyle(topColor, topColor, bottomColor, bottomColor, 1);
    g.fillRoundedRect(cx - w / 2, cy - h / 2, w, h, r);
    g.fillStyle(0xffffff, 0.32).fillRoundedRect(cx - w / 2 + 6, cy - h / 2 + 5, w - 12, h / 3, Math.min(9, h / 6));
    // 투명 사각형을 히트 영역으로 사용해 터치 명중률 확보
    this.add.rectangle(cx, cy, w, h, 0xffffff, 0).setDepth(depth + 2)
      .setInteractive({ useHandCursor: true }).on('pointerdown', action);
    this.label(cx, cy, text, size, textColor, { bold: true, stroke: textStroke, strokeThickness: 3, depth: depth + 1 })
      .setOrigin(0.5).setAlign('center')
      .setInteractive({ useHandCursor: true }).on('pointerdown', action);
  }

  // 원형 아이콘 버튼: 색상 원 + 글로시 밴드 + 간단 도형 아이콘 + 작은 라벨
  private circleButton(
    cx: number, cy: number, radius: number, color: number,
    caption: string, captionColor: string, captionStroke: string | undefined,
    action: () => void,
    drawIcon: (x: number, y: number, depth: number) => void,
    depth = 23,
  ) {
    this.add.circle(cx + 2, cy + 4, radius, C.shadowInk, 0.2).setDepth(depth);
    this.add.circle(cx, cy, radius, color).setDepth(depth + 1)
      .setInteractive({ useHandCursor: true }).on('pointerdown', action);
    this.add.ellipse(cx, cy - radius * 0.45, radius * 1.35, radius * 0.72, 0xffffff, 0.32).setDepth(depth + 2);
    drawIcon(cx, cy, depth + 3);
    this.label(cx, cy + radius + 6, caption, 9, captionColor, {
      bold: true, stroke: captionStroke, strokeThickness: captionStroke ? 3 : 0, depth: depth + 3,
    }).setOrigin(0.5, 0).setAlign('center')
      .setInteractive({ useHandCursor: true }).on('pointerdown', action);
  }

  // 라운드 캡슐 게이지: 트랙 + 채움 바 + 끝의 밝은 포인트
  private gauge(x: number, y: number, w: number, h: number, ratio: number, track: number, fill: number, depth: number) {
    const g = this.add.graphics().setDepth(depth);
    const r = h / 2;
    g.fillStyle(track, 1).fillRoundedRect(x, y - r, w, h, r);
    const fw = Math.max(h, w * ratio);
    g.fillStyle(fill, 1).fillRoundedRect(x, y - r, fw, h, r);
    g.fillStyle(0xffffff, 0.85).fillCircle(x + fw - r, y, Math.max(1.6, h * 0.22));
    return g;
  }

  private cloud(cx: number, cy: number, scale: number) {
    this.add.ellipse(cx, cy, 74 * scale, 30 * scale, 0xffffff, 0.9).setDepth(1);
    this.add.ellipse(cx - 20 * scale, cy + 4 * scale, 44 * scale, 22 * scale, 0xffffff, 0.85).setDepth(1);
    this.add.ellipse(cx + 22 * scale, cy + 5 * scale, 40 * scale, 20 * scale, 0xffffff, 0.85).setDepth(1);
  }

  // ---------- 간단 도형 아이콘 (특정 게임 자산 미사용, 독자 도형) ----------

  private iconFlag(x: number, y: number, depth: number) {
    this.add.rectangle(x - 5, y, 3, 18, 0xffffff).setDepth(depth);
    this.add.rectangle(x + 3, y - 5, 13, 8, 0xffffff).setDepth(depth);
  }

  private iconPodium(x: number, y: number, depth: number) {
    this.add.rectangle(x - 8, y + 4, 5, 8, 0xffffff).setDepth(depth);
    this.add.rectangle(x, y + 2, 5, 12, 0xffffff).setDepth(depth);
    this.add.rectangle(x + 8, y + 5, 5, 6, 0xffffff).setDepth(depth);
  }

  private iconCompass(x: number, y: number, depth: number) {
    this.add.circle(x, y, 8).setStrokeStyle(3, 0xffffff).setDepth(depth);
    this.add.line(0, 0, x - 4, y + 4, x + 4, y - 4, 0xffffff).setOrigin(0).setLineWidth(2).setDepth(depth);
    this.add.circle(x, y, 2, 0xffffff).setDepth(depth);
  }

  private iconGear(x: number, y: number, depth: number) {
    this.add.circle(x, y, 7).setStrokeStyle(4, 0xffffff).setDepth(depth);
    const stubs: Array<[number, number]> = [[0, -10], [10, 0], [0, 10], [-10, 0]];
    stubs.forEach(([dx, dy]) => this.add.rectangle(x + dx, y + dy, 5, 5, 0xffffff).setDepth(depth));
  }

  private iconPerson(x: number, y: number, depth: number) {
    this.add.circle(x, y - 6, 4.5, 0xffffff).setDepth(depth);
    this.add.ellipse(x, y + 5, 15, 10, 0xffffff).setDepth(depth);
  }

  private iconBike(x: number, y: number, depth: number) {
    this.add.circle(x - 6, y + 3, 5).setStrokeStyle(2.5, 0xffffff).setDepth(depth);
    this.add.circle(x + 6, y + 3, 5).setStrokeStyle(2.5, 0xffffff).setDepth(depth);
    this.add.line(0, 0, x - 6, y + 3, x, y - 5, 0xffffff).setOrigin(0).setLineWidth(2).setDepth(depth);
    this.add.line(0, 0, x, y - 5, x + 6, y + 3, 0xffffff).setOrigin(0).setLineWidth(2).setDepth(depth);
  }

  // ---------- 렌더 분기 ----------

  private render() {
    this.children.removeAll();
    this.playing ? this.renderPlayPreview() : this.renderGarageHome();
  }

  private notify(message: string) { this.toast = message; this.render(); }

  // 배경: 하늘→민트 그라데이션 + 구름 + 언덕 + 밝은 나무톤 오픈 쇼룸 바닥
  private renderBackdrop() {
    const g = this.add.graphics().setDepth(0);
    g.fillGradientStyle(C.skyTop, C.skyTop, C.skyBottom, C.skyBottom, 1);
    g.fillRect(0, 0, 390, 810);
    this.cloud(70, 150, 1);
    this.cloud(315, 132, 0.8);
    this.cloud(348, 250, 0.6);
    this.add.ellipse(60, 470, 340, 170, C.hillDark).setDepth(1);
    this.add.ellipse(320, 480, 380, 190, C.hillLight).setDepth(1);
    this.add.ellipse(195, 480, 620, 120, C.floorWood).setDepth(2);
    this.add.rectangle(195, 645, 390, 330, C.floorWood).setDepth(2);
    const plankYs = [560, 615, 670];
    plankYs.forEach((y) => this.add.rectangle(195, y, 390, 2, C.floorLine, 0.25).setDepth(3));
  }

  // 1. 상단 바: ENERGY 72/100 + 게이지, COIN 2,480
  private renderTopBar() {
    this.card(195, 39, 366, 54, 16, 20);
    this.label(30, 15, 'ENERGY', 8, '#7d93ab', { bold: true });
    this.label(30, 27, '72 / 100', 13, '#2e9e57', { bold: true });
    this.gauge(100, 34, 84, 9, 0.72, C.track, C.green, 21);
    this.add.circle(258, 34, 9, 0xf2b21d).setDepth(21);
    this.add.circle(258, 34, 6, 0xffd93b).setDepth(22);
    this.label(274, 15, 'COIN', 8, '#7d93ab', { bold: true });
    this.label(274, 27, '2,480', 13, '#c76f12', { bold: true });
  }

  private renderGarageHome() {
    this.renderBackdrop();
    this.renderTopBar();

    // 2. 오늘의 주문 카드
    this.card(195, 125, 250, 64, 16, 20);
    this.label(84, 100, 'TODAY\'S ORDER', 8, '#e0861a', { bold: true });
    this.label(84, 112, '통학용 어반 바이크', 14, '#1f3c5c', { bold: true });
    this.label(84, 134, '진행 2 / 4  ·  보상 1,000', 10, '#5b7a99', { bold: true });
    drawDreamBikeMini(this, 285, 128, 0.52, C.blue, C.tireNavy, 21);

    // 3. 좌측 원형 아이콘 버튼: EVENT 3, RANK #18
    this.circleButton(38, 203, 23, C.coral, 'EVENT', '#ffffff', '#1f3c5c', () => this.notify('이벤트 준비 중'), (x, y, d) => this.iconFlag(x, y, d));
    this.add.circle(55, 187, 8, C.yellow).setDepth(27); // 이벤트 3건 배지
    this.label(55, 187, '3', 9, '#1f3c5c', { bold: true, depth: 28 }).setOrigin(0.5);
    this.circleButton(38, 273, 23, C.purple, 'RANK #18', '#ffffff', '#1f3c5c', () => this.notify('랭킹 준비 중'), (x, y, d) => this.iconPodium(x, y, d));

    // 4. 우측 원형 아이콘 버튼: TOUR D2, 조립 2/4, STATUS Lv.12
    this.circleButton(352, 203, 23, C.blue, 'TOUR D2', '#ffffff', '#1f3c5c', () => this.notify('투어 준비 중'), (x, y, d) => this.iconCompass(x, y, d));
    this.circleButton(352, 273, 23, C.orange, '조립 2/4', '#ffffff', '#1f3c5c', () => this.notify('조립 현황'), (x, y, d) => this.iconGear(x, y, d));
    this.circleButton(352, 343, 23, C.green, 'STATUS Lv.12', '#ffffff', '#1f3c5c', () => this.notify('견습 정비사 Lv.12'), (x, y, d) => this.iconPerson(x, y, d));

    // 5. 중앙: 대표 드림 바이크 + 원형 전시 단상 + 방사형 하이라이트
    this.label(195, 163, 'MY LITTLE GARAGE', 10, '#ffffff', { bold: true, stroke: '#1f3c5c', strokeThickness: 3, depth: 15 }).setOrigin(0.5, 0);
    this.label(195, 177, '나의 드림 로드바이크', 18, '#ffffff', { bold: true, stroke: '#1f3c5c', strokeThickness: 4, depth: 15 }).setOrigin(0.5, 0);
    this.label(195, 201, '오픈 쇼룸에서 반짝반짝 전시 중', 10, '#ffffff', { bold: true, stroke: '#5b7a99', strokeThickness: 2, depth: 15 }).setOrigin(0.5, 0);
    this.add.circle(195, 320, 140, 0xffffff, 0.10).setDepth(10);
    this.add.circle(195, 320, 100, 0xffffff, 0.12).setDepth(10);
    this.add.circle(195, 320, 66, 0xffffff, 0.14).setDepth(10);
    this.add.ellipse(195, 424, 292, 58, C.pedestalSide).setDepth(10);
    this.add.ellipse(195, 412, 292, 58, C.pedestalTop).setDepth(11);
    this.add.ellipse(195, 404, 214, 24, C.shadowInk, 0.16).setDepth(12); // 바닥 그림자
    // 라벨(나의 드림 로드바이크)과 실루엣이 일치하도록 로드바이크 스타일 사용
    drawDreamBike(this, 195, 348, 1.02, BIKE_PALETTE, 13, { style: 'road' });

    // 6. 중앙 하단: 수집률·다음 목표·Garage 성장
    this.card(195, 488, 244, 92, 16, 20);
    this.label(88, 450, 'COLLECTION', 8, '#7d93ab', { bold: true });
    this.label(88, 461, '8 / 24', 17, '#1f3c5c', { bold: true });
    this.label(192, 450, 'NEXT GOAL', 8, '#7d93ab', { bold: true });
    this.label(192, 461, 'TRAIL MTB', 12, '#1f3c5c', { bold: true });
    this.label(192, 478, '주문 2건 남음', 9, '#e0861a', { bold: true });
    this.gauge(88, 510, 214, 10, 0.33, C.track, C.green, 21);
    this.label(195, 518, 'Garage 성장 33%', 9, '#5b7a99', { bold: true }).setOrigin(0.5, 0);

    // 8. 토스트 영역
    this.card(195, 585, 330, 46, 16, 20, 0xffffff, 0.96);
    this.label(195, 585, this.toast, 10, '#1f3c5c', { bold: true }).setOrigin(0.5);

    // 7. 하단 바: 프로필 / PLAY / 자전거
    this.card(195, 744, 370, 92, 22, 20);
    this.circleButton(67, 736, 24, C.purple, '프로필 Lv.12', '#1f3c5c', undefined, () => this.notify('견습 정비사 프로필'), (x, y, d) => this.iconPerson(x, y, d));
    this.capsuleButton(195, 738, 168, 62, 'PLAY', 24, C.yellow, C.orange, '#ffffff', '#c65f00', () => { this.playing = true; this.render(); });
    this.circleButton(323, 736, 24, C.mint, '자전거 8/24', '#1f3c5c', undefined, () => this.notify('자전거 도감'), (x, y, d) => this.iconBike(x, y, d));
    this.label(195, 779, 'DREAM BIKE GARAGE · MODERN CASUAL HOME', 8, '#7d93ab', { bold: true, depth: 22 }).setOrigin(0.5, 0);
  }

  // PLAY 탭 → 기능 검증용 축약 플레이 미리보기
  private renderPlayPreview() {
    this.renderBackdrop();
    this.renderTopBar();

    this.capsuleButton(57, 102, 88, 40, '← HOME', 12, C.mint, C.mintDark, '#ffffff', '#17695e', () => {
      this.playing = false;
      this.toast = 'Garage로 돌아왔습니다. 결과가 이곳에 쌓입니다.';
      this.render();
    });
    this.card(237, 102, 262, 48, 14, 20);
    this.label(118, 87, 'ORDER #01 · 통학용 어반 바이크', 10, '#1f3c5c', { bold: true });
    this.label(118, 105, '조립 진행 2 / 4 · 보상 1,000', 9, '#5b7a99', { bold: true });

    // 5x4 머지 보드 요약 (A안과 동일 데이터)
    this.card(195, 372, 348, 384, 18, 20);
    this.label(195, 192, 'MERGE WORKBENCH', 11, '#1f3c5c', { bold: true }).setOrigin(0.5, 0);
    const parts = [1, 1, 2, 0, 3, 0, 2, 0, 1, 0, 0, 3, 0, 2, 0, 1, 0, 0, 2, 0];
    const levelColors = [0x000000, C.green, C.blue, C.coral]; // 레벨별 색 구분
    const cells = this.add.graphics().setDepth(21);
    parts.forEach((level, i) => {
      const x = 63 + (i % 5) * 66;
      const y = 250 + Math.floor(i / 5) * 82;
      cells.fillStyle(level ? 0xeef6ff : 0xdfe9f2, 1).fillRoundedRect(x - 30, y - 35, 60, 70, 10);
      if (level) {
        this.add.circle(x, y - 9, 13, levelColors[level]).setDepth(22);
        this.add.circle(x - 4, y - 14, 4, 0xffffff, 0.55).setDepth(23); // 글로시 포인트
        this.label(x, y + 10, `Lv.${level}`, 9, '#1f3c5c', { bold: true, depth: 22 }).setOrigin(0.5, 0);
      }
    });
    this.label(195, 540, '같은 레벨 부품을 합치면 다음 단계 부품이 됩니다.', 9, '#7d93ab', { bold: true }).setOrigin(0.5, 0);

    this.card(195, 640, 344, 48, 14, 20);
    this.label(195, 640, 'PLAY 화면은 기능 검증용 축약 미리보기입니다.', 10, '#1f3c5c', { bold: true }).setOrigin(0.5);
    this.capsuleButton(195, 716, 200, 56, '부품 주문하기', 15, C.yellow, C.orange, '#ffffff', '#c65f00', () => {
      this.toast = '부품이 배송되었습니다.';
    });
    this.label(195, 772, '완료 후 HOME으로 돌아가 Garage 성장을 확인', 9, '#ffffff', { bold: true, stroke: '#1f3c5c', strokeThickness: 3 }).setOrigin(0.5, 0);
  }
}
