import Phaser from 'phaser';
import { drawDreamBike, drawDreamBikeMini } from './home-design-bike';
import type { BikePalette } from './home-design-bike';

// C안: 레트로 아케이드 픽셀 Garage
// A안(따뜻한 생활형 픽셀)과 동일한 정보 구조·데이터를 유지한 채,
// 16비트 콘솔/아케이드 감성의 제한 팔레트와 6px 격자 드로잉으로
// 시각 언어만 교체해 비교하는 프로토타입입니다.

// 6px 격자 스냅 헬퍼: 계산으로 만들어지는 좌표·크기는 모두 이 함수를 거칩니다.
// 리터럴 좌표는 화면 중심 x=195(격자 32.5칸)를 기준으로 대칭 배치하고,
// 폭·높이를 6의 홀수배로 잡아 사각형의 양쪽 모서리가 항상 6px 격자에
// 떨어지도록 미리 스냅한 값입니다.
const q = (v: number): number => Math.round(v / 6) * 6;

// 레트로 콘솔 감성의 제한 팔레트(14색). 화면의 모든 색은 이 상수에서만 가져옵니다.
const PAL = {
  bgDeep: 0x11132b, // 하늘·최심부 남색
  bgWall: 0x1b1e3f, // 벽 남색
  bgFloor: 0x2a2f57, // 바닥 남색
  panel: 0x1d2142, // 패널 본체
  panelDark: 0x141732, // 패널 음영·안쪽 보더
  ink: 0x0a0b1a, // 외곽선·그림자
  white: 0xf2f4ff, // 밝은 외곽선·본문
  gray: 0x8f95c4, // 보조 텍스트·스포크
  cyan: 0x2ee6d6, // 포인트 1: 청록
  cyanDeep: 0x117f7a, // 청록 음영
  magenta: 0xff4fa3, // 포인트 2: 마젠타
  magentaDeep: 0x8f2760, // 마젠타 음영
  yellow: 0xffd23e, // 포인트 3: 옐로
  yellowDeep: 0xa87f16, // 옐로 음영
} as const;

// Phaser Text용 CSS 색상 문자열(위 팔레트와 1:1 대응)
const TXT = {
  white: '#f2f4ff',
  gray: '#8f95c4',
  cyan: '#2ee6d6',
  magenta: '#ff4fa3',
  yellow: '#ffd23e',
  ink: '#0a0b1a',
} as const;

// 중앙 드림 바이크 팔레트: 프레임은 포인트 색(청록), 배지는 옐로로 시선을 모읍니다.
const BIKE_PALETTE: BikePalette = {
  frame: PAL.cyan,
  frameShadow: PAL.cyanDeep,
  tire: PAL.ink,
  rim: PAL.white,
  spoke: PAL.gray,
  metal: PAL.gray,
  saddle: PAL.magenta,
  accent: PAL.yellow,
};

export class RetroPixelGarageScene extends Phaser.Scene {
  private playing = false;
  private toast = '오늘의 주문을 확인하고 작업을 시작해 보세요.';

  constructor() { super('home-design-retro-pixel'); }
  create() { this.render(); }

  // 아케이드 HUD 느낌의 모노스페이스 라벨
  private label(x: number, y: number, value: string, size = 10, color: string = TXT.white, bold = false) {
    return this.add.text(x, y, value, {
      fontFamily: '"Courier New", Courier, monospace',
      fontSize: `${size}px`,
      color,
      fontStyle: bold ? 'bold' : 'normal',
    });
  }

  // 도트 스타일 2중 보더 패널: 밝은 외곽선 + 안쪽 어두운 외곽선
  private panel(x: number, y: number, w: number, h: number, fill: number, depth: number, edge: number = PAL.gray) {
    const box = this.add.rectangle(x, y, q(w), q(h), fill).setStrokeStyle(3, edge).setDepth(depth);
    this.add.rectangle(x, y, q(w) - 12, q(h) - 12, PAL.ink, 0).setStrokeStyle(3, PAL.ink).setDepth(depth);
    return box;
  }

