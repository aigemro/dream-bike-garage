// Garage 효과(#109) 단위 테스트
// 강화 스탯별 효과(성능 → 레이스, 스타일 → 전시 팁, 희귀도 → Lv.2 입고), 카테고리 세트 보너스, 드림 시그니처,
// 보유 마일스톤, 외형 사양이 규칙·수치·카탈로그 연결·작업대·레이스까지 한 줄로 이어지는지 확인합니다.
import { describe, expect, it } from 'vitest';
import { GARAGE_PERK_CONFIG } from '../src/data/garage-perks';
import {
  PERK_CATEGORIES,
  bikeVisualSpec,
  categorySetTier,
  computeGaragePerks,
  nextMilestone,
  reachedMilestones,
  tipFor,
  type GaragePerkInput,
} from '../src/domain/garage-perks';
import { LEVEL2_BOX_RATE, createWorkbench, openPartBox, rollPart, type WorkbenchOrder } from '../src/domain/merge-workbench';
import { CATALOG_BIKES } from '../src/game/release/bike-catalog';
import {
  CRAFT_PART_TYPES,
  ORDER_METAS,
  UNDERSTANDING_MAX,
  applyCraftPart,
  applyOrderDelivery,
  createCollectionProgress,
  createGrowthProgress,
  parseCollectionProgress,
  sanitizeCollectionProgress,
  serializeCollectionProgress,
  type CollectionProgress,
  type GrowthProgress,
} from '../src/game/release/meta-progress';
import {
  catalogCountByCategory,
  categorySetViews,
  claimCollectionMilestones,
  craftedCountByCategory,
  deliveryTip,
  garageBonusLine,
  garagePerks,
  heroBikeId,
  heroEffectLine,
  nextCollectionMilestone,
  perkValueLabel,
  raceBonusLine,
  statEffectViews,
} from '../src/game/release/garage-perks';
import { NPC_SPEED_MIN, NPC_SPEED_SPAN, RIVERSIDE_ENDURANCE_RACE, playerSpeedScore, simulateRace } from '../src/game/release/race-progress';

const CONFIG = GARAGE_PERK_CONFIG;
const noOwned = () => Object.fromEntries(PERK_CATEGORIES.map((category) => [category, 0])) as GaragePerkInput['ownedByCategory'];
const baseInput = (): GaragePerkInput => ({ heroBikeId: null, heroStats: null, showcaseStyleLevels: [], ownedByCategory: noOwned() });
const stats = (성능 = 1, 스타일 = 1, 희귀도 = 1) => ({ 성능, 스타일, 희귀도 });

/** 도감 자전거를 주문 2회 납품(또는 드림이면 직접 등록) → 부품 4종 제작으로 보유 상태로 만듭니다. */
function ownBike(collection: CollectionProgress, bikeId: string) {
  const order = ORDER_METAS.find((meta) => meta.bikeId === bikeId);
  if (order) {
    applyOrderDelivery(collection, order.orderIndex);
    applyOrderDelivery(collection, order.orderIndex);
  } else if (!collection.registeredBikeIds.includes(bikeId)) {
    collection.understandingByBikeId[bikeId] = UNDERSTANDING_MAX;
    collection.registeredBikeIds.push(bikeId);
  }
  CRAFT_PART_TYPES.forEach((part) => applyCraftPart(collection, 99_999, bikeId, part));
  expect(collection.craftedBikeIds).toContain(bikeId);
}

const sequence = (...values: number[]) => { let index = 0; return () => values[index++ % values.length]; };

