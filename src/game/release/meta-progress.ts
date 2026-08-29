// 메타 루프 진행 로직 (순수 로직 · Phaser 비의존) — #200 트랙
// 주문 완료 → 컬렉션 해금(#201), 컬렉션 진행 저장·복구(#204),
// 드림 바이크 성장·코인 소비(#203)의 데이터 규칙을 화면 코드와 분리해 단위 테스트 가능하게 관리합니다.

import { catalogBikeById, type CatalogBike } from './bike-catalog';

// ── 주문 메타: merge-prototype의 ORDERS(부품 목표)와 인덱스로 1:1 대응 ──
// bikeId는 이 주문 납품이 이해도를 올리는 대상 자전거입니다 (#221).
export type OrderBikeCategory = 'city' | 'mtb' | 'road';
export type OrderMeta = {
  orderIndex: number;
  name: string;
  bikeCategory: OrderBikeCategory;
  reward: number;
  bikeId: string;
};

export const ORDER_METAS: OrderMeta[] = [
  { orderIndex: 0, name: '통학용 어반 로드', bikeCategory: 'city', reward: 1000, bikeId: 'urban-road' },
  { orderIndex: 1, name: '트레일 MTB', bikeCategory: 'mtb', reward: 1400, bikeId: 'trail-mtb' },
  { orderIndex: 2, name: '엔듀런스 로드', bikeCategory: 'road', reward: 1800, bikeId: 'aero-sprinter' },
];

export function orderMetaAt(orderIndex: number): OrderMeta | undefined {
  return ORDER_METAS[orderIndex];
}

// ── 컬렉션 진행 상태 (#221 이해도 모델) ──
// 납품은 대상 자전거의 이해도를 올리고, 이해도 100%에 도감 등록(제작 가능)이 된다.
// 보유(전시·성장 가능)는 부품 제작 완료(#222) 시의 상태이며, 시작 보유는 Garage 대표 자전거 1대다.
export const INITIAL_OWNED_BIKE_IDS: readonly string[] = ['dream-road'];
export const UNDERSTANDING_PER_DELIVERY = 50;
export const UNDERSTANDING_MAX = 100;

export type CollectionProgress = {
  // 자전거별 이해도(0~100). 기록이 없으면 0으로 본다.
  understandingByBikeId: Record<string, number>;
  // 도감 등록(이해도 100% 달성 · 제작 가능) 자전거
  registeredBikeIds: string[];
  // 완성(보유 · 전시/성장 가능) 자전거
  craftedBikeIds: string[];
  // 제작 중인 자전거별 장착 부품 목록 (#222)
  craftPartsByBikeId: Record<string, CraftPartType[]>;
  // 등록 후 아직 도감에서 확인하지 않은 신규 자전거
  newBikeIds: string[];
  selectedBikeId: string;
  showcaseSlots: Array<string | null>;
};

export function createCollectionProgress(): CollectionProgress {
  const first = INITIAL_OWNED_BIKE_IDS[0];
  return {
    understandingByBikeId: { [first]: UNDERSTANDING_MAX },
    registeredBikeIds: [...INITIAL_OWNED_BIKE_IDS],
    craftedBikeIds: [...INITIAL_OWNED_BIKE_IDS],
    craftPartsByBikeId: {},
    newBikeIds: [],
    selectedBikeId: first,
    showcaseSlots: [first, null, null],
  };
}

export function bikeUnderstanding(progress: CollectionProgress, bikeId: string): number {
  return progress.understandingByBikeId[bikeId] ?? 0;
}

export function isBikeRegistered(progress: CollectionProgress, bikeId: string): boolean {
  return progress.registeredBikeIds.includes(bikeId);
}

export function isBikeCrafted(progress: CollectionProgress, bikeId: string): boolean {
  return progress.craftedBikeIds.includes(bikeId);
}

export type OrderDeliveryResult = {
  bike?: CatalogBike;
  // 납품 전·후 이해도
  before: number;
  after: number;
  // 이번 납품으로 이해도 100%를 달성해 새로 도감 등록됐는지
  registeredNow: boolean;
  // 이미 등록된 자전거의 반복 납품인지 (이해도·등록에 변화 없음)
  alreadyRegistered: boolean;
};

