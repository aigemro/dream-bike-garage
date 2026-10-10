// 레벨 디자인 전체 흐름 시뮬레이션 테스트
// 영업 1일차부터 설계 끝(과 반복 구간 일부)까지 주문표대로 납품하고, 홈 NEXT GOAL 순서(제작 → 강화)로 급여를 쓰며,
// 대회일에는 참가해 상금을 받는 플레이어를 순수 로직으로 돌려 "게임이 끝까지 흘러가는지"를 확인합니다.
// 작업대 플레이(상자·합성)는 생략하고 주문 단위로 진행하며, 체력은 작업량 × 0.93 추정치로만 봅니다.
import { describe, expect, it } from 'vitest';
import { CATALOG_BIKES } from '../src/game/release/bike-catalog';
import { CHAPTERS, DAY_PLANS, DREAM_BIKE_UNLOCKS } from '../src/data/level-design';
import {
  INITIAL_OWNED_BIKE_IDS,
  applyBikeUpgrade,
  applyCraftPart,
  applyDreamBikeUnlocks,
  applyOrderDelivery,
  bikeStats,
  computeNextGoal,
  craftedBikeCount,
  createCollectionProgress,
  createGrowthProgress,
  dreamTotalLevel,
  isBikeRegistered,
  type CollectionProgress,
  type GrowthProgress,
} from '../src/game/release/meta-progress';
import { ORDER_SCHEDULE } from '../src/game/release/meta-progress';
import { WORKBENCH_SCHEDULE } from '../src/game/release/workbench-orders';
import { orderIndexOf } from '../src/domain/merge-workbench';
import { ORDERS_PER_DAY, chapterForDay, scheduledOrderAt, summarizeDay } from '../src/domain/progression';
import { RIVERSIDE_ENDURANCE_RACE, applyRaceEntry, applyRaceReward, isRaceDay, simulateRace } from '../src/game/release/race-progress';
import { bikeCategoryFromKorean } from '../src/game/release/bike-pixel-sprite';

const NORMAL_BIKE_IDS = CATALOG_BIKES.filter((bike) => bike.grade !== '드림' && !INITIAL_OWNED_BIKE_IDS.includes(bike.id)).map((bike) => bike.id);
const DREAM_BIKE_IDS = DREAM_BIKE_UNLOCKS.map((rule) => rule.bikeId);
const DESIGNED_DAYS = DAY_PLANS.length;
// 설계 끝 뒤 반복 구간을 조금 더 돌려 장기 목표(드림 3대·전부 완성)가 닫히는지 본다
const SIM_DAYS = DESIGNED_DAYS + 15;

type DayRow = {
  day: number;
  chapter: string;
  workUnits: number;
  energy: number;
  income: number;
  coinsEnd: number;
  registered: number;
  crafted: number;
  ownedTotal: number;
  heroTotal: number;
  race?: { rank: number; net: number };
  unlocked: string[];
};

/** 대표 자전거: 보유 자전거 중 스탯 합이 가장 큰 자전거(동률이면 시작 자전거 우선) */
function heroBike(collection: CollectionProgress, growth: GrowthProgress) {
  return [...collection.craftedBikeIds].sort((a, b) => dreamTotalLevel(bikeStats(growth, b)) - dreamTotalLevel(bikeStats(growth, a)))[0];
}

/** 홈 NEXT GOAL 순서대로 코인을 씁니다. 다음 영업일이 대회일이면 참가비는 남겨 둡니다. */
function spend(collection: CollectionProgress, growth: GrowthProgress, coins: number, reserve: number): { coins: number; growth: GrowthProgress; unlocked: string[] } {
  const unlocked: string[] = [];
  for (let guard = 0; guard < 500; guard += 1) {
    // 홈 NEXT GOAL과 같은 규칙: 쓸 수 있는 코인(참가비 예비금 제외)을 넘긴다
    const goal = computeNextGoal(collection, growth, coins - reserve);
    if (goal.kind === 'craft') {
      if (coins - reserve < goal.cost) break;
      const part = ({ 프레임: 'frame', 휠셋: 'wheel', 구동계: 'drivetrain', 핸들바: 'handlebar' } as const)[goal.partName as '프레임' | '휠셋' | '구동계' | '핸들바'];
      const result = applyCraftPart(collection, coins, goal.bikeId, part);
      if (!result.ok) break;
      coins = result.coins;
      continue;
    }
    if (goal.kind === 'upgrade') {
      if (coins - reserve < goal.cost) break;
      const result = applyBikeUpgrade(collection, growth, coins, goal.bikeId, goal.stat);
      if (!result.ok) break;
      coins = result.coins;
      growth = result.growth;
      unlocked.push(...applyDreamBikeUnlocks(collection, growth));
      continue;
    }
    break;
  }
  return { coins, growth, unlocked };
}

