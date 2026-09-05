// 레이스 라이더 스프라이트 빌더 (Phaser 비의존).
// 자전거 리그(bike-pixel-sprite)와 운동 모델(race-rider-motion)의 위상·자세를 받아
// 픽셀 격자 프레임을 만들고, 한 장의 RGBA 스프라이트시트로 굽습니다.
// 레이어 구성(레이서 컨테이너 z 순서):
//   1) 바퀴 회전 레이어(rear·front) — 스포크·허브·반사판, 티어(crisp/fast/blur)×위상 프레임
//   2) far 레이어 — 원경 팔·다리·크랭크·페달. 잉크 없이 어두운 톤만 써서 근경 잉크와 겹쳐도 검은 띠가 생기지 않음
//   3) 자전거 몸체 — 타이어·림·프레임·체인·체인링·핸들바·안장 (스포크·허브·크랭크·페달 제외)
//   4) near 레이어 — 근경 크랭크·다리·신발·몸통·머리·근경 팔·손. 한 그리드에 플롯해 잉크 외곽선을 1회만 두름
// 규칙: 마디는 늘리지 않고(IK 도달 불가는 테스트 실패), 회전하는 사지는 캡슐 래스터(회전 대칭 두께),
// 정적 정체성(머리)은 문자 맵, 노력 표현(스탠딩 스프린트 힙·어깨 요동)은 위상 프레임에 베이크합니다.
// 베이크는 셀 1 = 픽셀 1이며, 화면에서는 정수 배(RIDER_CELL)로 확대해 픽셀 정합을 유지합니다.
import type { PixelCharacterRole } from './art-character-pixel';
import {
  type BikeCategory,
  type BikeColorway,
  type BikeRig,
  type WheelStyle,
  bikeRig,
  buildBikeGrid,
  plotWheelHub,
  plotWheelSpokes,
  resolveBikeCellColor,
  shadeColor,
  spokeSpan,
  type BikeGrid,
} from './bike-pixel-sprite';
import {
  type PixelGrid,
  gridBounds,
  makePixelGrid,
  outlineGrid,
  paintGridRgba,
  plotCapsule,
  plotCell,
  plotDisc,
  plotRect,
  stampGrid,
} from './pixel-raster';
import {
  CRANK_PHASES,
  GLINT_PHASES,
  RIDER_POSTURES,
  WHEEL_PHASES,
  type RiderPosture,
  type Vec2,
  type WheelTier,
  bakedPoseOffsets,
  phaseAngle,
  solveTwoBone,
} from './race-rider-motion';

/** 화면 확대 배율(셀 → px). 베이크는 셀 1 = 1px, 표시는 정수 배 */
export const RIDER_CELL = 2;
/** 자전거 그리드(64×40) 위로 확장하는 행 수. 라이더 머리가 들어갈 공간 */
export const RIDER_TOP_MARGIN = 18;
export const RIDER_GRID_W = 64;
export const RIDER_GRID_H = 40 + RIDER_TOP_MARGIN;

export const INK = 0x3b2531;
export const GOLD = 0xf4b84a;
export const PALE_GOLD = 0xf6d995;
export const CREAM = 0xfff1c6;
const SKIN = 0xeeb07c;
const SKIN_SHADE = 0xd18a54;
const CRANK_METAL = 0xa39985;
const CRANK_METAL_FAR = 0x8d8779;
const PEDAL_PLATE = 0x573044;
const SPOKE = 0xd9c197;
const HUB = 0xa39985;
/** 원경 레이어 톤 배율 */
const FAR_TONE = 0.7;

// ─── 신체 치수(그리드 셀) ───────────────────────────────────────────────
export const RIDER_BODY = {
  thigh: 15,
  shin: 14,
  upperArm: 10,
  foreArm: 12,
  thighHalfWidth: 2.0,
  shinHalfWidth: 1.5,
  upperArmHalfWidth: 1.2,
  foreArmHalfWidth: 1.0,
  torsoHalfWidth: 3.6,
  /** 발목은 페달 중심에서 위로 2.5, 뒤로 0.5 */
  ankleOffset: { x: -0.5, y: -2.5 },
};

export type RiderPart =
  | 'torso' | 'torsoLight' | 'torsoShade' | 'bib' | 'neck' | 'head'
  | 'arm' | 'hand' | 'thigh' | 'thighLight' | 'thighShade' | 'shin' | 'shinShade' | 'shoe'
  | 'crank' | 'pedal' | 'hub' | 'ink';
