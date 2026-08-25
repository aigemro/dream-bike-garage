import Phaser from 'phaser';

// 따뜻한 생활형 픽셀 자전거 스프라이트 모듈.
// 기존 home-design-bike의 선(line) 드로잉 대신, 캐릭터 A안(art-character-pixel)과
// 같은 문법의 픽셀 그리드 위에 카테고리별 실제 자전거 지오메트리를 래스터라이즈합니다.
// - 굵은 잉크 외곽선 + 2톤 음영(상단 하이라이트·하단 음영)으로 스타듀밸리풍 질감을 만듭니다.
// - 로드(드롭바·물통), MTB(서스펜션 포크·노브 타이어·슬로핑 탑튜브),
//   그래블(드롭바·탑튜브 백·세미 노브), 미니벨로(작은 바퀴·긴 싯포스트·긴 헤드튜브),
//   시티(플랫바·펜더·앞바구니)로 실루엣을 구분합니다.
// - 부품 그룹(frame/wheel/drivetrain/handlebar)별 알파를 지원해 주문 진행 연출에 쓰고,
//   실루엣 모드로 도감의 미획득 상태를 표현합니다.
// - 성능: Graphics 경로(drawPixelBike)는 행 단위 RLE 병합에도 자전거 1대당 수백 개의
//   커맨드를 매 프레임 재처리하므로, 도감처럼 여러 대를 동시에 그리는 화면은
//   텍스처 캐시 경로(addPixelBikeImage)를 사용하세요.

export type BikeCategory = 'road' | 'mtb' | 'gravel' | 'minivelo' | 'city';
export type BikePartGroup = 'frame' | 'wheel' | 'drivetrain' | 'handlebar';

// 픽셀 역할: 같은 부품 그룹 안에서도 본색·음영·하이라이트를 구분합니다.
type Role =
  | 'tire' | 'tireShade' | 'rim' | 'spoke' | 'hub' | 'cassette'
  | 'frame' | 'frameShade' | 'frameLight' | 'seatpost' | 'saddle' | 'saddleShade'
  | 'headBadge' | 'bottle' | 'bag' | 'basket' | 'fender'
  | 'chain' | 'ring' | 'crank' | 'pedal'
  | 'bar' | 'stem' | 'grip'
  | 'ink';

// 역할 → 부품 그룹 매핑 (잉크 외곽선은 이웃 픽셀의 그룹을 따라갑니다)
const ROLE_GROUP: Record<Exclude<Role, 'ink'>, BikePartGroup> = {
  tire: 'wheel', tireShade: 'wheel', rim: 'wheel', spoke: 'wheel', hub: 'wheel', cassette: 'drivetrain',
  frame: 'frame', frameShade: 'frame', frameLight: 'frame', seatpost: 'frame',
  saddle: 'frame', saddleShade: 'frame', headBadge: 'frame',
  bottle: 'frame', bag: 'frame', basket: 'frame', fender: 'frame',
  chain: 'drivetrain', ring: 'drivetrain', crank: 'drivetrain', pedal: 'drivetrain',
  bar: 'handlebar', stem: 'handlebar', grip: 'handlebar',
};

// 잉크 외곽선을 두르는 "면" 역할. 스포크·체인 같은 1px 디테일은 잉크를 두르지 않습니다.
const OUTLINED_ROLES = new Set<Role>([
  'tire', 'tireShade', 'frame', 'frameShade', 'frameLight', 'seatpost',
  'saddle', 'saddleShade', 'bottle', 'bag', 'basket', 'fender',
  'ring', 'crank', 'pedal', 'bar', 'stem', 'grip',
]);

type Cell = { role: Role; group: BikePartGroup };
type Grid = { width: number; height: number; cells: Array<Cell | undefined> };

export interface BikeColorway {
  ink: number;
  frame: number; frameShade: number; frameLight: number;
  tire: number; tireShade: number; rim: number; spoke: number; hub: number;
  seatpost: number; saddle: number; saddleShade: number;
  chain: number; ring: number; crank: number; pedal: number; cassette: number;
  bar: number; stem: number; grip: number;
  headBadge: number; bottle: number; bag: number; basket: number; fender: number;
}

