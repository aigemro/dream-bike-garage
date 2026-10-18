// 알바 체력 소진 안내 규칙 단위 테스트 (Lab #263 A안)
import { describe, expect, it } from 'vitest';
import { ENERGY_MAX, ENERGY_RECOVERY_MS, msUntilNextEnergy, recoverEnergy, createWorkbench, type WorkbenchOrder } from '../src/domain/merge-workbench';
import { formatDuration, isEnergyEmpty, msUntilFullEnergy } from '../src/domain/energy-refill';

const ORDERS: WorkbenchOrder[] = [{ levels: { frame: 2, wheel: 2, drivetrain: 1, handlebar: 1 }, reward: 1000 }];
const NOW = 1_000_000;

describe('체력 소진 판정', () => {
  it('체력 0이고 무료 상자도 없을 때만 소진이다', () => {
    expect(isEnergyEmpty({ energy: 0, freeBoxes: 0 })).toBe(true);
    expect(isEnergyEmpty({ energy: 0, freeBoxes: 1 })).toBe(false);
    expect(isEnergyEmpty({ energy: 1, freeBoxes: 0 })).toBe(false);
  });
});

describe('가득 참까지 남은 시간', () => {
  it('가득 차 있으면 0이다', () => {
    expect(msUntilFullEnergy({ energy: ENERGY_MAX, energyAnchor: NOW }, NOW + 5000)).toBe(0);
  });

  it('다음 +1까지 남은 시간에 나머지 칸의 회복 시간을 더한 값이다', () => {
    const state = createWorkbench(ORDERS, NOW);
    state.energy = 0;
    state.energyAnchor = NOW;
    const now = NOW + 3 * 60_000; // 기준 시각에서 3분 지남
    expect(msUntilFullEnergy(state, now)).toBe(msUntilNextEnergy(state, now) + (ENERGY_MAX - 1) * ENERGY_RECOVERY_MS);
  });

  it('남은 시간이 지나면 실제로 가득 찬다', () => {
    const state = createWorkbench(ORDERS, NOW);
    state.energy = 7;
    state.energyAnchor = NOW;
    const full = NOW + msUntilFullEnergy(state, NOW);
    recoverEnergy(state, full - 1);
    expect(state.energy).toBe(ENERGY_MAX - 1);
    recoverEnergy(state, full);
    expect(state.energy).toBe(ENERGY_MAX);
  });

  it('시계가 기준 시각보다 뒤로 가도 최대 회복 시간을 넘지 않는다', () => {
    expect(msUntilFullEnergy({ energy: 0, energyAnchor: NOW }, NOW - 60_000)).toBe(ENERGY_MAX * ENERGY_RECOVERY_MS);
  });
});

describe('남은 시간 표시', () => {
  it('분 단위로 올림하고 60분 이상은 시간과 분으로 보여 준다', () => {
    expect(formatDuration(0)).toBe('0분');
    expect(formatDuration(1)).toBe('1분');
    expect(formatDuration(59 * 60_000)).toBe('59분');
    expect(formatDuration(300 * 60_000)).toBe('5시간 0분');
    expect(formatDuration(299 * 60_000 + 1)).toBe('5시간 0분');
    expect(formatDuration(125 * 60_000)).toBe('2시간 5분');
  });
});