export type RiderCell = { color: number; part: RiderPart };
export type RiderGrid = PixelGrid<RiderCell>;

// ─── 역할별 팔레트 (art-character-pixel 필드 스프라이트 팔레트 발췌) ────
export type RiderPalette = {
  jersey: number; jerseyShade: number; jerseyLight: number;
  /** 팔 색(점장은 조끼 아래 크림 셔츠) */
  sleeve: number;
  pants: number; pantsShade: number; pantsLight: number;
  shoe: number;
  /** 옆모습 머리 맵 레전드 */
  headLegend: Record<string, number>;
  /** 반다나 꼬리 등 뒤로 날리는 장식 색(없으면 undefined) */
  flutter?: { main: number; shade: number };
};

const BASE_HEAD_LEGEND: Record<string, number> = { K: INK, S: SKIN, T: SKIN_SHADE, B: 0xe58a66, E: 0x2c1c26, W: 0xfff8df };

export const RIDER_PALETTES: Record<PixelCharacterRole, RiderPalette> = {
  정비사: {
    jersey: 0x5e9a67, jerseyShade: 0x477a50, jerseyLight: shadeColor(0x5e9a67, 1.18), sleeve: 0x5e9a67,
    pants: 0x6b4534, pantsShade: 0x53341f, pantsLight: shadeColor(0x6b4534, 1.18), shoe: 0x352c3c,
    headLegend: { ...BASE_HEAD_LEGEND, N: 0xfff1c6, n: 0xe8c98d, H: 0x77492f, h: 0x95613e },
    flutter: { main: 0xfff1c6, shade: 0xe8c98d },
  },
  점장: {
    jersey: 0x573044, jerseyShade: 0x41202f, jerseyLight: shadeColor(0x573044, 1.3), sleeve: 0xf9e6b3,
    pants: 0x4a3542, pantsShade: 0x38222f, pantsLight: shadeColor(0x4a3542, 1.2), shoe: 0x6b4226,
    headLegend: { ...BASE_HEAD_LEGEND, H: 0x8d7a68, h: 0xa8988a },
  },
  고객: {
    jersey: 0x4e8092, jerseyShade: 0x3a6274, jerseyLight: shadeColor(0x4e8092, 1.18), sleeve: 0x4e8092,
    pants: 0x3f4a63, pantsShade: 0x2e3850, pantsLight: shadeColor(0x3f4a63, 1.2), shoe: 0x352c3c,
    headLegend: { ...BASE_HEAD_LEGEND, R: 0xc95746, r: 0xa63f31, H: 0x4f3527 },
  },
};

// ─── 옆모습 머리 맵 (12×12, 오른쪽을 향함, 맨 아랫줄에 목) ───────────────
// 게임 캐릭터의 정체성 요소를 실루엣으로 유지합니다: 정비사 크림 반다나, 점장 회갈색 머리·콧수염, 고객 빨간 캡 챙.
export const RIDER_HEAD_MAPS: Record<PixelCharacterRole, string[]> = {
  // 정비사: 크림 반다나 2행 띠 + 뒤통수 매듭 꼬리, 갈색 머리 하이라이트
  정비사: [
    '...KKKKKK...',
    '..KHhhHHHK..',
    '.KHhHHHHHHK.',
    '.KNNNNNNNNNK',
    'KNNNNNNNNnnK',
    'KNHSSSSSSSK.',
    'KnHSSSSEWSK.',
    '.KHSSSSESSK.',
    '.KHSSSBBSSTK',
    '..KSSSSSSKK.',
    '...KKSSSTK..',
    '....KSSTK...',
  ],
  // 점장: 회갈색 옆가르마 머리 + 코 앞으로 돌출한 콧수염
  점장: [
    '...KKKKKK...',
    '..KHHhhhHK..',
    '.KHHHHhhHK..',
    '.KHHHHHhSSK.',
    'KHHHHHSEWSK.',
    'KHHHSSSESSK.',
    'KHHHSSSSSSSK',
    '.KHHSSBBSSTK',
    '..KSSSSHHHK.',
    '...KSSSSKK..',
    '....KTSSSSK.',
    '....KTSSKK..',
  ],
  // 고객: 빨간 캡, 챙이 진행 방향(오른쪽)으로 돌출, 짙은 앞머리
  고객: [
    '..KKKKK.....',
    '.KRRRRRK....',
    'KRRRRRRRK...',
    'KRRRRRRrKK..',
    'KRRRRRrrrrK.',
    'KHHHHHSSKrrK',
    'KHHSSSEWKKK.',
    'KHHSSSESK...',
    '.KSSSBBSTK..',
    '.KSSSSSKK...',
    '..KSSSSK....',
    '...KTSSK....',
  ],
};