export interface PixelBikeOptions {
  category?: BikeCategory;
  colorway?: BikeColorway;
  depth?: number;
  // 부품 그룹별 알파: 주문 카드에서 미장착 부품을 흐리게 표현
  partAlpha?: Partial<Record<BikePartGroup, number>>;
  // 실루엣 모드: 도감 미획득 칸처럼 단색 그림자로 표현
  silhouette?: { body: number; ink: number };
}

// ─── 색 유틸 ───────────────────────────────────────────────────────────

// 색상 채널을 비율로 곱해 음영(factor<1)·하이라이트(factor>1)를 만듭니다.
function shade(color: number, factor: number): number {
  const r = Math.min(255, Math.round(((color >> 16) & 0xff) * factor));
  const g = Math.min(255, Math.round(((color >> 8) & 0xff) * factor));
  const b = Math.min(255, Math.round((color & 0xff) * factor));
  return (r << 16) | (g << 8) | b;
}

// 홈 A안 팔레트를 기준으로 프레임 색 하나에서 전체 컬러웨이를 만듭니다.
export function makeWarmColorway(frameColor: number): BikeColorway {
  return {
    ink: 0x3b2531,
    frame: frameColor,
    frameShade: shade(frameColor, 0.72),
    frameLight: shade(frameColor, 1.28),
    tire: 0x453a4b,
    tireShade: 0x302936,
    rim: 0xfff1c6,
    spoke: 0xd9c197,
    hub: 0xa39985,
    seatpost: 0xa39985,
    saddle: 0x573044,
    saddleShade: 0x41202f,
    chain: 0x8d8779,
    ring: 0xc2bcae,
    crank: 0xa39985,
    pedal: 0x573044,
    cassette: 0xc2bcae,
    bar: 0xa39985,
    stem: 0xa39985,
    grip: 0x573044,
    headBadge: 0xf4b84a,
    bottle: 0xfff1c6,
    bag: 0x8e5136,
    basket: 0xb98a4e,
    fender: shade(frameColor, 0.85),
  };
}

// ─── 픽셀 래스터 프리미티브 ────────────────────────────────────────────

const GRID_W = 64;
const GRID_H = 40;

function makeGrid(): Grid {
  return { width: GRID_W, height: GRID_H, cells: new Array<Cell | undefined>(GRID_W * GRID_H) };
}

function plot(grid: Grid, x: number, y: number, role: Exclude<Role, 'ink'>) {
  const px = Math.round(x);
  const py = Math.round(y);
  if (px < 0 || py < 0 || px >= grid.width || py >= grid.height) return;
  grid.cells[py * grid.width + px] = { role, group: ROLE_GROUP[role] };
}

function cellAt(grid: Grid, x: number, y: number): Cell | undefined {
  if (x < 0 || y < 0 || x >= grid.width || y >= grid.height) return undefined;
  return grid.cells[y * grid.width + x];
}

// 브레젠험 직선. thickness는 기울기에 수직 방향으로 확장해 튜브 두께를 만듭니다.
function plotLine(
  grid: Grid,
  x0: number, y0: number, x1: number, y1: number,
  role: Exclude<Role, 'ink'>, thickness = 1,
) {
  let cx = Math.round(x0);
  let cy = Math.round(y0);
  const tx = Math.round(x1);
  const ty = Math.round(y1);
  const dx = Math.abs(tx - cx);
  const dy = Math.abs(ty - cy);
  const sx = cx < tx ? 1 : -1;
  const sy = cy < ty ? 1 : -1;
  let err = dx - dy;
  const horizontalish = dx >= dy; // 완만하면 세로로, 가파르면 가로로 두께를 확장
  const offsets = thickness === 1 ? [0] : thickness === 2 ? [0, 1] : [-1, 0, 1];
  for (;;) {
    offsets.forEach((offset) => {
      if (horizontalish) plot(grid, cx, cy + offset, role);
      else plot(grid, cx + offset, cy, role);
    });
    if (cx === tx && cy === ty) break;
    const e2 = err * 2;
    if (e2 > -dy) { err -= dy; cx += sx; }
    if (e2 < dx) { err += dx; cy += sy; }
  }
}