function runSimulation() {
  const collection = createCollectionProgress();
  let growth = createGrowthProgress();
  let coins = 0;
  let completedOrders = 0;
  const rows: DayRow[] = [];
  const milestones: Record<string, number | null> = { allRegistered: null, allCrafted: null, firstDream: null, allDream: null, repeatGoal: null };

  for (let day = 1; day <= SIM_DAYS; day += 1) {
    const summary = summarizeDay(ORDER_SCHEDULE, day);
    let income = 0;
    const unlockedToday: string[] = [];
    // 대회일 아침: 대표 자전거로 참가 (컨트롤러와 같은 시드 규칙)
    let race: DayRow['race'];
    if (isRaceDay(day, RIVERSIDE_ENDURANCE_RACE)) {
      const entry = applyRaceEntry(coins, RIVERSIDE_ENDURANCE_RACE);
      expect(entry.ok, `${day}일차 대회 참가비 부족 (코인 ${coins})`).toBe(true);
      if (entry.ok) {
        coins = entry.coins;
        const hero = heroBike(collection, growth);
        const result = simulateRace({
          seed: day * 1009 + completedOrders,
          playerStats: bikeStats(growth, hero),
          playerCategory: bikeCategoryFromKorean(CATALOG_BIKES.find((bike) => bike.id === hero)!.category),
          meta: RIVERSIDE_ENDURANCE_RACE,
        });
        const rewarded = applyRaceReward(coins, result.playerRank, RIVERSIDE_ENDURANCE_RACE);
        coins = rewarded.coins;
        race = { rank: result.playerRank, net: rewarded.reward - RIVERSIDE_ENDURANCE_RACE.entryFee };
      }
    }
    for (let slot = 0; slot < ORDERS_PER_DAY; slot += 1) {
      const sequence = (day - 1) * ORDERS_PER_DAY + slot;
      const order = scheduledOrderAt(ORDER_SCHEDULE, sequence)!;
      const orderIndex = orderIndexOf(sequence, WORKBENCH_SCHEDULE);
      const delivery = applyOrderDelivery(collection, orderIndex);
      expect(delivery.bike?.id).toBe(order.bikeId);
      unlockedToday.push(...applyDreamBikeUnlocks(collection, growth));
      coins += order.reward;
      income += order.reward;
      completedOrders += 1;
    }
    const reserve = isRaceDay(day + 1, RIVERSIDE_ENDURANCE_RACE) ? RIVERSIDE_ENDURANCE_RACE.entryFee : 0;
    const spent = spend(collection, growth, coins, reserve);
    coins = spent.coins;
    growth = spent.growth;
    unlockedToday.push(...spent.unlocked);
    expect(coins).toBeGreaterThanOrEqual(0);

    const registered = NORMAL_BIKE_IDS.filter((id) => isBikeRegistered(collection, id)).length;
    // 일반 20대 기준(시작 보유·드림 등급 제외). 전체 보유 수는 craftedBikeCount로 따로 센다.
    const crafted = NORMAL_BIKE_IDS.filter((id) => collection.craftedBikeIds.includes(id)).length;
    const ownedTotal = craftedBikeCount(collection);
    const dreamRegistered = DREAM_BIKE_IDS.filter((id) => isBikeRegistered(collection, id)).length;
    if (milestones.allRegistered === null && registered === NORMAL_BIKE_IDS.length) milestones.allRegistered = day;
    if (milestones.allCrafted === null && crafted >= NORMAL_BIKE_IDS.length) milestones.allCrafted = day;
    if (milestones.firstDream === null && dreamRegistered > 0) milestones.firstDream = day;
    if (milestones.allDream === null && dreamRegistered === DREAM_BIKE_IDS.length) milestones.allDream = day;
    if (milestones.repeatGoal === null && computeNextGoal(collection, growth, coins).kind === 'repeat') milestones.repeatGoal = day;
    rows.push({
      day,
      chapter: chapterForDay(CHAPTERS, day)?.rankName ?? '',
      workUnits: summary.workUnits,
      energy: summary.energyEstimate,
      income,
      coinsEnd: coins,
      registered,
      crafted,
      ownedTotal,
      heroTotal: dreamTotalLevel(bikeStats(growth, heroBike(collection, growth))),
      race,
      unlocked: unlockedToday,
    });
  }
  return { rows, milestones, collection, growth, coins };
}