/** 머리 맵 맨 아랫줄에서 목(피부) 셀의 중앙 열 */
export function headNeckColumn(rows: string[]): number {
  const last = rows[rows.length - 1];
  const columns: number[] = [];
  for (let x = 0; x < last.length; x += 1) if (last[x] === 'S' || last[x] === 'T') columns.push(x);
  if (columns.length === 0) return Math.floor(last.length / 2);
  return Math.round((columns[0] + columns[columns.length - 1]) / 2);
}

// ─── 자세 리그 ────────────────────────────────────────────────────────
type HandGrip = keyof BikeRig['hands'];
type PostureRig = {
  /** 기본 힙(안장 기준) 대비 이동(셀) */
  hipShift: Vec2;
  /** 힙 기준 어깨 위치 */
  shoulder: Vec2;
  hand: HandGrip;
  /** 어깨 기준 목 아래(머리 맵 목 중앙)가 놓이는 위치 */
  head: Vec2;
};
export const POSTURE_RIG: Record<RiderPosture, PostureRig> = {
  seated: { hipShift: { x: 0, y: 0 }, shoulder: { x: 10, y: -8 }, hand: 'hoods', head: { x: 2, y: -2 } },
  climb: { hipShift: { x: 0, y: 0 }, shoulder: { x: 9, y: -9 }, hand: 'tops', head: { x: 2, y: -2 } },
  tuck: { hipShift: { x: 0, y: 0 }, shoulder: { x: 12, y: -4 }, hand: 'drops', head: { x: 3, y: -1 } },
  sprint: { hipShift: { x: 2, y: -1 }, shoulder: { x: 10, y: -9 }, hand: 'hoods', head: { x: 2, y: -2 } },
};

export type RiderPose = {
  hip: Vec2;
  shoulder: Vec2;
  hand: Vec2;
  headAnchor: Vec2;
  bb: Vec2;
  near: { pedal: Vec2; ankle: Vec2; knee: Vec2; reachable: boolean; kneeAngle: number };
  far: { pedal: Vec2; ankle: Vec2; knee: Vec2; reachable: boolean; kneeAngle: number };
  arm: { elbow: Vec2; reachable: boolean; elbowAngle: number };
};

/** 착좌 기본 힙: 안장 윗면에서 2칸 위·1칸 앞. BB가 낮은 미니벨로는 1칸 내려 다리 도달성을 맞춥니다. */
export function baseHip(rig: BikeRig): Vec2 {
  return { x: rig.saddleTop[0] + 1, y: rig.saddleTop[1] - 2 + Math.round((rig.bb[1] - 30) / 2) };
}

/** 자세·크랭크 각도에 따른 라이더 관절 좌표(자전거 그리드 좌표계). 테스트와 프레임 빌드가 공유합니다. */
export function riderPose(category: BikeCategory, posture: RiderPosture, crankAngle: number): RiderPose {
  const rig = bikeRig(category);
  const postureRig = POSTURE_RIG[posture];
  const offsets = bakedPoseOffsets(posture, crankAngle);
  const base = baseHip(rig);
  const hip = { x: base.x + postureRig.hipShift.x, y: base.y + postureRig.hipShift.y + offsets.hipDy };
  const shoulder = { x: hip.x + postureRig.shoulder.x + offsets.shoulderDx, y: hip.y + postureRig.shoulder.y };
  const handPoint = rig.hands[postureRig.hand];
  const hand = { x: handPoint[0], y: handPoint[1] };
  const bb = { x: rig.bb[0], y: rig.bb[1] };
  const leg = (angle: number) => {
    const pedal = { x: bb.x + Math.cos(angle) * rig.crankRadius, y: bb.y + Math.sin(angle) * rig.crankRadius };
    const ankle = { x: pedal.x + RIDER_BODY.ankleOffset.x, y: pedal.y + RIDER_BODY.ankleOffset.y };
    const ik = solveTwoBone(hip, ankle, RIDER_BODY.thigh, RIDER_BODY.shin, 'forward');
    return { pedal, ankle, knee: ik.joint, reachable: ik.reachable, kneeAngle: ik.jointAngle };
  };
  const armIk = solveTwoBone(shoulder, hand, RIDER_BODY.upperArm, RIDER_BODY.foreArm, 'down');
  return {
    hip,
    shoulder,
    hand,
    headAnchor: { x: shoulder.x + postureRig.head.x, y: shoulder.y + postureRig.head.y },
    bb,
    near: leg(crankAngle),
    far: leg(crankAngle + Math.PI),
    arm: { elbow: armIk.joint, reachable: armIk.reachable, elbowAngle: armIk.jointAngle },
  };
}