// 주문 납품 결과를 이해도에 반영합니다. 알 수 없는 주문·자전거 ID는 변화 없이 무시합니다.
export function applyOrderDelivery(progress: CollectionProgress, orderIndex: number): OrderDeliveryResult {
  const meta = orderMetaAt(orderIndex);
  const bike = meta ? catalogBikeById(meta.bikeId) : undefined;
  if (!bike) return { before: 0, after: 0, registeredNow: false, alreadyRegistered: false };
  if (isBikeRegistered(progress, bike.id)) {
    return { bike, before: UNDERSTANDING_MAX, after: UNDERSTANDING_MAX, registeredNow: false, alreadyRegistered: true };
  }
  const before = bikeUnderstanding(progress, bike.id);
  const after = Math.min(UNDERSTANDING_MAX, before + UNDERSTANDING_PER_DELIVERY);
  progress.understandingByBikeId[bike.id] = after;
  const registeredNow = after >= UNDERSTANDING_MAX;
  if (registeredNow) {
    progress.registeredBikeIds.push(bike.id);
    if (!progress.newBikeIds.includes(bike.id)) progress.newBikeIds.push(bike.id);
  }
  return { bike, before, after, registeredNow, alreadyRegistered: false };
}

// 도감에서 신규 자전거를 확인하면 NEW 표시를 해제합니다.
export function markBikeSeen(progress: CollectionProgress, bikeId: string) {
  progress.newBikeIds = progress.newBikeIds.filter((id) => id !== bikeId);
}

// 수집 수는 완성(보유) 기준으로 센다.
export function craftedBikeCount(progress: CollectionProgress): number {
  return new Set(progress.craftedBikeIds).size;
}

// ── Garage 자전거 만들기 (#222) ──
// 도감에 등록된 자전거에 급여로 부품을 하나씩 장착하고, 4종을 모두 장착하면 완성(보유)으로 승격한다.
// 부품 종류는 머지 보드의 부품 그룹과 같은 개념이며, 비용 합계 1,000은 첫 주문 급여와 맞춘 검증용 수치다.

export type CraftPartType = 'frame' | 'wheel' | 'drivetrain' | 'handlebar';
export const CRAFT_PARTS: Array<{ type: CraftPartType; name: string; cost: number }> = [
  { type: 'frame', name: '프레임', cost: 400 },
  { type: 'wheel', name: '휠셋', cost: 300 },
  { type: 'drivetrain', name: '구동계', cost: 200 },
  { type: 'handlebar', name: '핸들바', cost: 100 },
];
export const CRAFT_PART_TYPES: CraftPartType[] = CRAFT_PARTS.map((part) => part.type);

export function installedCraftParts(progress: CollectionProgress, bikeId: string): CraftPartType[] {
  // 완성 자전거는 항상 부품 4종이 모두 장착된 상태로 본다
  if (isBikeCrafted(progress, bikeId)) return [...CRAFT_PART_TYPES];
  return [...(progress.craftPartsByBikeId[bikeId] ?? [])];
}

// 다음에 장착할 부품 (CRAFT_PARTS 순서 기준). 완성됐거나 제작 대상이 아니면 undefined.
export function nextCraftPart(progress: CollectionProgress, bikeId: string) {
  if (!isBikeRegistered(progress, bikeId) || isBikeCrafted(progress, bikeId)) return undefined;
  const installed = installedCraftParts(progress, bikeId);
  return CRAFT_PARTS.find((part) => !installed.includes(part.type));
}

export type CraftResult =
  | { ok: true; coins: number; part: CraftPartType; installedParts: CraftPartType[]; completed: boolean }
  | { ok: false; reason: 'coins' | 'not-registered' | 'already-crafted' | 'already-installed' | 'unknown'; coins: number };