describe('수치 데이터 정합성', () => {
  it('Lv.2 입고 기본 확률은 작업대 규칙과 같고, 상한은 모두 양수다', () => {
    expect(CONFIG.level2BoxBase).toBe(LEVEL2_BOX_RATE);
    Object.values(CONFIG.caps).forEach((cap) => expect(cap).toBeGreaterThan(0));
  });

  it('카테고리 세트 규칙은 4개 카테고리를 한 번씩 덮고, 단계는 오름차순이며 마지막 단계는 도감 대수(6)와 같다', () => {
    const totals = catalogCountByCategory();
    expect(CONFIG.categorySets.map((rule) => rule.category).sort()).toEqual([...PERK_CATEGORIES].sort());
    CONFIG.categorySets.forEach((rule) => {
      rule.tiers.forEach((tier, index) => {
        expect(tier.value).toBeGreaterThan(0);
        if (index > 0) {
          expect(tier.owned).toBeGreaterThan(rule.tiers[index - 1].owned);
          expect(tier.value).toBeGreaterThan(rule.tiers[index - 1].value);
        }
      });
      expect(rule.tiers.at(-1)!.owned).toBe(totals[rule.category]);
    });
  });

  it('시그니처는 드림 등급 3대에 하나씩 있고, 마일스톤은 오름차순으로 도감 전체(24대)에서 끝난다', () => {
    const dreamIds = CATALOG_BIKES.filter((bike) => bike.grade === '드림').map((bike) => bike.id).sort();
    expect(CONFIG.signatures.map((perk) => perk.bikeId).sort()).toEqual(dreamIds);
    CONFIG.milestones.forEach((milestone, index) => {
      expect(milestone.freeBoxes).toBeGreaterThan(0);
      if (index > 0) expect(milestone.owned).toBeGreaterThan(CONFIG.milestones[index - 1].owned);
    });
    expect(CONFIG.milestones.at(-1)!.owned).toBe(CATALOG_BIKES.length);
  });
});

