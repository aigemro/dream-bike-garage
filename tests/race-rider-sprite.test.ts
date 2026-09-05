// 레이스 라이더 스프라이트 빌더 단위 테스트: 리그 정합·IK 도달·잉크 정책·시트 베이크 결정성
import { describe, expect, it } from 'vitest';
import type { PixelCharacterRole } from '../src/game/release/art-character-pixel';
import { bikeRig, buildBikeGrid, makeWarmColorway, type BikeCategory } from '../src/game/release/bike-pixel-sprite';
import { countCells, gridBounds } from '../src/game/release/pixel-raster';
import { CRANK_PHASES, GLINT_PHASES, RIDER_POSTURES, WHEEL_PHASES, phaseAngle } from '../src/game/release/race-rider-motion';
import {
  INK,
  RIDER_BODY,
  RIDER_CELL,
  RIDER_GRID_H,
  RIDER_GRID_W,
  RIDER_HEAD_MAPS,
  RIDER_TOP_MARGIN,
  bakeBikeBody,
  bakeRiderSheet,
  bakeShadow,
  bakeWheelSheet,
  baseHip,
  buildRiderLayerGrids,
  headNeckColumn,
  riderFrameName,
  riderPose,
  wheelFrameName,
  type RiderCell,
} from '../src/game/release/race-rider-sprite';

const CATEGORIES: BikeCategory[] = ['road', 'mtb', 'gravel', 'city', 'minivelo'];
const ROLES: PixelCharacterRole[] = ['정비사', '점장', '고객'];
const deg = (rad: number) => (rad * 180) / Math.PI;

describe('리그·IK 도달성', () => {
  it('모든 카테고리×자세×위상에서 다리는 늘리지 않고 페달에 닿으며 무릎은 60°~175° 사이로 굽힌다', () => {
    CATEGORIES.forEach((category) => RIDER_POSTURES.forEach((posture) => {
      for (let phase = 0; phase < CRANK_PHASES; phase += 1) {
        const pose = riderPose(category, posture, phaseAngle(phase, CRANK_PHASES));
        [pose.near, pose.far].forEach((leg) => {
          expect(leg.reachable, `${category}/${posture}/${phase} 다리 도달`).toBe(true);
          expect(deg(leg.kneeAngle), `${category}/${posture}/${phase} 무릎각`).toBeGreaterThanOrEqual(60);
          expect(deg(leg.kneeAngle), `${category}/${posture}/${phase} 무릎각`).toBeLessThanOrEqual(175);
          // 무릎은 항상 앞(+x)으로 굽는다
          const hipToAnkle = { x: leg.ankle.x - pose.hip.x, y: leg.ankle.y - pose.hip.y };
          const hipToKnee = { x: leg.knee.x - pose.hip.x, y: leg.knee.y - pose.hip.y };
          const cross = hipToAnkle.x * hipToKnee.y - hipToAnkle.y * hipToKnee.x;
          expect(cross, `${category}/${posture}/${phase} 무릎 방향`).toBeLessThan(0);
        });
      }
    }));
  });

  it('모든 카테고리×자세×위상(어깨 오프셋 포함)에서 팔은 늘리지 않고 그립에 닿으며 팔꿈치는 아래로 굽는다', () => {
    CATEGORIES.forEach((category) => RIDER_POSTURES.forEach((posture) => {
      for (let phase = 0; phase < CRANK_PHASES; phase += 1) {
        const pose = riderPose(category, posture, phaseAngle(phase, CRANK_PHASES));
        expect(pose.arm.reachable, `${category}/${posture}/${phase} 팔 도달`).toBe(true);
        expect(deg(pose.arm.elbowAngle), `${category}/${posture}/${phase} 팔꿈치각`).toBeGreaterThanOrEqual(60);
        expect(pose.arm.elbow.y).toBeGreaterThanOrEqual(Math.min(pose.shoulder.y, pose.hand.y) - 1e-9);
      }
    }));
  });

  it('손은 리그의 핸들바 그립 좌표 위에 있다', () => {
    CATEGORIES.forEach((category) => {
      const rig = bikeRig(category);
      expect(riderPose(category, 'seated', 0).hand).toEqual({ x: rig.hands.hoods[0], y: rig.hands.hoods[1] });
      expect(riderPose(category, 'climb', 0).hand).toEqual({ x: rig.hands.tops[0], y: rig.hands.tops[1] });
      expect(riderPose(category, 'tuck', 0).hand).toEqual({ x: rig.hands.drops[0], y: rig.hands.drops[1] });
    });
  });

  it('힙은 안장 바로 위에 앉고, 미니벨로는 BB가 낮은 만큼 1칸 내려앉는다', () => {
    expect(baseHip(bikeRig('road'))).toEqual({ x: 23, y: 6 });
    expect(baseHip(bikeRig('minivelo'))).toEqual({ x: 23, y: 7 });
    CATEGORIES.forEach((category) => {
      const rig = bikeRig(category);
      const hip = baseHip(rig);
      expect(hip.y).toBeLessThan(rig.saddleTop[1]);
      expect(Math.abs(hip.x - rig.saddleTop[0])).toBeLessThanOrEqual(2);
    });
  });

  it('스탠딩 스프린트는 힙이 안장에서 앞·위로 떠 있다', () => {
    const seated = riderPose('road', 'seated', 0).hip;
    const sprint = riderPose('road', 'sprint', 0).hip;
    expect(sprint.x).toBeGreaterThan(seated.x);
    expect(sprint.y).toBeLessThan(seated.y);
  });

  it('페달 위치는 크랭크 원 위에 있고 근경·원경은 180° 반대다', () => {
    const rig = bikeRig('road');
    const pose = riderPose('road', 'seated', Math.PI / 3);
    const dist = (p: { x: number; y: number }) => Math.hypot(p.x - rig.bb[0], p.y - rig.bb[1]);
    expect(dist(pose.near.pedal)).toBeCloseTo(rig.crankRadius, 6);
    expect(dist(pose.far.pedal)).toBeCloseTo(rig.crankRadius, 6);
    expect(pose.near.pedal.x + pose.far.pedal.x).toBeCloseTo(rig.bb[0] * 2, 6);
    expect(pose.near.pedal.y + pose.far.pedal.y).toBeCloseTo(rig.bb[1] * 2, 6);
  });
});

