// 알바 체력 조정안 비교 시뮬레이션 (기획 결정 #77 참고용 · 게임 코드 수치는 바꾸지 않음)
// 실행: npx vite-node scripts/energy-tuning-sim.ts [반복 횟수=300] [행동당 초=2]
//
// 1단계(보드): src/domain/merge-workbench.ts 규칙 그대로 탐욕 봇이 1~15일차 주문 45건을 납품합니다.
//   봇: 필요한 부품부터 합성 → 합성할 것이 없으면 확정 상자(같은 종류 Lv.1 옆) → 무료 상자 → 체력 상자.
//   보드가 차고 합성할 것이 없으면 가장 덜 필요한 부품을 반품합니다.
//   봇의 선택은 체력과 무관하므로, 행동 기록(체력 소모 여부·Day 경계)을 한 번 만들고 모든 안에 똑같이 재생합니다(같은 난수 비교).
// 2단계(시간): 행동 기록을 안별 체력 규칙(최대치·회복 간격·정산 회복·광고)으로 재생해 대기·플레이 시간을 잽니다.
import {
  WORKBENCH_PART_TYPES,
  canMerge,
  createWorkbench,
  discardPart,
  mergeParts,
  neighbors,
  nextIntakeSlot,
  openPartBox,
  orderIndexOf,
  orderListOf,
  placePickBox,
  ENERGY_MAX,
  type WorkbenchEvent,
  type WorkbenchPartType,
  type WorkbenchState,
} from '../src/domain/merge-workbench';
import { REWARDED_AD_POLICY } from '../src/domain/energy-refill';
import { buildOrderSchedule } from '../src/domain/progression';
import { LEVEL_DESIGN } from '../src/data/level-design';

const RUNS = Number(process.argv[2] ?? 300);
const DAYS = 15;
const ORDERS_PER_DAY = 3;
const RACE_DAY = 5;
const LOOKAHEAD = 6;

// 시간 가정(초)
const ACTION_SEC = Number(process.argv[3] ?? 2); // 합성·상자·반품 1회
const DAY_TRANSITION_SEC = 20; // 정산 화면 → 다음 Day 시작
const AD_SEC = 30; // 보상형 광고 1편
// 비교 당시(2026-10-18) #92 초안의 광고 제한. 이후 제한을 없앴지만(REWARDED_AD_POLICY) 비교표 재현을 위해 여기 고정합니다.
const AD_PER_DAY = 3;
const AD_COOLDOWN_SEC = 10 * 60;

const schedule = buildOrderSchedule(LEVEL_DESIGN).workbench;
const orderList = orderListOf(schedule);
const specAt = (order: number) => orderList[orderIndexOf(order, schedule)];

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── 1단계: 탐욕 봇 ──
type Step = { cost: 0 | 1; dayEnded: number | null };

/** 이번 주문에서 아직 장착하지 않은 종류와 요구 레벨 */
function neededNow(state: WorkbenchState): Partial<Record<WorkbenchPartType, number>> {
  const spec = specAt(state.order);
  const result: Partial<Record<WorkbenchPartType, number>> = {};
  WORKBENCH_PART_TYPES.forEach((type) => { if (!state.installed[type]) result[type] = spec.levels[type]; });
  return result;
}

/** 이번 주문 + 다음 LOOKAHEAD건에서 종류별 최대 요구 레벨 */
function maxUpcoming(state: WorkbenchState): Record<WorkbenchPartType, number> {
  const result = { frame: 0, wheel: 0, drivetrain: 0, handlebar: 0 };
  for (let k = 0; k <= LOOKAHEAD; k += 1) {
    const spec = specAt(state.order + k);
    WORKBENCH_PART_TYPES.forEach((type) => { result[type] = Math.max(result[type], spec.levels[type]); });
  }
  return result;
}

const emptyCount = (state: WorkbenchState) => state.board.filter((cell) => !cell).length;

function chooseMerge(state: WorkbenchState): [number, number] | null {
  const need = neededNow(state);
  const upcoming = maxUpcoming(state);
  const crowded = emptyCount(state) <= 2;
  let best: [number, number] | null = null;
  let bestScore = -Infinity;
  state.board.forEach((part, from) => {
    if (!part) return;
    neighbors(from).forEach((to) => {
      if (!canMerge(state.board, from, to)) return;
      const required = need[part.type];
      let score: number;
      if (required !== undefined && part.level < required) score = 100 + part.level * 10;
      else if (part.level + 1 <= upcoming[part.type]) score = 50 + part.level;
      else if (crowded) score = 1;
      else return;
      // 합성 결과 칸 옆에 같은 종류·한 단계 위 부품이 있으면 이어서 합성할 수 있습니다.
      const chain = neighbors(to).some((cell) => cell !== from && state.board[cell]?.type === part.type && state.board[cell]?.level === part.level + 1);
      if (chain) score += 5;
      if (score > bestScore) { bestScore = score; best = [from, to]; }
    });
  });
  return best;
}