// 도넛 링: 타이어·림·체인링에 사용. roleFor로 픽셀 위치별 역할(음영)을 정합니다.
function plotRing(
  grid: Grid,
  cx: number, cy: number, radius: number, thickness: number,
  roleFor: (x: number, y: number) => Exclude<Role, 'ink'>,
) {
  const reach = Math.ceil(radius) + 1;
  for (let y = cy - reach; y <= cy + reach; y += 1) {
    for (let x = cx - reach; x <= cx + reach; x += 1) {
      const distance = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
      if (distance <= radius + 0.4 && distance > radius - thickness + 0.4) plot(grid, x, y, roleFor(x, y));
    }
  }
}

function plotRect(
  grid: Grid,
  x0: number, y0: number, x1: number, y1: number,
  role: Exclude<Role, 'ink'>,
) {
  for (let y = y0; y <= y1; y += 1) for (let x = x0; x <= x1; x += 1) plot(grid, x, y, role);
}

// ─── 바퀴·음영·외곽선 공통 처리 ────────────────────────────────────────

type WheelStyle = { radius: number; tireThickness: number; knobStep?: number; spokeStep: number };

function plotWheel(grid: Grid, cx: number, cy: number, style: WheelStyle) {
  const { radius, tireThickness, knobStep, spokeStep } = style;
  // 타이어: 아래쪽 절반은 음영 톤으로 눌러 바닥의 무게감을 만듭니다.
  plotRing(grid, cx, cy, radius, tireThickness, (_x, y) => (y > cy + 1 ? 'tireShade' : 'tire'));
  // 노브(MTB·그래블): 타이어 바깥으로 한 픽셀씩 튀어나오는 돌기
  if (knobStep) {
    for (let angle = 0; angle < 360; angle += knobStep) {
      const rad = (angle * Math.PI) / 180;
      plot(grid, cx + Math.cos(rad) * (radius + 1), cy + Math.sin(rad) * (radius + 1), 'tireShade');
    }
  }
  // 림: 타이어 안쪽에 빈틈 없이 붙는 밝은 크림 링 (틈이 생기면 잉크가 끼어 바퀴가 두꺼워 보입니다)
  plotRing(grid, cx, cy, radius - tireThickness, 1, () => 'rim');
  // 스포크: 잉크를 두르지 않는 1px 디테일
  for (let angle = 0; angle < 360; angle += spokeStep) {
    const rad = (angle * Math.PI) / 180;
    plotLine(
      grid,
      cx + Math.cos(rad) * 1.6, cy + Math.sin(rad) * 1.6,
      cx + Math.cos(rad) * (radius - tireThickness - 1.4), cy + Math.sin(rad) * (radius - tireThickness - 1.4),
      'spoke', 1,
    );
  }
  plot(grid, cx, cy, 'hub');
  plot(grid, cx + 1, cy, 'hub');
  plot(grid, cx, cy + 1, 'hub');
  plot(grid, cx - 1, cy, 'hub');
  plot(grid, cx, cy - 1, 'hub');
}

// 프레임 튜브 2톤 음영: 3px 이상 튜브는 윗줄 하이라이트, 모든 튜브는 아랫줄 음영.
function applyFrameShading(grid: Grid) {
  const snapshot = grid.cells.map((cell) => cell?.role);
  for (let y = 0; y < grid.height; y += 1) {
    for (let x = 0; x < grid.width; x += 1) {
      if (snapshot[y * grid.width + x] !== 'frame') continue;
      const above = snapshot[(y - 1) * grid.width + x] === 'frame';
      const below = snapshot[(y + 1) * grid.width + x] === 'frame';
      const belowTwo = snapshot[(y + 2) * grid.width + x] === 'frame';
      if (!above && below && belowTwo) plot(grid, x, y, 'frameLight');
      else if (above && !below) plot(grid, x, y, 'frameShade');
    }
  }
}

// 잉크 외곽선: 면 역할과 맞닿은 빈 칸을 이웃 부품 그룹의 잉크로 채웁니다.
function applyInkOutline(grid: Grid) {
  const additions: Array<{ x: number; y: number; group: BikePartGroup }> = [];
  for (let y = 0; y < grid.height; y += 1) {
    for (let x = 0; x < grid.width; x += 1) {
      if (cellAt(grid, x, y)) continue;
      const neighbors = [cellAt(grid, x - 1, y), cellAt(grid, x + 1, y), cellAt(grid, x, y - 1), cellAt(grid, x, y + 1)];
      const outlined = neighbors.find((cell) => cell && cell.role !== 'ink' && OUTLINED_ROLES.has(cell.role));
      if (outlined) additions.push({ x, y, group: outlined.group });
    }
  }
  additions.forEach(({ x, y, group }) => {
    grid.cells[y * grid.width + x] = { role: 'ink', group };
  });
}

