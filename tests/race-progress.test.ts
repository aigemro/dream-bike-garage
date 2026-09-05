// 대회·레이스 순수 로직(시드 시뮬레이션·참가비·보상·구간) 단위 테스트
import { describe, expect, it } from 'vitest';
import type { BikeStats } from '../src/game/release/meta-progress';
import {
  RACE_SEGMENTS,
  RIVERSIDE_ENDURANCE_RACE,
  RIVERSIDE_RACE,
  applyRaceEntry,
  applyRaceReward,
  daysUntilRace,
  formatRaceTime,
  isRaceDay,
  nextRaceDay,
  progressAt,
  raceRewardForRank,
  segmentAt,
  simulateRace,
} from '../src/game/release/race-progress';

const MIN_STATS: BikeStats = { 성능: 1, 스타일: 1, 희귀도: 1 };
const MAX_STATS: BikeStats = { 성능: 4, 스타일: 4, 희귀도: 4 };

describe('대회 일정', () => {
  it('5일차마다 대회가 열린다', () => {
    expect(isRaceDay(5)).toBe(true);
    expect(isRaceDay(10)).toBe(true);
    [0, 1, 2, 3, 4, 6, 7, 11].forEach((day) => expect(isRaceDay(day), `${day}일차`).toBe(false));
  });

  it('다음 대회일은 당일을 포함해 계산한다', () => {
    expect(nextRaceDay(1)).toBe(5);
    expect(nextRaceDay(5)).toBe(5);
    expect(nextRaceDay(6)).toBe(10);
    expect(daysUntilRace(1)).toBe(4);
    expect(daysUntilRace(5)).toBe(0);
    expect(daysUntilRace(6)).toBe(4);
  });
});

describe('참가비', () => {
  it('코인이 부족하면 실패하고 코인은 변하지 않는다', () => {
    const result = applyRaceEntry(RIVERSIDE_RACE.entryFee - 1);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('coins');
    expect(result.coins).toBe(RIVERSIDE_RACE.entryFee - 1);
  });

  it('성공하면 참가비만큼 차감한다', () => {
    const result = applyRaceEntry(2480);
    expect(result.ok).toBe(true);
    expect(result.coins).toBe(2480 - RIVERSIDE_RACE.entryFee);
  });
});

describe('트랙 구간', () => {
  it('구간은 진행률 0~1을 빈틈없이 덮는다', () => {
    expect(RACE_SEGMENTS[0].from).toBe(0);
    expect(RACE_SEGMENTS[RACE_SEGMENTS.length - 1].to).toBe(1);
    for (let index = 1; index < RACE_SEGMENTS.length; index += 1) {
      expect(RACE_SEGMENTS[index].from).toBe(RACE_SEGMENTS[index - 1].to);
    }
  });

  it('진행률에 맞는 구간을 돌려주고 범위 밖은 양끝으로 고정한다', () => {
    expect(segmentAt(0).id).toBe('start');
    expect(segmentAt(0.3).id).toBe('climb');
    expect(segmentAt(0.5).id).toBe('descent');
    expect(segmentAt(0.8).id).toBe('sprint');
    expect(segmentAt(1).id).toBe('sprint');
    expect(segmentAt(-1).id).toBe('start');
    expect(segmentAt(7).id).toBe('sprint');
  });

  it('3K 챌린지는 코스 길이만 다르고 참가비·상금은 서킷과 같다', () => {
    expect(RIVERSIDE_ENDURANCE_RACE.distanceMeters).toBe(3000);
    expect(RIVERSIDE_ENDURANCE_RACE.entryFee).toBe(RIVERSIDE_RACE.entryFee);
    expect(RIVERSIDE_ENDURANCE_RACE.rankRewards).toEqual(RIVERSIDE_RACE.rankRewards);
    expect(RIVERSIDE_ENDURANCE_RACE.racerCount).toBe(RIVERSIDE_RACE.racerCount);
  });
});

