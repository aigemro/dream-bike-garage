// #202 → #221 개편: 주문 납품 이해도 → 도감 등록 → 성장 전체 메타 루프 검증 테스트
// 릴리스 통합 컨트롤러(mvp-release-integration)가 수행하는 상태 전이를
// meta-progress 순수 로직 수준에서 처음부터 끝까지 시뮬레이션합니다.
// 주문은 레벨 디자인 주문표(ORDER_METAS = 영업일 순서)에서 가져오며, 자전거별 첫 주문 위치를 찾아 씁니다.
import { describe, expect, it } from 'vitest';
import { CATALOG_SIZE } from '../src/game/release/bike-catalog';
import {
  CRAFT_PARTS,
  DREAM_STAT_MAX_LEVEL,
  ORDER_METAS,
  UNDERSTANDING_MAX,
  applyCraftPart,
  applyBikeUpgrade,
  bikeStats,
  applyOrderDelivery,
  bikeUnderstanding,
  computeNextGoal,
  craftTotalCost,
  craftedBikeCount,
  createCollectionProgress,
  createGrowthProgress,
  dreamGradeName,
  dreamUpgradeCost,
  isBikeCrafted,
  isBikeRegistered,
  markBikeSeen,
  orderMetaAt,
  parseCollectionProgress,
  parseGrowthProgress,
  serializeCollectionProgress,
  serializeGrowthProgress,
  type CollectionProgress,
  type GrowthProgress,
} from '../src/game/release/meta-progress';

// 컨트롤러의 저장·복구를 모사한 인메모리 localStorage
function makeStorage() {
  const store = new Map<string, string>();
  return {
    save(collection: CollectionProgress, growth: GrowthProgress) {
      store.set('collection', serializeCollectionProgress(collection));
      store.set('growth', serializeGrowthProgress(growth));
    },
    reload() {
      return {
        collection: parseCollectionProgress(store.get('collection') ?? null),
        growth: parseGrowthProgress(store.get('growth') ?? null),
      };
    },
    corruptCollection() { store.set('collection', '{broken-json'); },
    reset() { store.clear(); },
  };
}

/** 주문표에서 이 자전거의 첫 주문 위치 */
const firstOrderIndexFor = (bikeId: string) => ORDER_METAS.find((meta) => meta.bikeId === bikeId)!.orderIndex;
// 주문표 앞쪽에 등장하는 서로 다른 자전거 3대(첫 주문은 항상 어반 로드)
const FIRST_THREE_BIKES = [...new Set(ORDER_METAS.map((meta) => meta.bikeId))].slice(0, 3);

