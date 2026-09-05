// 자전거 픽셀 스프라이트: 리그 지오메트리·부품 분리 그리드·컬러웨이 단위 테스트
import { describe, expect, it } from 'vitest';
import {
  bikeRig,
  buildBikeGrid,
  makeWarmColorway,
  resolveBikeCellColor,
  shadeColor,
  type BikeCategory,
} from '../src/game/release/bike-pixel-sprite';
import { countCells } from '../src/game/release/pixel-raster';

const CATEGORIES: BikeCategory[] = ['road', 'mtb', 'gravel', 'city', 'minivelo'];

describe('리그 지오메트리', () => {
  it('손 위치 후보는 실제 핸들바 픽셀(바·그립) 위 또는 바로 옆에 있다', () => {
    CATEGORIES.forEach((category) => {
      const rig = bikeRig(category);
      const grid = buildBikeGrid(category);
      const barNear = (x: number, y: number) => {
        for (let dy = -1; dy <= 1; dy += 1) for (let dx = -1; dx <= 1; dx += 1) {
          const cell = grid.cells[(y + dy) * grid.width + x + dx];
          if (cell && (cell.role === 'bar' || cell.role === 'grip' || cell.role === 'stem')) return true;
        }
        return false;
      };
      (['hoods', 'tops', 'drops'] as const).forEach((hand) => {
        const [x, y] = rig.hands[hand];
        expect(barNear(x, y), `${category} ${hand}`).toBe(true);
      });
      if (rig.handlebar === 'flat') expect(rig.hands.hoods).toEqual(rig.hands.drops);
      else expect(rig.hands.drops[1]).toBeGreaterThan(rig.hands.hoods[1]);
    });
  });

  it('안장 윗면은 saddle 픽셀이고 BB는 체인링 중심이다', () => {
    CATEGORIES.forEach((category) => {
      const rig = bikeRig(category);
      const grid = buildBikeGrid(category);
      const at = (x: number, y: number) => grid.cells[y * grid.width + x];
      expect(at(rig.saddleTop[0], rig.saddleTop[1])?.role, `${category} 안장`).toBe('saddle');
      // 체인링(반지름 3, 두께 1) 위의 한 점
      expect(at(rig.bb[0] + rig.chainringRadius, rig.bb[1])?.role, `${category} 체인링`).toBe('ring');
      expect(rig.crankRadius).toBeGreaterThan(rig.chainringRadius);
      expect(rig.axleY).toBe(rig.rear[1]);
      expect(rig.axleY).toBe(rig.front[1]);
    });
  });

  it('바퀴 축 사이에 BB가 있고 그리드는 64×40이다', () => {
    CATEGORIES.forEach((category) => {
      const rig = bikeRig(category);
      expect(rig.gridWidth).toBe(64);
      expect(rig.gridHeight).toBe(40);
      expect(rig.bb[0]).toBeGreaterThan(rig.rear[0]);
      expect(rig.bb[0]).toBeLessThan(rig.front[0]);
    });
  });
});

describe('부품 분리 그리드', () => {
  it('spokes 분리는 스포크·허브만 제거하고 림·타이어는 남긴다', () => {
    CATEGORIES.forEach((category) => {
      const full = buildBikeGrid(category);
      const body = buildBikeGrid(category, { detach: ['spokes'] });
      expect(countCells(body, (cell) => cell.role === 'spoke' || cell.role === 'hub')).toBe(0);
      expect(countCells(body, (cell) => cell.role === 'rim')).toBe(countCells(full, (cell) => cell.role === 'rim'));
      expect(countCells(body, (cell) => cell.role === 'tire' || cell.role === 'tireShade'))
        .toBe(countCells(full, (cell) => cell.role === 'tire' || cell.role === 'tireShade'));
      // 바퀴 그룹 잉크(타이어 외곽선)는 늘지 않는다 — 림이 남아 림 안쪽에 잉크가 끼지 않음.
      // (프레임 튜브가 바퀴 안쪽에서 스포크 대신 빈 칸과 맞닿아 생기는 프레임 그룹 잉크는 허용)
      expect(countCells(body, (cell) => cell.role === 'ink' && cell.group === 'wheel'))
        .toBe(countCells(full, (cell) => cell.role === 'ink' && cell.group === 'wheel'));
    });
  });

  it('crankset 분리는 크랭크·페달만 제거하고 체인·체인링·카세트는 남긴다', () => {
    CATEGORIES.forEach((category) => {
      const full = buildBikeGrid(category);
      const body = buildBikeGrid(category, { detach: ['crankset'] });
      expect(countCells(body, (cell) => cell.role === 'crank' || cell.role === 'pedal')).toBe(0);
      (['chain', 'ring', 'cassette'] as const).forEach((role) => {
        expect(countCells(body, (cell) => cell.role === role), `${category} ${role}`).toBeGreaterThanOrEqual(countCells(full, (cell) => cell.role === role));
      });
    });
  });

  it('분리 옵션은 캐시 키에 반영되어 전체 그리드와 섞이지 않는다', () => {
    const full = buildBikeGrid('road');
    const body = buildBikeGrid('road', { detach: ['spokes', 'crankset'] });
    expect(buildBikeGrid('road')).toBe(full);
    expect(buildBikeGrid('road', { detach: ['crankset', 'spokes'] })).toBe(body);
    expect(body).not.toBe(full);
    expect(countCells(full, (cell) => cell.role === 'spoke')).toBeGreaterThan(0);
  });

  it('분리하지 않은 그리드는 변형 없이 프레임·바퀴·구동계·핸들바 그룹을 모두 가진다', () => {
    CATEGORIES.forEach((category) => {
      const grid = buildBikeGrid(category);
      (['frame', 'wheel', 'drivetrain', 'handlebar'] as const).forEach((group) => {
        expect(countCells(grid, (cell) => cell.group === group), `${category} ${group}`).toBeGreaterThan(0);
      });
    });
  });
});

describe('컬러웨이', () => {
  it('프레임 색에서 음영·하이라이트를 파생하고 잉크는 고정이다', () => {
    const colorway = makeWarmColorway(0x4e8092);
    expect(colorway.frame).toBe(0x4e8092);
    expect(colorway.frameShade).toBe(shadeColor(0x4e8092, 0.72));
    expect(colorway.frameLight).toBe(shadeColor(0x4e8092, 1.28));
    expect(colorway.ink).toBe(0x3b2531);
  });

  it('셀 색 결정: 실루엣 모드는 잉크/몸체 두 색만 쓴다', () => {
    const colorway = makeWarmColorway(0xc95746);
    const normal = resolveBikeCellColor({}, colorway);
    const silhouette = resolveBikeCellColor({ silhouette: { body: 0x111111, ink: 0x222222 } }, colorway);
    expect(normal({ role: 'frame', group: 'frame' })).toBe(0xc95746);
    expect(normal({ role: 'ink', group: 'frame' })).toBe(0x3b2531);
    expect(silhouette({ role: 'frame', group: 'frame' })).toBe(0x111111);
    expect(silhouette({ role: 'ink', group: 'frame' })).toBe(0x222222);
  });

  it('shadeColor는 채널을 클램프한다', () => {
    expect(shadeColor(0xffffff, 1.5)).toBe(0xffffff);
    expect(shadeColor(0x000000, 0.5)).toBe(0x000000);
    expect(shadeColor(0x808080, 0.5)).toBe(0x404040);
  });
});
