// 레벨 디자인(영업일 주문표) 규칙 — 순수 로직, Phaser·저장소 비의존
// 주문은 순차·강제이므로 "영업 d일차의 주문 3건"을 설계자가 정한 표가 곧 레벨 디자인입니다.
// 이 모듈은 설계 데이터(src/data/level-design.ts)를 작업대가 쓰는 주문표(WorkbenchSchedule)로 펼치고,
// 누적 주문 순번 ↔ 영업일·슬롯 변환, 챕터 판정, 작업량·체력 추정, 데이터 검증 규칙을 제공합니다.
// 수치(요구 레벨·보상·공개 시점)는 데이터 쪽에 두고, 여기서는 규칙만 다룹니다.
import { DAY_ORDER_TARGET } from './day-session';
import { WORKBENCH_MAX_LEVEL, WORKBENCH_PART_TYPES, orderIndexOf, type WorkbenchPartType, type WorkbenchSchedule } from './merge-workbench';

/** 하루 주문 수. Day 세션의 목표 주문 수와 같은 값을 써야 순번 ↔ 영업일 변환이 맞습니다. */
export const ORDERS_PER_DAY = DAY_ORDER_TARGET;

export type OrderGrade = '입문' | '중급' | '고급';
/** 작업대·홈·정산 화면이 자전거 그림을 그릴 때 쓰는 렌더 카테고리 */
export type OrderCategory = 'road' | 'mtb' | 'gravel' | 'minivelo' | 'city';
export type PartLevels = Record<WorkbenchPartType, number>;

/** 주문 정의. 같은 자전거에 주문이 여러 개 있을 수 있습니다(이름·요구 레벨·보상이 다른 변형). */
export type OrderDefinition = {
  id: string;
  /** 납품하면 이해도가 오르는 도감 자전거 */
  bikeId: string;
  /** 손님 맥락이 드러나는 표시 이름 */
  name: string;
  category: OrderCategory;
  grade: OrderGrade;
  levels: PartLevels;
  reward: number;
  note?: string;
};

/** 영업 d일차의 주문 3건(주문 id)과 설계 의도 */
export type DayPlan = { day: number; slots: readonly string[]; intent: string };

/** 챕터(구간). 화면을 바꾸지 않고 구간 이름·목표를 정리하는 설계 단위입니다. */
export type Chapter = {
  id: string;
  name: string;
  rankName: string;
  dayFrom: number;
  dayTo: number;
  goal: string;
  teaches: readonly string[];
  unlocks: readonly string[];
};

export type LevelDesign = {
  orders: readonly OrderDefinition[];
  days: readonly DayPlan[];
  /** 이 영업일부터 마지막 영업일까지를 설계가 끝난 뒤 반복합니다. */
  repeatFromDay: number;
  chapters: readonly Chapter[];
};

export type CatalogCategoryKorean = '로드' | 'MTB' | '그래블' | '미니벨로';
export type CatalogGrade = '입문' | '중급' | '고급' | '드림';

/** 등급별 Garage 제작 비용 배수(부품 4종 기본 합 1,000코인에 곱함) */
export type CraftCostMultipliers = Record<CatalogGrade, number>;

/**
 * 드림 등급 자전거 해금 규칙: 같은 카테고리의 보유 자전거 1대가 강화로 `requiredStage`(1 중급 · 2 고급 · 3 드림)에 닿으면 도감 등록.
 * `requireCategoryRegistered`가 참이면 그 카테고리의 일반 자전거가 모두 도감 등록돼 있어야 합니다.
 */
export type DreamBikeUnlockRule = {
  bikeId: string;
  category: CatalogCategoryKorean;
  requiredStage: 1 | 2 | 3;
  requireCategoryRegistered: boolean;
};

/** 주문표에 펼쳐진 주문 1건: 누적 순번(0부터), 영업일(1부터), 슬롯(0부터) */
export type ScheduledOrder = OrderDefinition & { sequence: number; day: number; slot: number };

export type OrderSchedule = {
  entries: readonly ScheduledOrder[];
  /** 반복이 시작되는 순번 */
  repeatFrom: number;
  /** 작업대 규칙이 그대로 받는 주문표 */
  workbench: WorkbenchSchedule;
};