describe('레이어 그리드 정책', () => {
  const sample = buildRiderLayerGrids('road', '정비사', 'seated', 3);

  it('far 레이어에는 잉크 셀이 없고, near 레이어에는 잉크 외곽선이 있다', () => {
    expect(countCells(sample.far, (cell) => cell.part === 'ink')).toBe(0);
    expect(countCells(sample.near, (cell) => cell.part === 'ink')).toBeGreaterThan(40);
  });

  it('far 레이어는 근경보다 어두운 톤만 쓴다(원경 무잉크 깊이 규칙)', () => {
    const luminance = (color: number) => ((color >> 16) & 0xff) * 0.299 + ((color >> 8) & 0xff) * 0.587 + (color & 0xff) * 0.114;
    const nearThigh = [...sample.near.cells].find((cell): cell is RiderCell => cell?.part === 'thigh')!;
    const farThigh = [...sample.far.cells].find((cell): cell is RiderCell => cell?.part === 'thigh')!;
    expect(luminance(farThigh.color)).toBeLessThan(luminance(nearThigh.color));
  });

  it('근경 허벅지는 몸통 아래에 깔린다(힙이 몸 안에 있는 것으로 읽힘)', () => {
    // 몸통이 차지하는 영역 안에는 허벅지 셀이 남아 있지 않다
    RIDER_POSTURES.forEach((posture) => {
      for (let phase = 0; phase < CRANK_PHASES; phase += 4) {
        const { near, pose } = buildRiderLayerGrids('road', '정비사', posture, phase);
        const hipX = Math.round(pose.hip.x);
        const hipY = Math.round(pose.hip.y) + RIDER_TOP_MARGIN;
        const cell = near.cells[hipY * near.width + hipX];
        expect(cell?.part.startsWith('torso') || cell?.part === 'bib', `${posture}/${phase} 힙 셀`).toBe(true);
      }
    });
  });

  it('신발은 페달 발판 바로 위에 있고 진행 방향으로 앞코가 나온다', () => {
    const { near, pose } = buildRiderLayerGrids('road', '정비사', 'seated', 0);
    const px = Math.round(pose.near.pedal.x);
    const py = Math.round(pose.near.pedal.y) + RIDER_TOP_MARGIN;
    const partAt = (x: number, y: number) => near.cells[y * near.width + x]?.part;
    expect(partAt(px, py)).toBe('pedal');
    expect(partAt(px, py - 1)).toBe('shoe');
    expect(partAt(px + 2, py - 1)).toBe('shoe');
  });

  it('머리 맵은 잉크로 닫힌 12×12이며 목 열을 찾을 수 있다', () => {
    ROLES.forEach((role) => {
      const rows = RIDER_HEAD_MAPS[role];
      expect(rows).toHaveLength(12);
      rows.forEach((row) => expect(row).toHaveLength(12));
      const neck = headNeckColumn(rows);
      expect(rows[11][neck] === 'S' || rows[11][neck] === 'T').toBe(true);
    });
  });

  it('머리는 어깨 위에 놓이고 전 프레임에서 그리드 안에 들어간다', () => {
    CATEGORIES.forEach((category) => ROLES.forEach((role) => RIDER_POSTURES.forEach((posture) => {
      for (let phase = 0; phase < CRANK_PHASES; phase += 6) {
        const { near, far, pose } = buildRiderLayerGrids(category, role, posture, phase);
        const headTop = Math.round(pose.headAnchor.y) + RIDER_TOP_MARGIN - 11;
        expect(headTop, `${category}/${role}/${posture}/${phase} 머리 상단`).toBeGreaterThanOrEqual(0);
        expect(pose.headAnchor.y).toBeLessThan(pose.shoulder.y);
        // 페달 최하단(+신발 아래 발판)도 그리드 안
        const bounds = gridBounds(near)!;
        expect(bounds.maxY).toBeLessThan(RIDER_GRID_H);
        expect(bounds.maxX).toBeLessThan(RIDER_GRID_W);
        expect(gridBounds(far)).not.toBeNull();
      }
    })));
  });

  it('반다나 꼬리는 정비사에만 있고 위상 짝/홀로 위치가 바뀐다', () => {
    const even = buildRiderLayerGrids('road', '정비사', 'seated', 2);
    const odd = buildRiderLayerGrids('road', '정비사', 'seated', 3);
    const headCells = (grid: typeof even.near) => countCells(grid, (cell) => cell.part === 'head');
    expect(headCells(even.near)).toBe(headCells(odd.near));
    const evenAscii = even.near.cells.map((cell) => (cell?.part === 'head' ? cell.color : 0)).join(',');
    const oddAscii = odd.near.cells.map((cell) => (cell?.part === 'head' ? cell.color : 0)).join(',');
    expect(evenAscii).not.toBe(oddAscii);
    const manager = buildRiderLayerGrids('road', '점장', 'seated', 2);
    expect(countCells(manager.near, (cell) => cell.part === 'head' && cell.color === 0xfff1c6)).toBe(0);
  });
});