  // 사각 버튼: 픽셀 그림자 + 2중 보더. 라벨에도 같은 핸들러를 걸어 터치 명중률을 확보합니다.
  private button(
    x: number, y: number, w: number, h: number,
    text: string, action: () => void, primary = false, sub?: string,
  ) {
    const bw = q(w);
    const bh = q(h);
    this.add.rectangle(x + 6, y + 6, bw, bh, PAL.ink).setDepth(20); // 6px 오프셋 픽셀 그림자
    const box = this.add.rectangle(x, y, bw, bh, primary ? PAL.yellow : PAL.panel)
      .setStrokeStyle(primary ? 6 : 3, primary ? PAL.white : PAL.gray).setDepth(21)
      .setInteractive({ useHandCursor: true }).on('pointerdown', action);
    this.add.rectangle(x, y, bw - (primary ? 18 : 12), bh - (primary ? 18 : 12), PAL.ink, 0)
      .setStrokeStyle(3, primary ? PAL.yellowDeep : PAL.ink).setDepth(22);
    const mainY = sub ? y - 9 : y;
    this.label(x, mainY, text, primary ? 17 : 9, primary ? TXT.ink : TXT.white, true)
      .setOrigin(0.5).setAlign('center').setDepth(23)
      .setInteractive({ useHandCursor: true }).on('pointerdown', action);
    if (sub) {
      this.label(x, y + 15, sub, 8, TXT.ink, true)
        .setOrigin(0.5).setDepth(23)
        .setInteractive({ useHandCursor: true }).on('pointerdown', action);
    }
    return box;
  }

  // 체커보드 디더링: 6px 사각형 격자를 교차로 깔아 픽셀 그라데이션을 표현합니다.
  private dither(yTop: number, rows: number, color: number, depth = 1) {
    for (let r = 0; r < rows; r += 1) {
      for (let c = 0; c < 65; c += 1) {
        if ((c + r) % 2 === 0) {
          this.add.rectangle(q(c * 6), q(yTop + r * 6), 6, 6, color).setOrigin(0).setDepth(depth);
        }
      }
    }
  }

  private render() {
    this.children.removeAll();
    this.add.rectangle(195, 405, 390, 810, PAL.bgDeep).setDepth(0);
    if (this.playing) {
      this.renderPlayPreview();
    } else {
      this.renderGarageHome();
    }
  }