describe('레이스 시뮬레이션', () => {
  const run = (seed: number, stats: BikeStats = MIN_STATS, meta = RIVERSIDE_ENDURANCE_RACE) =>
    simulateRace({ seed, playerStats: stats, meta });

  it('같은 시드는 같은 결과를 만든다 (결과 선확정 → 연출 재생 구조의 전제)', () => {
    expect(run(42)).toEqual(run(42));
  });

  it('다른 시드는 다른 기록을 만든다', () => {
    expect(run(1).playerTimeMs).not.toBe(run(2).playerTimeMs);
  });

  it('참가자는 8명이고 플레이어는 정확히 1명이며 첫 번째다', () => {
    const result = run(7);
    expect(result.racers).toHaveLength(RIVERSIDE_ENDURANCE_RACE.racerCount);
    expect(result.racers.filter((racer) => racer.isPlayer)).toHaveLength(1);
    expect(result.racers[0].isPlayer).toBe(true);
  });

  it('등수는 1~8이 중복 없이 부여되고 기록 순서와 일치한다', () => {
    const result = run(11);
    const ranks = result.racers.map((racer) => racer.rank).sort((a, b) => a - b);
    expect(ranks).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    const ordered = [...result.racers].sort((a, b) => a.rank - b.rank);
    for (let index = 1; index < ordered.length; index += 1) {
      expect(ordered[index].finishTimeMs).toBeGreaterThanOrEqual(ordered[index - 1].finishTimeMs);
    }
    expect(result.playerRank).toBe(result.racers[0].rank);
    expect(result.playerTimeMs).toBe(result.racers[0].finishTimeMs);
  });

  it('타임라인은 모두 같은 길이로 0에서 시작해 1로 끝나며 줄어들지 않는다', () => {
    const result = run(23);
    const length = result.racers[0].timeline.length;
    expect(length).toBe(result.totalTicks + 1);
    result.racers.forEach((racer) => {
      expect(racer.timeline).toHaveLength(length);
      expect(racer.timeline[0]).toBe(0);
      expect(racer.timeline[length - 1]).toBe(1);
      for (let index = 1; index < length; index += 1) {
        expect(racer.timeline[index]).toBeGreaterThanOrEqual(racer.timeline[index - 1]);
        expect(racer.timeline[index]).toBeLessThanOrEqual(1);
      }
    });
  });

  it('완주 기록은 타임라인이 1에 도달한 틱 범위 안에 있다', () => {
    const result = run(31);
    result.racers.forEach((racer) => {
      const firstFinishTick = racer.timeline.findIndex((progress) => progress >= 1);
      expect(racer.finishTimeMs).toBeGreaterThan((firstFinishTick - 1) * result.tickMs - 1e-6);
      expect(racer.finishTimeMs).toBeLessThanOrEqual(firstFinishTick * result.tickMs + 1e-6);
    });
  });

  it('오르막 구간에서는 틱당 진행량이 스타트 직선보다 작다 (속도 계수 반영)', () => {
    const result = run(5, MAX_STATS);
    const player = result.racers[0];
    const stepAt = (progress: number) => {
      const index = player.timeline.findIndex((value) => value >= progress);
      return player.timeline[index + 1] - player.timeline[index];
    };
    // 노이즈(±9%)보다 큰 계수 차이(1 → 0.72)라 평균 비교 대신 단일 틱 비교도 안정적이다
    expect(stepAt(0.05)).toBeGreaterThan(stepAt(0.3));
    expect(stepAt(0.5)).toBeGreaterThan(stepAt(0.3));
  });

  it('성장한 자전거는 같은 시드에서 더 빨리 완주하고 여러 시드 평균 등수도 높다', () => {
    let betterRankSum = 0;
    let worseRankSum = 0;
    for (let seed = 100; seed < 130; seed += 1) {
      const strong = run(seed, MAX_STATS);
      const weak = run(seed, MIN_STATS);
      expect(strong.playerTimeMs).toBeLessThan(weak.playerTimeMs);
      betterRankSum += strong.playerRank;
      worseRankSum += weak.playerRank;
    }
    expect(betterRankSum).toBeLessThan(worseRankSum);
  });

  it('1,200m 서킷은 3,000m 챌린지보다 빨리 끝난다', () => {
    expect(run(9, MIN_STATS, RIVERSIDE_RACE).totalTicks).toBeLessThan(run(9, MIN_STATS).totalTicks);
  });
});

