import type { BikeStats } from './meta-progress';
import { dreamStage } from './meta-progress';
import type { BikeCategory } from './bike-pixel-sprite';

export type RaceSegmentId = 'start' | 'climb' | 'descent' | 'sprint';
export type RaceSegment = { id: RaceSegmentId; name: string; from: number; to: number; speedFactor: number };
export const RACE_SEGMENTS: RaceSegment[] = [
  { id: 'start', name: '스타트 직선', from: 0, to: 0.25, speedFactor: 1 },
  { id: 'climb', name: '오르막', from: 0.25, to: 0.45, speedFactor: 0.72 },
  { id: 'descent', name: '내리막', from: 0.45, to: 0.65, speedFactor: 1.3 },
  { id: 'sprint', name: '피니시 스퍼트', from: 0.65, to: 1, speedFactor: 1.1 },
];
export function segmentAt(progress: number) { const p = Math.min(Math.max(progress, 0), 1); return RACE_SEGMENTS.find((s) => p < s.to) ?? RACE_SEGMENTS[RACE_SEGMENTS.length - 1]; }
export type RaceMeta = { id: string; name: string; heldEveryDays: number; entryFee: number; distanceMeters: number; racerCount: number; rankRewards: number[]; finishReward: number };
export const RIVERSIDE_RACE: RaceMeta = { id: 'riverside-circuit', name: '리버사이드 서킷', heldEveryDays: 5, entryFee: 500, distanceMeters: 1200, racerCount: 8, rankRewards: [2000, 1200, 800], finishReward: 200 };
export const RIVERSIDE_ENDURANCE_RACE: RaceMeta = { ...RIVERSIDE_RACE, id: 'riverside-endurance-3k', name: '리버사이드 3K 챌린지', distanceMeters: 3000 };
export function isRaceDay(day: number, meta = RIVERSIDE_RACE) { return day > 0 && day % meta.heldEveryDays === 0; }
export function nextRaceDay(day: number, meta = RIVERSIDE_RACE) { const base = Math.max(1, day); return Math.ceil(base / meta.heldEveryDays) * meta.heldEveryDays; }
export function daysUntilRace(day: number, meta = RIVERSIDE_RACE) { return nextRaceDay(day, meta) - Math.max(1, day); }
export function applyRaceEntry(coins: number, meta = RIVERSIDE_RACE) { return coins < meta.entryFee ? { ok: false as const, reason: 'coins' as const, coins, entryFee: meta.entryFee } : { ok: true as const, coins: coins - meta.entryFee, entryFee: meta.entryFee }; }
function randomFor(seed: number) { let state = seed >>> 0; return () => { state = (state + 0x6d2b79f5) >>> 0; let t = state; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function speed(stats: BikeStats) { return 17 + stats.성능 * 2.5 + dreamStage(stats) * 1.5; }
type Npc = { name: string; category: BikeCategory; frameColor: number };
const NPCS: Npc[] = [
  { name: '강변의 지호', category: 'road', frameColor: 0x4e8092 }, { name: '언덕왕 미소', category: 'mtb', frameColor: 0x5e9a67 },
  { name: '자갈길 서준', category: 'gravel', frameColor: 0xb98a4e }, { name: '골목의 하나', category: 'minivelo', frameColor: 0xf4b84a },
  { name: '출근왕 도윤', category: 'city', frameColor: 0x573044 }, { name: '바람잡이 유나', category: 'road', frameColor: 0x86ba6f }, { name: '정비소 삼촌', category: 'mtb', frameColor: 0x8e5136 },
];
export type RacerResult = { id: string; name: string; isPlayer: boolean; category: BikeCategory; frameColor: number; speedScore: number; rank: number; finishTimeMs: number; timeline: number[] };
export type RaceResult = { meta: RaceMeta; seed: number; tickMs: number; totalTicks: number; racers: RacerResult[]; playerRank: number; playerTimeMs: number };
export function simulateRace(input: { seed: number; playerName?: string; playerStats: BikeStats; playerCategory?: BikeCategory; playerFrameColor?: number; meta?: RaceMeta }): RaceResult {
  const meta = input.meta ?? RIVERSIDE_RACE; const rnd = randomFor(input.seed); const tickMs = 600;
  const runners = [{ id: 'player', name: input.playerName ?? '나', isPlayer: true, category: input.playerCategory ?? 'road' as BikeCategory, frameColor: input.playerFrameColor ?? 0xc95746, speedScore: speed(input.playerStats), distance: 0, finish: null as number | null, timeline: [0] }, ...NPCS.slice(0, meta.racerCount - 1).map((n, i) => ({ id: `npc-${i}`, name: n.name, isPlayer: false, category: n.category, frameColor: n.frameColor, speedScore: 20.5 + rnd() * 9, distance: 0, finish: null as number | null, timeline: [0] }))];
  let tick = 0; while (tick < 240 && runners.some((r) => r.finish === null)) { tick++; runners.forEach((r) => { if (r.finish !== null) { r.timeline.push(1); return; } const step = r.speedScore * segmentAt(r.distance / meta.distanceMeters).speedFactor * (1 + (rnd() * 2 - 1) * 0.09); const before = r.distance; r.distance = Math.min(meta.distanceMeters, r.distance + step); if (r.distance >= meta.distanceMeters) { r.finish = Math.round((tick - 1 + (meta.distanceMeters - before) / step) * tickMs); r.timeline.push(1); } else r.timeline.push(r.distance / meta.distanceMeters); }); }
  runners.forEach((r) => { if (r.finish === null) r.finish = tick * tickMs; }); const ordered = [...runners].sort((a, b) => a.finish! - b.finish!); const ranks = new Map(ordered.map((r, i) => [r.id, i + 1])); const racers = runners.map((r) => ({ id: r.id, name: r.name, isPlayer: r.isPlayer, category: r.category, frameColor: r.frameColor, speedScore: r.speedScore, rank: ranks.get(r.id)!, finishTimeMs: r.finish!, timeline: r.timeline })); const player = racers[0]; return { meta, seed: input.seed, tickMs, totalTicks: tick, racers, playerRank: player.rank, playerTimeMs: player.finishTimeMs };
}
export function progressAt(timeline: number[], tick: number, finishTick?: number) {
  if (tick <= 0) return timeline[0] ?? 0;
  if (finishTick !== undefined && tick >= finishTick) return 1;
  const i = Math.floor(tick);
  if (i >= timeline.length - 1) return timeline[timeline.length - 1] ?? 1;
  // 마지막 틱은 실제 결승 시각까지 보간해 HUD 시계와 결승 통과를 맞춥니다.
  const endTick = finishTick !== undefined && finishTick > i && finishTick < i + 1 ? finishTick : i + 1;
  const f = (tick - i) / (endTick - i);
  return timeline[i] + (timeline[i + 1] - timeline[i]) * f;
}
export function raceRewardForRank(rank: number, meta = RIVERSIDE_RACE) { return meta.rankRewards[rank - 1] ?? meta.finishReward; }
export function applyRaceReward(coins: number, rank: number, meta = RIVERSIDE_RACE) { const reward = raceRewardForRank(rank, meta); return { coins: coins + reward, reward, rank }; }
export function formatRaceTime(ms: number) { const s = ms / 1000; const m = Math.floor(s / 60); return `${String(m).padStart(2, '0')}:${(s - m * 60).toFixed(1).padStart(4, '0')}`; }