// ─── 프레임 그리드 빌드 ─────────────────────────────────────────────────

function makeRiderGrid(): RiderGrid {
  return makePixelGrid<RiderCell>(RIDER_GRID_W, RIDER_GRID_H);
}

// 자전거 그리드 좌표 → 라이더 그리드 좌표(위쪽 여백만큼 내림)
function gy(y: number): number {
  return y + RIDER_TOP_MARGIN;
}

function cellOf(color: number, part: RiderPart): RiderCell {
  return { color, part };
}

function capsule(grid: RiderGrid, from: Vec2, to: Vec2, halfWidth: number, color: number, part: RiderPart) {
  const value = cellOf(color, part);
  plotCapsule(grid, from.x, gy(from.y), to.x, gy(to.y), halfWidth, () => value);
}

/** 튜브 음영 규칙: 부위 셀 중 위가 비면 하이라이트, 아래가 비면 음영. 자전거 프레임 튜브와 같은 문법 */
function applyPartShading(grid: RiderGrid, part: RiderPart, light: RiderCell | null, shade: RiderCell) {
  const isPart = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= grid.width || y >= grid.height) return false;
    const cell = grid.cells[y * grid.width + x];
    return cell !== undefined && (cell.part === part || cell.part === light?.part || cell.part === shade.part);
  };
  const snapshot = grid.cells.map((cell) => cell?.part === part);
  for (let y = 0; y < grid.height; y += 1) {
    for (let x = 0; x < grid.width; x += 1) {
      if (!snapshot[y * grid.width + x]) continue;
      const above = isPart(x, y - 1);
      const below = isPart(x, y + 1);
      if (!above && below && light) grid.cells[y * grid.width + x] = light;
      else if (above && !below) grid.cells[y * grid.width + x] = shade;
    }
  }
}

function plotCrank(grid: RiderGrid, bb: Vec2, pedal: Vec2, crankColor: number, plateColor: number) {
  capsule(grid, bb, pedal, 0.9, crankColor, 'crank');
  // 페달 발판: 회전 위치를 따라가되 수평 유지(4칸)
  const py = Math.round(pedal.y);
  plotRect(grid, Math.round(pedal.x) - 2, gy(py), Math.round(pedal.x) + 1, gy(py), cellOf(plateColor, 'pedal'));
}

function plotShoe(grid: RiderGrid, pedal: Vec2, color: number) {
  // 신발: 회전하지 않는 4×2 스탬프, 앞코가 진행 방향(+x)
  const px = Math.round(pedal.x);
  const py = Math.round(pedal.y);
  plotRect(grid, px - 1, gy(py - 2), px + 2, gy(py - 1), cellOf(color, 'shoe'));
}

function plotLeg(
  grid: RiderGrid,
  hip: Vec2,
  leg: RiderPose['near'],
  colors: { thigh: number; shin: number },
) {
  capsule(grid, hip, leg.knee, RIDER_BODY.thighHalfWidth, colors.thigh, 'thigh');
  capsule(grid, leg.knee, leg.ankle, RIDER_BODY.shinHalfWidth, colors.shin, 'shin');
}

function plotArm(grid: RiderGrid, shoulder: Vec2, elbow: Vec2, hand: Vec2, color: number) {
  capsule(grid, shoulder, elbow, RIDER_BODY.upperArmHalfWidth, color, 'arm');
  capsule(grid, elbow, hand, RIDER_BODY.foreArmHalfWidth, color, 'arm');
}