describe('타임라인 보간', () => {
  const timeline = [0, 0.1, 0.3, 0.6, 1];

  it('정수 틱은 그대로, 소수 틱은 선형 보간한다', () => {
    expect(progressAt(timeline, 0)).toBe(0);
    expect(progressAt(timeline, 1)).toBe(0.1);
    expect(progressAt(timeline, 1.5)).toBeCloseTo(0.2);
    expect(progressAt(timeline, 2.25)).toBeCloseTo(0.375);
  });

  it('범위 밖 틱은 양끝 값으로 고정한다', () => {
    expect(progressAt(timeline, -3)).toBe(0);
    expect(progressAt(timeline, 4)).toBe(1);
    expect(progressAt(timeline, 99)).toBe(1);
  });

  it('보간 결과는 틱에 대해 단조 증가한다', () => {
    let previous = -1;
    for (let tick = 0; tick <= 5; tick += 0.1) {
      const value = progressAt(timeline, tick);
      expect(value).toBeGreaterThanOrEqual(previous);
      previous = value;
    }
  });
});

describe('보상 정산', () => {
  it('1~3위는 상금표, 그 밖은 완주 수당을 받는다', () => {
    expect(raceRewardForRank(1)).toBe(2000);
    expect(raceRewardForRank(2)).toBe(1200);
    expect(raceRewardForRank(3)).toBe(800);
    expect(raceRewardForRank(4)).toBe(200);
    expect(raceRewardForRank(8)).toBe(200);
  });

  it('applyRaceReward는 보유 코인에 보상을 더해 돌려준다', () => {
    expect(applyRaceReward(1000, 1)).toEqual({ coins: 3000, reward: 2000, rank: 1 });
    expect(applyRaceReward(1000, 6)).toEqual({ coins: 1200, reward: 200, rank: 6 });
  });

  it('3위 이내면 참가비보다 이익이고, 완주 수당만 받으면 손해다', () => {
    [1, 2, 3].forEach((rank) => expect(raceRewardForRank(rank)).toBeGreaterThan(RIVERSIDE_RACE.entryFee));
    expect(raceRewardForRank(4)).toBeLessThan(RIVERSIDE_RACE.entryFee);
  });
});

describe('기록 표기', () => {
  it('mm:ss.d 형식으로 표기한다', () => {
    expect(formatRaceTime(0)).toBe('00:00.0');
    expect(formatRaceTime(65_400)).toBe('01:05.4');
    expect(formatRaceTime(600_000)).toBe('10:00.0');
  });
});

describe('결승 시각 보간', () => {
  it('마지막 불완전 틱도 실제 결승 시각에 맞춰 끝난다', () => {
    expect(progressAt([0, 0.8, 1, 1], 1.25, 1.5)).toBeCloseTo(0.9);
    expect(progressAt([0, 0.8, 1, 1], 1.5, 1.5)).toBe(1);
    expect(progressAt([0, 0.8, 1, 1], 1.4, 1.5)).toBeLessThan(1);
  });
  it('모든 참가자가 기록상 결승 시각에 완주한다', () => {
    const result = simulateRace({ seed: 0, playerStats: MIN_STATS, meta: RIVERSIDE_ENDURANCE_RACE });
    for (const racer of result.racers) {
      const finishTick = racer.finishTimeMs / result.tickMs;
      expect(progressAt(racer.timeline, finishTick - 0.001, finishTick)).toBeLessThan(1);
      expect(progressAt(racer.timeline, finishTick, finishTick)).toBe(1);
    }
  });
});