  private renderGarageHome() {
    this.renderHomeBackdrop();
    this.renderTopBar();

    // 상단 주문 카드 (A안과 동일 데이터)
    this.panel(195, 125, 246, 60, PAL.panel, 20);
    this.label(84, 101, "TODAY'S ORDER", 8, TXT.gray, true).setDepth(21);
    this.label(84, 113, '통학용 어반 바이크', 13, TXT.white, true).setDepth(21);
    this.label(84, 134, '진행 2 / 4 · 보상 1,000', 9, TXT.yellow, true).setDepth(21);
    drawDreamBikeMini(this, 285, 127, 0.32, PAL.cyan, PAL.gray, 22);

    // 좌측 버튼: 이벤트·랭킹
    this.button(39, 207, 54, 48, 'EVENT\n3', () => this.notify('이벤트 준비 중'));
    this.button(39, 267, 54, 48, 'RANK\n#18', () => this.notify('랭킹 준비 중'));
    // 우측 버튼: 투어·조립·상태
    this.button(351, 207, 54, 48, 'TOUR\nD2', () => this.notify('투어 준비 중'));
    this.button(351, 267, 54, 48, '조립\n2/4', () => this.notify('조립 현황'));
    this.button(351, 327, 54, 48, 'STATUS\nLv.12', () => this.notify('견습 정비사 Lv.12'));

    // 중앙 전시 무대: 어두운 알코브 + 코너 도트 + 픽셀 단상 위 드림 바이크
    this.panel(195, 306, 258, 276, PAL.panelDark, 10, PAL.cyanDeep);
    const stageCorners: Array<[number, number]> = [[78, 180], [312, 180], [78, 432], [312, 432]];
    stageCorners.forEach(([cx, cy]) => {
      this.add.rectangle(q(cx), q(cy), 6, 6, PAL.cyanDeep).setDepth(10);
    });
    this.label(195, 186, 'MY LITTLE GARAGE', 9, TXT.cyan, true).setOrigin(0.5).setDepth(14);
    this.label(195, 207, '나의 드림 로드바이크', 17, TXT.white, true).setOrigin(0.5).setDepth(14);
    this.label(195, 228, '아케이드 무대 위에 전시 중', 9, TXT.gray).setOrigin(0.5).setDepth(14);

    // 픽셀 단상(계단형 3단) — 좌우 벽 소품(공구·주문 보드)을 가리지 않는 폭으로 제한합니다.
    this.add.rectangle(195, 402, q(222), 12, PAL.panel).setStrokeStyle(3, PAL.cyan).setDepth(11);
    this.add.rectangle(195, 414, q(246), 12, PAL.panelDark).setStrokeStyle(3, PAL.cyanDeep).setDepth(11);
    this.add.rectangle(195, 426, q(270), 12, PAL.panelDark).setStrokeStyle(3, PAL.ink).setDepth(11);
    // 바닥 그림자 → 자전거 순서로 겹칩니다.
    this.add.ellipse(195, 399, 210, 18, PAL.ink, 0.45).setDepth(12);
    // 중앙 드림 바이크: 화면에서 가장 큰 오브젝트. 우측 STATUS 버튼을 침범하지 않는 스케일로 제한합니다.
    drawDreamBike(this, 195, 350, 0.92, BIKE_PALETTE, 13, { style: 'road', pixelStep: 3 });

    // 중앙 하단: 수집률·다음 목표 (A안과 동일 데이터)
    this.panel(195, 480, 234, 72, PAL.panel, 14);
    this.label(96, 456, 'COLLECTION', 8, TXT.gray, true).setDepth(15);
    this.label(96, 469, '8 / 24', 16, TXT.white, true).setDepth(15);
    this.label(192, 456, 'NEXT GOAL', 8, TXT.gray, true).setDepth(15);
    this.label(192, 470, 'TRAIL MTB', 12, TXT.cyan, true).setDepth(15);
    this.label(192, 490, '주문 2건 남음', 9, TXT.magenta, true).setDepth(15);

    // Garage 성장 게이지 33% (채움 폭은 라벨 수치와 일치하도록 실비율 사용)
    this.add.rectangle(90, 528, q(210), 12, PAL.ink).setOrigin(0, 0.5).setDepth(14);
    this.add.rectangle(90, 528, Math.round(210 * 0.33), 12, PAL.cyan).setOrigin(0, 0.5).setDepth(15);
    this.label(195, 546, 'Garage 성장 33%', 9, TXT.gray, true).setOrigin(0.5).setDepth(15);

    // 토스트 영역: 버튼 탭 결과를 짧은 안내로 교체 표시
    this.panel(195, 594, 330, 48, PAL.panelDark, 20, PAL.yellow);
    this.label(195, 594, this.toast, 10, TXT.white, true).setOrigin(0.5).setDepth(21);

    // 하단 바: 프로필 / PLAY / 자전거 도감
    this.panel(195, 747, 366, 84, PAL.panelDark, 20);
    this.button(69, 744, 78, 48, '프로필\nLv.12', () => this.notify('견습 정비사 프로필'));
    // PLAY: INSERT COIN 감성의 정적 강조(굵은 2중 보더, 애니메이션 없음)
    this.button(195, 741, 162, 60, '▶ PLAY', () => {
      this.playing = true;
      this.toast = '같은 레벨 부품을 합쳐 주문을 완성해 보세요.'; // 미리보기 진입 시 홈 문구가 남지 않게 초기화
      this.render();
    }, true, 'PRESS START');
    this.button(321, 744, 78, 48, '자전거\n8/24', () => this.notify('자전거 도감'));
    this.label(195, 795, 'DREAM BIKE GARAGE · RETRO ARCADE HOME', 8, TXT.gray, true).setOrigin(0.5).setDepth(23);
  }