describe('스프라이트시트 베이크', () => {
  const sheet = bakeRiderSheet('road', '정비사');

  it('자세 4 × 위상 24 × 레이어 2 = 192 프레임이 겹치지 않고 시트 안에 배치된다', () => {
    const names = Object.keys(sheet.frames);
    expect(names).toHaveLength(RIDER_POSTURES.length * CRANK_PHASES * 2);
    names.forEach((name) => {
      const frame = sheet.frames[name];
      expect(frame.width).toBe(sheet.frameWidth);
      expect(frame.height).toBe(sheet.frameHeight);
      expect(frame.x + frame.width).toBeLessThanOrEqual(sheet.width);
      expect(frame.y + frame.height).toBeLessThanOrEqual(sheet.height);
    });
    const occupied = new Set<string>();
    names.forEach((name) => {
      const frame = sheet.frames[name];
      const key = `${frame.x},${frame.y}`;
      expect(occupied.has(key)).toBe(false);
      occupied.add(key);
    });
    expect(sheet.width).toBeLessThanOrEqual(2048);
    expect(sheet.height).toBeLessThanOrEqual(2048);
  });

  it('프레임 크기는 라이더가 실제로 차지하는 영역(약 30~50셀)이고 앵커는 정수다', () => {
    expect(sheet.frameWidth).toBeGreaterThan(24);
    expect(sheet.frameWidth).toBeLessThan(RIDER_GRID_W);
    expect(sheet.frameHeight).toBeGreaterThan(30);
    expect(sheet.frameHeight).toBeLessThanOrEqual(RIDER_GRID_H);
    expect(Number.isInteger(sheet.anchor.dx)).toBe(true);
    expect(Number.isInteger(sheet.anchor.dy)).toBe(true);
    expect(RIDER_CELL).toBe(2);
  });

  it('모든 프레임에 픽셀이 있고 알파는 0 또는 255만 쓴다', () => {
    Object.values(sheet.frames).forEach((frame) => {
      let opaque = 0;
      for (let y = frame.y; y < frame.y + frame.height; y += 1) {
        for (let x = frame.x; x < frame.x + frame.width; x += 1) {
          const alpha = sheet.data[(y * sheet.width + x) * 4 + 3];
          expect(alpha === 0 || alpha === 255).toBe(true);
          if (alpha === 255) opaque += 1;
        }
      }
      expect(opaque).toBeGreaterThan(20);
    });
  });

  it('프레임 이름 규약으로 자세·레이어·위상을 찾을 수 있다', () => {
    expect(sheet.frames[riderFrameName('seated', 'near', 0)]).toBeDefined();
    expect(sheet.frames[riderFrameName('sprint', 'far', CRANK_PHASES - 1)]).toBeDefined();
    expect(sheet.frames[riderFrameName('sprint', 'far', CRANK_PHASES)]).toBeUndefined();
  });

  it('같은 입력을 두 번 굽으면 바이트 단위로 동일하다(결정성)', () => {
    const again = bakeRiderSheet('road', '정비사');
    expect(again.width).toBe(sheet.width);
    expect(again.height).toBe(sheet.height);
    expect(Buffer.from(again.data).equals(Buffer.from(sheet.data))).toBe(true);
  });

  it('역할이 다르면 색만 다르고 프레임 레이아웃은 같다', () => {
    const manager = bakeRiderSheet('road', '점장');
    expect(manager.frameWidth).toBe(sheet.frameWidth);
    expect(manager.frameHeight).toBe(sheet.frameHeight);
    expect(manager.frames).toEqual(sheet.frames);
    expect(Buffer.from(manager.data).equals(Buffer.from(sheet.data))).toBe(false);
  });
});

