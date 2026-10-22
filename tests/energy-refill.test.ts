// 알바 체력 소진 안내(Lab #263 A안)·보상형 광고 충전(#92) 규칙 단위 테스트
import { describe, expect, it } from 'vitest';
import { ENERGY_MAX, ENERGY_RECOVERY_MS, msUntilNextEnergy, recoverEnergy, createWorkbench, type WorkbenchOrder } from '../src/domain/merge-workbench';
import {
  REWARDED_AD_POLICY,
  SETTLEMENT_REFILL_LAST_DAY,
  adOffer,
  applyBonusEnergy,
  applySettlementRefill,
  hasSettlementRefill,
  formatDuration,
  grantAdRefill,
  isEnergyEmpty,
  msUntilFullEnergy,
  parseAdRefillRecord,
  type AdRefillRecord,
} from '../src/domain/energy-refill';
import { RIVERSIDE_ENDURANCE_RACE, nextRaceDay } from '../src/game/release/race-progress';

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

describe('보상형 광고 충전 제안', () => {
  it('체력이 기준 이하이면 제안하고, 넘으면 체력 조건으로만 막는다', () => {
    expect(adOffer({ energy: REWARDED_AD_POLICY.maxEnergy })).toEqual({ available: true, block: null });
    expect(adOffer({ energy: 0 })).toEqual({ available: true, block: null });
    expect(adOffer({ energy: REWARDED_AD_POLICY.maxEnergy + 1 })).toEqual({ available: false, block: 'energy-high' });
  });

  it('하루 횟수·충전 간격 제한이 없어 연달아 충전할 수 있다', () => {
    const state = { energy: 0, energyAnchor: NOW };
    let record: AdRefillRecord | null = null;
    for (let i = 0; i < 10; i += 1) {
      state.energy = 0; // 받은 체력을 바로 다 썼다고 봅니다.
      expect(adOffer(state).available).toBe(true);
      record = grantAdRefill(state, record, `req-${i}`, NOW + i);
      expect(record).not.toBeNull();
      expect(state.energy).toBe(REWARDED_AD_POLICY.amount);
    }
    expect(record?.count).toBe(10);
  });
});

describe('보상형 광고 충전 지급', () => {
  const NOON = new Date(2026, 9, 18, 12, 0, 0).getTime();

  it('보상 1회에 체력 +10, 누적 횟수 +1, 보상 시각·요청 식별자를 기록한다', () => {
    const state = { energy: 3, energyAnchor: NOON - 1000 };
    const record = grantAdRefill(state, null, 'req-1', NOON);
    expect(state).toEqual({ energy: 3 + REWARDED_AD_POLICY.amount, energyAnchor: NOON - 1000 });
    expect(record).toEqual({ count: 1, lastRewardAt: NOON, lastRequestId: 'req-1' });
    expect(grantAdRefill(state, record, 'req-2', NOON + 1)).toEqual({ count: 2, lastRewardAt: NOON + 1, lastRequestId: 'req-2' });
  });

  it('같은 요청의 보상 이벤트가 두 번 와도 한 번만 반영한다', () => {
    const state = { energy: 0, energyAnchor: NOON };
    const first = grantAdRefill(state, null, 'req-1', NOON);
    expect(grantAdRefill(state, first, 'req-1', NOON + 10)).toBeNull();
    expect(state.energy).toBe(REWARDED_AD_POLICY.amount);
  });

  it('최대치를 넘지 않고, 가득 차면 회복 기준 시각을 지금으로 옮긴다', () => {
    const state = { energy: ENERGY_MAX - 4, energyAnchor: NOON - 5000 };
    grantAdRefill(state, null, 'req-1', NOON);
    expect(state).toEqual({ energy: ENERGY_MAX, energyAnchor: NOON });
  });

  it('기록을 복구하고, 손상된 기록은 기록 없음으로 본다', () => {
    expect(parseAdRefillRecord({ count: 1, lastRewardAt: 5, lastRequestId: 'a' })).toEqual({ count: 1, lastRewardAt: 5, lastRequestId: 'a' });
    expect(parseAdRefillRecord({ count: 0, lastRewardAt: null, lastRequestId: null })).not.toBeNull();
    expect(parseAdRefillRecord({ count: -1, lastRewardAt: null, lastRequestId: null })).toBeNull();
    expect(parseAdRefillRecord({ count: 1, lastRewardAt: -5, lastRequestId: null })).toBeNull();
    expect(parseAdRefillRecord({ count: 1, lastRewardAt: null, lastRequestId: 7 })).toBeNull();
    expect(parseAdRefillRecord('nope')).toBeNull();
  });

  it('하루 횟수 제한이 있던 이전 기록은 날짜를 버리고 이어서 쓴다(중복 보상 방지 유지)', () => {
    const legacy = parseAdRefillRecord({ date: '2026-10-18', count: 3, lastRewardAt: NOON, lastRequestId: 'old' });
    expect(legacy).toEqual({ count: 3, lastRewardAt: NOON, lastRequestId: 'old' });
    const state = { energy: 0, energyAnchor: NOON };
    expect(grantAdRefill(state, legacy, 'old', NOON + 1)).toBeNull();
    expect(grantAdRefill(state, legacy, 'new', NOON + 1)).toEqual({ count: 4, lastRewardAt: NOON + 1, lastRequestId: 'new' });
  });
});

