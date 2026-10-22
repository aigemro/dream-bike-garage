// Garage 효과 규칙 (순수 로직 · Phaser·카탈로그 비의존) — #109
// 자전거를 모으고 강화한 결과가 매일의 작업대·납품·대회에 돌아오게 하는 규칙입니다.
// - 강화 스탯 3종은 각각 다른 곳에 효과를 줍니다: 성능 → 레이스 속도(대표 자전거, race-progress의 속도 공식),
//   스타일 → 전시대에 올린 자전거의 손님 팁, 희귀도 → 대표 자전거의 부품 상자 Lv.2 입고 확률.
// - 카테고리별 보유(완성) 대수가 기준에 닿으면 세트 보너스가 열리고, 드림 자전거는 대표로 둘 때 시그니처 특성을 냅니다.
// - 보유 대수 마일스톤은 1회성 보상(무료 상자)을 줍니다.
// 수치는 src/data/garage-perks.ts에 두고, 카탈로그(자전거별 카테고리)와의 연결은 src/game/release/garage-perks.ts가 합니다.

export type PerkCategory = '로드' | 'MTB' | '그래블' | '미니벨로';
export const PERK_CATEGORIES: readonly PerkCategory[] = ['로드', 'MTB', '그래블', '미니벨로'];

/** 강화 스탯. meta-progress의 BikeStats와 같은 모양이며, 이 모듈은 숫자만 봅니다. */
export type PerkStats = { 성능: number; 스타일: number; 희귀도: number };

/** 효과 종류: 레이스 속도 가산 · 하루 정산 시 체력 회복 · 상자 Lv.2 입고 확률 가산 · 손님 팁 비율 가산 */
export type PerkKind = 'raceSpeed' | 'settlementEnergy' | 'level2Box' | 'tip';

export type SetTier = { owned: number; value: number };
/** 카테고리 세트 보너스 규칙: 보유 대수가 tiers[i].owned 이상이면 그 단계의 value를 받습니다(가장 높은 단계 하나). */
export type CategorySetRule = { category: PerkCategory; kind: PerkKind; label: string; tiers: readonly SetTier[] };
/** 드림 자전거 시그니처 특성: 그 자전거를 대표로 둘 때만 발동합니다. */
export type SignaturePerk = { bikeId: string; kind: PerkKind; value: number; label: string };
/** 보유 대수 마일스톤: owned대에 닿으면 무료 상자 freeBoxes개(1회) */
export type CollectionMilestone = { owned: number; freeBoxes: number };

export type GaragePerkConfig = {
  /** 전시대 자전거 스타일 Lv 1당 팁 비율 */
  tipPerStyleLevel: number;
  /** 팁 금액을 이 단위로 내림(코인 끝자리를 깔끔하게) */
  tipRounding: number;
  /** 상자 Lv.2 입고 기본 확률(작업대 규칙과 같은 값) */
  level2BoxBase: number;
  /** 대표 자전거 희귀도 Lv.2부터 Lv 1당 더하는 Lv.2 입고 확률 */
  level2BoxPerRarityLevel: number;
  /** 효과별 상한(여러 출처가 겹쳐도 넘지 않음) */
  caps: { tipRate: number; level2BoxRate: number; raceSpeedBonus: number; settlementEnergy: number };
  categorySets: readonly CategorySetRule[];
  signatures: readonly SignaturePerk[];
  milestones: readonly CollectionMilestone[];
};

/** 효과 출처(화면 표시용): 어떤 규칙이 얼마를 보탰는지 */
export type PerkSource = {
  kind: PerkKind;
  label: string;
  value: number;
  origin: 'hero' | 'showcase' | 'set' | 'signature';
};

export type GaragePerks = {
  /** 납품 급여에 곱하는 팁 비율(0 이상) */
  tipRate: number;
  /** 부품 상자에서 Lv.2가 나올 확률 */
  level2BoxRate: number;
  /** 레이스 속도 가산(성능 스탯의 기본 속도와 별개) */
  raceSpeedBonus: number;
  /** 하루 정산 시 회복하는 알바 체력 */
  settlementEnergy: number;
  sources: PerkSource[];
};

export type GaragePerkInput = {
  /** 대표 자전거 id와 스탯. 보유 자전거가 없으면 null */
  heroBikeId: string | null;
  heroStats: PerkStats | null;
  /** 전시대에 올린 자전거들의 스타일 Lv (빈 칸은 제외) */
  showcaseStyleLevels: readonly number[];
  /** 카테고리별 보유(완성) 대수 */
  ownedByCategory: Record<PerkCategory, number>;
};

export type SetTierState = {
  owned: number;
  /** 현재 단계(0 = 아직 없음) */
  tier: number;
  /** 현재 단계의 효과 값(없으면 0) */
  value: number;
  /** 다음 단계(모두 달성했으면 undefined) */
  next?: SetTier;
};

const round2 = (value: number) => Math.round(value * 1000) / 1000;
const clamp = (value: number, max: number) => Math.max(0, Math.min(max, value));

/** 보유 대수로 세트 보너스 단계를 판정합니다. tiers는 owned 오름차순이어야 합니다. */
export function categorySetTier(owned: number, rule: CategorySetRule): SetTierState {
  const count = Math.max(0, Math.floor(owned));
  const reached = rule.tiers.filter((tier) => count >= tier.owned);
  const current = reached.at(-1);
  return {
    owned: count,
    tier: reached.length,
    value: current?.value ?? 0,
    next: rule.tiers.find((tier) => count < tier.owned),
  };
}

/**
 * 대표 자전거·전시대·카테고리 보유 수·시그니처를 합쳐 지금의 Garage 효과를 계산합니다.
 * 효과별 상한을 넘지 않고, sources에는 0이 아닌 출처만 담습니다.
 */
