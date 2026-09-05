// 픽셀 격자 래스터 프리미티브 (Phaser 비의존).
// bike-pixel-sprite(자전거)와 race-rider-sprite(레이스 라이더)가 같은 문법으로
// 1px 격자에 선·링·사각형·다각형을 찍고, 잉크 외곽선을 두르고, 행 단위 RLE로 출력합니다.
// 셀 값 T는 호출자가 정의합니다(예: { role, group }). 같은 값 객체를 여러 칸이 공유해도 안전하도록
// 이 모듈은 셀 객체를 절대 변형하지 않고 교체만 합니다.

export type PixelGrid<T> = { width: number; height: number; cells: Array<T | undefined> };

export function makePixelGrid<T>(width: number, height: number): PixelGrid<T> {
  return { width, height, cells: new Array<T | undefined>(width * height) };
}

/** 격자 범위 안이면 (x, y)를 반올림해 값을 찍습니다. 범위 밖은 조용히 무시합니다. */
export function plotCell<T>(grid: PixelGrid<T>, x: number, y: number, value: T): void {
  const px = Math.round(x);
  const py = Math.round(y);
  if (px < 0 || py < 0 || px >= grid.width || py >= grid.height) return;
  grid.cells[py * grid.width + px] = value;
}

export function cellAt<T>(grid: PixelGrid<T>, x: number, y: number): T | undefined {
  if (x < 0 || y < 0 || x >= grid.width || y >= grid.height) return undefined;
  return grid.cells[y * grid.width + x];
}

// 두께 t를 중심선 기준으로 대칭 확장하는 오프셋 목록: 1→[0], 2→[0,1], 3→[-1,0,1], 4→[-1,0,1,2] …
function thicknessOffsets(thickness: number): number[] {
  const t = Math.max(1, Math.round(thickness));
  const offsets: number[] = [];
  for (let offset = -Math.floor((t - 1) / 2); offset <= Math.floor(t / 2); offset += 1) offsets.push(offset);
  return offsets;
}

/**
 * 브레젠험 직선. thickness는 기울기에 수직인 축 방향으로 확장해 튜브·사지 두께를 만듭니다.
 * (완만한 선은 세로로, 가파른 선은 가로로 확장 — 픽셀 아트 특유의 계단 두께)
 */
export function plotLine<T>(
  grid: PixelGrid<T>,
  x0: number, y0: number, x1: number, y1: number,
  value: T, thickness = 1,
): void {
  let cx = Math.round(x0);
  let cy = Math.round(y0);
  const tx = Math.round(x1);
  const ty = Math.round(y1);
  const dx = Math.abs(tx - cx);
  const dy = Math.abs(ty - cy);
  const sx = cx < tx ? 1 : -1;
  const sy = cy < ty ? 1 : -1;
  let err = dx - dy;
  const horizontalish = dx >= dy;
  const offsets = thicknessOffsets(thickness);
  for (;;) {
    offsets.forEach((offset) => {
      if (horizontalish) plotCell(grid, cx, cy + offset, value);
      else plotCell(grid, cx + offset, cy, value);
    });
    if (cx === tx && cy === ty) break;
    const e2 = err * 2;
    if (e2 > -dy) { err -= dy; cx += sx; }
    if (e2 < dx) { err += dx; cy += sy; }
  }
}

/** 도넛 링. valueFor로 픽셀 위치별 값(음영 등)을 정합니다. */
export function plotRing<T>(
  grid: PixelGrid<T>,
  cx: number, cy: number, radius: number, thickness: number,
  valueFor: (x: number, y: number) => T,
): void {
  const reach = Math.ceil(radius) + 1;
  for (let y = Math.floor(cy - reach); y <= Math.ceil(cy + reach); y += 1) {
    for (let x = Math.floor(cx - reach); x <= Math.ceil(cx + reach); x += 1) {
      const distance = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
      if (distance <= radius + 0.4 && distance > radius - thickness + 0.4) plotCell(grid, x, y, valueFor(x, y));
    }
  }
}

/**
 * 캡슐(둥근 끝 두꺼운 선분): 셀 중심에서 선분까지의 거리가 halfWidth 이하면 채웁니다.
 * plotLine의 축 정렬 두께 확장과 달리 어느 기울기에서도 두께가 같아, 회전하는 사지·크랭크 암에 씁니다.
 * valueFor(x, y, t)의 t는 선분 위 투영 위치(0=시작, 1=끝)라 관절 쪽 음영에 쓸 수 있습니다.
 */