// ─── 카테고리별 자전거 지오메트리 ──────────────────────────────────────

// 그리드 기준선: 지면 y=37, 큰 바퀴 축 y=27 (미니벨로는 y=30)
const AXLE_Y: Record<BikeCategory, number> = { road: 27, mtb: 27, gravel: 27, city: 27, minivelo: 30 };

type FramePoints = {
  rear: [number, number]; front: [number, number]; bb: [number, number];
  seat: [number, number]; headTop: [number, number]; headBottom: [number, number];
};

// 다이아몬드 프레임 + 구동계 + 싯포스트·안장 공통 플로팅
function plotDiamondFrame(grid: Grid, points: FramePoints, options: { forkThickness?: number; stayThickness?: number } = {}) {
  const { rear, front, bb, seat, headTop, headBottom } = points;
  const forkThickness = options.forkThickness ?? 2;
  const stayThickness = options.stayThickness ?? 2;
  // 스테이(뒤 삼각형) → 메인 튜브 순서로 겹쳐 그립니다.
  plotLine(grid, bb[0], bb[1], rear[0], rear[1], 'frame', stayThickness); // 체인스테이
  plotLine(grid, rear[0], rear[1], seat[0], seat[1], 'frame', stayThickness); // 시트스테이
  plotLine(grid, seat[0], seat[1], bb[0], bb[1], 'frame', 3); // 시트튜브
  plotLine(grid, headBottom[0], headBottom[1], bb[0], bb[1], 'frame', 3); // 다운튜브
  plotLine(grid, seat[0], seat[1], headTop[0], headTop[1], 'frame', 3); // 탑튜브
  plotLine(grid, headTop[0], headTop[1], headBottom[0], headBottom[1], 'frame', 3); // 헤드튜브
  plotLine(grid, headBottom[0], headBottom[1], front[0], front[1], 'frame', forkThickness); // 포크
}

function plotDrivetrain(grid: Grid, bb: [number, number], rear: [number, number], chainringRadius: number) {
  // 체인: 체인링 상·하단에서 카세트 상·하단으로 이어지는 1px 라인
  plotLine(grid, bb[0], bb[1] - chainringRadius, rear[0], rear[1] - 2, 'chain', 1);
  plotLine(grid, bb[0], bb[1] + chainringRadius, rear[0], rear[1] + 2, 'chain', 1);
  plotRing(grid, rear[0], rear[1], 2, 1, () => 'cassette'); // 뒤 카세트
  plotRing(grid, bb[0], bb[1], chainringRadius, 1, () => 'ring'); // 체인링
  // 크랭크 암과 페달 (측면 뷰에서는 앞쪽 크랭크만 강조)
  plotLine(grid, bb[0], bb[1], bb[0] + 4, bb[1] + 3, 'crank', 2);
  plotRect(grid, bb[0] + 3, bb[1] + 4, bb[0] + 6, bb[1] + 4, 'pedal');
}

function plotSaddle(grid: Grid, seat: [number, number], saddleX: number, saddleY: number) {
  plotLine(grid, seat[0], seat[1], saddleX + 1, saddleY + 2, 'seatpost', 1); // 싯포스트
  plotRect(grid, saddleX - 3, saddleY, saddleX + 3, saddleY, 'saddle'); // 안장 윗면
  plotRect(grid, saddleX - 2, saddleY + 1, saddleX + 2, saddleY + 1, 'saddleShade'); // 안장 음영
}

// 드롭바: 앞으로 뻗은 뒤 아래로 말리는 후크 실루엣. 말린 부분은 바 테이프(그립) 색으로 강조합니다.
function plotDropBar(grid: Grid, headTop: [number, number]) {
  const [hx, hy] = headTop;
  plotLine(grid, hx, hy, hx + 2, hy - 3, 'stem', 1); // 스템
  plotLine(grid, hx + 2, hy - 4, hx + 7, hy - 4, 'bar', 1); // 톱 구간
  plot(grid, hx + 8, hy - 3, 'grip');
  plot(grid, hx + 8, hy - 2, 'grip');
  plot(grid, hx + 8, hy - 1, 'grip');
  plot(grid, hx + 7, hy, 'grip');
  plot(grid, hx + 6, hy, 'grip');
}