  // 홈 배경: 하늘 → 벽 → 바닥 3단 남색과 디더링 전환부, 낮은 대비의 벽 소품
  private renderHomeBackdrop() {
    this.add.rectangle(195, 48, 390, 96, PAL.bgDeep).setDepth(0);
    this.add.rectangle(195, 330, 390, 468, PAL.bgWall).setDepth(0);
    this.add.rectangle(195, 687, 390, 246, PAL.bgFloor).setDepth(0);

    // 하늘의 픽셀 별(6px 사각형)
    const stars: Array<[number, number]> = [[45, 72], [117, 78], [273, 72], [339, 78]];
    stars.forEach(([sx, sy], i) => {
      this.add.rectangle(q(sx), q(sy), 6, 6, i % 2 === 0 ? PAL.white : PAL.yellow, 0.8)
        .setOrigin(0).setDepth(1);
    });

    // 디더링: 하늘→벽, 벽→바닥 전환부에 체커보드 2~3줄
    this.dither(84, 2, PAL.bgWall, 1);
    this.dither(96, 1, PAL.bgDeep, 1);
    this.dither(552, 2, PAL.bgFloor, 1);
    this.dither(564, 1, PAL.bgWall, 1);

    // 바닥 이음새(수평 라인 대용의 얇은 사각형)
    this.add.rectangle(195, 636, 390, 6, PAL.panelDark, 0.5).setDepth(1);
    this.add.rectangle(195, 684, 390, 6, PAL.panelDark, 0.5).setDepth(1);

    // 좌측 공구 보드: 어두운 톤의 공구 실루엣(중앙 자전거보다 낮은 대비)
    this.add.rectangle(39, 399, 54, 90, PAL.panelDark).setStrokeStyle(3, PAL.ink).setDepth(2);
    this.label(39, 366, 'TOOL', 8, TXT.gray, true).setOrigin(0.5).setDepth(3);
    [PAL.cyanDeep, PAL.yellowDeep, PAL.magentaDeep].forEach((c, i) => {
      this.add.rectangle(q(24 + i * 15), 408, 12, 30, c).setStrokeStyle(2, PAL.ink).setDepth(3);
    });

    // 우측 주문 보드: 회색 전표 3장
    this.add.rectangle(351, 399, 54, 90, PAL.panelDark).setStrokeStyle(3, PAL.ink).setDepth(2);
    this.label(351, 366, 'ORDER', 8, TXT.gray, true).setOrigin(0.5).setDepth(3);
    [0, 1, 2].forEach((i) => {
      this.add.rectangle(351, q(378 + i * 24), 36, 12, PAL.gray).setStrokeStyle(2, PAL.ink).setDepth(3);
    });
  }

  // 상단 바: 에너지 72/100 + 게이지, 코인 2,480 (A안과 동일 데이터)
  private renderTopBar() {
    this.panel(195, 39, 366, 54, PAL.panel, 20);
    this.label(24, 15, 'ENERGY', 9, TXT.white, true).setDepth(21);
    this.label(24, 29, '72 / 100', 13, TXT.cyan, true).setDepth(21);
    this.add.rectangle(114, 35, q(72), 8, PAL.ink).setOrigin(0, 0.5).setDepth(21);
    this.add.rectangle(114, 35, Math.round(72 * 0.72), 8, PAL.cyan).setOrigin(0, 0.5).setDepth(22);
    this.add.rectangle(246, 35, 12, 12, PAL.yellow).setStrokeStyle(2, PAL.ink).setDepth(21); // 픽셀 코인
    this.label(270, 15, 'COIN', 9, TXT.white, true).setDepth(21);
    this.label(270, 29, '2,480', 14, TXT.yellow, true).setDepth(21);
  }

