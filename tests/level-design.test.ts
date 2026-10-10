// 레벨 디자인 데이터(src/data/level-design.ts) 검증 테스트
// 영업일 주문표가 도감 24대 전체를 끝까지 흘려보낼 수 있는 데이터인지, 검증 규칙(levelDesignIssues)과 보조 데이터의 정합성을 확인합니다.
import { describe, expect, it } from 'vitest';
import { CATALOG_BIKES } from '../src/game/release/bike-catalog';
import {
  CHAPTERS,
  CRAFT_COST_MULTIPLIER_BY_GRADE,
  DAY_PLANS,
  DREAM_BIKE_UNLOCKS,
  HEAVY_DAYS,
  LEVEL_DESIGN,
  MAX_DAY_WORK_UNITS,
  ORDER_DEFINITIONS,
  REPEAT_FROM_DAY,
} from '../src/data/level-design';
import {
  INITIAL_OWNED_BIKE_IDS,
  ORDER_METAS,
  ORDER_SCHEDULE,
  UNDERSTANDING_MAX,
  UNDERSTANDING_PER_DELIVERY,
  applyDreamBikeUnlocks,
  craftPartCost,
  craftTotalCost,
  createCollectionProgress,
  createGrowthProgress,
  normalBikeIdsOfCategory,
  type CollectionProgress,
} from '../src/game/release/meta-progress';
import { WORKBENCH_SCHEDULE } from '../src/game/release/workbench-orders';
import { ORDERS_PER_DAY, levelDesignIssues, summarizeDay, workUnits } from '../src/domain/progression';

const DELIVERIES_TO_REGISTER = Math.ceil(UNDERSTANDING_MAX / UNDERSTANDING_PER_DELIVERY);
const NORMAL_BIKES = CATALOG_BIKES.filter((bike) => bike.grade !== '드림' && !INITIAL_OWNED_BIKE_IDS.includes(bike.id));
const DREAM_BIKES = CATALOG_BIKES.filter((bike) => bike.grade === '드림');