function plotHead(grid: RiderGrid, anchor: Vec2, role: PixelCharacterRole, legend: Record<string, number>) {
  const rows = RIDER_HEAD_MAPS[role];
  const neckCol = headNeckColumn(rows);
  const originX = Math.round(anchor.x) - neckCol;
  const originY = Math.round(gy(anchor.y)) - (rows.length - 1);
  rows.forEach((row, rowIndex) => {
    for (let column = 0; column < row.length; column += 1) {
      const color = legend[row[column]];
      if (color === undefined) continue;
      plotCell(grid, originX + column, originY + rowIndex, cellOf(color, row[column] === 'K' ? 'ink' : 'head'));
    }
  });
  return { originX, originY, width: Math.max(...rows.map((row) => row.length)), height: rows.length };
}

/** 반다나 꼬리: 반 회전마다 위·아래로 움직여 고케이던스 깜빡임을 줄입니다. */
function plotFlutter(grid: RiderGrid, head: { originX: number; originY: number }, phase: number, colors: { main: number; shade: number }) {
  const lift = phase < CRANK_PHASES / 2 ? 0 : 1;
  const y = head.originY + 4 + lift;
  plotCell(grid, head.originX - 1, y, cellOf(colors.main, 'head'));
  plotCell(grid, head.originX - 2, y + (lift ? -1 : 1), cellOf(colors.shade, 'head'));
  plotCell(grid, head.originX - 3, y + (lift ? -1 : 1), cellOf(colors.shade, 'head'));
}

export type RiderLayer = 'far' | 'near';

export type RiderFrameGrids = { far: RiderGrid; near: RiderGrid; pose: RiderPose };

/**
 * 한 (카테고리, 역할, 자세, 크랭크 위상)의 far/near 레이어 그리드를 만듭니다.
 * far: 잉크 없음·어두운 톤. near: 플롯 순서 고정 후 잉크 외곽선 1회.
 */
export function buildRiderLayerGrids(category: BikeCategory, role: PixelCharacterRole, posture: RiderPosture, phase: number): RiderFrameGrids {
  const palette = RIDER_PALETTES[role];
  const angle = phase * Math.PI * 2 / CRANK_PHASES;
  const pose = riderPose(category, posture, angle);
  const far = makeRiderGrid();
  const near = makeRiderGrid();
  const tone = (color: number) => shadeColor(color, FAR_TONE);

  // ─ far: 원경 크랭크 → 원경 다리 → 원경 신발 → 원경 팔
  plotCrank(far, pose.bb, pose.far.pedal, CRANK_METAL_FAR, shadeColor(PEDAL_PLATE, FAR_TONE));
  plotLeg(far, pose.hip, pose.far, { thigh: tone(palette.pants), shin: tone(palette.pants) });
  applyPartShading(far, 'thigh', null, cellOf(tone(palette.pantsShade), 'thighShade'));
  applyPartShading(far, 'shin', null, cellOf(tone(palette.pantsShade), 'shinShade'));
  plotShoe(far, pose.far.pedal, tone(palette.shoe));
  const farShoulder = { x: pose.shoulder.x - 1, y: pose.shoulder.y + 1 };
  const farArm = solveTwoBone(farShoulder, pose.hand, RIDER_BODY.upperArm, RIDER_BODY.foreArm, 'down');
  plotArm(far, farShoulder, farArm.joint, farArm.end, tone(palette.sleeve));

  // ─ near: 근경 크랭크 → 근경 다리 → 신발 → 몸통 → 배번 → 목 → 머리 → 근경 팔 → 손 → 허브 캡
  plotCrank(near, pose.bb, pose.near.pedal, CRANK_METAL, PEDAL_PLATE);
  plotLeg(near, pose.hip, pose.near, { thigh: palette.pants, shin: palette.pants });
  applyPartShading(near, 'thigh', cellOf(palette.pantsLight, 'thighLight'), cellOf(palette.pantsShade, 'thighShade'));
  applyPartShading(near, 'shin', null, cellOf(palette.pantsShade, 'shinShade'));
  plotShoe(near, pose.near.pedal, palette.shoe);
  capsule(near, pose.hip, pose.shoulder, RIDER_BODY.torsoHalfWidth, palette.jersey, 'torso');
  applyPartShading(near, 'torso', cellOf(palette.jerseyLight, 'torsoLight'), cellOf(palette.jerseyShade, 'torsoShade'));
  // 배번 비브: 등(축의 뒤쪽 법선 방향) 위에 크림 3×2 + 잉크 점 하나로 "경기" 신호
  const ux = pose.shoulder.x - pose.hip.x;
  const uy = pose.shoulder.y - pose.hip.y;
  const len = Math.hypot(ux, uy) || 1;
  const bibCenter = {
    x: pose.hip.x + ux * 0.55 + (uy / len) * 1.6,
    y: pose.hip.y + uy * 0.55 - (ux / len) * 1.6,
  };
  const bx = Math.round(bibCenter.x);
  const by = Math.round(gy(bibCenter.y));
  plotRect(near, bx - 1, by - 1, bx + 1, by, cellOf(CREAM, 'bib'));
  plotCell(near, bx, by, cellOf(0x8e5136, 'bib'));
  capsule(near, { x: pose.shoulder.x + 1, y: pose.shoulder.y - 1 }, { x: pose.headAnchor.x, y: pose.headAnchor.y }, 1.0, SKIN, 'neck');
  const head = plotHead(near, pose.headAnchor, role, palette.headLegend);
  if (palette.flutter) plotFlutter(near, head, phase, palette.flutter);
  plotArm(near, pose.shoulder, pose.arm.elbow, pose.hand, palette.sleeve);
  plotRect(near, Math.round(pose.hand.x) - 1, gy(Math.round(pose.hand.y)) - 1, Math.round(pose.hand.x), gy(Math.round(pose.hand.y)), cellOf(SKIN, 'hand'));
  plotDisc(near, pose.bb.x, gy(pose.bb.y), 1.1, () => cellOf(CRANK_METAL, 'hub'));
  outlineGrid(near, (cell) => cell.part !== 'ink', () => cellOf(INK, 'ink'));

  return { far, near, pose };
}

