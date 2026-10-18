// 알바 체력 소진 안내 규칙 (Lab #263 A안 재구현 · 순수 로직, Phaser 비의존)
// 체력이 바닥나고 무료 상자도 없으면 상자를 열 수 없습니다. 이때 화면은 소진 안내 카드로
// 다음 +1·가득 참까지 남은 시간과 '합성은 체력 없이 계속할 수 있음'을 알려 줍니다.
// 보상형 광고 충전(#92)은 이 카드에 버튼을 더하는 방식으로 연결합니다.
import { ENERGY_MAX, ENERGY_RECOVERY_MS, type WorkbenchState } from './merge-workbench';

/** 상자를 열 수 없는 체력 소진 상태(체력 0, 무료 상자도 없음) */
export function isEnergyEmpty(state: Pick<WorkbenchState, 'energy' | 'freeBoxes'>): boolean {
  return state.energy < 1 && state.freeBoxes < 1;
}

/**
 * 체력이 가득 찰 때까지 남은 시간(ms). 가득 차 있으면 0.
 * energyAnchor는 마지막 회복 기준 시각이라, 다음 +1까지 남은 시간에 나머지 칸의 회복 시간을 더한 값과 같습니다.
 */
export function msUntilFullEnergy(state: Pick<WorkbenchState, 'energy' | 'energyAnchor'>, now: number): number {
  if (state.energy >= ENERGY_MAX) return 0;
  const sinceAnchor = Math.max(0, now - state.energyAnchor);
  return Math.max(0, (ENERGY_MAX - state.energy) * ENERGY_RECOVERY_MS - sinceAnchor);
}

/** 남은 시간을 'N시간 M분' 또는 'M분'으로 표시합니다(분 단위 올림). */
export function formatDuration(ms: number): string {
  const minutes = Math.ceil(Math.max(0, ms) / 60_000);
  const hours = Math.floor(minutes / 60);
  return hours > 0 ? `${hours}시간 ${minutes % 60}분` : `${minutes}분`;
}

// ── 보상형 광고 체력 충전 (#92 초안 수치) ──
// 광고 SDK는 플랫폼 어댑터(src/platform)에만 두고, 이 모듈은 '지금 광고 충전을 제안할 수 있는지'와
// '보상 1회를 어떻게 반영하는지'만 정합니다. 횟수는 게임 Day가 아니라 기기 날짜로 셉니다.

/** 광고 충전 정책. 광고를 켜고 끄는 것은 플랫폼(광고 지원 여부)이 정하고, 수치는 여기서만 바꿉니다. */
export const REWARDED_AD_POLICY = {
  /** 광고 1회 충전량 */
  amount: 10,
  /** 기기 날짜 기준 하루 횟수 */
  perDay: 3,
  /** 체력이 이 값 이하일 때만 제안(충전량이 최대치를 넘어 버려지지 않게) */
  maxEnergy: ENERGY_MAX - 10,
  /** 마지막 충전 뒤 다음 충전까지 간격 */
  cooldownMs: 10 * 60 * 1000,
} as const;

/**
 * 광고 충전 기록. 체력과 같은 저장 항목(release)에 두어 보상 1회가 한 번의 저장으로 함께 기록됩니다.
 * - date: 횟수를 센 기기 날짜(YYYY-MM-DD)
 * - lastRewardAt: 마지막 보상 시각(ms). 충전 간격 계산용
 * - lastRequestId: 마지막으로 보상한 광고 요청 식별자. 같은 요청의 보상 이벤트가 두 번 와도 한 번만 반영
 */
export type AdRefillRecord = { date: string; count: number; lastRewardAt: number | null; lastRequestId: string | null };

export type AdOfferBlock = 'energy-high' | 'daily-limit' | 'cooldown';
export type AdOffer = { available: boolean; block: AdOfferBlock | null; left: number; cooldownMs: number };

