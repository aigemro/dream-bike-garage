import Phaser from 'phaser';

// 홈 화면 디자인 트랙 공용 드림 바이크 드로잉 모듈.
// A안의 단순 프레임 대비 스포크·허브·체인·크랭크·페달·안장·핸들바까지 표현해
// "대표 자전거"가 화면의 주인공으로 보이도록 디테일을 높였습니다.

export type BikeStyle = 'road' | 'city';

export interface BikePalette {
  frame: number; // 프레임 주 색상
  frameShadow: number; // 프레임 하단 음영
  tire: number; // 타이어
  rim: number; // 림·허브 외곽
  spoke: number; // 스포크
  metal: number; // 크랭크·핸들바·싯포스트 금속부
  saddle: number; // 안장·그립
  accent: number; // 허브 중심·헤드 배지 포인트
}

export interface BikeOptions {
  style?: BikeStyle; // road: 드롭바 / city: 플랫바
  pixelStep?: number; // 지정 시 모든 좌표를 격자에 스냅해 픽셀풍 유지
  partAlpha?: Partial<Record<'frame' | 'wheel' | 'drivetrain' | 'handlebar', number>>; // 주문 카드의 부품별 완성 상태
}

// 픽셀풍 씬에서 좌표를 격자에 맞추기 위한 스냅 함수
function snap(value: number, step?: number) {
  return step && step > 0 ? Math.round(value / step) * step : value;
}

/**
 * 상세 드림 바이크를 그립니다. (측면, 오른쪽 방향)
 * @param x 자전거 중심 x (앞뒤 바퀴 축의 중간)
 * @param y 바퀴 축 높이 y
 * @param scale 1일 때 약 300×150px
 */