// 플랫바: 수평 바 + 양끝 그립
function plotFlatBar(grid: Grid, headTop: [number, number]) {
  const [hx, hy] = headTop;
  plotLine(grid, hx, hy, hx + 1, hy - 3, 'stem', 1);
  plotLine(grid, hx - 3, hy - 4, hx + 6, hy - 4, 'bar', 1);
  plot(grid, hx - 3, hy - 4, 'grip');
  plot(grid, hx - 4, hy - 4, 'grip');
  plot(grid, hx + 5, hy - 4, 'grip');
  plot(grid, hx + 6, hy - 4, 'grip');
}

// 카테고리별 그리드 생성 (색과 무관한 순수 지오메트리라 카테고리 단위로 캐시합니다)
const gridCache = new Map<BikeCategory, Grid>();

function buildBikeGrid(category: BikeCategory): Grid {
  const cached = gridCache.get(category);
  if (cached) return cached;
  const grid = makeGrid();

  if (category === 'minivelo') {
    // 미니벨로: 작은 바퀴, 긴 헤드튜브·싯포스트, 콤팩트 프레임
    const points: FramePoints = {
      rear: [16, 30], front: [48, 30], bb: [30, 32],
      seat: [25, 16], headTop: [41, 10], headBottom: [43, 20],
    };
    const wheel: WheelStyle = { radius: 6, tireThickness: 1, spokeStep: 60 };
    plotWheel(grid, points.rear[0], points.rear[1], wheel);
    plotWheel(grid, points.front[0], points.front[1], wheel);
    plotDrivetrain(grid, points.bb, points.rear, 3);
    plotDiamondFrame(grid, points);
    plotSaddle(grid, points.seat, 22, 8);
    plotFlatBar(grid, [points.headTop[0], points.headTop[1] + 1]);
    applyFrameShading(grid);
    plot(grid, 42, 15, 'headBadge');
  } else {
    const isMtb = category === 'mtb';
    const points: FramePoints = {
      rear: [14, 27], front: [50, 27], bb: [30, 30],
      seat: isMtb ? [23, 17] : category === 'gravel' ? [23, 14] : [23, 13],
      headTop: isMtb ? [42, 14] : [42, 13],
      headBottom: [45, isMtb ? 20 : 19],
    };
    const wheel: WheelStyle = {
      radius: 9,
      tireThickness: isMtb ? 2 : 1,
      knobStep: isMtb ? 30 : category === 'gravel' ? 60 : undefined,
      spokeStep: 45,
    };
    plotWheel(grid, points.rear[0], points.rear[1], wheel);
    plotWheel(grid, points.front[0], points.front[1], wheel);
    plotDrivetrain(grid, points.bb, points.rear, 3);
    plotDiamondFrame(grid, points, { forkThickness: isMtb ? 3 : 2 });
    if (isMtb) {
      // 서스펜션 포크: 스탠션 상단을 밝은 톤으로 덮어 이중 구조를 표현
      plotLine(
        grid,
        points.headBottom[0], points.headBottom[1],
        points.headBottom[0] + 2, points.headBottom[1] + 3,
        'frameLight', 2,
      );
    }
    plotSaddle(grid, points.seat, isMtb ? 21 : 22, 8);
    if (category === 'road' || category === 'gravel') plotDropBar(grid, points.headTop);
    else plotFlatBar(grid, points.headTop);
    if (category === 'road') plotRect(grid, 35, 22, 36, 24, 'bottle'); // 다운튜브 물통
    if (category === 'gravel') plotRect(grid, 26, 15, 28, 16, 'bag'); // 탑튜브 백
    if (category === 'city') {
      // 시티: 타이어 위에 바로 붙는 앞·뒤 펜더와 앞바구니로 생활 자전거 실루엣을 만듭니다.
      const plotFender = (cx: number, cy: number) => {
        for (let x = cx - 7; x <= cx + 7; x += 1) {
          for (let y = cy - 11; y <= cy - 3; y += 1) {
            const distance = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
            if (distance <= 10.4 && distance > 9.4) plot(grid, x, y, 'fender');
          }
        }
      };
      plotFender(points.rear[0], points.rear[1]);
      plotFender(points.front[0], points.front[1]);
      plotRect(grid, 47, 11, 51, 13, 'basket');
      plotRect(grid, 48, 12, 50, 13, 'bag');
    }
    applyFrameShading(grid);
    plot(grid, 43, 16, 'headBadge');
  }

  applyInkOutline(grid);
  gridCache.set(category, grid);
  return grid;
}