// 코인 차감과 부품 장착을 함께 적용합니다. 실패 시 어느 쪽도 변하지 않습니다(원자적 처리).
// 부품 4종이 모두 장착되면 완성(보유)으로 승격합니다.
export function applyCraftPart(progress: CollectionProgress, coins: number, bikeId: string, part: CraftPartType): CraftResult {
  const meta = CRAFT_PARTS.find((item) => item.type === part);
  if (!meta || !catalogBikeById(bikeId)) return { ok: false, reason: 'unknown', coins };
  if (isBikeCrafted(progress, bikeId)) return { ok: false, reason: 'already-crafted', coins };
  if (!isBikeRegistered(progress, bikeId)) return { ok: false, reason: 'not-registered', coins };
  const installed = progress.craftPartsByBikeId[bikeId] ?? [];
  if (installed.includes(part)) return { ok: false, reason: 'already-installed', coins };
  if (coins < meta.cost) return { ok: false, reason: 'coins', coins };

  const nextInstalled = [...installed, part];
  const completed = CRAFT_PART_TYPES.every((type) => nextInstalled.includes(type));
  if (completed) {
    delete progress.craftPartsByBikeId[bikeId];
    progress.craftedBikeIds.push(bikeId);
  } else {
    progress.craftPartsByBikeId[bikeId] = nextInstalled;
  }
  return { ok: true, coins: coins - meta.cost, part, installedParts: nextInstalled, completed };
}

// ── 컬렉션 진행 저장·복구 (#204) ──
// localStorage 접근은 호출 측(컨트롤러)이 담당하고, 이 모듈은 직렬화·검증·마이그레이션 규칙만 가집니다.

export const COLLECTION_STORAGE_KEY = 'dbg-lab-meta-collection';
// v2 (#221): 즉시 해금(ownedBikeIds) 모델 → 이해도·등록·완성 분리 모델
export const COLLECTION_SCHEMA_VERSION = 2;
const SHOWCASE_SLOT_COUNT = 3;

type SavedCollectionV1 = { version: 1; ownedBikeIds?: unknown; newBikeIds?: unknown; selectedBikeId?: unknown; showcaseSlots?: unknown };
type SavedCollection = { version: number } & Partial<CollectionProgress>;

export function serializeCollectionProgress(progress: CollectionProgress): string {
  return JSON.stringify({ version: COLLECTION_SCHEMA_VERSION, ...progress } satisfies SavedCollection);
}

// v1(즉시 해금) 저장을 v2로 마이그레이션: 보유 자전거는 이해도 100%·등록·완성 상태로 승계한다.
function migrateCollectionV1(data: SavedCollectionV1): Partial<CollectionProgress> {
  const owned = Array.isArray(data.ownedBikeIds)
    ? data.ownedBikeIds.filter((id): id is string => typeof id === 'string')
    : [];
  return {
    understandingByBikeId: Object.fromEntries(owned.map((id) => [id, UNDERSTANDING_MAX])),
    registeredBikeIds: [...owned],
    craftedBikeIds: [...owned],
    newBikeIds: Array.isArray(data.newBikeIds) ? (data.newBikeIds as string[]) : [],
    selectedBikeId: typeof data.selectedBikeId === 'string' ? data.selectedBikeId : undefined,
    showcaseSlots: Array.isArray(data.showcaseSlots) ? (data.showcaseSlots as Array<string | null>) : undefined,
  };
}

// 저장 원본이 없거나(JSON 손상 포함) 알 수 없는 스키마 버전이면 기본값으로 복구합니다.
// v1은 마이그레이션하고, 버전이 맞아도 필드 단위로 검증해 삭제된 자전거 ID·중복·형식 이상을 방어합니다.
export function parseCollectionProgress(raw: string | null | undefined): CollectionProgress {
  if (!raw) return createCollectionProgress();
  let saved: unknown;
  try {
    saved = JSON.parse(raw);
  } catch {
    return createCollectionProgress();
  }
  if (typeof saved !== 'object' || saved === null) return createCollectionProgress();
  const data = saved as SavedCollection;
  if (data.version === 1) return sanitizeCollectionProgress(migrateCollectionV1(data as SavedCollectionV1));
  if (data.version !== COLLECTION_SCHEMA_VERSION) return createCollectionProgress();
  return sanitizeCollectionProgress(data);
}