export function computeGaragePerks(input: GaragePerkInput, config: GaragePerkConfig): GaragePerks {
  const sources: PerkSource[] = [];
  let tipRate = 0;
  let level2BoxRate = config.level2BoxBase;
  let raceSpeedBonus = 0;
  let settlementEnergy = 0;

  // 전시대: 올린 자전거의 스타일 Lv 합만큼 손님 팁
  const styleTotal = input.showcaseStyleLevels.reduce((sum, level) => sum + Math.max(0, Math.floor(level)), 0);
  if (styleTotal > 0 && config.tipPerStyleLevel > 0) {
    const value = styleTotal * config.tipPerStyleLevel;
    tipRate += value;
    sources.push({ kind: 'tip', label: `전시 스타일 Lv 합 ${styleTotal}`, value, origin: 'showcase' });
  }

  // 대표 자전거: 희귀도 Lv.2부터 Lv.2 입고 확률 가산
  if (input.heroStats) {
    const rarityLevels = Math.max(0, Math.floor(input.heroStats.희귀도) - 1);
    if (rarityLevels > 0 && config.level2BoxPerRarityLevel > 0) {
      const value = rarityLevels * config.level2BoxPerRarityLevel;
      level2BoxRate += value;
      sources.push({ kind: 'level2Box', label: `대표 희귀도 Lv.${rarityLevels + 1}`, value, origin: 'hero' });
    }
  }

  // 카테고리 세트 보너스
  config.categorySets.forEach((rule) => {
    const state = categorySetTier(input.ownedByCategory[rule.category] ?? 0, rule);
    if (state.value <= 0) return;
    if (rule.kind === 'tip') tipRate += state.value;
    else if (rule.kind === 'level2Box') level2BoxRate += state.value;
    else if (rule.kind === 'raceSpeed') raceSpeedBonus += state.value;
    else settlementEnergy += state.value;
    sources.push({ kind: rule.kind, label: `${rule.category} 컬렉션 ${state.tier}단계`, value: state.value, origin: 'set' });
  });

  // 시그니처: 대표 자전거가 드림 자전거일 때
  const signature = input.heroBikeId ? config.signatures.find((perk) => perk.bikeId === input.heroBikeId) : undefined;
  if (signature) {
    if (signature.kind === 'tip') tipRate += signature.value;
    else if (signature.kind === 'level2Box') level2BoxRate += signature.value;
    else if (signature.kind === 'raceSpeed') raceSpeedBonus += signature.value;
    else settlementEnergy += signature.value;
    sources.push({ kind: signature.kind, label: signature.label, value: signature.value, origin: 'signature' });
  }

  return {
    tipRate: round2(clamp(tipRate, config.caps.tipRate)),
    level2BoxRate: round2(clamp(level2BoxRate, config.caps.level2BoxRate)),
    raceSpeedBonus: round2(clamp(raceSpeedBonus, config.caps.raceSpeedBonus)),
    settlementEnergy: Math.floor(clamp(settlementEnergy, config.caps.settlementEnergy)),
    sources,
  };
}

/** 납품 급여에 붙는 팁 금액. rounding 단위로 내림하며 음수·비정상 값은 0입니다. */
export function tipFor(reward: number, tipRate: number, rounding = 10): number {
  if (!(reward > 0) || !(tipRate > 0)) return 0;
  const unit = Math.max(1, Math.floor(rounding));
  return Math.floor((reward * tipRate) / unit) * unit;
}

/** 보유 대수로 닿았지만 아직 받지 않은 마일스톤(낮은 것부터) */
export function reachedMilestones(owned: number, claimed: readonly number[], milestones: readonly CollectionMilestone[]): CollectionMilestone[] {
  return milestones
    .filter((milestone) => owned >= milestone.owned && !claimed.includes(milestone.owned))
    .sort((a, b) => a.owned - b.owned);
}

/** 다음 마일스톤(모두 달성했으면 undefined) */
export function nextMilestone(owned: number, milestones: readonly CollectionMilestone[]): CollectionMilestone | undefined {
  return [...milestones].sort((a, b) => a.owned - b.owned).find((milestone) => owned < milestone.owned);
}

// ── 외형 이펙트 사양 (화면은 이 숫자대로 그리기만 합니다) ──

export type BikeVisualSpec = {
  /** 자전거 주변 반짝임 개수 (희귀도 Lv.2부터 2개씩) */
  sparkles: number;
  /** 반짝임 색을 골드·크림으로 번갈아 쓰는지 (희귀도 최대) */
  sparkleAlternate: boolean;
  /** 뒤쪽 속도선 개수 (성능 Lv.2부터 1개씩) */
  speedLines: number;
  /** 스타일 단계 0~3: 1 골드 림, 2 + 골드 핸들바, 3 + 붉은 안장·밝은 프레임 하이라이트 */
  styleTier: 0 | 1 | 2 | 3;
  /** 성장 단계 1 중급 · 2 고급(연한 오라) · 3 드림(골드 링·배지) */
  stage: 1 | 2 | 3;
};

const MAX_STAT_LEVEL = 4;

export function bikeVisualSpec(stats: PerkStats, stage: 1 | 2 | 3): BikeVisualSpec {
  const level = (value: number) => Math.max(1, Math.min(MAX_STAT_LEVEL, Math.floor(value)));
  const rarity = level(stats.희귀도);
  const performance = level(stats.성능);
  const style = level(stats.스타일);
  return {
    sparkles: (rarity - 1) * 2,
    sparkleAlternate: rarity >= MAX_STAT_LEVEL,
    speedLines: performance - 1,
    styleTier: (style - 1) as 0 | 1 | 2 | 3,
    stage,
  };
}