describe('메타 루프 E2E: 새 게임 → 이해도 학습 → 등록 → 성장 → 반복 (#221)', () => {
  it('첫 납품부터 3종 등록·성장까지 전체 루프를 중단 없이 완주한다', () => {
    const storage = makeStorage();

    // 1. 새 게임 시작 (코인 0 · 등록·완성은 드림 바이크 1대)
    let collection = createCollectionProgress();
    let growth = createGrowthProgress();
    let coins = 0;
    let completedOrders = 0;
    expect(FIRST_THREE_BIKES[0]).toBe('urban-road');
    expect(computeNextGoal(collection, growth, coins)).toMatchObject({ kind: 'understand', bikeId: 'urban-road', orderIndex: 0, deliveriesLeft: 2 });

    // 2~3. 첫 납품 → 급여 + 이해도 50% (아직 도감 잠금)
    const firstMeta = orderMetaAt(0)!;
    const first = applyOrderDelivery(collection, 0);
    coins += firstMeta.reward;
    completedOrders += 1;
    storage.save(collection, growth);
    expect(first.after).toBe(50);
    expect(first.registeredNow).toBe(false);
    expect(isBikeRegistered(collection, 'urban-road')).toBe(false);

    // 4. 같은 자전거의 두 번째 주문 납품 → 이해도 100% 도감 등록 (반복 납품의 동기)
    const secondIndex = ORDER_METAS.find((meta) => meta.bikeId === 'urban-road' && meta.orderIndex > 0)!.orderIndex;
    const second = applyOrderDelivery(collection, secondIndex);
    coins += orderMetaAt(secondIndex)!.reward;
    completedOrders += 1;
    storage.save(collection, growth);
    expect(second.registeredNow).toBe(true);
    expect(collection.newBikeIds).toContain('urban-road');

    // 5. 도감에서 확인 → NEW 해제, 등록은 유지되지만 아직 보유(완성)는 아니다
    markBikeSeen(collection, 'urban-road');
    storage.save(collection, growth);
    expect(isBikeCrafted(collection, 'urban-road')).toBe(false);
    expect(craftedBikeCount(collection)).toBe(1);

    // 6. 급여로 드림 바이크 강화 (코인 2,000 → 1,650)
    const upgrade = applyBikeUpgrade(collection, growth, coins, 'dream-road', '성능');
    expect(upgrade.ok).toBe(true);
    if (upgrade.ok) { growth = upgrade.growth; coins = upgrade.coins; }
    storage.save(collection, growth);
    expect(coins).toBe(firstMeta.reward + orderMetaAt(secondIndex)!.reward - dreamUpgradeCost(1));

    // 7. 다음 목표가 등록된 자전거의 제작으로 갱신 (제작이 학습보다 우선)
    expect(computeNextGoal(collection, growth)).toMatchObject({ kind: 'craft', bikeId: 'urban-road', partName: '프레임' });

    // 8. 새로고침 후 상태 복구
    const restored = storage.reload();
    expect(restored.collection).toEqual(collection);
    expect(restored.growth).toEqual(growth);
    collection = restored.collection;
    growth = restored.growth;

    // 9. 다음 두 자전거를 각 2회씩 납품해 3종 모두 등록 (주문 위치는 주문표에서 찾는다)
    let rewardsForTwo = 0;
    for (const bikeId of FIRST_THREE_BIKES.slice(1)) {
      const index = firstOrderIndexFor(bikeId);
      for (let repeat = 0; repeat < 2; repeat += 1) {
        applyOrderDelivery(collection, index);
        coins += orderMetaAt(index)!.reward;
        rewardsForTwo += orderMetaAt(index)!.reward;
        completedOrders += 1;
        storage.save(collection, growth);
      }
    }
    expect(completedOrders).toBe(6);
    FIRST_THREE_BIKES.forEach((bikeId) => expect(isBikeRegistered(collection, bikeId)).toBe(true));
    // 등록만으로는 수집 수가 늘지 않는다 (보유는 제작 완료 시)
    expect(craftedBikeCount(collection)).toBe(1);

    // 10. 급여로 등록 자전거 3종을 부품 하나씩 장착해 완성 (#222) — 다음 목표가 제작을 안내한다
    const coinsBeforeCraft = coins;
    while (computeNextGoal(collection, growth).kind === 'craft') {
      const goal = computeNextGoal(collection, growth);
      if (goal.kind !== 'craft') break;
      const partType = CRAFT_PARTS.find((part) => part.name === goal.partName)!.type;
      const result = applyCraftPart(collection, coins, goal.bikeId, partType);
      expect(result.ok).toBe(true);
      if (result.ok) coins = result.coins;
      storage.save(collection, growth);
    }
    // 부품 12개 = 세 자전거의 등급별 제작비 합을 소비, 3종 완성 → 수집 4/24, 전시 배치 가능
    expect(craftedBikeCount(collection)).toBe(4);
    FIRST_THREE_BIKES.forEach((bikeId) => expect(isBikeCrafted(collection, bikeId)).toBe(true));
    expect(coins).toBe(coinsBeforeCraft - FIRST_THREE_BIKES.reduce((sum, bikeId) => sum + craftTotalCost(bikeId), 0));
    expect(rewardsForTwo).toBeGreaterThan(0);

    // 11. 이후에도 다음 목표가 항상 존재한다: (코인이 있으면 대표 자전거 강화) → 주문표의 나머지 자전거 학습 → 강화 → 반복
    expect(computeNextGoal(collection, growth, coins)).toMatchObject({ kind: 'upgrade', bikeId: 'dream-road' });
    expect(computeNextGoal(collection, growth, 0).kind).toBe('understand');
    for (const bikeId of new Set(ORDER_METAS.map((meta) => meta.bikeId))) {
      if (isBikeRegistered(collection, bikeId)) continue;
      const index = firstOrderIndexFor(bikeId);
      applyOrderDelivery(collection, index);
      applyOrderDelivery(collection, index);
      expect(isBikeRegistered(collection, bikeId)).toBe(true);
    }
    while (computeNextGoal(collection, growth).kind === 'craft') {
      const goal = computeNextGoal(collection, growth);
      if (goal.kind !== 'craft') break;
      const result = applyCraftPart(collection, 99_999, goal.bikeId, CRAFT_PARTS.find((part) => part.name === goal.partName)!.type);
      expect(result.ok).toBe(true);
    }
    while (computeNextGoal(collection, growth).kind === 'upgrade') {
      const goal = computeNextGoal(collection, growth);
      if (goal.kind !== 'upgrade') break;
      const result = applyBikeUpgrade(collection, growth, 99_999, goal.bikeId, goal.stat);
      expect(result.ok).toBe(true);
      if (result.ok) growth = result.growth;
    }
    expect(dreamGradeName(bikeStats(growth, 'dream-road'))).toBe('드림');
    expect(computeNextGoal(collection, growth)).toEqual({ kind: 'repeat' });
  });

  it('보상 중복·빠른 연속 입력에도 상태 불일치가 없다', () => {
    const collection = createCollectionProgress();
    let growth = createGrowthProgress();

    // 등록 후 같은 주문을 빠르게 재납품해도 등록 목록은 한 번만 반영된다
    applyOrderDelivery(collection, 0);
    applyOrderDelivery(collection, 0);
    const repeat = applyOrderDelivery(collection, 0);
    expect(repeat.alreadyRegistered).toBe(true);
    expect(collection.registeredBikeIds.filter((id) => id === 'urban-road')).toHaveLength(1);
    expect(bikeUnderstanding(collection, 'urban-road')).toBe(UNDERSTANDING_MAX);

    // 코인이 한 번 강화분만 있을 때 연타해도 두 번째는 원자적으로 거부된다
    let coins = dreamUpgradeCost(1);
    const firstUpgrade = applyBikeUpgrade(collection, growth, coins, 'dream-road', '성능');
    expect(firstUpgrade.ok).toBe(true);
    if (firstUpgrade.ok) { growth = firstUpgrade.growth; coins = firstUpgrade.coins; }
    const secondUpgrade = applyBikeUpgrade(collection, growth, coins, 'dream-road', '성능');
    expect(secondUpgrade.ok).toBe(false);
    expect(secondUpgrade.coins).toBe(0);
    expect(bikeStats(growth, 'dream-road').성능).toBe(2);
  });

  it('저장 손상 후에도 진행 불가 없이 복구되고 나머지 저장은 유지된다', () => {
    const storage = makeStorage();
    const collection = createCollectionProgress();
    let growth = createGrowthProgress();
    applyOrderDelivery(collection, 0);
    const upgraded = applyBikeUpgrade(collection, growth, 1000, 'dream-road', '스타일');
    if (upgraded.ok) growth = upgraded.growth;
    storage.save(collection, growth);

    storage.corruptCollection();
    const restored = storage.reload();
    expect(restored.collection).toEqual(createCollectionProgress());
    expect(restored.growth).toEqual(growth);
    expect(computeNextGoal(restored.collection, restored.growth).kind).toBe('understand');
  });

  it('새 게임 초기화 시 이해도·등록·성장·다음 목표가 처음 상태로 돌아간다', () => {
    const storage = makeStorage();
    const collection = createCollectionProgress();
    const trailIndex = firstOrderIndexFor('trail-mtb');
    [0, 0, trailIndex, trailIndex].forEach((index) => applyOrderDelivery(collection, index));
    let growth = createGrowthProgress();
    growth.statsByBikeId['dream-road'] = { 성능: DREAM_STAT_MAX_LEVEL, 스타일: 2, 희귀도: 2 };
    storage.save(collection, growth);

    storage.reset();
    const fresh = storage.reload();
    expect(fresh.collection).toEqual(createCollectionProgress());
    expect(fresh.growth).toEqual(createGrowthProgress());
    expect(craftedBikeCount(fresh.collection)).toBe(1);
    expect(CATALOG_SIZE).toBe(24);
  });
});
