// #221 납품 이해도·도감 등록 / #204 저장·복구 / #203 성장 규칙 단위 테스트
import { describe, expect, it } from 'vitest';
import { CATALOG_BIKES, catalogBikeById } from '../src/game/release/bike-catalog';
import {
  COLLECTION_SCHEMA_VERSION,
  CRAFT_PART_TYPES,
  DREAM_STAT_MAX_LEVEL,
  GROWTH_SCHEMA_VERSION,
  ORDER_METAS,
  UNDERSTANDING_MAX,
  UNDERSTANDING_PER_DELIVERY,
  applyCraftPart,
  applyBikeUpgrade,
  applyOrderDelivery,
  bikeUnderstanding,
  computeNextGoal,
  craftedBikeCount,
  createCollectionProgress,
  bikeStats,
  createGrowthProgress,
  dreamGradeName,
  dreamUpgradeCost,
  isBikeCrafted,
  isBikeRegistered,
  markBikeSeen,
  orderMetaAt,
  parseCollectionProgress,
  parseGrowthProgress,
  sanitizeCollectionProgress,
  sanitizeGrowthProgress,
  serializeCollectionProgress,
  serializeGrowthProgress,
} from '../src/game/release/meta-progress';

describe('주문 메타 매핑', () => {
  it('모든 주문의 대상 자전거 ID가 카탈로그에 실제로 존재한다', () => {
    ORDER_METAS.forEach((meta) => {
      expect(catalogBikeById(meta.bikeId), `${meta.name}의 대상 자전거`).toBeDefined();
    });
  });

  it('카탈로그 ID는 중복이 없다', () => {
    const ids = CATALOG_BIKES.map((bike) => bike.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('범위를 벗어난 주문 인덱스는 undefined를 반환한다', () => {
    expect(orderMetaAt(-1)).toBeUndefined();
    expect(orderMetaAt(ORDER_METAS.length)).toBeUndefined();
  });
});

describe('초기 컬렉션 상태 (#221)', () => {
  it('시작 상태는 드림 로드바이크 1대만 등록·완성이다', () => {
    const progress = createCollectionProgress();
    expect(progress.registeredBikeIds).toEqual(['dream-road']);
    expect(progress.craftedBikeIds).toEqual(['dream-road']);
    expect(bikeUnderstanding(progress, 'dream-road')).toBe(UNDERSTANDING_MAX);
    expect(craftedBikeCount(progress)).toBe(1);
  });

  it('납품하지 않은 자전거의 이해도는 0이다', () => {
    const progress = createCollectionProgress();
    expect(bikeUnderstanding(progress, 'urban-road')).toBe(0);
    expect(isBikeRegistered(progress, 'urban-road')).toBe(false);
  });
});

describe('납품 → 이해도 누적 → 도감 등록 (#221)', () => {
  it('첫 납품은 이해도 50%만 올리고 아직 등록하지 않는다', () => {
    const progress = createCollectionProgress();
    const result = applyOrderDelivery(progress, 0);
    expect(result.bike?.id).toBe('urban-road');
    expect(result.before).toBe(0);
    expect(result.after).toBe(UNDERSTANDING_PER_DELIVERY);
    expect(result.registeredNow).toBe(false);
    expect(isBikeRegistered(progress, 'urban-road')).toBe(false);
    expect(progress.newBikeIds).toEqual([]);
  });

  it('같은 주문 2회 납품 시 이해도 100%로 도감에 등록되고 NEW 표시가 붙는다', () => {
    const progress = createCollectionProgress();
    applyOrderDelivery(progress, 0);
    const second = applyOrderDelivery(progress, 0);
    expect(second.after).toBe(UNDERSTANDING_MAX);
    expect(second.registeredNow).toBe(true);
    expect(isBikeRegistered(progress, 'urban-road')).toBe(true);
    expect(progress.newBikeIds).toContain('urban-road');
  });

  it('등록은 보유(완성)가 아니다 — 제작 완료 전에는 전시·수집 수에 반영되지 않는다', () => {
    const progress = createCollectionProgress();
    applyOrderDelivery(progress, 0);
    applyOrderDelivery(progress, 0);
    expect(isBikeCrafted(progress, 'urban-road')).toBe(false);
    expect(craftedBikeCount(progress)).toBe(1);
  });

  it('등록 후 반복 납품은 이해도·등록에 변화가 없다 (보상 중복 누적 방지)', () => {
    const progress = createCollectionProgress();
    applyOrderDelivery(progress, 0);
    applyOrderDelivery(progress, 0);
    const repeat = applyOrderDelivery(progress, 0);
    expect(repeat.alreadyRegistered).toBe(true);
    expect(repeat.registeredNow).toBe(false);
    expect(progress.registeredBikeIds.filter((id) => id === 'urban-road')).toHaveLength(1);
  });

  it('알 수 없는 주문 인덱스는 아무 변화도 만들지 않는다', () => {
    const progress = createCollectionProgress();
    const result = applyOrderDelivery(progress, 99);
    expect(result.bike).toBeUndefined();
    expect(result.registeredNow).toBe(false);
    expect(craftedBikeCount(progress)).toBe(1);
  });
});

describe('신규 등록 확인 처리', () => {
  it('도감에서 확인하면 NEW 표시가 해제되고 등록은 유지된다', () => {
    const progress = createCollectionProgress();
    applyOrderDelivery(progress, 0);
    applyOrderDelivery(progress, 0);
    markBikeSeen(progress, 'urban-road');
    expect(progress.newBikeIds).not.toContain('urban-road');
    expect(isBikeRegistered(progress, 'urban-road')).toBe(true);
  });
});

describe('컬렉션 저장·복구 (#204 · v2 스키마)', () => {
  it('직렬화 → 복원 왕복 후 상태가 동일하다', () => {
    const progress = createCollectionProgress();
    applyOrderDelivery(progress, 0);
    applyOrderDelivery(progress, 1);
    progress.selectedBikeId = 'dream-road';
    const restored = parseCollectionProgress(serializeCollectionProgress(progress));
    expect(restored).toEqual(progress);
  });

  it('저장 없음·손상 JSON·알 수 없는 버전은 기본값으로 복구된다', () => {
    expect(parseCollectionProgress(null)).toEqual(createCollectionProgress());
    expect(parseCollectionProgress('{"version":2,')).toEqual(createCollectionProgress());
    const unknown = JSON.stringify({ version: COLLECTION_SCHEMA_VERSION + 1 });
    expect(parseCollectionProgress(unknown)).toEqual(createCollectionProgress());
  });

  it('v1(즉시 해금) 저장은 보유 자전거를 이해도 100%·등록·완성으로 승계한다', () => {
    const v1 = JSON.stringify({
      version: 1,
      ownedBikeIds: ['dream-road', 'urban-road', 'trail-mtb'],
      newBikeIds: ['trail-mtb'],
      selectedBikeId: 'urban-road',
      showcaseSlots: ['dream-road', 'urban-road', null],
    });
    const migrated = parseCollectionProgress(v1);
    expect(migrated.craftedBikeIds).toEqual(expect.arrayContaining(['dream-road', 'urban-road', 'trail-mtb']));
    expect(migrated.registeredBikeIds).toEqual(expect.arrayContaining(['urban-road', 'trail-mtb']));
    expect(bikeUnderstanding(migrated, 'urban-road')).toBe(UNDERSTANDING_MAX);
    expect(migrated.newBikeIds).toEqual(['trail-mtb']);
    expect(migrated.selectedBikeId).toBe('urban-road');
    expect(migrated.showcaseSlots).toEqual(['dream-road', 'urban-road', null]);
  });

  it('완성 목록은 등록 목록에 포함되도록 보정된다', () => {
    const result = sanitizeCollectionProgress({
      registeredBikeIds: [],
      craftedBikeIds: ['urban-road'],
    });
    expect(result.registeredBikeIds).toContain('urban-road');
    expect(bikeUnderstanding(result, 'urban-road')).toBe(UNDERSTANDING_MAX);
  });

  it('삭제된 ID·범위 밖 이해도·미완성 전시는 안전한 값으로 보정된다', () => {
    const result = sanitizeCollectionProgress({
      understandingByBikeId: { 'urban-road': 250, 'trail-mtb': -10, 'deleted-bike': 50 },
      registeredBikeIds: ['deleted-bike'],
      craftedBikeIds: ['deleted-bike'],
      newBikeIds: ['deleted-bike'],
      selectedBikeId: 'deleted-bike',
      showcaseSlots: ['urban-road', 'dream-road'],
    });
    expect(result.registeredBikeIds).toEqual(['dream-road']);
    expect(result.understandingByBikeId['urban-road']).toBe(UNDERSTANDING_MAX);
    expect(result.understandingByBikeId['trail-mtb']).toBe(0);
    expect(result.understandingByBikeId['deleted-bike']).toBeUndefined();
    expect(result.selectedBikeId).toBe('dream-road');
    // 전시는 완성 자전거만: urban-road는 미완성이므로 비운다
    expect(result.showcaseSlots).toEqual([null, 'dream-road', null]);
  });
});

describe('자전거 성장 (#203 → #223 완성 자전거별)', () => {
  it('첫 주문 급여(1,000코인)로 시작 자전거를 최소 한 단계 강화할 수 있다', () => {
    const collection = createCollectionProgress();
    const growth = createGrowthProgress();
    const firstReward = ORDER_METAS[0].reward;
    expect(dreamUpgradeCost(bikeStats(growth, 'dream-road').성능)).toBeLessThanOrEqual(firstReward);
    const result = applyBikeUpgrade(collection, growth, firstReward, 'dream-road', '성능');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.stats.성능).toBe(2);
      expect(result.coins).toBe(firstReward - dreamUpgradeCost(1));
    }
  });

  it('완성하지 않은 자전거는 성장할 수 없다', () => {
    const collection = createCollectionProgress();
    [0, 0].forEach((index) => applyOrderDelivery(collection, index)); // 어반 로드 등록(미완성)
    const result = applyBikeUpgrade(collection, createGrowthProgress(), 9_999, 'urban-road', '성능');
    expect(result).toMatchObject({ ok: false, reason: 'not-crafted', coins: 9_999 });
  });

  it('코인 부족·최대 단계는 원자적으로 거부된다', () => {
    const collection = createCollectionProgress();
    const growth = createGrowthProgress();
    expect(applyBikeUpgrade(collection, growth, 100, 'dream-road', '성능')).toMatchObject({ ok: false, reason: 'coins', coins: 100 });
    growth.statsByBikeId['dream-road'] = { 성능: DREAM_STAT_MAX_LEVEL, 스타일: 1, 희귀도: 1 };
    expect(applyBikeUpgrade(collection, growth, 99_999, 'dream-road', '성능')).toMatchObject({ ok: false, reason: 'max' });
  });

  it('자전거별 성장 단계가 독립 관리된다', () => {
    const collection = createCollectionProgress();
    [0, 0].forEach((index) => applyOrderDelivery(collection, index));
    CRAFT_PART_TYPES.forEach((part) => applyCraftPart(collection, 9_999, 'urban-road', part));
    let growth = createGrowthProgress();
    const result = applyBikeUpgrade(collection, growth, 9_999, 'urban-road', '스타일');
    expect(result.ok).toBe(true);
    if (result.ok) growth = result.growth;
    expect(bikeStats(growth, 'urban-road').스타일).toBe(2);
    expect(bikeStats(growth, 'dream-road').스타일).toBe(1);
  });

  it('합계 7·10 도달 시 등급이 상승하고 stageUp이 보고된다', () => {
    const collection = createCollectionProgress();
    let growth = createGrowthProgress();
    let stageUps = 0;
    for (const stat of ['성능', '스타일', '희귀도', '성능', '스타일', '희귀도', '성능'] as const) {
      const result = applyBikeUpgrade(collection, growth, 99_999, 'dream-road', stat);
      expect(result.ok).toBe(true);
      if (result.ok) {
        growth = result.growth;
        if (result.stageUp) stageUps += 1;
      }
    }
    expect(dreamGradeName(bikeStats(growth, 'dream-road'))).toBe('드림');
    expect(stageUps).toBe(2);
  });
});

describe('자전거 성장 저장·복구 (#223 · v2 스키마)', () => {
  it('직렬화 왕복·손상 복구·버전 처리·값 보정이 동작한다', () => {
    const collection = createCollectionProgress();
    let growth = createGrowthProgress();
    const upgraded = applyBikeUpgrade(collection, growth, 1000, 'dream-road', '희귀도');
    if (upgraded.ok) growth = upgraded.growth;
    expect(parseGrowthProgress(serializeGrowthProgress(growth))).toEqual(growth);
    expect(parseGrowthProgress('{broken')).toEqual(createGrowthProgress());
    const unknown = JSON.stringify({ version: GROWTH_SCHEMA_VERSION + 1 });
    expect(parseGrowthProgress(unknown)).toEqual(createGrowthProgress());
    const fixed = sanitizeGrowthProgress({
      statsByBikeId: {
        'deleted-bike': { 성능: 2, 스타일: 2, 희귀도: 2 },
        'urban-road': { 성능: 99, 스타일: -3, 희귀도: 2.7 },
      },
    });
    expect(fixed.statsByBikeId['deleted-bike']).toBeUndefined();
    expect(fixed.statsByBikeId['urban-road']).toEqual({ 성능: DREAM_STAT_MAX_LEVEL, 스타일: 1, 희귀도: 2 });
  });

  it('v1(단일 드림 바이크) 저장은 대상 자전거의 스탯으로 승계된다', () => {
    const v1 = JSON.stringify({ version: 1, targetBikeId: 'dream-road', stats: { 성능: 3, 스타일: 2, 희귀도: 1 } });
    const migrated = parseGrowthProgress(v1);
    expect(migrated.statsByBikeId['dream-road']).toEqual({ 성능: 3, 스타일: 2, 희귀도: 1 });
  });
});

describe('다음 목표 결정 규칙 (#205 → #221 개편)', () => {
  it('시작 상태에서는 첫 주문 자전거의 이해도 학습이 다음 목표다', () => {
    const goal = computeNextGoal(createCollectionProgress(), createGrowthProgress());
    expect(goal).toMatchObject({ kind: 'understand', orderIndex: 0, bikeId: 'urban-road', understanding: 0, deliveriesLeft: 2 });
  });

  it('납품 1회 후에는 남은 납품 횟수가 줄어든다', () => {
    const collection = createCollectionProgress();
    applyOrderDelivery(collection, 0);
    const goal = computeNextGoal(collection, createGrowthProgress());
    expect(goal).toMatchObject({ kind: 'understand', orderIndex: 0, understanding: 50, deliveriesLeft: 1 });
  });

  it('등록 직후에는 제작이 우선하고, 완성하면 다음 미등록 자전거 학습으로 넘어간다', () => {
    const collection = createCollectionProgress();
    [0, 0].forEach((index) => applyOrderDelivery(collection, index));
    expect(computeNextGoal(collection, createGrowthProgress())).toMatchObject({ kind: 'craft', bikeId: 'urban-road' });
    CRAFT_PART_TYPES.forEach((part) => applyCraftPart(collection, 9_999, 'urban-road', part));
    expect(computeNextGoal(collection, createGrowthProgress())).toMatchObject({ kind: 'understand', orderIndex: 1, bikeId: 'trail-mtb' });
  });

  it('3종 모두 등록되면 제작 → 완성 후 강화 → 모두 최대면 반복 안내로 전환된다', () => {
    const collection = createCollectionProgress();
    [0, 0, 1, 1, 2, 2].forEach((index) => applyOrderDelivery(collection, index));
    const growth = createGrowthProgress();
    // 등록·미완성 자전거가 있으므로 제작이 최우선 목표
    expect(computeNextGoal(collection, growth)).toMatchObject({ kind: 'craft', bikeId: 'urban-road' });
    ORDER_METAS.forEach((meta) => CRAFT_PART_TYPES.forEach((part) => applyCraftPart(collection, 9_999, meta.bikeId, part)));
    // 완성 자전거 중 첫 자전거(시작 자전거)의 강화가 안내된다
    expect(computeNextGoal(collection, growth)).toMatchObject({ kind: 'upgrade', bikeId: 'dream-road' });
    // 완성 자전거 4대를 모두 최대 단계로 올리면 반복 안내로 전환된다
    collection.craftedBikeIds.forEach((id) => {
      growth.statsByBikeId[id] = { 성능: DREAM_STAT_MAX_LEVEL, 스타일: DREAM_STAT_MAX_LEVEL, 희귀도: DREAM_STAT_MAX_LEVEL };
    });
    expect(computeNextGoal(collection, growth)).toEqual({ kind: 'repeat' });
  });
});

describe('Garage 자전거 만들기 (#222)', () => {
  const registerUrban = () => {
    const progress = createCollectionProgress();
    applyOrderDelivery(progress, 0);
    applyOrderDelivery(progress, 0);
    return progress;
  };

  it('부품 비용 합계는 첫 주문 급여와 같다 (검증용 수치)', async () => {
    const { CRAFT_PARTS } = await import('../src/game/release/meta-progress');
    const total = CRAFT_PARTS.reduce((sum, part) => sum + part.cost, 0);
    expect(total).toBe(ORDER_METAS[0].reward);
  });

  it('등록 자전거에 부품을 하나씩 장착할 수 있고 코인이 함께 차감된다', async () => {
    const { applyCraftPart, CRAFT_PARTS } = await import('../src/game/release/meta-progress');
    const progress = registerUrban();
    const frame = CRAFT_PARTS[0];
    const result = applyCraftPart(progress, 1000, 'urban-road', 'frame');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.coins).toBe(1000 - frame.cost);
      expect(result.installedParts).toEqual(['frame']);
      expect(result.completed).toBe(false);
    }
  });

  it('코인 부족·미등록·중복 장착은 원자적으로 거부된다', async () => {
    const { applyCraftPart } = await import('../src/game/release/meta-progress');
    const progress = registerUrban();
    expect(applyCraftPart(progress, 100, 'urban-road', 'frame')).toMatchObject({ ok: false, reason: 'coins', coins: 100 });
    expect(applyCraftPart(progress, 9999, 'trail-mtb', 'frame')).toMatchObject({ ok: false, reason: 'not-registered' });
    applyCraftPart(progress, 9999, 'urban-road', 'frame');
    expect(applyCraftPart(progress, 9999, 'urban-road', 'frame')).toMatchObject({ ok: false, reason: 'already-installed' });
    expect(progress.craftPartsByBikeId['urban-road']).toEqual(['frame']);
  });

  it('부품 4종을 모두 장착하면 완성(보유)으로 승격되고 수집 수·전시가 열린다', async () => {
    const { applyCraftPart, CRAFT_PART_TYPES } = await import('../src/game/release/meta-progress');
    const progress = registerUrban();
    let coins = 2000;
    let completed = false;
    CRAFT_PART_TYPES.forEach((part) => {
      const result = applyCraftPart(progress, coins, 'urban-road', part);
      expect(result.ok).toBe(true);
      if (result.ok) { coins = result.coins; completed = result.completed; }
    });
    expect(completed).toBe(true);
    expect(coins).toBe(1000);
    expect(isBikeCrafted(progress, 'urban-road')).toBe(true);
    expect(craftedBikeCount(progress)).toBe(2);
    expect(progress.craftPartsByBikeId['urban-road']).toBeUndefined();
    // 완성 자전거는 전시 슬롯 보정을 통과한다
    const sanitized = sanitizeCollectionProgress({ ...progress, showcaseSlots: ['urban-road', null, null] });
    expect(sanitized.showcaseSlots[0]).toBe('urban-road');
    // 완성 후 추가 장착은 거부된다
    const again = applyCraftPart(progress, 9999, 'urban-road', 'frame');
    expect(again).toMatchObject({ ok: false, reason: 'already-crafted' });
  });

  it('제작 진행이 저장·복구되고, 4종 완비 저장본은 완성으로 승격 보정된다', async () => {
    const { applyCraftPart, CRAFT_PART_TYPES, nextCraftPart } = await import('../src/game/release/meta-progress');
    const progress = registerUrban();
    applyCraftPart(progress, 9999, 'urban-road', 'frame');
    applyCraftPart(progress, 9999, 'urban-road', 'wheel');
    const restored = parseCollectionProgress(serializeCollectionProgress(progress));
    expect(restored).toEqual(progress);
    expect(nextCraftPart(restored, 'urban-road')?.type).toBe('drivetrain');
    // 저장본에 4종이 모두 있으면 완성으로 승격
    const promoted = sanitizeCollectionProgress({
      ...progress,
      craftPartsByBikeId: { 'urban-road': [...CRAFT_PART_TYPES] },
    });
    expect(promoted.craftedBikeIds).toContain('urban-road');
    expect(promoted.craftPartsByBikeId['urban-road']).toBeUndefined();
  });

  it('다음 목표: 등록·미완성 자전거가 있으면 제작이 강화보다 우선한다', () => {
    const progress = registerUrban();
    const goal = computeNextGoal(progress, createGrowthProgress());
    expect(goal).toMatchObject({ kind: 'craft', bikeId: 'urban-road', partName: '프레임', cost: 400, installedCount: 0, totalParts: 4 });
  });
});