export function plotCapsule<T>(
  grid: PixelGrid<T>,
  x0: number, y0: number, x1: number, y1: number,
  halfWidth: number,
  valueFor: (x: number, y: number, t: number) => T,
): void {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const lengthSq = dx * dx + dy * dy;
  const reach = Math.ceil(halfWidth) + 1;
  const minX = Math.floor(Math.min(x0, x1)) - reach;
  const maxX = Math.ceil(Math.max(x0, x1)) + reach;
  const minY = Math.floor(Math.min(y0, y1)) - reach;
  const maxY = Math.ceil(Math.max(y0, y1)) + reach;
  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const t = lengthSq === 0 ? 0 : Math.max(0, Math.min(1, ((x - x0) * dx + (y - y0) * dy) / lengthSq));
      const px = x0 + dx * t;
      const py = y0 + dy * t;
      if (Math.hypot(x - px, y - py) <= halfWidth) plotCell(grid, x, y, valueFor(x, y, t));
    }
  }
}

/** 채운 원. */
export function plotDisc<T>(
  grid: PixelGrid<T>,
  cx: number, cy: number, radius: number,
  valueFor: (x: number, y: number) => T,
): void {
  const reach = Math.ceil(radius) + 1;
  for (let y = Math.floor(cy - reach); y <= Math.ceil(cy + reach); y += 1) {
    for (let x = Math.floor(cx - reach); x <= Math.ceil(cx + reach); x += 1) {
      if (Math.sqrt((x - cx) ** 2 + (y - cy) ** 2) <= radius + 0.4) plotCell(grid, x, y, valueFor(x, y));
    }
  }
}

export function plotRect<T>(
  grid: PixelGrid<T>,
  x0: number, y0: number, x1: number, y1: number,
  value: T,
): void {
  const left = Math.round(Math.min(x0, x1));
  const right = Math.round(Math.max(x0, x1));
  const top = Math.round(Math.min(y0, y1));
  const bottom = Math.round(Math.max(y0, y1));
  for (let y = top; y <= bottom; y += 1) for (let x = left; x <= right; x += 1) plotCell(grid, x, y, value);
}

// 점-다각형 포함 판정(짝홀 규칙). 셀 중심을 정수 좌표로 보고 판정합니다.
function insidePolygon(points: Array<[number, number]>, x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i, i += 1) {
    const [xi, yi] = points[i];
    const [xj, yj] = points[j];
    const crosses = (yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (crosses) inside = !inside;
  }
  return inside;
}

/**
 * 채운 다각형(몸통·안장 같은 사변형 면). 내부 판정으로 채운 뒤 변을 1px 선으로 덧그려
 * 폭이 1~2칸인 좁은 부분도 끊기지 않게 합니다.
 */
export function plotPolygon<T>(grid: PixelGrid<T>, points: Array<[number, number]>, value: T): void {
  if (points.length < 3) return;
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  for (let y = Math.floor(Math.min(...ys)); y <= Math.ceil(Math.max(...ys)); y += 1) {
    for (let x = Math.floor(Math.min(...xs)); x <= Math.ceil(Math.max(...xs)); x += 1) {
      if (insidePolygon(points, x, y)) plotCell(grid, x, y, value);
    }
  }
  for (let i = 0; i < points.length; i += 1) {
    const [x0, y0] = points[i];
    const [x1, y1] = points[(i + 1) % points.length];
    plotLine(grid, x0, y0, x1, y1, value, 1);
  }
}

/**
 * 잉크 외곽선: shouldOutline(셀)이 참인 면과 4방향으로 맞닿은 빈 칸을 ink(이웃 셀)로 채웁니다.
 * 이미 값이 있는 칸은 건드리지 않으므로 서로 다른 면이 맞닿은 경계에는 잉크가 생기지 않습니다.
 */
export function outlineGrid<T>(
  grid: PixelGrid<T>,
  shouldOutline: (cell: T) => boolean,
  ink: (neighbor: T) => T,
): void {
  const additions: Array<{ x: number; y: number; value: T }> = [];
  for (let y = 0; y < grid.height; y += 1) {
    for (let x = 0; x < grid.width; x += 1) {
      if (cellAt(grid, x, y) !== undefined) continue;
      const neighbors = [cellAt(grid, x - 1, y), cellAt(grid, x + 1, y), cellAt(grid, x, y - 1), cellAt(grid, x, y + 1)];
      const outlined = neighbors.find((cell) => cell !== undefined && shouldOutline(cell));
      if (outlined !== undefined) additions.push({ x, y, value: ink(outlined) });
    }
  }
  additions.forEach(({ x, y, value }) => {
    grid.cells[y * grid.width + x] = value;
  });
}

/**
 * 다른 격자를 (dx, dy) 위치에 합성합니다. transform이 undefined를 돌려주면 그 칸은 건너뜁니다.
 * 원본 셀 객체를 그대로 공유합니다(불변 전제).
 */