// ─── 스프라이트시트 베이크 ───────────────────────────────────────────────

export type SheetFrame = { x: number; y: number; width: number; height: number };
export type RgbaSheet = {
  width: number;
  height: number;
  data: Uint8ClampedArray;
  frames: Record<string, SheetFrame>;
};

export type RiderSheet = RgbaSheet & {
  frameWidth: number;
  frameHeight: number;
  /** 프레임 좌상단이 자전거 앵커(x=그리드 중앙 32, y=바퀴 축)에서 떨어진 셀 오프셋 */
  anchor: { dx: number; dy: number };
};

export function riderFrameName(posture: RiderPosture, layer: RiderLayer, phase: number): string {
  return `${posture}-${layer}-${phase}`;
}

const SHEET_GUTTER = 1;

function cropGrid<T>(grid: PixelGrid<T>, x: number, y: number, width: number, height: number): PixelGrid<T> {
  const out = makePixelGrid<T>(width, height);
  stampGrid(out, grid, -x, -y);
  return out;
}

/**
 * (카테고리, 역할)의 모든 자세×위상×레이어 프레임을 한 시트로 굽습니다.
 * 프레임 크기는 전 프레임의 합집합 경계 상자로 고정해 setFrame만으로 교체할 수 있게 합니다.
 */
export function bakeRiderSheet(category: BikeCategory, role: PixelCharacterRole): RiderSheet {
  const rig = bikeRig(category);
  const built: Array<{ posture: RiderPosture; phase: number; grids: RiderFrameGrids }> = [];
  let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
  RIDER_POSTURES.forEach((posture) => {
    for (let phase = 0; phase < CRANK_PHASES; phase += 1) {
      const grids = buildRiderLayerGrids(category, role, posture, phase);
      built.push({ posture, phase, grids });
      [grids.far, grids.near].forEach((grid) => {
        const bounds = gridBounds(grid);
        if (!bounds) return;
        minX = Math.min(minX, bounds.minX); minY = Math.min(minY, bounds.minY);
        maxX = Math.max(maxX, bounds.maxX); maxY = Math.max(maxY, bounds.maxY);
      });
    }
  });
  const frameWidth = maxX - minX + 1;
  const frameHeight = maxY - minY + 1;
  const columns = CRANK_PHASES;
  const rows = RIDER_POSTURES.length * 2;
  const width = columns * (frameWidth + SHEET_GUTTER);
  const height = rows * (frameHeight + SHEET_GUTTER);
  const data = new Uint8ClampedArray(width * height * 4);
  const frames: Record<string, SheetFrame> = {};
  const layers: RiderLayer[] = ['far', 'near'];
  built.forEach(({ posture, phase, grids }) => {
    layers.forEach((layer) => {
      const row = RIDER_POSTURES.indexOf(posture) * 2 + layers.indexOf(layer);
      const fx = phase * (frameWidth + SHEET_GUTTER);
      const fy = row * (frameHeight + SHEET_GUTTER);
      const cropped = cropGrid(grids[layer], minX, minY, frameWidth, frameHeight);
      paintGridRgba(cropped, (cell) => cell.color, { width, height, data, offsetX: fx, offsetY: fy });
      frames[riderFrameName(posture, layer, phase)] = { x: fx, y: fy, width: frameWidth, height: frameHeight };
    });
  });
  return {
    width, height, data, frames, frameWidth, frameHeight,
    anchor: { dx: minX - RIDER_GRID_W / 2, dy: minY - (rig.axleY + RIDER_TOP_MARGIN) },
  };
}