// ── 순번 ↔ 영업일 ──

export const dayOfSequence = (sequence: number) => Math.floor(Math.max(0, sequence) / ORDERS_PER_DAY) + 1;
export const slotOfSequence = (sequence: number) => Math.max(0, sequence) % ORDERS_PER_DAY;
export const firstSequenceOfDay = (day: number) => (Math.max(1, Math.floor(day)) - 1) * ORDERS_PER_DAY;

// ── 작업량·체력 추정 ──

/** 요구 레벨 Lv.n 부품 1개를 만드는 데 드는 Lv.1 부품 수(2^(n-1)). 주문 작업량은 4종 합입니다. */
export function workUnits(levels: PartLevels): number {
  return WORKBENCH_PART_TYPES.reduce((sum, type) => sum + 2 ** (Math.max(1, levels[type]) - 1), 0);
}

/**
 * 작업량 → 체력 환산 비율. Lab 경제 시뮬레이터(초보 모델, 주문 30건 × 400회)의 주문당 체력 7.79 ÷ 평균 작업량 8.33.
 * 이월 부품·Lv.2 입고(20%)·연쇄 무료 상자가 섞여 실제 값은 주문마다 다르므로, 설계 검토용 추정치로만 씁니다.
 */
export const ENERGY_PER_WORK_UNIT = 0.93;
export const estimateEnergy = (units: number) => Math.round(units * ENERGY_PER_WORK_UNIT);

// ── 주문표 펼치기 ──

/** 설계 데이터를 누적 순번 기준 주문표로 펼칩니다. 알 수 없는 주문 id가 있으면 데이터 오류이므로 예외를 던집니다. */
export function buildOrderSchedule(design: LevelDesign): OrderSchedule {
  const byId = new Map(design.orders.map((order) => [order.id, order]));
  const days = [...design.days].sort((a, b) => a.day - b.day);
  const entries: ScheduledOrder[] = [];
  days.forEach((plan) => {
    plan.slots.forEach((id, slot) => {
      const order = byId.get(id);
      if (!order) throw new Error(`레벨 디자인: 영업 ${plan.day}일차 슬롯 ${slot}의 주문 id '${id}'가 주문 정의에 없습니다.`);
      entries.push({ ...order, levels: { ...order.levels }, sequence: entries.length, day: plan.day, slot });
    });
  });
  const repeatFrom = Math.min(Math.max(0, firstSequenceOfDay(design.repeatFromDay)), Math.max(0, entries.length - 1));
  return {
    entries,
    repeatFrom,
    workbench: { orders: entries.map((entry) => ({ levels: { ...entry.levels }, reward: entry.reward })), repeatFrom },
  };
}

/** 누적 순번의 주문. 설계 구간이 끝나면 반복 구간 규칙(orderIndexOf)을 따릅니다. */
export function scheduledOrderAt(schedule: OrderSchedule, sequence: number): ScheduledOrder | undefined {
  if (schedule.entries.length === 0 || !Number.isFinite(sequence) || sequence < 0) return undefined;
  return schedule.entries[orderIndexOf(sequence, schedule.workbench)];
}

/** 영업 d일차의 주문 3건(설계 구간을 넘으면 반복 구간에서 가져옵니다) */
export function ordersOfDay(schedule: OrderSchedule, day: number): ScheduledOrder[] {
  const first = firstSequenceOfDay(day);
  return Array.from({ length: ORDERS_PER_DAY }, (_, slot) => scheduledOrderAt(schedule, first + slot)).filter((order): order is ScheduledOrder => !!order);
}

export type DaySummary = { day: number; workUnits: number; energyEstimate: number; reward: number; orders: ScheduledOrder[] };

/** 영업 d일차의 작업량 합·체력 추정·보상 합 (설계 검토·문서 표 생성용) */
export function summarizeDay(schedule: OrderSchedule, day: number): DaySummary {
  const orders = ordersOfDay(schedule, day);
  const units = orders.reduce((sum, order) => sum + workUnits(order.levels), 0);
  return { day, workUnits: units, energyEstimate: estimateEnergy(units), reward: orders.reduce((sum, order) => sum + order.reward, 0), orders };
}