// 저장 데이터의 비정상 값(미등록 ID, 중복, 범위 밖 이해도, 미완성 전시 등)을 안전한 값으로 보정합니다.
export function sanitizeCollectionProgress(data: Partial<CollectionProgress>): CollectionProgress {
  const fallback = createCollectionProgress();
  const validIds = (value: unknown) => (Array.isArray(value) ? value : [])
    .filter((id): id is string => typeof id === 'string' && Boolean(catalogBikeById(id)));

  // 완성은 등록을 포함한다: crafted ⊆ registered 를 합집합으로 강제
  const crafted = [...new Set(validIds(data.craftedBikeIds))];
  const registered = [...new Set([...validIds(data.registeredBikeIds), ...crafted])];
  // 시작 자전거는 항상 등록·완성 상태를 유지해 진행 불가를 막는다
  INITIAL_OWNED_BIKE_IDS.forEach((id) => {
    if (!registered.includes(id)) registered.unshift(id);
    if (!crafted.includes(id)) crafted.unshift(id);
  });

  // 이해도: 0~100 정수로 클램프, 등록 자전거는 항상 100
  const understanding: Record<string, number> = {};
  const rawUnderstanding = data.understandingByBikeId;
  if (rawUnderstanding && typeof rawUnderstanding === 'object') {
    Object.entries(rawUnderstanding).forEach(([id, value]) => {
      if (!catalogBikeById(id)) return;
      if (typeof value !== 'number' || !Number.isFinite(value)) return;
      understanding[id] = Math.min(UNDERSTANDING_MAX, Math.max(0, Math.floor(value)));
    });
  }
  registered.forEach((id) => { understanding[id] = UNDERSTANDING_MAX; });

  // 제작 진행: 등록·미완성 자전거의 유효한 부품만 유지, 4종이 모두 장착돼 있으면 완성으로 승격 (#222)
  const craftParts: Record<string, CraftPartType[]> = {};
  const rawCraftParts = data.craftPartsByBikeId;
  if (rawCraftParts && typeof rawCraftParts === 'object') {
    Object.entries(rawCraftParts).forEach(([id, value]) => {
      if (!catalogBikeById(id) || crafted.includes(id) || !registered.includes(id)) return;
      const parts = [...new Set(Array.isArray(value) ? value : [])]
        .filter((part): part is CraftPartType => typeof part === 'string' && CRAFT_PART_TYPES.includes(part as CraftPartType));
      if (parts.length === 0) return;
      if (CRAFT_PART_TYPES.every((type) => parts.includes(type))) {
        crafted.push(id);
        return;
      }
      craftParts[id] = parts;
    });
  }

  const news = [...new Set(Array.isArray(data.newBikeIds) ? data.newBikeIds : [])]
    .filter((id): id is string => typeof id === 'string' && registered.includes(id));

  const selected = typeof data.selectedBikeId === 'string' && catalogBikeById(data.selectedBikeId)
    ? data.selectedBikeId
    : crafted[0] ?? fallback.selectedBikeId;

  const slotsRaw = Array.isArray(data.showcaseSlots) ? data.showcaseSlots : fallback.showcaseSlots;
  const slots = Array.from({ length: SHOWCASE_SLOT_COUNT }, (_, index) => {
    const slot = slotsRaw[index];
    // 전시는 완성 자전거만 가능
    return typeof slot === 'string' && crafted.includes(slot) ? slot : null;
  });

  return {
    understandingByBikeId: understanding,
    registeredBikeIds: registered,
    craftedBikeIds: crafted,
    craftPartsByBikeId: craftParts,
    newBikeIds: news,
    selectedBikeId: selected,
    showcaseSlots: slots,
  };
}

// ── 자전거 성장 (#203 → #223 완성 자전거별 개편) ──
// 강화 규칙(파츠 3종 · Lv.1~4 · 비용 350×레벨 · 합계 7/10에서 등급 상승)은 유지하고,
// 성장 단계를 완성(보유) 자전거별로 독립 관리합니다. Garage에서 자전거를 클릭해 진입합니다.

export type DreamStatKey = '성능' | '스타일' | '희귀도';
export const DREAM_STAT_KEYS: DreamStatKey[] = ['성능', '스타일', '희귀도'];
export const DREAM_STAT_MIN_LEVEL = 1;
export const DREAM_STAT_MAX_LEVEL = 4;

export type BikeStats = Record<DreamStatKey, number>;
export type GrowthProgress = {
  // 완성 자전거별 파츠 강화 단계. 기록이 없으면 모든 파츠 Lv.1로 본다.
  statsByBikeId: Record<string, BikeStats>;
};

function createBikeStats(): BikeStats {
  return { 성능: 1, 스타일: 1, 희귀도: 1 };
}

export function createGrowthProgress(): GrowthProgress {
  return { statsByBikeId: {} };
}

export function bikeStats(growth: GrowthProgress, bikeId: string): BikeStats {
  return { ...(growth.statsByBikeId[bikeId] ?? createBikeStats()) };
}