// ─── 바퀴 회전 레이어 ─────────────────────────────────────────────────

export type WheelSheet = RgbaSheet & {
  /** 프레임 한 변(셀). 중심은 (radius, radius) */
  frameSize: number;
  /** 프레임 중심 = 바퀴 축 */
  center: number;
};

export function wheelFrameName(tier: WheelTier, phase: number): string {
  return `${tier}-${phase}`;
}

export function wheelSheetKey(style: WheelStyle): string {
  return `${style.radius}-${style.tireThickness}-${style.spokeStep}`;
}

type WheelCell = RiderCell;

function wheelInnerGrid(size: number): PixelGrid<WheelCell> {
  return makePixelGrid<WheelCell>(size, size);
}

/** 스포크·허브를 bike 그리드 프리미티브로 찍은 뒤 라이더 셀 색으로 옮깁니다. */
function stampSpokes(target: PixelGrid<WheelCell>, style: WheelStyle, center: number, angle: number, spokeColor: number, withHub: boolean) {
  const scratch = makePixelGrid(target.width, target.height) as BikeGrid;
  plotWheelSpokes(scratch, center, center, style, angle);
  if (withHub) plotWheelHub(scratch, center, center);
  stampGrid(target, scratch as unknown as PixelGrid<WheelCell>, 0, 0, (cell) => {
    const role = (cell as unknown as { role: string }).role;
    if (role === 'spoke') return cellOf(spokeColor, 'crank');
    if (role === 'hub') return cellOf(HUB, 'hub');
    return undefined;
  });
}

function plotReflector(grid: PixelGrid<WheelCell>, center: number, style: WheelStyle, angle: number, trail: number) {
  const outer = spokeSpan(style).outer;
  // 반사판: 스포크 0 바깥 끝 2칸을 골드로. 회전 인지의 주 단서
  plotCell(grid, center + Math.cos(angle) * outer, center + Math.sin(angle) * outer, cellOf(GOLD, 'hub'));
  plotCell(grid, center + Math.cos(angle) * (outer - 1), center + Math.sin(angle) * (outer - 1), cellOf(GOLD, 'hub'));
  // 궤적(빠를수록 길게): 회전 반대 방향으로 페일 골드
  for (let i = 1; i <= trail; i += 1) {
    const a = angle - (i * Math.PI) / 12;
    plotCell(grid, center + Math.cos(a) * outer, center + Math.sin(a) * outer, cellOf(PALE_GOLD, 'hub'));
  }
}

/**
 * 바퀴 안쪽 회전 프레임 시트. 티어별 표현(알파 없음):
 * - crisp: 선명한 8스포크 + 허브 + 골드 반사판 (24위상)
 * - fast: 원 위상과 22.5° 위상의 스포크를 중간톤으로 겹친 16스포크 + 반사판 궤적 (24위상)
 * - blur: 1칸 체커 디더 디스크(위상마다 1칸 시프트) + 속도 상한 글린트 호 (8위상)
 * 스포크 자체는 45° 대칭이라 3장만 고유하며, 회전 인지는 반사판이 담당합니다.
 */