export function stampGrid<T>(
  target: PixelGrid<T>,
  source: PixelGrid<T>,
  dx: number, dy: number,
  transform?: (cell: T) => T | undefined,
): void {
  for (let y = 0; y < source.height; y += 1) {
    for (let x = 0; x < source.width; x += 1) {
      const cell = source.cells[y * source.width + x];
      if (cell === undefined) continue;
      const value = transform ? transform(cell) : cell;
      if (value !== undefined) plotCell(target, x + dx, y + dy, value);
    }
  }
}

/** 값이 있는 칸의 경계 상자. 비어 있으면 null. */
export function gridBounds<T>(grid: PixelGrid<T>): { minX: number; minY: number; maxX: number; maxY: number } | null {
  let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
  for (let y = 0; y < grid.height; y += 1) {
    for (let x = 0; x < grid.width; x += 1) {
      if (grid.cells[y * grid.width + x] === undefined) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  return minX === Infinity ? null : { minX, minY, maxX, maxY };
}

export function countCells<T>(grid: PixelGrid<T>, predicate?: (cell: T) => boolean): number {
  let count = 0;
  grid.cells.forEach((cell) => {
    if (cell !== undefined && (!predicate || predicate(cell))) count += 1;
  });
  return count;
}

/**
 * 그리드를 RGBA 바이트 버퍼(폭×높이×4, 셀 1 = 픽셀 1)에 그립니다. colorFor가 undefined면 투명.
 * 알파는 0 또는 255만 씁니다(픽셀 문법: 반투명 금지). Canvas ImageData·PNG 인코더가 그대로 받을 수 있습니다.
 * offsetX/offsetY로 큰 시트 버퍼의 일부 영역에 찍을 수 있습니다.
 */
export function paintGridRgba<T>(
  grid: PixelGrid<T>,
  colorFor: (cell: T) => number | undefined,
  target?: { width: number; height: number; data: Uint8ClampedArray; offsetX?: number; offsetY?: number },
): { width: number; height: number; data: Uint8ClampedArray } {
  const out = target ?? { width: grid.width, height: grid.height, data: new Uint8ClampedArray(grid.width * grid.height * 4) };
  const offsetX = target?.offsetX ?? 0;
  const offsetY = target?.offsetY ?? 0;
  for (let y = 0; y < grid.height; y += 1) {
    const ty = y + offsetY;
    if (ty < 0 || ty >= out.height) continue;
    for (let x = 0; x < grid.width; x += 1) {
      const cell = grid.cells[y * grid.width + x];
      if (cell === undefined) continue;
      const color = colorFor(cell);
      if (color === undefined) continue;
      const tx = x + offsetX;
      if (tx < 0 || tx >= out.width) continue;
      const i = (ty * out.width + tx) * 4;
      out.data[i] = (color >> 16) & 0xff;
      out.data[i + 1] = (color >> 8) & 0xff;
      out.data[i + 2] = color & 0xff;
      out.data[i + 3] = 255;
    }
  }
  return { width: out.width, height: out.height, data: out.data };
}

/**
 * 그리드를 문자 지도로 바꿉니다(스냅샷 테스트·디버그용). 빈 칸은 '.', 나머지는 charFor(셀).
 */
export function gridToAscii<T>(grid: PixelGrid<T>, charFor: (cell: T) => string): string[] {
  const rows: string[] = [];
  for (let y = 0; y < grid.height; y += 1) {
    let row = '';
    for (let x = 0; x < grid.width; x += 1) {
      const cell = grid.cells[y * grid.width + x];
      row += cell === undefined ? '.' : charFor(cell)[0] ?? '#';
    }
    rows.push(row);
  }
  return rows;
}

/**
 * 행 단위 RLE 순회. keyOf가 같은 값을 돌려주는 연속 칸을 하나의 런으로 묶어 visit합니다.
 * keyOf가 undefined를 돌려주면 그 칸은 빈 칸으로 취급합니다(알파 0 등).
 * Graphics.fillRect / Canvas fillRect 호출 수를 줄이는 공통 출력 경로입니다.
 */
export function forEachRun<T>(
  grid: PixelGrid<T>,
  keyOf: (cell: T) => string | number | undefined,
  visit: (x: number, y: number, length: number, cell: T) => void,
): void {
  for (let y = 0; y < grid.height; y += 1) {
    let runStart = -1;
    let runKey: string | number | undefined;
    let runCell: T | undefined;
    const flush = (endX: number) => {
      if (runStart >= 0 && runCell !== undefined) visit(runStart, y, endX - runStart, runCell);
      runStart = -1;
      runCell = undefined;
    };
    for (let x = 0; x < grid.width; x += 1) {
      const cell = grid.cells[y * grid.width + x];
      const key = cell === undefined ? undefined : keyOf(cell);
      if (key === undefined) { flush(x); continue; }
      if (runStart >= 0 && key !== runKey) flush(x);
      if (runStart < 0) { runStart = x; runKey = key; runCell = cell; }
    }
    flush(grid.width);
  }
}