describe('효과 계산 규칙 (domain/garage-perks)', () => {
  it('아무것도 없으면 팁 0 · Lv.2 입고 기본값 · 속도 0 · 정산 체력 0이고 출처가 없다', () => {
    expect(computeGaragePerks(baseInput(), CONFIG)).toEqual({ tipRate: 0, level2BoxRate: LEVEL2_BOX_RATE, raceSpeedBonus: 0, settlementEnergy: 0, sources: [] });
  });

  it('스타일: 전시 자전거 스타일 Lv 합 × 1%가 팁이 된다 (3칸 풀강 = 12%)', () => {
    expect(computeGaragePerks({ ...baseInput(), showcaseStyleLevels: [1] }, CONFIG).tipRate).toBeCloseTo(0.01);
    const full = computeGaragePerks({ ...baseInput(), showcaseStyleLevels: [4, 4, 4] }, CONFIG);
    expect(full.tipRate).toBeCloseTo(0.12);
    expect(full.sources).toEqual([{ kind: 'tip', label: '전시 스타일 Lv 합 12', value: 0.12, origin: 'showcase' }]);
  });

  it('희귀도: 대표 자전거 희귀도 Lv.2부터 Lv 1당 Lv.2 입고 +5%p (Lv.4 = 35%)', () => {
    expect(computeGaragePerks({ ...baseInput(), heroBikeId: 'urban-road', heroStats: stats(4, 4, 1) }, CONFIG).level2BoxRate).toBeCloseTo(LEVEL2_BOX_RATE);
    expect(computeGaragePerks({ ...baseInput(), heroBikeId: 'urban-road', heroStats: stats(1, 1, 4) }, CONFIG).level2BoxRate).toBeCloseTo(0.35);
  });

  it('카테고리 세트: 보유 2·4·6대에서 단계가 오르고 종류별로 다른 효과를 준다', () => {
    const owned = (category: (typeof PERK_CATEGORIES)[number], count: number) => ({ ...baseInput(), ownedByCategory: { ...noOwned(), [category]: count } });
    expect(computeGaragePerks(owned('로드', 1), CONFIG).raceSpeedBonus).toBe(0);
    expect(computeGaragePerks(owned('로드', 2), CONFIG).raceSpeedBonus).toBeCloseTo(0.8);
    expect(computeGaragePerks(owned('로드', 5), CONFIG).raceSpeedBonus).toBeCloseTo(1.6);
    expect(computeGaragePerks(owned('로드', 6), CONFIG).raceSpeedBonus).toBeCloseTo(2.5);
    expect(computeGaragePerks(owned('MTB', 6), CONFIG).settlementEnergy).toBe(12);
    expect(computeGaragePerks(owned('그래블', 6), CONFIG).level2BoxRate).toBeCloseTo(LEVEL2_BOX_RATE + 0.1);
    expect(computeGaragePerks(owned('미니벨로', 4), CONFIG).tipRate).toBeCloseTo(0.04);
    expect(computeGaragePerks(owned('MTB', 6), CONFIG).sources[0]).toMatchObject({ kind: 'settlementEnergy', origin: 'set', label: 'MTB 컬렉션 3단계' });
  });

  it('시그니처: 드림 자전거를 대표로 둘 때만 발동한다', () => {
    expect(computeGaragePerks({ ...baseInput(), heroBikeId: 'dream-machine', heroStats: stats() }, CONFIG).raceSpeedBonus).toBeCloseTo(2);
    expect(computeGaragePerks({ ...baseInput(), heroBikeId: 'expedition-gravel', heroStats: stats() }, CONFIG).level2BoxRate).toBeCloseTo(LEVEL2_BOX_RATE + 0.1);
    expect(computeGaragePerks({ ...baseInput(), heroBikeId: 'dream-mini', heroStats: stats() }, CONFIG).tipRate).toBeCloseTo(0.05);
    expect(computeGaragePerks({ ...baseInput(), heroBikeId: 'trail-mtb', heroStats: stats(4, 4, 4) }, CONFIG).sources.some((source) => source.origin === 'signature')).toBe(false);
  });

  it('여러 출처가 겹쳐도 상한을 넘지 않는다', () => {
    const everything: GaragePerkInput = {
      heroBikeId: 'expedition-gravel',
      heroStats: stats(4, 4, 4),
      showcaseStyleLevels: [4, 4, 4],
      ownedByCategory: { 로드: 6, MTB: 6, 그래블: 6, 미니벨로: 6 },
    };
    const perks = computeGaragePerks(everything, CONFIG);
    // 20% + 희귀도 15%p + 그래블 10%p + 시그니처 10%p = 55% → 상한 45%
    expect(perks.level2BoxRate).toBeCloseTo(CONFIG.caps.level2BoxRate);
    expect(perks.tipRate).toBeLessThanOrEqual(CONFIG.caps.tipRate);
    expect(perks.raceSpeedBonus).toBeLessThanOrEqual(CONFIG.caps.raceSpeedBonus);
    expect(perks.settlementEnergy).toBeLessThanOrEqual(CONFIG.caps.settlementEnergy);
  });

  it('세트 단계 판정은 현재 단계·값·다음 단계를 돌려준다', () => {
    const rule = CONFIG.categorySets.find((item) => item.category === '로드')!;
    expect(categorySetTier(0, rule)).toEqual({ owned: 0, tier: 0, value: 0, next: rule.tiers[0] });
    expect(categorySetTier(3, rule)).toEqual({ owned: 3, tier: 1, value: 0.8, next: rule.tiers[1] });
    expect(categorySetTier(6, rule)).toEqual({ owned: 6, tier: 3, value: 2.5, next: undefined });
  });

  it('팁 금액은 10코인 단위로 내리고 비정상 값은 0이다', () => {
    expect(tipFor(1400, 0.03)).toBe(40);
    expect(tipFor(1000, 0.12)).toBe(120);
    expect(tipFor(1800, 0.25)).toBe(450);
    expect(tipFor(0, 0.1)).toBe(0);
    expect(tipFor(1000, 0)).toBe(0);
    expect(tipFor(1000, Number.NaN)).toBe(0);
    expect(tipFor(-5, 0.1)).toBe(0);
  });

  it('마일스톤: 닿았지만 받지 않은 것만 낮은 순으로 돌려주고, 다음 마일스톤을 안내한다', () => {
    expect(reachedMilestones(9, [4], CONFIG.milestones)).toEqual([{ owned: 8, freeBoxes: 3 }]);
    expect(reachedMilestones(9, [4, 8], CONFIG.milestones)).toEqual([]);
    expect(reachedMilestones(24, [], CONFIG.milestones).map((milestone) => milestone.owned)).toEqual([4, 8, 12, 16, 20, 24]);
    expect(nextMilestone(1, CONFIG.milestones)).toEqual({ owned: 4, freeBoxes: 2 });
    expect(nextMilestone(24, CONFIG.milestones)).toBeUndefined();
  });

  it('외형 사양: 희귀도는 반짝임, 성능은 속도선, 스타일은 색 단계로 드러난다', () => {
    expect(bikeVisualSpec(stats(1, 1, 1), 1)).toEqual({ sparkles: 0, sparkleAlternate: false, speedLines: 0, styleTier: 0, stage: 1 });
    expect(bikeVisualSpec(stats(4, 4, 4), 3)).toEqual({ sparkles: 6, sparkleAlternate: true, speedLines: 3, styleTier: 3, stage: 3 });
    expect(bikeVisualSpec(stats(2, 3, 2), 2)).toMatchObject({ sparkles: 2, sparkleAlternate: false, speedLines: 1, styleTier: 2, stage: 2 });
  });
});

