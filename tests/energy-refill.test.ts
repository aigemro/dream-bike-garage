// 알바 체력 소진 안내(Lab #263 A안)·보상형 광고 충전(#92) 규칙 단위 테스트
import { describe, expect, it } from 'vitest';
import { ENERGY_MAX, ENERGY_RECOVERY_MS, msUntilNextEnergy, recoverEnergy, createWorkbench, type WorkbenchOrder } from '../src/domain/merge-workbench';
import {
  REWARDED_AD_POLICY,
  adOffer,
  formatDuration,
  grantAdRefill,
  isEnergyEmpty,
  localDateKey,
  msUntilFullEnergy,
  parseAdRefillRecord,
  type AdRefillRecord,
} from '../src/domain/energy-refill';

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
  // 2026-10-18 12:00 (기기 시간대 기준)
  const NOON = new Date(2026, 9, 18, 12, 0, 0).getTime();
  const today = localDateKey(NOON);

  it('체력이 기준 이하이고 오늘 횟수·간격이 남았을 때만 제안한다', () => {
    expect(adOffer({ energy: REWARDED_AD_POLICY.maxEnergy }, null, NOON)).toEqual({ available: true, block: null, left: 3, cooldownMs: 0 });
    expect(adOffer({ energy: REWARDED_AD_POLICY.maxEnergy + 1 }, null, NOON)).toMatchObject({ available: false, block: 'energy-high' });
  });

  it('마지막 충전 뒤 간격이 지나야 다시 제안하고, 시계가 뒤로 가도 간격 한 번보다 오래 막지 않는다', () => {
    const record: AdRefillRecord = { date: today, count: 1, lastRewardAt: NOON, lastRequestId: 'a' };
    expect(adOffer({ energy: 0 }, record, NOON + 60_000)).toMatchObject({ available: false, block: 'cooldown', left: 2, cooldownMs: REWARDED_AD_POLICY.cooldownMs - 60_000 });
    expect(adOffer({ energy: 0 }, record, NOON + REWARDED_AD_POLICY.cooldownMs).available).toBe(true);
    expect(adOffer({ energy: 0 }, record, NOON - 60 * 60_000).cooldownMs).toBe(REWARDED_AD_POLICY.cooldownMs);
  });

  it('하루 횟수는 기기 날짜가 바뀌면 초기화되고, 시계를 과거로 돌려도 초기화되지 않는다', () => {
    const record: AdRefillRecord = { date: today, count: 3, lastRewardAt: NOON - 3 * 60 * 60_000, lastRequestId: 'c' };
    expect(adOffer({ energy: 0 }, record, NOON)).toMatchObject({ available: false, block: 'daily-limit', left: 0 });
    const tomorrow = new Date(2026, 9, 19, 0, 1).getTime();
    expect(adOffer({ energy: 0 }, record, tomorrow)).toMatchObject({ available: true, left: 3 });
    const yesterday = new Date(2026, 9, 17, 12, 0).getTime();
    expect(adOffer({ energy: 0 }, record, yesterday)).toMatchObject({ available: false, block: 'daily-limit' });
  });
});

describe('보상형 광고 충전 지급', () => {
  const NOON = new Date(2026, 9, 18, 12, 0, 0).getTime();

  it('보상 1회에 체력 +10, 횟수 +1, 간격 기준 시각을 기록한다', () => {
    const state = { energy: 3, energyAnchor: NOON - 1000 };
    const record = grantAdRefill(state, null, 'req-1', NOON);
    expect(state).toEqual({ energy: 3 + REWARDED_AD_POLICY.amount, energyAnchor: NOON - 1000 });
    expect(record).toEqual({ date: localDateKey(NOON), count: 1, lastRewardAt: NOON, lastRequestId: 'req-1' });
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

  it('오늘 횟수를 다 썼으면 지급하지 않는다', () => {
    const state = { energy: 0, energyAnchor: NOON };
    const full: AdRefillRecord = { date: localDateKey(NOON), count: REWARDED_AD_POLICY.perDay, lastRewardAt: NOON - 60 * 60_000, lastRequestId: 'old' };
    expect(grantAdRefill(state, full, 'req-new', NOON)).toBeNull();
    expect(state.energy).toBe(0);
  });

  it('손상된 기록은 기록 없음으로 복구한다', () => {
    expect(parseAdRefillRecord({ date: '2026-10-18', count: 1, lastRewardAt: 5, lastRequestId: 'a' })).toEqual({ date: '2026-10-18', count: 1, lastRewardAt: 5, lastRequestId: 'a' });
    expect(parseAdRefillRecord({ date: '2026-10-18', count: 1, lastRewardAt: null, lastRequestId: null })).not.toBeNull();
    expect(parseAdRefillRecord({ date: 'today', count: 1, lastRewardAt: null, lastRequestId: null })).toBeNull();
    expect(parseAdRefillRecord({ date: '2026-10-18', count: -1, lastRewardAt: null, lastRequestId: null })).toBeNull();
    expect(parseAdRefillRecord('nope')).toBeNull();
  });
});