// ── 챕터 ──

/** 영업일이 속한 챕터. 마지막 챕터 뒤의 영업일은 마지막 챕터가 계속됩니다. */
export function chapterForDay(chapters: readonly Chapter[], day: number): Chapter | undefined {
  const ordered = [...chapters].sort((a, b) => a.dayFrom - b.dayFrom);
  return ordered.filter((chapter) => chapter.dayFrom <= Math.max(1, day)).at(-1) ?? ordered[0];
}

// ── 검증 ──

export type CatalogEntryForValidation = { id: string; category: CatalogCategoryKorean; grade: CatalogGrade };

const CATEGORY_RENDER: Record<CatalogEntryForValidation['category'], OrderCategory[]> = {
  로드: ['road', 'city'],
  MTB: ['mtb'],
  그래블: ['gravel'],
  미니벨로: ['minivelo'],
};

export type LevelDesignValidationOptions = {
  /** 도감(시작 자전거·드림 등급 제외)이 전부 등록되려면 자전거마다 필요한 납품 수 */
  deliveriesToRegister: number;
  /** 이 작업량을 넘는 영업일은 '바쁜 날'로 따로 선언돼야 합니다 */
  maxDayWorkUnits: number;
  /** 바쁜 날로 선언한 영업일 */
  heavyDays?: readonly number[];
  /** 주문으로 잇지 않는 자전거(시작 보유·드림 등급 등) */
  excludedBikeIds?: readonly string[];
};

/**
 * 레벨 디자인 데이터가 게임 전체를 끝까지 흘려보낼 수 있는지 확인합니다. 문제가 없으면 빈 배열.
 * - 주문 정의: id 중복 없음, 요구 레벨 1~최대, Lv.최대 요구는 주문당 1개, 카탈로그에 있는 자전거, 카테고리 일치
 * - 주문표: 영업일 1부터 빈틈 없이 이어짐, 하루 슬롯 수 = 하루 주문 수, 첫 주문은 시작 보드와 결합된 어반 로드
 * - 흐름: 모든 일반 자전거가 등록에 필요한 횟수 이상 등장, 바쁜 날 외에는 작업량 상한 이하, 반복 구간에 튜토리얼성 주문 없음
 * - 챕터: 영업일 1부터 빈틈·겹침 없이 이어지고 마지막 챕터가 설계 끝까지 덮음
 */