describe('카탈로그·컬렉션 연결 (release/garage-perks)', () => {
  it('카테고리별 도감 대수는 6대씩 24대이고, 시작 보유는 로드 1대뿐이다', () => {
    const totals = catalogCountByCategory();
    PERK_CATEGORIES.forEach((category) => expect(totals[category]).toBe(6));
    expect(craftedCountByCategory(createCollectionProgress())).toEqual({ 로드: 1, MTB: 0, 그래블: 0, 미니벨로: 0 });
  });

  it('시작 상태: 대표는 드림 로드이고 전시된 대표(스타일 Lv.1)로 팁 1%, Lv.2 입고는 기본값이다', () => {
    const collection = createCollectionProgress();
    expect(heroBikeId(collection)).toBe('dream-road');
    const perks = garagePerks(collection, createGrowthProgress());
    expect(perks.tipRate).toBeCloseTo(0.01);
    expect(perks.level2BoxRate).toBeCloseTo(LEVEL2_BOX_RATE);
    expect(perks.raceSpeedBonus).toBe(0);
  });

  it('대표 자전거의 희귀도만 Lv.2 입고에 반영되고, 다른 자전거의 희귀도는 반영되지 않는다', () => {
    const collection = createCollectionProgress();
    ownBike(collection, 'urban-road');
    const growth: GrowthProgress = { statsByBikeId: { 'urban-road': stats(1, 1, 4) } };
    expect(garagePerks(collection, growth).level2BoxRate).toBeCloseTo(LEVEL2_BOX_RATE);
    collection.selectedBikeId = 'urban-road';
    expect(heroBikeId(collection)).toBe('urban-road');
    expect(garagePerks(collection, growth).level2BoxRate).toBeCloseTo(0.35);
    // 미완성 자전거를 선택해도 대표는 첫 보유 자전거로 남는다
    collection.selectedBikeId = 'trail-mtb';
    expect(heroBikeId(collection)).toBe('dream-road');
  });

  it('전시대에 올린 자전거의 스타일만 팁에 반영된다', () => {
    const collection = createCollectionProgress();
    ownBike(collection, 'urban-road');
    const growth: GrowthProgress = { statsByBikeId: { 'dream-road': stats(1, 4, 1), 'urban-road': stats(1, 3, 1) } };
    expect(garagePerks(collection, growth).tipRate).toBeCloseTo(0.04);
    collection.showcaseSlots = ['dream-road', 'urban-road', null];
    expect(garagePerks(collection, growth).tipRate).toBeCloseTo(0.07);
    collection.showcaseSlots = [null, null, null];
    expect(garagePerks(collection, growth).tipRate).toBe(0);
  });

  it('카테고리를 모으면 세트 보너스가 열리고 도감 화면 문구에 단계가 드러난다', () => {
    const collection = createCollectionProgress();
    CATALOG_BIKES.filter((bike) => bike.category === 'MTB').forEach((bike) => ownBike(collection, bike.id));
    const perks = garagePerks(collection, createGrowthProgress());
    expect(perks.settlementEnergy).toBe(12);
    expect(garageBonusLine(perks)).toBe('팁 +1% · 정산 체력 +12');
    const mtb = categorySetViews(collection).find((view) => view.rule.category === 'MTB')!;
    expect(mtb.state).toMatchObject({ owned: 6, tier: 3, value: 12 });
    expect(mtb.total).toBe(6);
    expect(perkValueLabel('settlementEnergy', 12)).toBe('+12');
    expect(perkValueLabel('raceSpeed', 2.5)).toBe('+2.5');
    expect(perkValueLabel('level2Box', 0.1)).toBe('+10%p');
    expect(perkValueLabel('tip', 0.06)).toBe('+6%p');
  });

  it('드림 머신을 대표로 두면 출전 보너스 문구에 시그니처가 나온다', () => {
    const collection = createCollectionProgress();
    ownBike(collection, 'dream-machine');
    collection.selectedBikeId = 'dream-machine';
    const perks = garagePerks(collection, createGrowthProgress());
    // 로드 2대(드림 로드 + 드림 머신) 세트 0.8 + 시그니처 2.0
    expect(perks.raceSpeedBonus).toBeCloseTo(2.8);
    expect(raceBonusLine(perks)).toBe('출전 보너스 속도 +2.8 · 로드 컬렉션 1단계 +0.8 · 드림 머신 · 에어로 프레임 +2');
    expect(raceBonusLine(garagePerks(createCollectionProgress(), createGrowthProgress()))).toBe('');
  });

  it('납품 팁은 현재 팁 비율로 10코인 단위 내림이고, 홈 대표 효과 문구는 입고 확률과 속도를 보여 준다', () => {
    const collection = createCollectionProgress();
    const growth: GrowthProgress = { statsByBikeId: { 'dream-road': stats(4, 3, 3) } };
    const perks = garagePerks(collection, growth);
    expect(perks.tipRate).toBeCloseTo(0.03);
    expect(deliveryTip(1400, perks)).toBe(40);
    expect(heroEffectLine(stats(4, 3, 3), perks)).toBe(`희귀 부품 30% · 속도 ${playerSpeedScore(stats(4, 3, 3), 0).toFixed(1)}`);
  });

  it('스탯 카드 문구는 대표·전시 여부에 따라 지금 값 또는 조건을 보여 준다', () => {
    const perks = computeGaragePerks({ ...baseInput(), heroBikeId: 'dream-road', heroStats: stats(2, 2, 2), showcaseStyleLevels: [2] }, CONFIG);
    const hero = statEffectViews(stats(2, 2, 2), { isHero: true, isShowcased: true, perks });
    expect(hero.map((view) => view.stat)).toEqual(['성능', '스타일', '희귀도']);
    expect(hero[0].current).toBe(`출전 속도 ${playerSpeedScore(stats(2, 2, 2), 0).toFixed(1)}`);
    expect(hero[1].current).toBe('전시 중 · 공방 팁 2%');
    expect(hero[2].current).toBe('지금 Lv.2 입고 25%');
    const other = statEffectViews(stats(1, 1, 3), { isHero: false, isShowcased: false, perks });
    expect(other[0].current).toBe('대표로 두면 대회에 반영');
    expect(other[1].current).toBe('전시대에 올리면 팁 반영');
    expect(other[2].current).toBe('대표로 두면 30%');
    expect(other[2].effect).toBe('대표 시 Lv.2 입고 +5%p/Lv');
  });
});

