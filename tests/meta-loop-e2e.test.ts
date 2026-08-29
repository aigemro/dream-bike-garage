// #202 → #221 개편: 주문 납품 이해도 → 도감 등록 → 성장 전체 메타 루프 검증 테스트
// 릴리스 통합 컨트롤러(mvp-release-integration)가 수행하는 상태 전이를
// meta-progress 순수 로직 수준에서 처음부터 끝까지 시뮬레이션합니다.
// (부품 제작·완성 승격 시나리오는 #222에서 추가합니다.)
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

describe('메타 루프 E2E: 새 게임 → 이해도 학습 → 등록 → 성장 → 반복 (#221)', () => {
  it('첫 납품부터 3종 등록·성장까지 전체 루프를 중단 없이 완주한다', () => {
    const storage = makeStorage();

    // 1. 새 게임 시작 (코인 0 · 등록·완성은 드림 바이크 1대)
    let collection = createCollectionProgress();
    let growth = createGrowthProgress();
    let coins = 0;
    let completedOrders = 0;
    let orderIndex = 0;
    expect(computeNextGoal(collection, growth)).toMatchObject({ kind: 'understand', bikeId: 'urban-road', deliveriesLeft: 2 });

    // 2~3. 첫 납품 → 급여 + 이해도 50% (아직 도감 잠금)
    const firstMeta = orderMetaAt(orderIndex)!;
    const first = applyOrderDelivery(collection, orderIndex);
    coins += firstMeta.reward;
    completedOrders += 1;
    storage.save(collection, growth);
    expect(first.after).toBe(50);
    expect(first.registeredNow).toBe(false);
    expect(isBikeRegistered(collection, 'urban-road')).toBe(false);

    // 4. 같은 주문 반복 납품 → 이해도 100% 도감 등록 (반복 납품의 동기)
    const second = applyOrderDelivery(collection, orderIndex);
    coins += firstMeta.reward;
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
    expect(coins).toBe(firstMeta.reward * 2 - dreamUpgradeCost(1));

    // 7. 다음 목표가 등록된 자전거의 제작으로 갱신 (제작이 학습보다 우선)
    expect(computeNextGoal(collection, growth)).toMatchObject({ kind: 'craft', bikeId: 'urban-road', partName: '프레임' });

    // 8. 새로고침 후 상태 복구
    const restored = storage.reload();
    expect(restored.collection).toEqual(collection);
    expect(restored.growth).toEqual(growth);
    collection = restored.collection;
    growth = restored.growth;

    // 9. 주문 2·3을 각 2회씩 납품해 3종 모두 등록 (주문 순환 포함)
    for (const index of [1, 1, 2, 2]) {
      orderIndex = index;
      const meta = orderMetaAt(index)!;
      applyOrderDelivery(collection, index);
      coins += meta.reward;
      completedOrders += 1;
      storage.save(collection, growth);
    }
    expect(completedOrders).toBe(6);
    ORDER_METAS.forEach((meta) => expect(isBikeRegistered(collection, meta.bikeId)).toBe(true));
    // 등록만으로는 수집 수가 늘지 않는다 (보유는 제작 완료 시)
    expect(craftedBikeCount(collection)).toBe(1);

    // 10. 급여로 등록 자전거 3종을 부품 하나씩 장착해 완성 (#222) — 다음 목표가 제작을 안내한다
    while (computeNextGoal(collection, growth).kind === 'craft') {
      const goal = computeNextGoal(collection, growth);
      if (goal.kind !== 'craft') break;
      const partType = CRAFT_PARTS.find((part) => part.name === goal.partName)!.type;
      const result = applyCraftPart(collection, coins, goal.bikeId, partType);
      expect(result.ok).toBe(true);
      if (result.ok) coins = result.coins;
      storage.save(collection, growth);
    }
    // 부품 12개 = 3,000코인 소비, 3종 완성 → 수집 4/24, 전시 배치 가능
    expect(craftedBikeCount(collection)).toBe(4);
    ORDER_METAS.forEach((meta) => expect(isBikeCrafted(collection, meta.bikeId)).toBe(true));
    expect(coins).toBe(8400 - dreamUpgradeCost(1) - 3000);

    // 11. 이후에도 다음 목표가 항상 존재한다 (강화 → 반복)
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
    [0, 0, 1, 1].forEach((index) => applyOrderDelivery(collection, index));
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