describe('바퀴 회전 시트', () => {
  const style = bikeRig('road').wheel;
  const sheet = bakeWheelSheet(style);

  it('crisp 24 + fast 24 + blur 8 프레임, 한 변은 림 지름과 같다', () => {
    expect(Object.keys(sheet.frames)).toHaveLength(WHEEL_PHASES * 2 + GLINT_PHASES);
    expect(sheet.frameSize).toBe((style.radius - style.tireThickness) * 2 + 1);
    expect(sheet.center).toBe(style.radius - style.tireThickness);
    for (let phase = 0; phase < WHEEL_PHASES; phase += 1) {
      expect(sheet.frames[wheelFrameName('crisp', phase)]).toBeDefined();
      expect(sheet.frames[wheelFrameName('fast', phase)]).toBeDefined();
    }
    for (let phase = 0; phase < GLINT_PHASES; phase += 1) expect(sheet.frames[wheelFrameName('blur', phase)]).toBeDefined();
  });

  const framePixels = (name: string) => {
    const frame = sheet.frames[name];
    const pixels: Array<{ x: number; y: number; color: number }> = [];
    for (let y = 0; y < frame.height; y += 1) for (let x = 0; x < frame.width; x += 1) {
      const i = ((frame.y + y) * sheet.width + frame.x + x) * 4;
      if (sheet.data[i + 3] === 255) pixels.push({ x, y, color: (sheet.data[i] << 16) | (sheet.data[i + 1] << 8) | sheet.data[i + 2] });
    }
    return pixels;
  };

  it('8스포크는 45° 대칭이라 위상 0과 위상 3(45°)의 점유 셀은 같고, 골드 반사판 위치만 다르다', () => {
    const a = framePixels(wheelFrameName('crisp', 0));
    const b = framePixels(wheelFrameName('crisp', 3));
    const occupied = (pixels: typeof a) => new Set(pixels.map((p) => `${p.x},${p.y}`));
    expect(occupied(a)).toEqual(occupied(b));
    const gold = (pixels: typeof a) => pixels.filter((p) => p.color === 0xf4b84a).map((p) => `${p.x},${p.y}`).sort();
    expect(gold(a).length).toBeGreaterThan(0);
    expect(gold(a)).not.toEqual(gold(b));
  });

  it('crisp 24위상의 반사판 위치는 모두 다르다(회전 인지 단서)', () => {
    const seen = new Set<string>();
    for (let phase = 0; phase < WHEEL_PHASES; phase += 1) {
      const gold = framePixels(wheelFrameName('crisp', phase)).filter((p) => p.color === 0xf4b84a).map((p) => `${p.x},${p.y}`).sort().join('|');
      expect(seen.has(gold), `위상 ${phase} 반사판 중복`).toBe(false);
      seen.add(gold);
    }
  });

  it('fast 프레임은 crisp보다 스포크 셀이 많고(16스포크), blur 프레임은 디스크를 체커로 채운다', () => {
    const crisp = framePixels(wheelFrameName('crisp', 0)).length;
    const fast = framePixels(wheelFrameName('fast', 0)).length;
    const blur = framePixels(wheelFrameName('blur', 0)).length;
    expect(fast).toBeGreaterThan(crisp);
    expect(blur).toBeGreaterThan(crisp);
    // 체커: 인접 위상은 디더 패턴이 1칸 어긋나 서로 다르다
    const blurA = framePixels(wheelFrameName('blur', 0)).map((p) => `${p.x},${p.y}`).sort().join('|');
    const blurB = framePixels(wheelFrameName('blur', 1)).map((p) => `${p.x},${p.y}`).sort().join('|');
    expect(blurA).not.toBe(blurB);
  });

  it('바퀴 프레임은 몸체의 림 안쪽(잉크 없는 영역)에만 그려진다', () => {
    const body = buildBikeGrid('road', { detach: ['spokes', 'crankset'] });
    const rig = bikeRig('road');
    const pixels = framePixels(wheelFrameName('fast', 5));
    pixels.forEach((p) => {
      const gx = rig.rear[0] - sheet.center + p.x;
      const gy = rig.rear[1] - sheet.center + p.y;
      const cell = body.cells[gy * body.width + gx];
      // 스포크가 프레임(체인스테이 등) 뒤에 가려질 수는 있지만, 타이어·림 위로 나가지는 않는다
      expect(cell?.role === 'tire' || cell?.role === 'tireShade' || cell?.role === 'rim').toBe(false);
    });
  });

  it('스타일이 다르면(미니벨로) 프레임 크기도 다르다', () => {
    const mini = bakeWheelSheet(bikeRig('minivelo').wheel);
    expect(mini.frameSize).toBeLessThan(sheet.frameSize);
  });
});