// 강화 비용: 현재 레벨 × 350 (명시적 데이터 — 밸런스 확정은 메인 담당)
export function dreamUpgradeCost(level: number): number {
  return 350 * level;
}

export function dreamTotalLevel(stats: BikeStats): number {
  return DREAM_STAT_KEYS.reduce((sum, key) => sum + stats[key], 0);
}

// 종합 성장 단계: 합계 10 이상 = 3단계(드림), 7 이상 = 2단계(고급), 그 외 1단계(중급)
export function dreamStage(stats: BikeStats): 1 | 2 | 3 {
  const total = dreamTotalLevel(stats);
  return total >= 10 ? 3 : total >= 7 ? 2 : 1;
}

export function dreamGradeName(stats: BikeStats): '중급' | '고급' | '드림' {
  const stage = dreamStage(stats);
  return stage === 3 ? '드림' : stage === 2 ? '고급' : '중급';
}

export type DreamUpgradeResult =
  | { ok: true; coins: number; growth: GrowthProgress; stats: BikeStats; upgradedTo: number; stageUp: boolean }
  | { ok: false; reason: 'coins' | 'max' | 'not-crafted'; coins: number; stats: BikeStats };

// 코인 차감과 레벨 상승을 함께 계산해 반환합니다. 실패 시 어느 쪽도 변하지 않습니다(원자적 처리).
// 성장은 완성(보유) 자전거만 가능합니다 (#223).
export function applyBikeUpgrade(
  collection: CollectionProgress,
  growth: GrowthProgress,
  coins: number,
  bikeId: string,
  stat: DreamStatKey,
): DreamUpgradeResult {
  const stats = bikeStats(growth, bikeId);
  if (!isBikeCrafted(collection, bikeId)) return { ok: false, reason: 'not-crafted', coins, stats };
  const level = stats[stat];
  if (level >= DREAM_STAT_MAX_LEVEL) return { ok: false, reason: 'max', coins, stats };
  const cost = dreamUpgradeCost(level);
  if (coins < cost) return { ok: false, reason: 'coins', coins, stats };
  const beforeStage = dreamStage(stats);
  const nextStats: BikeStats = { ...stats, [stat]: level + 1 };
  const next: GrowthProgress = { statsByBikeId: { ...growth.statsByBikeId, [bikeId]: nextStats } };
  return {
    ok: true,
    coins: coins - cost,
    growth: next,
    stats: nextStats,
    upgradedTo: level + 1,
    stageUp: dreamStage(nextStats) > beforeStage,
  };
}

// ── 자전거 성장 저장·복구 (#203 → #223 v2) — 컬렉션(#204)과 같은 버전·보정 규칙 구조 ──

export const GROWTH_STORAGE_KEY = 'dbg-lab-meta-growth';
// v2 (#223): 단일 드림 바이크 스탯 → 완성 자전거별 스탯
export const GROWTH_SCHEMA_VERSION = 2;

type SavedGrowthV1 = { version: 1; targetBikeId?: unknown; stats?: unknown };
type SavedGrowth = { version: number } & Partial<GrowthProgress>;

export function serializeGrowthProgress(growth: GrowthProgress): string {
  return JSON.stringify({ version: GROWTH_SCHEMA_VERSION, ...growth } satisfies SavedGrowth);
}

// v1(단일 드림 바이크) 저장을 v2로 마이그레이션: 기존 스탯을 대상 자전거의 스탯으로 승계한다.
function migrateGrowthV1(data: SavedGrowthV1): Partial<GrowthProgress> {
  const targetBikeId = typeof data.targetBikeId === 'string' ? data.targetBikeId : 'dream-road';
  const stats = (data.stats && typeof data.stats === 'object' ? data.stats : {}) as Partial<BikeStats>;
  return { statsByBikeId: { [targetBikeId]: { ...createBikeStats(), ...stats } } };
}

export function parseGrowthProgress(raw: string | null | undefined): GrowthProgress {
  if (!raw) return createGrowthProgress();
  let saved: unknown;
  try {
    saved = JSON.parse(raw);
  } catch {
    return createGrowthProgress();
  }
  if (typeof saved !== 'object' || saved === null) return createGrowthProgress();
  const data = saved as SavedGrowth;
  if (data.version === 1) return sanitizeGrowthProgress(migrateGrowthV1(data as SavedGrowthV1));
  if (data.version !== GROWTH_SCHEMA_VERSION) return createGrowthProgress();
  return sanitizeGrowthProgress(data);
}

