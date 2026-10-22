// Garage 효과 — 카탈로그·컬렉션·성장 상태를 효과 규칙(domain/garage-perks)에 잇는 모듈 (순수 로직 · Phaser 비의존) — #109
// 컨트롤러는 여기서 계산한 효과를 작업대(Lv.2 입고 확률)·납품(팁)·정산(체력)·레이스(속도)·화면 문구에 넘깁니다.
import { CATALOG_BIKES, catalogBikeById } from './bike-catalog';
import { GARAGE_PERK_CONFIG } from '../../data/garage-perks';
import {
  PERK_CATEGORIES,
  bikeVisualSpec,
  categorySetTier,
  computeGaragePerks,
  nextMilestone,
  reachedMilestones,
  tipFor,
  type BikeVisualSpec,
  type CategorySetRule,
  type CollectionMilestone,
  type GaragePerkConfig,
  type GaragePerks,
  type PerkCategory,
  type PerkKind,
  type SetTierState,
} from '../../domain/garage-perks';
import { SPEED_PER_PERFORMANCE_LEVEL, playerSpeedScore } from './race-progress';
import { bikeStats, dreamStage, isBikeCrafted, type BikeStats, type CollectionProgress, type DreamStatKey, type GrowthProgress } from './meta-progress';

export type { GaragePerks, PerkCategory, PerkKind, BikeVisualSpec, CollectionMilestone } from '../../domain/garage-perks';

/** 대표 자전거: 선택한 자전거가 완성 상태면 그것, 아니면 첫 보유 자전거(시작 드림 로드). 홈·대회·입고 효과가 모두 이 규칙을 씁니다. */
export function heroBikeId(collection: CollectionProgress): string {
  return isBikeCrafted(collection, collection.selectedBikeId) ? collection.selectedBikeId : collection.craftedBikeIds[0];
}

/** 카테고리별 보유(완성) 대수 */
export function craftedCountByCategory(collection: CollectionProgress): Record<PerkCategory, number> {
  const counts = Object.fromEntries(PERK_CATEGORIES.map((category) => [category, 0])) as Record<PerkCategory, number>;
  new Set(collection.craftedBikeIds).forEach((id) => {
    const bike = catalogBikeById(id);
    if (bike) counts[bike.category] += 1;
  });
  return counts;
}

/** 카테고리별 도감 전체 대수(세트 보너스 n/6 표시용) */
export function catalogCountByCategory(): Record<PerkCategory, number> {
  const counts = Object.fromEntries(PERK_CATEGORIES.map((category) => [category, 0])) as Record<PerkCategory, number>;
  CATALOG_BIKES.forEach((bike) => { counts[bike.category] += 1; });
  return counts;
}

/** 지금의 Garage 효과(팁·Lv.2 입고·레이스 속도·정산 체력)와 출처 */
export function garagePerks(collection: CollectionProgress, growth: GrowthProgress, config: GaragePerkConfig = GARAGE_PERK_CONFIG): GaragePerks {
  const hero = heroBikeId(collection);
  return computeGaragePerks({
    heroBikeId: hero ?? null,
    heroStats: hero ? bikeStats(growth, hero) : null,
    showcaseStyleLevels: collection.showcaseSlots
      .filter((slot): slot is string => typeof slot === 'string' && isBikeCrafted(collection, slot))
      .map((slot) => bikeStats(growth, slot).스타일),
    ownedByCategory: craftedCountByCategory(collection),
  }, config);
}

/** 납품 급여에 붙는 손님 팁 */
export function deliveryTip(reward: number, perks: Pick<GaragePerks, 'tipRate'>, config: GaragePerkConfig = GARAGE_PERK_CONFIG): number {
  return tipFor(reward, perks.tipRate, config.tipRounding);
}

/**
 * 보유 대수가 닿은 마일스톤을 받습니다. 받은 기록을 컬렉션에 남기고 새로 받은 마일스톤(무료 상자 개수)을 돌려줍니다.
 * 보상 지급(작업대 무료 상자)은 호출 측이 합니다. 변화가 없으면 빈 배열.
 */
export function claimCollectionMilestones(collection: CollectionProgress, config: GaragePerkConfig = GARAGE_PERK_CONFIG): CollectionMilestone[] {
  const owned = new Set(collection.craftedBikeIds).size;
  const reached = reachedMilestones(owned, collection.claimedMilestones, config.milestones);
  reached.forEach((milestone) => collection.claimedMilestones.push(milestone.owned));
  collection.claimedMilestones.sort((a, b) => a - b);
  return reached;
}

/** 다음 보유 마일스톤(화면 안내용) */
export function nextCollectionMilestone(collection: CollectionProgress, config: GaragePerkConfig = GARAGE_PERK_CONFIG): CollectionMilestone | undefined {
  return nextMilestone(new Set(collection.craftedBikeIds).size, config.milestones);
}