describe('레벨 디자인 데이터 검증', () => {
  it('주문표는 검증 규칙을 모두 통과한다 (첫 주문·등록 횟수·작업량·반복 구간·챕터)', () => {
    expect(levelDesignIssues(LEVEL_DESIGN, CATALOG_BIKES, {
      deliveriesToRegister: DELIVERIES_TO_REGISTER,
      maxDayWorkUnits: MAX_DAY_WORK_UNITS,
      heavyDays: HEAVY_DAYS,
      excludedBikeIds: INITIAL_OWNED_BIKE_IDS,
    })).toEqual([]);
  });

  it('일반 자전거 20대가 모두 주문으로 이어지고, 바쁜 날은 실제로 상한을 넘는 날만 선언한다', () => {
    const orderedBikeIds = new Set(ORDER_DEFINITIONS.map((order) => order.bikeId));
    NORMAL_BIKES.forEach((bike) => expect(orderedBikeIds.has(bike.id), `${bike.id}에 주문이 없음`).toBe(true));
    HEAVY_DAYS.forEach((day) => expect(summarizeDay(ORDER_SCHEDULE, day).workUnits, `${day}일차는 바쁜 날로 선언됐지만 상한 이하`).toBeGreaterThan(MAX_DAY_WORK_UNITS));
  });

  it('주문표·주문 메타·작업대 주문표는 같은 길이와 순서를 가진다', () => {
    expect(ORDER_SCHEDULE.entries).toHaveLength(DAY_PLANS.length * ORDERS_PER_DAY);
    expect(ORDER_METAS).toHaveLength(ORDER_SCHEDULE.entries.length);
    expect(WORKBENCH_SCHEDULE.orders).toHaveLength(ORDER_SCHEDULE.entries.length);
    expect(WORKBENCH_SCHEDULE.repeatFrom).toBe((REPEAT_FROM_DAY - 1) * ORDERS_PER_DAY);
    ORDER_METAS.forEach((meta, index) => {
      expect(meta.orderIndex).toBe(index);
      expect(meta.day).toBe(Math.floor(index / ORDERS_PER_DAY) + 1);
      expect(WORKBENCH_SCHEDULE.orders[index]).toEqual({ levels: meta.partLevels, reward: meta.reward });
    });
  });

  it('챕터는 1일차부터 마지막 영업일까지 빈틈 없이 이어지고 직급 이름이 있다', () => {
    expect(CHAPTERS[0].dayFrom).toBe(1);
    expect(CHAPTERS.at(-1)!.dayTo).toBe(DAY_PLANS.length);
    CHAPTERS.forEach((chapter) => expect(chapter.rankName.length).toBeGreaterThan(0));
  });

  it('드림 등급 자전거마다 해금 규칙이 하나씩 있고 카테고리가 도감과 맞다', () => {
    expect(DREAM_BIKE_UNLOCKS.map((rule) => rule.bikeId).sort()).toEqual(DREAM_BIKES.map((bike) => bike.id).sort());
    DREAM_BIKE_UNLOCKS.forEach((rule) => {
      const bike = CATALOG_BIKES.find((item) => item.id === rule.bikeId)!;
      expect(bike.category).toBe(rule.category);
      expect([1, 2, 3]).toContain(rule.requiredStage);
    });
  });

  it('제작 비용 배수는 등급이 오를수록 같거나 커지고, 입문 자전거 제작비는 첫 주문 급여(1,000) 이하다', () => {
    const { 입문, 중급, 고급, 드림 } = CRAFT_COST_MULTIPLIER_BY_GRADE;
    expect(입문).toBeGreaterThan(0);
    expect(중급).toBeGreaterThanOrEqual(입문);
    expect(고급).toBeGreaterThanOrEqual(중급);
    expect(드림).toBeGreaterThanOrEqual(고급);
    expect(craftTotalCost('urban-road')).toBeLessThanOrEqual(ORDER_METAS[0].reward);
  });

  it('제작 비용은 등급 배수를 부품 단가에 곱한 값이다 (입문 1,000 · 중급 1,500 · 고급 2,000 · 드림 4,000)', () => {
    expect(craftTotalCost('urban-road')).toBe(1000);
    expect(craftTotalCost('trail-mtb')).toBe(1500);
    expect(craftTotalCost('aero-sprinter')).toBe(2000);
    expect(craftTotalCost('dream-machine')).toBe(4000);
    expect(craftPartCost('trail-mtb', 'frame')).toBe(600);
    expect(craftPartCost('dream-machine', 'handlebar')).toBe(400);
  });

  it('드림 해금은 카테고리 전부 등록과 드림 단계 보유 1대가 모두 있어야 열리고, 한 번만 등록된다', () => {
    const registerCategory = (collection: CollectionProgress, category: '로드' | '그래블' | '미니벨로') =>
      normalBikeIdsOfCategory(category).forEach((id) => {
        collection.understandingByBikeId[id] = UNDERSTANDING_MAX;
        if (!collection.registeredBikeIds.includes(id)) collection.registeredBikeIds.push(id);
      });
    const collection = createCollectionProgress();
    const growth = createGrowthProgress();
    // 시작 보유 드림 로드를 드림 단계(스탯 합 10)로 올려도 로드 일반 4대가 미등록이면 드림 머신은 열리지 않는다 (설계 핵심 근거)
    growth.statsByBikeId['dream-road'] = { 성능: 4, 스타일: 3, 희귀도: 3 };
    expect(applyDreamBikeUnlocks(collection, growth)).toEqual([]);
    registerCategory(collection, '로드');
    expect(applyDreamBikeUnlocks(collection, growth)).toEqual(['dream-machine']);
    expect(collection.newBikeIds).toContain('dream-machine');
    expect(applyDreamBikeUnlocks(collection, growth)).toEqual([]);
    // 그래블: 전부 등록했지만 드림 단계 보유가 없으면 열리지 않는다
    registerCategory(collection, '그래블');
    expect(applyDreamBikeUnlocks(collection, growth)).toEqual([]);
    // 카테고리 등록 조건이 없는 규칙은 단계 조건만 본다
    const stageOnly = [{ bikeId: 'dream-mini', category: '미니벨로' as const, requiredStage: 3 as const, requireCategoryRegistered: false }];
    expect(applyDreamBikeUnlocks(collection, growth, stageOnly)).toEqual([]);
    collection.registeredBikeIds.push('city-mini');
    collection.craftedBikeIds.push('city-mini');
    growth.statsByBikeId['city-mini'] = { 성능: 4, 스타일: 4, 희귀도: 2 };
    expect(applyDreamBikeUnlocks(collection, growth, stageOnly)).toEqual(['dream-mini']);
  });

  it('보상은 작업량이 많을수록 같거나 커지는 방향이고, 같은 등급 안에서 두 배 넘게 벌어지지 않는다', () => {
    const byGrade = new Map<string, number[]>();
    ORDER_DEFINITIONS.forEach((order) => byGrade.set(order.grade, [...(byGrade.get(order.grade) ?? []), order.reward]));
    byGrade.forEach((rewards, grade) => {
      expect(Math.max(...rewards) / Math.min(...rewards), `${grade} 보상 편차`).toBeLessThanOrEqual(2);
    });
    const gradeOrder = ['입문', '중급', '고급'];
    const avgUnits = gradeOrder.map((grade) => {
      const orders = ORDER_DEFINITIONS.filter((order) => order.grade === grade);
      return orders.reduce((sum, order) => sum + workUnits(order.levels), 0) / Math.max(1, orders.length);
    });
    expect(avgUnits[0]).toBeLessThanOrEqual(avgUnits[1]);
    expect(avgUnits[1]).toBeLessThanOrEqual(avgUnits[2]);
  });
});