// ─── 렌더링 ───────────────────────────────────────────────────────────

// 그리드를 Graphics에 렌더링합니다. 같은 행에서 색·알파가 같은 연속 셀을
// 한 번의 fillRect로 병합(RLE)해 Graphics 커맨드 수를 줄입니다.
function renderGridToGraphics(
  g: Phaser.GameObjects.Graphics,
  grid: Grid,
  originX: number,
  originY: number,
  cell: number,
  colorFor: (drawn: Cell) => number,
  alphaFor: (drawn: Cell) => number,
) {
  for (let gy = 0; gy < grid.height; gy += 1) {
    let runStart = -1;
    let runColor = 0;
    let runAlpha = 1;
    const flush = (endX: number) => {
      if (runStart < 0) return;
      g.fillStyle(runColor, runAlpha);
      g.fillRect(originX + runStart * cell, originY + gy * cell, (endX - runStart) * cell, cell);
      runStart = -1;
    };
    for (let gx = 0; gx < grid.width; gx += 1) {
      const drawn = grid.cells[gy * grid.width + gx];
      if (!drawn) { flush(gx); continue; }
      const color = colorFor(drawn);
      const alpha = alphaFor(drawn);
      if (runStart >= 0 && (color !== runColor || alpha !== runAlpha)) flush(gx);
      if (runStart < 0) { runStart = gx; runColor = color; runAlpha = alpha; }
    }
    flush(grid.width);
  }
}

// 실루엣·컬러웨이 옵션에 따른 셀 색상 결정
function bikeCellColor(options: PixelBikeOptions, colorway: BikeColorway) {
  return (drawn: Cell) => (options.silhouette
    ? (drawn.role === 'ink' ? options.silhouette.ink : options.silhouette.body)
    : (drawn.role === 'ink' ? colorway.ink : colorway[drawn.role]));
}

/**
 * 픽셀 자전거를 그립니다. (Graphics 경로 — 부품별 알파 지원)
 * @param x 자전거 중심 x (그리드 가로 중앙)
 * @param y 바퀴 축 높이 y (미니벨로도 같은 기준으로 정렬)
 * @param cell 픽셀 한 칸의 크기(px). 1이면 약 64×40px, 4면 약 256×160px.
 */
export function drawPixelBike(
  scene: Phaser.Scene,
  x: number,
  y: number,
  cell: number,
  options: PixelBikeOptions = {},
): Phaser.GameObjects.Graphics {
  const category = options.category ?? 'road';
  const colorway = options.colorway ?? makeWarmColorway(0xc95746);
  const grid = buildBikeGrid(category);
  const g = scene.add.graphics().setDepth(options.depth ?? 0);
  const originX = Math.round(x - (grid.width / 2) * cell);
  const originY = Math.round(y - AXLE_Y[category] * cell);
  renderGridToGraphics(
    g, grid, originX, originY, cell,
    bikeCellColor(options, colorway),
    (drawn) => options.partAlpha?.[drawn.group] ?? 1,
  );
  return g;
}

/**
 * 픽셀 자전거를 텍스처로 1회 래스터라이즈해 Image로 배치합니다. (텍스처 캐시 경로)
 * 도감 24칸처럼 같은 화면에 여러 대를 그릴 때 Graphics 커맨드가 매 프레임 쌓이는 것을 피합니다.
 * 텍스처 키는 (카테고리, cell, 프레임 색 또는 실루엣 색)으로 구성하므로, 컬러웨이는
 * makeWarmColorway처럼 프레임 색에서 파생된 것을 전제로 합니다. partAlpha가 필요한
 * 주문 카드 연출은 drawPixelBike(Graphics 경로)를 사용하세요.
 */