describe('보유 마일스톤 (컬렉션 저장 호환)', () => {
  it('보유 4대에 닿으면 무료 상자 보상을 한 번만 받고, 다음 마일스톤을 안내한다', () => {
    const collection = createCollectionProgress();
    expect(claimCollectionMilestones(collection)).toEqual([]);
    expect(nextCollectionMilestone(collection)).toEqual({ owned: 4, freeBoxes: 2 });
    ['urban-road', 'trail-mtb', 'touring-road'].forEach((id) => ownBike(collection, id));
    expect(claimCollectionMilestones(collection)).toEqual([{ owned: 4, freeBoxes: 2 }]);
    expect(collection.claimedMilestones).toEqual([4]);
    expect(claimCollectionMilestones(collection)).toEqual([]);
    expect(nextCollectionMilestone(collection)).toEqual({ owned: 8, freeBoxes: 3 });
  });

  it('밀린 마일스톤은 한 번에 모두 받는다 (기록이 없던 저장)', () => {
    const collection = createCollectionProgress();
    CATALOG_BIKES.filter((bike) => bike.category === 'MTB').forEach((bike) => ownBike(collection, bike.id));
    ownBike(collection, 'urban-road');
    expect(collection.craftedBikeIds).toHaveLength(8);
    expect(claimCollectionMilestones(collection).map((milestone) => milestone.owned)).toEqual([4, 8]);
  });

  it('수령 기록은 저장·복구를 거쳐도 남고, 없거나 손상된 기록은 빈 배열·정상 값으로 보정된다', () => {
    const collection = createCollectionProgress();
    ['urban-road', 'trail-mtb', 'touring-road'].forEach((id) => ownBike(collection, id));
    claimCollectionMilestones(collection);
    expect(parseCollectionProgress(serializeCollectionProgress(collection))).toEqual(collection);
    // 마일스톤 기록 도입 전 저장(v2, 필드 없음)
    const { claimedMilestones: _omit, ...legacy } = collection;
    expect(parseCollectionProgress(JSON.stringify({ version: 2, ...legacy })).claimedMilestones).toEqual([]);
    expect(sanitizeCollectionProgress({ claimedMilestones: [8, 4, 4, -1, 2.5, 'x' as unknown as number] }).claimedMilestones).toEqual([4, 8]);
  });
});