export function bakeWheelSheet(style: WheelStyle): WheelSheet {
  const rimRadius = style.radius - style.tireThickness;
  const size = rimRadius * 2 + 1;
  const center = rimRadius;
  const grids: Array<{ name: string; grid: PixelGrid<WheelCell> }> = [];
  for (let phase = 0; phase < WHEEL_PHASES; phase += 1) {
    const angle = phaseAngle(phase, WHEEL_PHASES);
    const crisp = wheelInnerGrid(size);
    stampSpokes(crisp, style, center, angle, SPOKE, true);
    plotCell(crisp, center, center, cellOf(CREAM, 'hub'));
    plotReflector(crisp, center, style, angle, 0);
    grids.push({ name: wheelFrameName('crisp', phase), grid: crisp });

    const fast = wheelInnerGrid(size);
    stampSpokes(fast, style, center, angle + style.spokeStep * Math.PI / 360, HUB, false);
    stampSpokes(fast, style, center, angle, HUB, true);
    plotCell(fast, center, center, cellOf(CREAM, 'hub'));
    plotReflector(fast, center, style, angle, 2);
    grids.push({ name: wheelFrameName('fast', phase), grid: fast });
  }
  const span = spokeSpan(style);
  for (let phase = 0; phase < GLINT_PHASES; phase += 1) {
    const blur = wheelInnerGrid(size);
    plotDisc(blur, center, center, span.outer, (x, y) => ((x + y + phase) % 2 === 0 ? cellOf(HUB, 'crank') : cellOf(0, 'ink')));
    // 디더 빈 칸 제거: 'ink' 표식 셀은 투명으로 되돌립니다
    for (let i = 0; i < blur.cells.length; i += 1) if (blur.cells[i]?.part === 'ink') blur.cells[i] = undefined;
    const scratch = makePixelGrid(size, size) as BikeGrid;
    plotWheelHub(scratch, center, center);
    stampGrid(blur, scratch as unknown as PixelGrid<WheelCell>, 0, 0, () => cellOf(HUB, 'hub'));
    plotCell(blur, center, center, cellOf(CREAM, 'hub'));
    // 글린트 호: 50° 폭 골드 + 뒤로 페일 골드 2칸
    const start = phaseAngle(phase, GLINT_PHASES);
    for (let i = 0; i <= 4; i += 1) {
      const a = start + (i * Math.PI) / 14;
      plotCell(blur, center + Math.cos(a) * span.outer, center + Math.sin(a) * span.outer, cellOf(GOLD, 'hub'));
    }
    for (let i = 1; i <= 2; i += 1) {
      const a = start - (i * Math.PI) / 12;
      plotCell(blur, center + Math.cos(a) * span.outer, center + Math.sin(a) * span.outer, cellOf(PALE_GOLD, 'hub'));
    }
    grids.push({ name: wheelFrameName('blur', phase), grid: blur });
  }
  const columns = 8;
  const rows = Math.ceil(grids.length / columns);
  const width = columns * (size + SHEET_GUTTER);
  const height = rows * (size + SHEET_GUTTER);
  const data = new Uint8ClampedArray(width * height * 4);
  const frames: Record<string, SheetFrame> = {};
  grids.forEach(({ name, grid }, index) => {
    const fx = (index % columns) * (size + SHEET_GUTTER);
    const fy = Math.floor(index / columns) * (size + SHEET_GUTTER);
    paintGridRgba(grid, (cell) => cell.color, { width, height, data, offsetX: fx, offsetY: fy });
    frames[name] = { x: fx, y: fy, width: size, height: size };
  });
  return { width, height, data, frames, frameSize: size, center };
}

// ─── 자전거 몸체·그림자 ───────────────────────────────────────────────

export type BodyImage = { width: number; height: number; data: Uint8ClampedArray; anchor: { dx: number; dy: number } };

/** 스포크·허브·크랭크·페달을 뺀 자전거 몸체(64×40). 앵커는 (그리드 중앙, 바퀴 축) */
export function bakeBikeBody(category: BikeCategory, colorway: BikeColorway): BodyImage {
  const rig = bikeRig(category);
  const grid = buildBikeGrid(category, { detach: ['spokes', 'crankset'] });
  const painted = paintGridRgba(grid, resolveBikeCellColor({}, colorway));
  return { ...painted, anchor: { dx: -RIDER_GRID_W / 2, dy: -rig.axleY } };
}

/** 접지 그림자: 도로 음영 톤의 납작한 타원(2행). 굴림·요동의 기준면 */
export function bakeShadow(color = 0x8a5231): BodyImage {
  const grid = makePixelGrid<RiderCell>(48, 2);
  plotRect(grid, 6, 0, 41, 0, cellOf(color, 'ink'));
  plotRect(grid, 2, 1, 45, 1, cellOf(color, 'ink'));
  const painted = paintGridRgba(grid, (cell) => cell.color);
  return { ...painted, anchor: { dx: -24, dy: 8 } };
}