export function addPixelBikeImage(
  scene: Phaser.Scene,
  x: number,
  y: number,
  cell: number,
  options: Omit<PixelBikeOptions, 'partAlpha'> = {},
): Phaser.GameObjects.Image {
  const category = options.category ?? 'road';
  const colorway = options.colorway ?? makeWarmColorway(0xc95746);
  const grid = buildBikeGrid(category);
  const key = options.silhouette
    ? `bike-${category}-${cell}-sil-${options.silhouette.body.toString(16)}-${options.silhouette.ink.toString(16)}`
    : `bike-${category}-${cell}-${colorway.frame.toString(16)}`;
  if (!scene.textures.exists(key)) {
    const g = scene.add.graphics();
    renderGridToGraphics(g, grid, 0, 0, cell, bikeCellColor(options, colorway), () => 1);
    g.generateTexture(key, Math.ceil(grid.width * cell), Math.ceil(grid.height * cell));
    g.destroy();
  }
  const image = scene.add.image(Math.round(x), Math.round(y), key).setDepth(options.depth ?? 0);
  // 앵커를 Graphics 경로와 동일하게 (x=가로 중앙, y=바퀴 축)으로 맞춥니다.
  image.setOrigin(0.5, AXLE_Y[category] / grid.height);
  return image;
}

// 부품 장착 연출의 목표 좌표: 그리드 기준점을 자전거 앵커(x=중앙, y=축) 대비 픽셀 오프셋으로 환산
export function bikePartAnchorOffset(category: BikeCategory, part: BikePartGroup, cell: number): { dx: number; dy: number } {
  const anchors: Record<BikePartGroup, [number, number]> = {
    frame: [32, category === 'minivelo' ? 15 : 14],
    wheel: [category === 'minivelo' ? 48 : 50, AXLE_Y[category]],
    drivetrain: [30, category === 'minivelo' ? 32 : 30],
    handlebar: [45, category === 'minivelo' ? 8 : 10],
  };
  const [gx, gy] = anchors[part];
  return { dx: (gx - GRID_W / 2) * cell, dy: (gy - AXLE_Y[category]) * cell };
}

// 수집 데이터의 한글 카테고리를 스프라이트 카테고리로 변환합니다.
export function bikeCategoryFromKorean(category: '로드' | 'MTB' | '그래블' | '미니벨로'): BikeCategory {
  return ({ 로드: 'road', MTB: 'mtb', 그래블: 'gravel', 미니벨로: 'minivelo' } as const)[category];
}

// ─── 부품 픽셀 아이콘 (프레임·휠셋·구동계·핸들바) ─────────────────────

// 아이콘 타입은 부품 그룹과 동일한 개념이므로 별칭으로 묶어 유니온이 어긋나는 것을 방지합니다.
export type BikePartIconType = BikePartGroup;

const ICON_W = 16;
const ICON_H = 14;

// 게임 화면 warm 팔레트와 같은 부품 대표색
export const WARM_PART_COLORS: Record<BikePartIconType, number> = {
  frame: 0xc95746, wheel: 0xe7a942, drivetrain: 0x5e9a67, handlebar: 0x4e8092,
};

const iconCache = new Map<BikePartIconType, Grid>();