export function levelDesignIssues(design: LevelDesign, catalog: readonly CatalogEntryForValidation[], options: LevelDesignValidationOptions): string[] {
  const issues: string[] = [];
  const catalogById = new Map(catalog.map((bike) => [bike.id, bike]));
  const ids = new Set<string>();
  design.orders.forEach((order) => {
    if (ids.has(order.id)) issues.push(`주문 id 중복: ${order.id}`);
    ids.add(order.id);
    const bike = catalogById.get(order.bikeId);
    if (!bike) issues.push(`카탈로그에 없는 자전거: ${order.id} → ${order.bikeId}`);
    else if (!CATEGORY_RENDER[bike.category].includes(order.category)) issues.push(`카테고리 불일치: ${order.id} (${order.category}) ↔ 도감 ${bike.category}`);
    else if (bike.grade === '드림') issues.push(`드림 등급은 주문으로 잇지 않습니다: ${order.id}`);
    const levels = WORKBENCH_PART_TYPES.map((type) => order.levels[type]);
    if (levels.some((level) => !Number.isInteger(level) || level < 1 || level > WORKBENCH_MAX_LEVEL)) issues.push(`요구 레벨 범위 밖(1~${WORKBENCH_MAX_LEVEL}): ${order.id}`);
    if (levels.filter((level) => level === WORKBENCH_MAX_LEVEL).length > 1) issues.push(`Lv.${WORKBENCH_MAX_LEVEL} 요구가 2개 이상: ${order.id}`);
    if (!Number.isInteger(order.reward) || order.reward <= 0) issues.push(`보상이 양의 정수가 아님: ${order.id}`);
  });

  const days = [...design.days].sort((a, b) => a.day - b.day);
  days.forEach((plan, index) => {
    if (plan.day !== index + 1) issues.push(`영업일이 이어지지 않음: ${index + 1}일차 자리에 ${plan.day}일차`);
    if (plan.slots.length !== ORDERS_PER_DAY) issues.push(`영업 ${plan.day}일차 주문 수 ${plan.slots.length} ≠ ${ORDERS_PER_DAY}`);
    plan.slots.forEach((id, slot) => { if (!ids.has(id)) issues.push(`영업 ${plan.day}일차 슬롯 ${slot}: 정의되지 않은 주문 ${id}`); });
  });
  if (days.length === 0) { issues.push('주문표가 비어 있습니다'); return issues; }

  const first = design.orders.find((order) => order.id === days[0].slots[0]);
  const starter: PartLevels = { frame: 2, wheel: 2, drivetrain: 1, handlebar: 1 };
  if (!first || first.bikeId !== 'urban-road' || WORKBENCH_PART_TYPES.some((type) => first.levels[type] !== starter[type])) {
    issues.push('첫 주문은 시작 보드·안내와 결합된 어반 로드(프레임2·휠셋2·구동계1·핸들바1)여야 합니다');
  }

  let schedule: OrderSchedule | null = null;
  try { schedule = buildOrderSchedule(design); } catch (error) { issues.push(String(error instanceof Error ? error.message : error)); }
  if (schedule) {
    const deliveries = new Map<string, number>();
    schedule.entries.forEach((entry) => deliveries.set(entry.bikeId, (deliveries.get(entry.bikeId) ?? 0) + 1));
    const excluded = new Set(options.excludedBikeIds ?? []);
    catalog.filter((bike) => bike.grade !== '드림' && !excluded.has(bike.id)).forEach((bike) => {
      const count = deliveries.get(bike.id) ?? 0;
      if (count < options.deliveriesToRegister) issues.push(`${bike.id} 납품 ${count}회 < 등록에 필요한 ${options.deliveriesToRegister}회`);
    });
    const heavy = new Set(options.heavyDays ?? []);
    days.forEach((plan) => {
      const summary = summarizeDay(schedule!, plan.day);
      if (summary.workUnits > options.maxDayWorkUnits && !heavy.has(plan.day)) {
        issues.push(`영업 ${plan.day}일차 작업량 ${summary.workUnits} > ${options.maxDayWorkUnits} (바쁜 날로 선언되지 않음)`);
      }
    });
    if (design.repeatFromDay < 1 || design.repeatFromDay > days.length) issues.push(`반복 시작 영업일 ${design.repeatFromDay}이 주문표(1~${days.length}) 밖입니다`);
    schedule.entries.slice(schedule.repeatFrom).forEach((entry) => {
      if (entry.grade === '입문' && WORKBENCH_PART_TYPES.every((type) => entry.levels[type] <= 2)) {
        issues.push(`반복 구간(영업 ${entry.day}일차)에 튜토리얼성 입문 주문 ${entry.id}이 있습니다`);
      }
    });
  }

  const chapters = [...design.chapters].sort((a, b) => a.dayFrom - b.dayFrom);
  if (chapters.length === 0) issues.push('챕터가 없습니다');
  chapters.forEach((chapter, index) => {
    const expectedFrom = index === 0 ? 1 : chapters[index - 1].dayTo + 1;
    if (chapter.dayFrom !== expectedFrom) issues.push(`챕터 ${chapter.id}의 시작 ${chapter.dayFrom}일차 ≠ 기대 ${expectedFrom}일차`);
    if (chapter.dayTo < chapter.dayFrom) issues.push(`챕터 ${chapter.id}의 끝이 시작보다 앞섭니다`);
  });
  if (chapters.length > 0 && chapters.at(-1)!.dayTo < days.length) issues.push(`마지막 챕터가 ${chapters.at(-1)!.dayTo}일차에서 끝나 주문표 ${days.length}일차를 덮지 못합니다`);
  return issues;
}