describe('작업대·레이스 연결', () => {
  it('rollPart는 Lv.2 입고 확률 인자를 따르고, 기본값은 작업대 규칙(20%)이다', () => {
    const installed = { frame: false, wheel: true, drivetrain: true, handlebar: true };
    // rng 순서: 미장착 우선 판정 → 종류 → 레벨. 세 번째 값 0.3은 기본(20%)이면 Lv.1, 35%면 Lv.2
    expect(rollPart(installed, 0, sequence(0.1, 0.1, 0.3)).part.level).toBe(1);
    expect(rollPart(installed, 0, sequence(0.1, 0.1, 0.3), 0.35).part.level).toBe(2);
    expect(rollPart(installed, 0, sequence(0.1, 0.1, 0.3), Number.NaN).part.level).toBe(1);
  });

  it('openPartBox는 supply 옵션의 확률로 입고한다', () => {
    const orders: WorkbenchOrder[] = [{ levels: { frame: 4, wheel: 4, drivetrain: 4, handlebar: 4 }, reward: 100 }];
    const state = createWorkbench(orders, 1_000_000);
    state.board = state.board.map(() => null);
    const events = openPartBox(state, orders, 1_000_000, sequence(0.1, 0.1, 0.3), { level2Rate: 0.35 })!;
    expect(events[0]).toMatchObject({ type: 'placed', part: { level: 2 } });
  });

  it('출전 속도 보너스는 같은 시드에서 완주 시간을 줄이고, 상대 속도는 공개된 대역 안에 있다', () => {
    const base = simulateRace({ seed: 77, playerStats: stats(2, 2, 2), meta: RIVERSIDE_ENDURANCE_RACE });
    const boosted = simulateRace({ seed: 77, playerStats: stats(2, 2, 2), playerSpeedBonus: 2.5, meta: RIVERSIDE_ENDURANCE_RACE });
    expect(boosted.racers[0].speedScore).toBeCloseTo(base.racers[0].speedScore + 2.5);
    expect(boosted.playerTimeMs).toBeLessThan(base.playerTimeMs);
    expect(playerSpeedScore(stats(2, 2, 2), -3)).toBe(playerSpeedScore(stats(2, 2, 2)));
    base.racers.filter((racer) => !racer.isPlayer).forEach((racer) => {
      expect(racer.speedScore).toBeGreaterThanOrEqual(NPC_SPEED_MIN);
      expect(racer.speedScore).toBeLessThanOrEqual(NPC_SPEED_MIN + NPC_SPEED_SPAN);
    });
  });
});