/** 기기 날짜(YYYY-MM-DD). 하루 횟수 초기화 기준입니다. */
export function localDateKey(now: number): string {
  const date = new Date(now);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * 오늘 쓴 횟수. 기록 날짜보다 오늘이 뒤일 때만 0으로 봅니다.
 * 기기 시계를 과거로 돌려도 횟수가 초기화되지 않게 하기 위해서입니다(날짜를 앞으로 돌리는 것은 막을 수 없음).
 */
function countToday(record: AdRefillRecord | null, today: string): number {
  if (!record) return 0;
  return today > record.date ? 0 : record.count;
}

/** 다음 충전까지 남은 간격(ms). 시계가 뒤로 가도 간격 한 번보다 길게 기다리게 하지 않습니다. */
function cooldownLeft(record: AdRefillRecord | null, now: number): number {
  if (!record || record.lastRewardAt === null) return 0;
  const left = record.lastRewardAt + REWARDED_AD_POLICY.cooldownMs - now;
  return Math.min(REWARDED_AD_POLICY.cooldownMs, Math.max(0, left));
}

/** 지금 광고 충전을 제안할 수 있는지와 막힌 이유. 막힌 이유가 여러 개면 하루 횟수 → 간격 → 체력 순으로 알립니다. */
export function adOffer(state: Pick<WorkbenchState, 'energy'>, record: AdRefillRecord | null, now: number): AdOffer {
  const left = Math.max(0, REWARDED_AD_POLICY.perDay - countToday(record, localDateKey(now)));
  const cooldownMs = cooldownLeft(record, now);
  const block: AdOfferBlock | null = left <= 0 ? 'daily-limit'
    : cooldownMs > 0 ? 'cooldown'
      : state.energy > REWARDED_AD_POLICY.maxEnergy ? 'energy-high'
        : null;
  return { available: block === null, block, left, cooldownMs };
}

/**
 * 광고 보상 1회를 반영합니다. SDK의 보상 이벤트(userEarnedReward)를 받았을 때만 부릅니다.
 * - 같은 요청 식별자는 한 번만 반영합니다(중복 이벤트·재진입 방어).
 * - 체력은 최대치를 넘지 않고, 가득 차면 회복 기준 시각을 지금으로 옮깁니다.
 * - 광고를 보는 사이 조건(체력·간격)이 바뀌었어도 시청한 보상은 지급합니다. 하루 횟수만은 넘기지 않습니다.
 * 반영했으면 새 기록, 반영하지 않았으면 null을 돌려줍니다. state는 제자리에서 바뀝니다.
 */
export function grantAdRefill(
  state: Pick<WorkbenchState, 'energy' | 'energyAnchor'>,
  record: AdRefillRecord | null,
  requestId: string,
  now: number,
): AdRefillRecord | null {
  if (!requestId || record?.lastRequestId === requestId) return null;
  const today = localDateKey(now);
  const used = countToday(record, today);
  if (used >= REWARDED_AD_POLICY.perDay) return null;
  state.energy = Math.min(ENERGY_MAX, Math.max(0, state.energy) + REWARDED_AD_POLICY.amount);
  if (state.energy >= ENERGY_MAX) state.energyAnchor = now;
  return { date: record && record.date > today ? record.date : today, count: used + 1, lastRewardAt: now, lastRequestId: requestId };
}

/** 저장된 광고 충전 기록을 복구합니다. 손상됐으면 기록 없음(null)으로 봅니다. */
export function parseAdRefillRecord(value: unknown): AdRefillRecord | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Partial<AdRefillRecord>;
  const count = (n: unknown): n is number => typeof n === 'number' && Number.isSafeInteger(n) && n >= 0;
  if (typeof record.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(record.date) || !count(record.count)) return null;
  if (record.lastRewardAt !== null && !count(record.lastRewardAt)) return null;
  if (record.lastRequestId !== null && typeof record.lastRequestId !== 'string') return null;
  return { date: record.date, count: record.count, lastRewardAt: record.lastRewardAt ?? null, lastRequestId: record.lastRequestId ?? null };
}

// ── 첫 대회 전 정산 지원 (#77 (e)안) ──
// 1~5일차 체력 소모(약 74)가 한 통(30) + 광고(+10 × 3)보다 커서 첫 대회까지 몇 시간을 기다려야 했습니다.
// 첫 대회 전날까지는 Day를 정산할 때 체력을 가득 채워, 처음 접속한 플레이어가 대기 없이 첫 대회까지 가게 합니다.
// 그 뒤 Day는 현행 회복(10분당 1)만 적용해 '한 번 접속 = 하루 영업' 리듬과 경제는 그대로 둡니다.
// 근거: docs/development/MERGE_WORKBENCH_DAY_SESSION.md 10절 '체력 조정안 비교'

/** 정산 지원을 받는 마지막 영업일. 첫 대회(5일차)의 전날입니다. */
export const SETTLEMENT_REFILL_LAST_DAY = 4;

/** 이 영업일을 정산하면 체력을 가득 채우는지 */
export function hasSettlementRefill(dayNumber: number): boolean {
  return Number.isInteger(dayNumber) && dayNumber >= 1 && dayNumber <= SETTLEMENT_REFILL_LAST_DAY;
}

/**
 * 정산한 영업일이 지원 구간이면 체력을 최대치로 채우고 회복 기준 시각을 지금으로 옮깁니다.
 * 가득 채우기라 여러 번 불려도 결과가 같습니다. 채운 양을 돌려주며, 지원 구간이 아니거나 이미 가득이면 0입니다.
 */
export function applySettlementRefill(state: Pick<WorkbenchState, 'energy' | 'energyAnchor'>, dayNumber: number, now: number): number {
  if (!hasSettlementRefill(dayNumber)) return 0;
  const added = Math.max(0, ENERGY_MAX - state.energy);
  state.energy = ENERGY_MAX;
  state.energyAnchor = now;
  return added;
}