describe('레벨 디자인 전체 흐름: 1일차부터 설계 끝과 반복 구간까지', () => {
  const result = runSimulation();

  it('설계 영업일 안에 일반 자전거 20대가 모두 도감에 등록된다', () => {
    expect(result.milestones.allRegistered, '전부 등록되는 영업일').not.toBeNull();
    expect(result.milestones.allRegistered!).toBeLessThanOrEqual(DESIGNED_DAYS);
  });

  it('급여를 NEXT GOAL대로 쓰면 코인이 바닥나거나 대회 참가비가 모자라는 날이 없고, 20대가 모두 완성된다', () => {
    result.rows.forEach((row) => expect(row.coinsEnd).toBeGreaterThanOrEqual(0));
    expect(result.milestones.allCrafted, '전부 완성되는 영업일').not.toBeNull();
    expect(result.milestones.allCrafted!).toBeLessThanOrEqual(SIM_DAYS);
  });

  it('드림 등급 3대는 승급 보상으로 열리고, 첫 드림 해금은 설계 영업일 안에 일어난다', () => {
    expect(result.milestones.firstDream).not.toBeNull();
    expect(result.milestones.firstDream!).toBeLessThanOrEqual(DESIGNED_DAYS);
    expect(result.milestones.allDream, '드림 3대 모두 등록되는 영업일').not.toBeNull();
    expect(result.milestones.allDream!).toBeLessThanOrEqual(SIM_DAYS);
  });

  it('설계 영업일 동안 홈 NEXT GOAL이 "반복"으로 비는 날이 없다', () => {
    expect(result.milestones.repeatGoal === null || result.milestones.repeatGoal > DESIGNED_DAYS).toBe(true);
  });

  it('하루 작업량은 체력 한 통(30) 추정 안에 들고, 넘는 날은 소수다', () => {
    const over = result.rows.filter((row) => row.day <= DESIGNED_DAYS && row.energy > 30).map((row) => row.day);
    expect(over.length).toBeLessThanOrEqual(Math.ceil(DESIGNED_DAYS * 0.15));
  });

  it('대회는 5일마다 열리고, 설계 후반에는 대표 자전거가 드림 단계(스탯 합 10)에 도달한다', () => {
    const raceDays = result.rows.filter((row) => row.race).map((row) => row.day);
    expect(raceDays).toEqual(result.rows.filter((row) => row.day % 5 === 0).map((row) => row.day));
    // 드림 단계 = 스탯 합 10 이상(최대 12)
    expect(result.rows[DESIGNED_DAYS - 1].heroTotal).toBeGreaterThanOrEqual(10);
  });

  it('영업일별 흐름표 (문서 참고용)', () => {
    const lines = result.rows.map((row) =>
      `${String(row.day).padStart(2)}일차 ${row.chapter.padEnd(6)} 작업량 ${String(row.workUnits).padStart(2)} 체력≈${String(row.energy).padStart(2)} 수입 ${String(row.income).padStart(5)} 잔고 ${String(row.coinsEnd).padStart(6)} 등록 ${String(row.registered).padStart(2)}/20 완성 ${String(row.crafted).padStart(2)}/20 보유 ${String(row.ownedTotal).padStart(2)}/24 대표합 ${String(row.heroTotal).padStart(2)}${row.race ? ` 대회 ${row.race.rank}위(${row.race.net >= 0 ? '+' : ''}${row.race.net})` : ''}${row.unlocked.length ? ` 해금 ${row.unlocked.join(',')}` : ''}`);
    console.log(['', ...lines, `마일스톤: ${JSON.stringify(result.milestones)}`, `시뮬레이션 끝(${SIM_DAYS}일차) 코인 ${result.coins}`].join('\n'));
    expect(lines).toHaveLength(SIM_DAYS);
  });
});