describe('첫 대회 전 정산 지원 (#77 (e)안)', () => {
  it('지원 마지막 영업일은 첫 대회의 전날이다', () => {
    expect(SETTLEMENT_REFILL_LAST_DAY).toBe(nextRaceDay(1, RIVERSIDE_ENDURANCE_RACE) - 1);
  });

  it('1~4일차 정산만 지원하고 대회일·이후·잘못된 값은 지원하지 않는다', () => {
    expect([1, 2, 3, 4].every(hasSettlementRefill)).toBe(true);
    expect([0, 5, 6, 10, -1, 1.5, Number.NaN].some(hasSettlementRefill)).toBe(false);
  });

  it('지원 구간이면 체력을 가득 채우고 회복 기준 시각을 지금으로 옮긴다', () => {
    const state = createWorkbench(ORDERS, NOW);
    state.energy = 3;
    state.energyAnchor = NOW - 7 * 60 * 1000;
    const later = NOW + 1000;
    expect(applySettlementRefill(state, 2, later)).toBe(ENERGY_MAX - 3);
    expect(state.energy).toBe(ENERGY_MAX);
    expect(state.energyAnchor).toBe(later);
    expect(msUntilNextEnergy(state, later)).toBe(0);
  });

  it('여러 번 불러도 결과가 같고, 이미 가득이면 0을 돌려준다', () => {
    const state = createWorkbench(ORDERS, NOW);
    state.energy = 10;
    applySettlementRefill(state, 1, NOW);
    expect(applySettlementRefill(state, 1, NOW)).toBe(0);
    expect(state.energy).toBe(ENERGY_MAX);
  });

  it('첫 대회일부터는 체력을 건드리지 않고 현행 회복만 적용한다', () => {
    const state = createWorkbench(ORDERS, NOW);
    state.energy = 5;
    state.energyAnchor = NOW;
    expect(applySettlementRefill(state, 5, NOW + 1000)).toBe(0);
    expect(state.energy).toBe(5);
    expect(state.energyAnchor).toBe(NOW);
    recoverEnergy(state, NOW + 2 * ENERGY_RECOVERY_MS);
    expect(state.energy).toBe(7);
  });
});

describe('Garage 효과 정산 체력 회복 (#109)', () => {
  it('최대치까지만 회복하고 실제 회복량을 돌려주며, 가득 차면 회복 기준 시각을 지금으로 옮긴다', () => {
    const state = { energy: 10, energyAnchor: 0 };
    expect(applyBonusEnergy(state, 4, 5_000)).toBe(4);
    expect(state).toEqual({ energy: 14, energyAnchor: 0 });
    expect(applyBonusEnergy(state, 100, 6_000)).toBe(16);
    expect(state).toEqual({ energy: ENERGY_MAX, energyAnchor: 6_000 });
    expect(applyBonusEnergy(state, 12, 7_000)).toBe(0);
    expect(applyBonusEnergy({ energy: 3, energyAnchor: 0 }, 0, 1)).toBe(0);
    expect(applyBonusEnergy({ energy: 3, energyAnchor: 0 }, Number.NaN, 1)).toBe(0);
    expect(applyBonusEnergy({ energy: 3, energyAnchor: 0 }, -5, 1)).toBe(0);
  });
});