function choosePick(state: WorkbenchState): [WorkbenchPartType, number] | null {
  const need = neededNow(state);
  const types = (Object.keys(need) as WorkbenchPartType[]).sort((a, b) => need[a]! - need[b]!);
  const fallback = nextIntakeSlot(state.board);
  if (fallback < 0) return null;
  // 요구 Lv.1이면 놓자마자 장착됩니다.
  const direct = types.find((type) => need[type] === 1);
  if (direct) return [direct, fallback];
  // 같은 종류 Lv.1 옆 빈칸
  for (const type of [...types].reverse()) {
    for (let index = 0; index < state.board.length; index += 1) {
      const part = state.board[index];
      if (part?.type !== type || part.level !== 1) continue;
      const cell = neighbors(index).find((n) => !state.board[n]);
      if (cell !== undefined) return [type, cell];
    }
  }
  return types.length ? [types[types.length - 1], fallback] : null;
}

function chooseDiscard(state: WorkbenchState): number {
  const need = neededNow(state);
  const upcoming = maxUpcoming(state);
  let best = -1;
  let bestScore = Infinity;
  state.board.forEach((part, index) => {
    if (!part) return;
    const score = (need[part.type] !== undefined ? 100 : 0) + (part.level <= upcoming[part.type] ? 10 : 0) + part.level;
    if (score < bestScore) { bestScore = score; best = index; }
  });
  return best;
}

type Trace = { steps: Step[]; freeBoxes: number; pickBoxes: number; discards: number };

function playTrace(seed: number): Trace {
  const rng = mulberry32(seed);
  const state = createWorkbench(schedule, 0);
  const steps: Step[] = [];
  let freeBoxes = 0;
  let pickBoxes = 0;
  let discards = 0;
  const record = (cost: 0 | 1, events: WorkbenchEvent[]) => {
    events.forEach((event) => {
      if (event.type === 'bonus') { if (event.bonus === 'free-box') freeBoxes += 1; else pickBoxes += 1; }
    });
    const delivered = events.find((event) => event.type === 'delivered');
    const dayEnded = delivered && delivered.type === 'delivered' && (delivered.order + 1) % ORDERS_PER_DAY === 0 ? (delivered.order + 1) / ORDERS_PER_DAY : null;
    steps.push({ cost, dayEnded });
  };
  // 시작 보드에서 이미 납품된 주문은 없지만, 안전하게 순번으로 끝을 판단합니다.
  for (let guard = 0; state.order < DAYS * ORDERS_PER_DAY; guard += 1) {
    if (guard > 20000) throw new Error(`봇이 멈췄습니다(seed ${seed}, 순번 ${state.order})`);
    const merge = chooseMerge(state);
    if (merge) { record(0, mergeParts(state, schedule, merge[0], merge[1])!); continue; }
    if (nextIntakeSlot(state.board) < 0) { discardPart(state, chooseDiscard(state)); discards += 1; steps.push({ cost: 0, dayEnded: null }); continue; }
    if (state.pickBoxes > 0) {
      const pick = choosePick(state);
      if (pick) { record(0, placePickBox(state, schedule, pick[0], pick[1])!); continue; }
    }
    // 체력은 2단계에서 따로 셉니다. 도메인 체력은 항상 가득 채워 두고 무료 상자 사용 여부만 기록합니다.
    state.energy = ENERGY_MAX;
    state.energyAnchor = 0;
    const events = openPartBox(state, schedule, 0, rng)!;
    const placed = events[0];
    record(placed.type === 'placed' && placed.free ? 0 : 1, events);
  }
  return { steps, freeBoxes, pickBoxes, discards };
}

// ── 2단계: 체력 규칙 재생 ──
type Variant = {
  key: string;
  label: string;
  max: number;
  recoveryMin: (day: number) => number;
  /** Day d 정산 때 더하는 체력(최대치까지). 'full'이면 가득 채움 */
  settleBonus: (day: number) => number | 'full';
};