  // 축약 플레이 미리보기: 주문 헤더 + 5x4 머지 보드 요약 (A안과 동일 데이터)
  private renderPlayPreview() {
    this.add.rectangle(195, 405, 390, 810, PAL.bgWall).setDepth(0);
    this.dither(66, 2, PAL.bgDeep, 1);
    this.renderTopBar();

    this.button(57, 105, 84, 42, '← HOME', () => {
      this.playing = false;
      this.toast = 'Garage로 돌아왔습니다. 결과가 이곳에 쌓입니다.';
      this.render();
    });
    this.panel(243, 105, 270, 48, PAL.panel, 20);
    this.label(117, 90, 'ORDER #01 · 통학용 어반 바이크', 9, TXT.white, true).setDepth(21);
    this.label(117, 108, '조립 진행 2 / 4 · 보상 1,000', 9, TXT.yellow, true).setDepth(21);

    // 머지 보드: A안과 동일한 parts 배열을 레벨별 색으로 표시
    this.panel(195, 375, 342, 480, PAL.panelDark, 10, PAL.cyanDeep);
    this.label(48, 147, 'MERGE WORKBENCH', 10, TXT.cyan, true).setDepth(11);
    const levelColors: number[] = [PAL.ink, PAL.cyan, PAL.yellow, PAL.magenta];
    const parts = [1, 1, 2, 0, 3, 0, 2, 0, 1, 0, 0, 3, 0, 2, 0, 1, 0, 0, 2, 0];
    parts.forEach((level, i) => {
      const cx = 63 + (i % 5) * 66;
      const cy = q(216 + Math.floor(i / 5) * 84);
      this.add.rectangle(cx, cy, 54, 72, level ? PAL.panel : PAL.bgDeep)
        .setStrokeStyle(3, level ? PAL.gray : PAL.ink).setDepth(11);
      if (level) {
        // 부품 아이콘도 원 대신 사각형으로 표현해 픽셀 정체성을 유지합니다.
        this.add.rectangle(cx, cy - 12, 18, 18, levelColors[level]).setStrokeStyle(3, PAL.ink).setDepth(12);
        this.label(cx, cy + 18, `Lv.${level}`, 9, TXT.white, true).setOrigin(0.5).setDepth(12);
      }
    });
    this.label(195, 528, '같은 레벨 부품을 합치면 조립 진행이 차오릅니다.', 9, TXT.gray).setOrigin(0.5).setDepth(11);
    [1, 2, 3].forEach((lv, i) => {
      const lx = q(111 + i * 84);
      this.add.rectangle(lx, 555, 12, 12, levelColors[lv]).setStrokeStyle(2, PAL.ink).setDepth(11);
      this.label(lx + 12, 549, `LV.${lv}`, 9, TXT.gray, true).setDepth(11);
    });

    this.panel(195, 645, 342, 48, PAL.panel, 20);
    this.label(195, 645, 'PLAY 화면은 기능 검증용 축약 미리보기입니다.', 10, TXT.white, true).setOrigin(0.5).setDepth(21);
    this.button(195, 714, 174, 54, '부품 주문하기', () => this.notify('부품이 배송되었습니다.'), true);
    this.label(195, 765, this.toast, 9, TXT.yellow, true).setOrigin(0.5).setDepth(21);
    this.label(195, 789, '완료 후 HOME으로 돌아가 Garage 성장을 확인', 8, TXT.gray).setOrigin(0.5).setDepth(21);
  }

  // 토스트 갱신 후 재렌더 (A안과 동일 패턴)
  private notify(message: string) {
    this.toast = message;
    this.render();
  }
}