describe('몸체·그림자', () => {
  it('몸체 이미지는 64×40이고 스포크·허브·크랭크·페달이 빠져 있다', () => {
    const body = bakeBikeBody('road', makeWarmColorway(0xc95746));
    expect(body.width).toBe(64);
    expect(body.height).toBe(40);
    expect(body.anchor).toEqual({ dx: -32, dy: -27 });
    const grid = buildBikeGrid('road', { detach: ['spokes', 'crankset'] });
    expect(countCells(grid, (cell) => cell.role === 'spoke' || cell.role === 'hub' || cell.role === 'crank' || cell.role === 'pedal')).toBe(0);
    expect(countCells(grid, (cell) => cell.role === 'rim')).toBeGreaterThan(0);
    // 림 안쪽에는 잉크가 끼지 않는다(림은 외곽선 대상이 아님)
    const rig = bikeRig('road');
    const inner = rig.wheel.radius - rig.wheel.tireThickness - 1;
    let inkInside = 0;
    for (let y = -inner; y <= inner; y += 1) for (let x = -inner; x <= inner; x += 1) {
      if (Math.hypot(x, y) > inner - 0.6) continue;
      const cell = grid.cells[(rig.rear[1] + y) * grid.width + rig.rear[0] + x];
      if (cell?.role === 'ink' && cell.group === 'wheel') inkInside += 1;
    }
    expect(inkInside).toBe(0);
  });

  it('그림자는 도로 음영 톤 2행 타원이다', () => {
    const shadow = bakeShadow();
    expect(shadow.height).toBe(2);
    expect(shadow.data[3]).toBe(0);
    let opaque = 0;
    for (let i = 3; i < shadow.data.length; i += 4) if (shadow.data[i] === 255) opaque += 1;
    expect(opaque).toBeGreaterThan(60);
  });

  it('신체 치수와 잉크 색은 설계값을 유지한다', () => {
    expect(RIDER_BODY.thigh + RIDER_BODY.shin).toBe(29);
    expect(RIDER_BODY.upperArm + RIDER_BODY.foreArm).toBe(22);
    expect(INK).toBe(0x3b2531);
  });
});

describe('코스팅 렌더 위상', () => {
  it.each(CATEGORIES)('%s: 수평 정지 프레임에서 양쪽 페달 높이가 같다', (category) => {
    for (const phase of [0, CRANK_PHASES / 2]) {
      const { pose } = buildRiderLayerGrids(category, '정비사', 'tuck', phase);
      expect(pose.near.pedal.y).toBeCloseTo(pose.far.pedal.y, 8);
      expect(pose.near.pedal.y).toBeCloseTo(pose.bb.y, 8);
    }
  });
});