const MIN = 60;
const variants: Variant[] = [
  { key: 'a', label: '(a) 현행 30 · 10분', max: 30, recoveryMin: () => 10, settleBonus: () => 0 },
  { key: 'b10', label: '(b) 정산 +10', max: 30, recoveryMin: () => 10, settleBonus: () => 10 },
  { key: 'b15', label: '(b) 정산 +15', max: 30, recoveryMin: () => 10, settleBonus: () => 15 },
  { key: 'c40', label: '(c) 최대 40', max: 40, recoveryMin: () => 10, settleBonus: () => 0 },
  { key: 'c50', label: '(c) 최대 50', max: 50, recoveryMin: () => 10, settleBonus: () => 0 },
  { key: 'd', label: '(d) 1챕터만 5분 회복', max: 30, recoveryMin: (day) => (day <= 5 ? 5 : 10), settleBonus: () => 0 },
  { key: 'e', label: '(e) 첫 대회 전 정산 시 가득', max: 30, recoveryMin: () => 10, settleBonus: (day) => (day < RACE_DAY ? 'full' : 0) },
];

type Replay = {
  waitByDay: number[]; // Day d 끝까지 누적 대기(초)
  timeByDay: number[]; // Day d 끝까지 누적 시간(초)
  firstEmptyDay: number | null; // 처음 체력 0으로 대기·광고를 만난 Day
  ads: number;
};

/**
 * 행동 기록을 재생합니다. startDay~endDay 구간만, 시작 체력 startEnergy(기본 최대치)로.
 * 광고 켬: 체력 표시 옆 표식이 뜨면(최대치 − 10 이하 · 10분 간격 · 하루 3회) 바로 봅니다(최선의 플레이어). 한 번의 연속 플레이는 같은 기기 날짜로 봅니다.
 */
function replay(steps: Step[], variant: Variant, ads: boolean, startDay = 1, endDay = DAYS): Replay {
  const period = (day: number) => variant.recoveryMin(day) * MIN;
  const adMaxEnergy = variant.max - REWARDED_AD_POLICY.amount;
  let t = 0;
  let energy = variant.max;
  let anchor = 0;
  let wait = 0;
  let adCount = 0;
  let lastAd = -Infinity;
  let day = 1;
  let firstEmptyDay: number | null = null;
  const waitByDay: number[] = [];
  const timeByDay: number[] = [];
  const recover = () => {
    if (energy >= variant.max) { anchor = t; return; }
    const ticks = Math.floor((t - anchor) / period(day));
    energy = Math.min(variant.max, energy + ticks);
    anchor = energy >= variant.max ? t : anchor + ticks * period(day);
  };
  const adReadyAt = () => (ads && adCount < AD_PER_DAY ? Math.max(t, lastAd + AD_COOLDOWN_SEC) : Infinity);
  const watchAd = () => {
    t += AD_SEC;
    recover();
    adCount += 1;
    lastAd = t;
    energy = Math.min(variant.max, energy + REWARDED_AD_POLICY.amount);
    if (energy >= variant.max) anchor = t;
  };
  for (const step of steps) {
    if (day < startDay) { if (step.dayEnded) day = step.dayEnded + 1; continue; }
    if (day > endDay) break;
    if (step.cost === 1) {
      recover();
      if (ads && energy <= adMaxEnergy && adReadyAt() <= t) watchAd();
      while (energy < 1) {
        if (firstEmptyDay === null) firstEmptyDay = day;
        const tickAt = anchor + period(day);
        const adAt = adReadyAt();
        const next = Math.min(tickAt, adAt);
        wait += next - t;
        t = next;
        if (adAt <= tickAt) watchAd(); else recover();
      }
      if (energy >= variant.max) anchor = t;
      energy -= 1;
    }
    t += ACTION_SEC;
    if (step.dayEnded) {
      waitByDay[step.dayEnded] = wait;
      timeByDay[step.dayEnded] = t;
      t += DAY_TRANSITION_SEC;
      recover();
      const bonus = variant.settleBonus(step.dayEnded);
      energy = bonus === 'full' ? variant.max : Math.min(variant.max, energy + bonus);
      if (energy >= variant.max) anchor = t;
      day = step.dayEnded + 1;
    }
  }
  return { waitByDay, timeByDay, firstEmptyDay, ads: adCount };
}

// ── 집계 ──
const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
const quantile = (values: number[], q: number) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] ?? 0;
};
const fmt = (value: number, digits = 0) => value.toFixed(digits);

const traces = Array.from({ length: RUNS }, (_, run) => playTrace(1000 + run));