export type CategorySetView = { rule: CategorySetRule; state: SetTierState; total: number };

/** 카테고리 세트 보너스 진행(도감 화면 표시용) */
export function categorySetViews(collection: CollectionProgress, config: GaragePerkConfig = GARAGE_PERK_CONFIG): CategorySetView[] {
  const owned = craftedCountByCategory(collection);
  const total = catalogCountByCategory();
  return config.categorySets.map((rule) => ({ rule, state: categorySetTier(owned[rule.category], rule), total: total[rule.category] }));
}

/** 자전거 외형 이펙트 사양(강화 스탯과 성장 단계에서) */
export function bikeEffects(stats: BikeStats): BikeVisualSpec {
  return bikeVisualSpec(stats, dreamStage(stats));
}

// ── 화면 문구 (컨트롤러가 계산해 화면에 넘기는 값) ──

export const percentLabel = (rate: number) => `${Math.round(rate * 100)}%`;
const signed = (value: number, digits = 1) => `${value >= 0 ? '+' : ''}${Number(value.toFixed(digits))}`;

/** 효과 값 표기: 레이스 속도 +2.5 · 정산 체력 +4 · 입고·팁 +5%p */
export function perkValueLabel(kind: PerkKind, value: number): string {
  if (kind === 'raceSpeed') return signed(value);
  if (kind === 'settlementEnergy') return `+${Math.round(value)}`;
  return `+${Math.round(value * 100)}%p`;
}

/** 효과 이름 */
export const PERK_KIND_NAMES: Record<PerkKind, string> = {
  raceSpeed: '레이스 속도',
  settlementEnergy: '정산 체력',
  level2Box: 'Lv.2 입고',
  tip: '손님 팁',
};

/** 대표 자전거 효과 한 줄(홈 소제목): `희귀 부품 35% · 속도 31.5` */
export function heroEffectLine(stats: BikeStats, perks: GaragePerks): string {
  return `희귀 부품 ${percentLabel(perks.level2BoxRate)} · 속도 ${playerSpeedScore(stats, perks.raceSpeedBonus).toFixed(1)}`;
}

/** 공방 보너스 요약(홈 성장 게이지 옆): 팁·정산 체력 중 0이 아닌 것만 */
export function garageBonusLine(perks: GaragePerks): string {
  const parts: string[] = [];
  if (perks.tipRate > 0) parts.push(`팁 +${percentLabel(perks.tipRate)}`);
  if (perks.settlementEnergy > 0) parts.push(`정산 체력 +${perks.settlementEnergy}`);
  return parts.join(' · ');
}

/** 출전 보너스 문구(레이스 진입): 로드 컬렉션·시그니처 출처별 */
export function raceBonusLine(perks: GaragePerks): string {
  const sources = perks.sources.filter((source) => source.kind === 'raceSpeed');
  if (perks.raceSpeedBonus <= 0 || sources.length === 0) return '';
  return `출전 보너스 속도 ${signed(perks.raceSpeedBonus)} · ${sources.map((source) => `${source.label} ${signed(source.value)}`).join(' · ')}`;
}

export type StatEffectView = { stat: DreamStatKey; effect: string; current: string };

/**
 * 성장 화면의 스탯 카드 문구: 이 스탯이 무엇을 올리는지와 지금 값.
 * 대표 자전거가 아니면 성능·희귀도는 "대표로 두면" 조건을, 전시하지 않은 자전거의 스타일은 "전시하면" 조건을 붙입니다.
 */
export function statEffectViews(
  stats: BikeStats,
  context: { isHero: boolean; isShowcased: boolean; perks: GaragePerks },
  config: GaragePerkConfig = GARAGE_PERK_CONFIG,
): StatEffectView[] {
  const rarityRate = config.level2BoxBase + Math.max(0, stats.희귀도 - 1) * config.level2BoxPerRarityLevel;
  return [
    {
      stat: '성능',
      effect: `레이스 속도 +${SPEED_PER_PERFORMANCE_LEVEL}/Lv`,
      current: context.isHero ? `출전 속도 ${playerSpeedScore(stats, context.perks.raceSpeedBonus).toFixed(1)}` : '대표로 두면 대회에 반영',
    },
    {
      stat: '스타일',
      effect: `전시 시 손님 팁 +${Math.round(config.tipPerStyleLevel * 100)}%/Lv`,
      current: context.isShowcased ? `전시 중 · 공방 팁 ${percentLabel(context.perks.tipRate)}` : '전시대에 올리면 팁 반영',
    },
    {
      stat: '희귀도',
      effect: `대표 시 Lv.2 입고 +${Math.round(config.level2BoxPerRarityLevel * 100)}%p/Lv`,
      current: context.isHero ? `지금 Lv.2 입고 ${percentLabel(context.perks.level2BoxRate)}` : `대표로 두면 ${percentLabel(rarityRate)}`,
    },
  ];
}