export function drawDreamBike(
  scene: Phaser.Scene,
  x: number,
  y: number,
  scale: number,
  palette: BikePalette,
  depth: number,
  options: BikeOptions = {},
): Phaser.GameObjects.Graphics {
  const { style = 'road', pixelStep } = options;
  const partAlpha = {
    frame: options.partAlpha?.frame ?? 1,
    wheel: options.partAlpha?.wheel ?? 1,
    drivetrain: options.partAlpha?.drivetrain ?? 1,
    handlebar: options.partAlpha?.handlebar ?? 1,
  };
  const s = scale;
  const g = scene.add.graphics().setDepth(depth);
  const px = (v: number) => snap(v, pixelStep);

  // 기준 좌표 (축 높이 y 기준)
  const wheelR = 46 * s;
  const rear = { x: px(x - 82 * s), y: px(y) };
  const front = { x: px(x + 82 * s), y: px(y) };
  const bb = { x: px(x - 10 * s), y: px(y + 8 * s) }; // 바텀브래킷
  const seatTop = { x: px(x - 36 * s), y: px(y - 54 * s) }; // 시트 클러스터
  const headTop = { x: px(x + 54 * s), y: px(y - 50 * s) }; // 헤드튜브 상단
  const headBottom = { x: px(x + 64 * s), y: px(y - 26 * s) }; // 헤드튜브 하단

  // 바퀴: 타이어 → 림 → 스포크 → 허브 순서로 겹쳐 그림
  const drawWheel = (cx: number, cy: number) => {
    g.lineStyle(9 * s, palette.tire, partAlpha.wheel).strokeCircle(cx, cy, wheelR);
    g.lineStyle(3.5 * s, palette.rim, partAlpha.wheel).strokeCircle(cx, cy, wheelR - 7.5 * s);
    g.lineStyle(2 * s, palette.spoke, partAlpha.wheel);
    const spokeCount = pixelStep ? 8 : 10;
    for (let i = 0; i < spokeCount; i += 1) {
      const angle = (Math.PI * 2 * i) / spokeCount + (pixelStep ? 0 : 0.24);
      g.lineBetween(
        px(cx + Math.cos(angle) * 6 * s), px(cy + Math.sin(angle) * 6 * s),
        px(cx + Math.cos(angle) * (wheelR - 9 * s)), px(cy + Math.sin(angle) * (wheelR - 9 * s)),
      );
    }
    g.fillStyle(palette.rim, partAlpha.wheel).fillCircle(cx, cy, 6 * s);
    g.fillStyle(palette.accent, partAlpha.wheel).fillCircle(cx, cy, 3 * s);
  };
  drawWheel(rear.x, rear.y);
  drawWheel(front.x, front.y);

  // 구동계: 체인이 프레임 뒤에 깔리도록 프레임보다 먼저 그림
  const chainringR = 15 * s;
  const cogR = 7 * s;
  g.lineStyle(3 * s, palette.metal, partAlpha.drivetrain);
  g.lineBetween(bb.x, bb.y - chainringR, rear.x, rear.y - cogR); // 체인 상단
  g.lineBetween(bb.x, bb.y + chainringR, rear.x, rear.y + cogR); // 체인 하단
  g.lineStyle(3.5 * s, palette.rim, partAlpha.drivetrain).strokeCircle(rear.x, rear.y, cogR); // 뒤 스프라켓

  // 프레임 음영: 본체보다 살짝 아래로 어두운 색을 깔아 입체감 부여
  const frameLines: Array<[{ x: number; y: number }, { x: number; y: number }]> = [
    [bb, seatTop], // 시트튜브
    [seatTop, headTop], // 탑튜브
    [bb, headBottom], // 다운튜브
    [headTop, headBottom], // 헤드튜브
    [bb, rear], // 체인스테이
    [rear, seatTop], // 시트스테이
    [headBottom, front], // 포크
  ];
  g.lineStyle(8 * s, palette.frameShadow, partAlpha.frame);
  frameLines.forEach(([a, b]) => g.lineBetween(a.x, a.y + 2.5 * s, b.x, b.y + 2.5 * s));
  g.lineStyle(7 * s, palette.frame, partAlpha.frame);
  frameLines.forEach(([a, b]) => g.lineBetween(a.x, a.y, b.x, b.y));

  // 크랭크·체인링·페달
  g.fillStyle(palette.metal, partAlpha.drivetrain).fillCircle(bb.x, bb.y, 5 * s);
  g.lineStyle(4 * s, palette.rim, partAlpha.drivetrain).strokeCircle(bb.x, bb.y, chainringR);
  g.lineStyle(4.5 * s, palette.metal, partAlpha.drivetrain);
  const pedalFront = { x: px(bb.x + 15 * s), y: px(bb.y + 13 * s) };
  const pedalRear = { x: px(bb.x - 15 * s), y: px(bb.y - 13 * s) };
  g.lineBetween(bb.x, bb.y, pedalFront.x, pedalFront.y);
  g.lineBetween(bb.x, bb.y, pedalRear.x, pedalRear.y);
  g.fillStyle(palette.tire, partAlpha.drivetrain);
  g.fillRect(pedalFront.x - 8 * s, pedalFront.y - 2.5 * s, 16 * s, 5 * s);
  g.fillRect(pedalRear.x - 8 * s, pedalRear.y - 2.5 * s, 16 * s, 5 * s);

  // 싯포스트와 안장
  const saddle = { x: px(x - 41 * s), y: px(y - 68 * s) };
  g.lineStyle(4.5 * s, palette.metal, partAlpha.frame).lineBetween(seatTop.x, seatTop.y, saddle.x + 3 * s, saddle.y + 4 * s);
  g.fillStyle(palette.saddle, partAlpha.frame).fillRoundedRect(saddle.x - 19 * s, saddle.y - 5 * s, 38 * s, 9 * s, 4 * s);

  // 스템과 핸들바 (road: 드롭바 / city: 플랫바)
  const stemEnd = { x: px(headTop.x + 6 * s), y: px(headTop.y - 10 * s) };
  g.lineStyle(4.5 * s, palette.metal, partAlpha.handlebar).lineBetween(headTop.x, headTop.y, stemEnd.x, stemEnd.y);
  if (style === 'road') {
    g.lineStyle(4.5 * s, palette.metal, partAlpha.handlebar);
    g.lineBetween(stemEnd.x, stemEnd.y, px(stemEnd.x + 15 * s), stemEnd.y);
    g.lineBetween(px(stemEnd.x + 15 * s), stemEnd.y, px(stemEnd.x + 19 * s), px(stemEnd.y + 12 * s));
    g.lineBetween(px(stemEnd.x + 19 * s), px(stemEnd.y + 12 * s), px(stemEnd.x + 10 * s), px(stemEnd.y + 17 * s));
    g.fillStyle(palette.saddle, partAlpha.handlebar).fillCircle(px(stemEnd.x + 10 * s), px(stemEnd.y + 17 * s), 3.5 * s);
  } else {
    g.lineStyle(4.5 * s, palette.metal, partAlpha.handlebar).lineBetween(px(stemEnd.x - 13 * s), px(stemEnd.y + 2 * s), px(stemEnd.x + 12 * s), px(stemEnd.y - 2 * s));
    g.fillStyle(palette.saddle, partAlpha.handlebar).fillRoundedRect(px(stemEnd.x - 17 * s), px(stemEnd.y) - 2 * s, 9 * s, 5 * s, 2 * s);
  }

  // 헤드 배지 포인트: 프레임의 시선 포인트
  g.fillStyle(palette.accent, partAlpha.frame).fillCircle(px((headTop.x + headBottom.x) / 2), px((headTop.y + headBottom.y) / 2), 3.5 * s);
  return g;
}