// 일차별 체력 소모
const costByDay = traces.map((trace) => {
  const costs = Array(DAYS + 1).fill(0);
  let day = 1;
  trace.steps.forEach((step) => {
    costs[day] += step.cost;
    if (step.dayEnded) day = step.dayEnded + 1;
  });
  return costs;
});
const ch1Costs = costByDay.map((costs) => costs.slice(1, RACE_DAY + 1).reduce((a, b) => a + b, 0));
console.log(`반복 ${RUNS}회 · 행동 ${ACTION_SEC}초 · 정산 전환 ${DAY_TRANSITION_SEC}초 · 광고 ${AD_SEC}초`);
console.log(`1~5일차 체력 소모 평균 ${fmt(mean(ch1Costs), 1)} · 상위 10% ${quantile(ch1Costs, 0.9)} · 무료 상자 ${fmt(mean(traces.map((t) => t.freeBoxes)), 1)}(15일) · 확정 상자 ${fmt(mean(traces.map((t) => t.pickBoxes)), 1)}(15일) · 반품 ${fmt(mean(traces.map((t) => t.discards)), 1)}(15일)`);
console.log('일차별 체력 소모 평균(p90): ' + Array.from({ length: DAYS }, (_, i) => {
  const values = costByDay.map((costs) => costs[i + 1]);
  return `D${i + 1} ${fmt(mean(values), 1)}(${quantile(values, 0.9)})`;
}).join(' · '));

console.log('\n## 첫 대회(Day 5 주문 3건 납품)까지 연속 플레이');
console.log('| 안 | 광고 | 대기 평균(분) | 대기 상위 10%(분) | 대기 0 비율 | 총 플레이 평균(분) | 처음 체력 0을 만나는 Day(중앙값) | 1챕터에서 체력 0 경험 |');
console.log('|---|---|---|---|---|---|---|---|');
for (const variant of variants) {
  for (const ads of [false, true]) {
    const results = traces.map((trace) => replay(trace.steps, variant, ads, 1, RACE_DAY));
    const waits = results.map((r) => r.waitByDay[RACE_DAY] / MIN);
    const times = results.map((r) => r.timeByDay[RACE_DAY] / MIN);
    const empties = results.map((r) => r.firstEmptyDay).filter((d): d is number => d !== null);
    console.log(`| ${variant.label} | ${ads ? '켬' : '끔'} | ${fmt(mean(waits))} | ${fmt(quantile(waits, 0.9))} | ${fmt(100 * waits.filter((w) => w === 0).length / RUNS)}% | ${fmt(mean(times))} | ${empties.length ? `Day ${quantile(empties, 0.5)}` : '—'} | ${fmt(100 * empties.length / RUNS)}% |`);
  }
}

console.log('\n## 이후 챕터(Day 6~15)');
console.log('- 하루 1회 접속(전날 끝나고 가득 찬 상태로 시작, 광고 끔): 하루 여유 = 시작 체력 − 그날 소모');
console.log('| 안 | 시작 체력 | 하루 소모 평균 | 하루 여유 평균 | 여유 최저(p10) | 한 번에 못 끝내는 날 비율 | 그런 날 평균 대기(분) | Day 6→15 연속 플레이 대기(분, 광고 끔) | Day 1부터 연속 플레이 시 첫 대기 Day(중앙값, 광고 끔) |');
console.log('|---|---|---|---|---|---|---|---|---|');
for (const variant of variants) {
  const dailyCosts: number[] = [];
  const dailyWaits: number[] = [];
  traces.forEach((trace, run) => {
    for (let day = RACE_DAY + 1; day <= DAYS; day += 1) {
      dailyCosts.push(costByDay[run][day]);
      const r = replay(trace.steps, variant, false, day, day);
      dailyWaits.push((r.waitByDay[day] ?? 0) / MIN);
    }
  });
  const margins = dailyCosts.map((cost) => variant.max - cost);
  const blocked = dailyWaits.filter((w) => w > 0);
  const binge = traces.map((trace) => {
    const r = replay(trace.steps, variant, false, RACE_DAY + 1, DAYS);
    return r.waitByDay[DAYS] / MIN;
  });
  const firstWait = traces.map((trace) => replay(trace.steps, variant, false, 1, DAYS).firstEmptyDay ?? DAYS + 1);
  console.log(`| ${variant.label} | ${variant.max} | ${fmt(mean(dailyCosts), 1)} | ${fmt(mean(margins), 1)} | ${fmt(quantile(margins, 0.1))} | ${fmt(100 * blocked.length / dailyWaits.length)}% | ${fmt(mean(blocked))} | ${fmt(mean(binge))} | Day ${quantile(firstWait, 0.5)} |`);
}