// 저장 데이터의 비정상 값(범위 밖 레벨, 소수·문자열, 미등록 자전거 ID)을 안전한 값으로 보정합니다.
export function sanitizeGrowthProgress(data: Partial<GrowthProgress>): GrowthProgress {
  const statsByBikeId: Record<string, BikeStats> = {};
  const raw = data.statsByBikeId;
  if (raw && typeof raw === 'object') {
    Object.entries(raw).forEach(([bikeId, value]) => {
      if (!catalogBikeById(bikeId) || !value || typeof value !== 'object') return;
      const stats = createBikeStats();
      DREAM_STAT_KEYS.forEach((key) => {
        const level = (value as Partial<BikeStats>)[key];
        if (typeof level === 'number' && Number.isFinite(level)) {
          stats[key] = Math.min(DREAM_STAT_MAX_LEVEL, Math.max(DREAM_STAT_MIN_LEVEL, Math.floor(level)));
        }
      });
      statsByBikeId[bikeId] = stats;
    });
  }
  return { statsByBikeId };
}

// ── 다음 목표 결정 규칙 (#205 → #221·#222·#223 개편) ──
// 우선순위: 1) 등록·미완성 자전거의 부품 제작 (등록 직후 만들기 체험으로 바로 연결)
// → 2) 이해도가 100%가 아닌 자전거의 주문 납품 → 3) 완성 자전거 중 강화 가능한 파츠
// → 4) 모두 달성 시 반복 주문 안내.

export type NextGoal =
  | { kind: 'understand'; orderIndex: number; orderName: string; bikeId: string; bikeName: string; understanding: number; deliveriesLeft: number }
  | { kind: 'craft'; bikeId: string; bikeName: string; partName: string; cost: number; installedCount: number; totalParts: number }
  | { kind: 'upgrade'; bikeId: string; bikeName: string; stat: DreamStatKey; cost: number }
  | { kind: 'repeat' };

export function computeNextGoal(collection: CollectionProgress, growth: GrowthProgress): NextGoal {
  // 등록됐지만 아직 완성하지 못한 자전거의 다음 부품 제작 (#222)
  const craftTargetId = collection.registeredBikeIds.find((id) => !isBikeCrafted(collection, id));
  if (craftTargetId) {
    const part = nextCraftPart(collection, craftTargetId);
    if (part) {
      return {
        kind: 'craft',
        bikeId: craftTargetId,
        bikeName: catalogBikeById(craftTargetId)?.name ?? craftTargetId,
        partName: part.name,
        cost: part.cost,
        installedCount: installedCraftParts(collection, craftTargetId).length,
        totalParts: CRAFT_PART_TYPES.length,
      };
    }
  }
  const nextStudy = ORDER_METAS.find((meta) => !isBikeRegistered(collection, meta.bikeId));
  if (nextStudy) {
    const bike = catalogBikeById(nextStudy.bikeId);
    const understanding = bikeUnderstanding(collection, nextStudy.bikeId);
    return {
      kind: 'understand',
      orderIndex: nextStudy.orderIndex,
      orderName: nextStudy.name,
      bikeId: nextStudy.bikeId,
      bikeName: bike?.name ?? nextStudy.bikeId,
      understanding,
      deliveriesLeft: Math.max(1, Math.ceil((UNDERSTANDING_MAX - understanding) / UNDERSTANDING_PER_DELIVERY)),
    };
  }
  // 완성 자전거 중 아직 최대 단계가 아닌 첫 자전거의 가장 낮은 파츠를 안내한다 (#223)
  for (const bikeId of collection.craftedBikeIds) {
    const stats = bikeStats(growth, bikeId);
    const upgradable = DREAM_STAT_KEYS.filter((key) => stats[key] < DREAM_STAT_MAX_LEVEL);
    if (upgradable.length === 0) continue;
    const stat = upgradable.reduce((lowest, key) => (stats[key] < stats[lowest] ? key : lowest));
    return {
      kind: 'upgrade',
      bikeId,
      bikeName: catalogBikeById(bikeId)?.name ?? bikeId,
      stat,
      cost: dreamUpgradeCost(stats[stat]),
    };
  }
  return { kind: 'repeat' };
}