/**
 * 주문 카드 등 작은 영역용 미니 자전거. 상세판과 같은 실루엣을 단순화했습니다.
 */
export function drawDreamBikeMini(
  scene: Phaser.Scene,
  x: number,
  y: number,
  scale: number,
  frameColor: number,
  tireColor: number,
  depth: number,
): Phaser.GameObjects.Graphics {
  const s = scale;
  const g = scene.add.graphics().setDepth(depth);
  const r = 20 * s;
  const rear = { x: x - 34 * s, y };
  const front = { x: x + 34 * s, y };
  const bb = { x: x - 4 * s, y: y + 4 * s };
  const seatTop = { x: x - 16 * s, y: y - 22 * s };
  const headTop = { x: x + 22 * s, y: y - 21 * s };
  g.lineStyle(4 * s, tireColor).strokeCircle(rear.x, rear.y, r).strokeCircle(front.x, front.y, r);
  g.lineStyle(1.5 * s, 0xffffff, 0.55);
  [rear, front].forEach((w) => {
    for (let i = 0; i < 4; i += 1) {
      const angle = (Math.PI * i) / 4;
      g.lineBetween(w.x - Math.cos(angle) * (r - 3 * s), w.y - Math.sin(angle) * (r - 3 * s), w.x + Math.cos(angle) * (r - 3 * s), w.y + Math.sin(angle) * (r - 3 * s));
    }
  });
  g.lineStyle(3.5 * s, frameColor);
  g.lineBetween(bb.x, bb.y, seatTop.x, seatTop.y);
  g.lineBetween(seatTop.x, seatTop.y, headTop.x, headTop.y);
  g.lineBetween(bb.x, bb.y, headTop.x + 4 * s, headTop.y + 10 * s);
  g.lineBetween(bb.x, bb.y, rear.x, rear.y);
  g.lineBetween(rear.x, rear.y, seatTop.x, seatTop.y);
  g.lineBetween(headTop.x + 4 * s, headTop.y + 10 * s, front.x, front.y);
  g.lineStyle(2.5 * s, frameColor).lineBetween(headTop.x + 4 * s, headTop.y + 10 * s, headTop.x, headTop.y);
  g.fillStyle(tireColor).fillRoundedRect(seatTop.x - 9 * s, seatTop.y - 6 * s, 14 * s, 3.5 * s, 1.5 * s);
  g.lineStyle(2.5 * s, tireColor).lineBetween(headTop.x, headTop.y, headTop.x + 7 * s, headTop.y - 4 * s);
  return g;
}