function buildPartIconGrid(type: BikePartIconType): Grid {
  const cached = iconCache.get(type);
  if (cached) return cached;
  const grid: Grid = { width: ICON_W, height: ICON_H, cells: new Array<Cell | undefined>(ICON_W * ICON_H) };
  if (type === 'frame') {
    // 프레임셋 아이콘: 뒤 삼각형 없이 메인 튜브 4개만 열어 그려 작은 크기에서도 뭉개지지 않게 합니다.
    plotLine(grid, 5, 3, 14, 3, 'frame', 1); // 탑튜브
    plotLine(grid, 14, 3, 15, 8, 'frame', 1); // 헤드튜브
    plotLine(grid, 15, 8, 8, 12, 'frame', 1); // 다운튜브
    plotLine(grid, 8, 12, 5, 3, 'frame', 1); // 시트튜브
    plot(grid, 8, 13, 'pedal'); // BB 쉘
  } else if (type === 'wheel') {
    plotRing(grid, 7, 6, 5.4, 1, (_x, y) => (y > 7 ? 'tireShade' : 'tire'));
    plotRing(grid, 7, 6, 4.2, 1, () => 'rim');
    for (let angle = 0; angle < 360; angle += 45) {
      const rad = (angle * Math.PI) / 180;
      plotLine(grid, 7, 6, 7 + Math.cos(rad) * 3.4, 6 + Math.sin(rad) * 3.4, 'spoke', 1);
    }
    plot(grid, 7, 6, 'hub');
  } else if (type === 'drivetrain') {
    // 체인링 + 티스 + 크랭크 암·페달
    for (let angle = 0; angle < 360; angle += 60) {
      const rad = (angle * Math.PI) / 180;
      plot(grid, 6 + Math.cos(rad) * 5.6, 6 + Math.sin(rad) * 5.6, 'ring'); // 티스
    }
    plotRing(grid, 6, 6, 4.4, 1, () => 'ring'); // 체인링
    plot(grid, 6, 6, 'crank');
    plotLine(grid, 7, 7, 11, 10, 'crank', 1); // 크랭크 암
    plotRect(grid, 11, 11, 13, 11, 'pedal'); // 페달
  } else {
    // 드롭 핸들바: 스템 + 톱 구간 + 바 테이프 후크
    plotLine(grid, 3, 11, 6, 5, 'stem', 1);
    plotLine(grid, 6, 4, 11, 4, 'bar', 1);
    plot(grid, 12, 5, 'grip');
    plot(grid, 12, 6, 'grip');
    plot(grid, 12, 7, 'grip');
    plot(grid, 12, 8, 'grip');
    plot(grid, 11, 9, 'grip');
    plot(grid, 10, 9, 'grip');
  }
  applyInkOutline(grid);
  iconCache.set(type, grid);
  return grid;
}

// 부품 아이콘의 역할별 색: 부품 대표색을 중심으로 한 2톤 + 크림 디테일
function partIconColor(type: BikePartIconType, role: Role): number {
  const base = WARM_PART_COLORS[type];
  const map: Partial<Record<Role, number>> = {
    ink: 0x3b2531,
    frame: base, frameShade: shade(base, 0.72), frameLight: shade(base, 1.28),
    tire: base, tireShade: shade(base, 0.72), rim: 0xfff1c6, spoke: 0xd9c197, hub: 0x3b2531,
    ring: base, cassette: shade(base, 0.72), chain: shade(base, 1.28), crank: shade(base, 0.85), pedal: 0x573044,
    bar: base, stem: shade(base, 0.8), grip: 0x573044,
  };
  return map[role] ?? base;
}

/**
 * 부품 픽셀 아이콘을 그립니다. level 2 이상은 반짝임 픽셀로 상급 부품을 표현합니다.
 * @param cell 픽셀 한 칸의 크기(px). 2면 약 28×26px.
 */
export function drawPixelPartIcon(
  scene: Phaser.Scene,
  x: number,
  y: number,
  cell: number,
  type: BikePartIconType,
  options: { depth?: number; alpha?: number; level?: number } = {},
): Phaser.GameObjects.Graphics {
  const grid = buildPartIconGrid(type);
  const alpha = options.alpha ?? 1;
  const g = scene.add.graphics().setDepth(options.depth ?? 0);
  const originX = Math.round(x - (grid.width / 2) * cell);
  const originY = Math.round(y - (grid.height / 2) * cell);
  renderGridToGraphics(g, grid, originX, originY, cell, (drawn) => partIconColor(type, drawn.role), () => alpha);
  // 레벨 반짝임: Lv.2는 크림, Lv.3 이상은 골드 십자 스파클
  const level = options.level ?? 1;
  if (level >= 2) {
    const sparkle = level >= 3 ? 0xf4b84a : 0xfff8df;
    g.fillStyle(sparkle, alpha);
    g.fillRect(originX + 14 * cell, originY + 1 * cell, cell, cell);
    if (level >= 3) {
      g.fillRect(originX + 13 * cell, originY + 0 * cell, cell, cell).fillRect(originX + 15 * cell, originY + 0 * cell, cell, cell);
      g.fillRect(originX + 14 * cell, originY - 1 * cell, cell, cell);
    }
  }
  return g;
}
