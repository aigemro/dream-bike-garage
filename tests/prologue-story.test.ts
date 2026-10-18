// 프롤로그(삼촌의 프로 대회) 순수 규칙 테스트: 대본 경기 선택의 결정성·삼촌 우승·연출 조건·문구 형식
import { describe, expect, it } from 'vitest';
import { characterPixelMaps } from '../src/game/release/art-character-pixel';
import {
  PROLOGUE_COMMENTARY,
  PROLOGUE_GOAL,
  PROLOGUE_INTERVIEW,
  PROLOGUE_INTRO,
  PROLOGUE_LEAD_TAKEN_AT,
  PROLOGUE_MARGIN_MS,
  PROLOGUE_OUTRO,
  PROLOGUE_RACE,
  PROLOGUE_RIDERS,
  PROLOGUE_SPRINT_GAP_M,
  UNCLE_ID,
  buildPrologueRace,
  checkPrologueStory,
  commentaryLine,
  isPrologueStoryRace,
  proRiderById,
  simulatePrologueRace,
} from '../src/game/release/prologue-story';

// UI 팔레트 토큰과 기존 캐릭터 색(새 색 추가 금지 규칙, UI_STYLE_GUIDE 2절)
const ALLOWED_TEAM_COLORS = [0xc95746, 0x4e8092, 0x5e9a67, 0x573044, 0xf4b84a, 0x86c9c8, 0xb66f45, 0x8e5136];

describe('프롤로그 대회 대본', () => {
  const race = buildPrologueRace();
  const check = checkPrologueStory(race);

  it('항상 같은 경기를 고른다(결정성)', () => {
    const again = buildPrologueRace();
    expect(again.seed).toBe(race.seed);
    expect(again.racers).toEqual(race.racers);
  });

  it('삼촌이 우승한다', () => {
    const uncle = race.racers.find((racer) => racer.id === UNCLE_ID)!;
    expect(uncle.rank).toBe(1);
    expect(race.playerRank).toBe(1);
    expect(race.playerTimeMs).toBe(uncle.finishTimeMs);
  });

  it('오르막에서 밀렸다가 마지막 스퍼트 후반에 역전해 아슬아슬하게 이긴다', () => {
    expect(isPrologueStoryRace(check)).toBe(true);
    expect(check.rankAfterClimb).toBeGreaterThanOrEqual(3);
    expect(check.climbLeaderId).not.toBe(UNCLE_ID);
    expect(check.gapAtSprintMeters).toBeGreaterThanOrEqual(PROLOGUE_SPRINT_GAP_M.min);
    expect(check.gapAtSprintMeters).toBeLessThanOrEqual(PROLOGUE_SPRINT_GAP_M.max);
    expect(check.leadTakenAt).toBeGreaterThanOrEqual(PROLOGUE_LEAD_TAKEN_AT.min);
    expect(check.leadTakenAt).toBeLessThanOrEqual(PROLOGUE_LEAD_TAKEN_AT.max);
    expect(check.marginMs).toBeGreaterThanOrEqual(PROLOGUE_MARGIN_MS.min);
    expect(check.marginMs).toBeLessThanOrEqual(PROLOGUE_MARGIN_MS.max);
  });

  it('선수 수치는 삼촌이 대부분의 시드에서 이기는 성격을 유지한다', () => {
    let wins = 0;
    for (let seed = 1; seed <= 200; seed += 1) if (checkPrologueStory(simulatePrologueRace(seed)).uncleWins) wins += 1;
    expect(wins).toBeGreaterThanOrEqual(150);
  });

  it('중계 화면이 재생할 수 있는 타임라인이다: 8명, 진행률 0에서 시작해 1로 끝나고 줄지 않는다', () => {
    expect(race.meta).toBe(PROLOGUE_RACE);
    expect(race.racers).toHaveLength(PROLOGUE_RACE.racerCount);
    race.racers.forEach((racer) => {
      expect(racer.timeline[0]).toBe(0);
      expect(racer.timeline.at(-1)).toBe(1);
      for (let index = 1; index < racer.timeline.length; index += 1) {
        expect(racer.timeline[index]).toBeGreaterThanOrEqual(racer.timeline[index - 1]);
      }
      expect(racer.finishTimeMs).toBeGreaterThan(0);
    });
    // x1 중계 시간: 프롤로그가 늘어지지 않게 약 40~50초
    expect(race.playerTimeMs).toBeGreaterThan(35_000);
    expect(race.playerTimeMs).toBeLessThan(55_000);
  });
});

describe('프롤로그 선수 명단', () => {
  it('8명, id가 겹치지 않고 삼촌이 포함된다', () => {
    expect(PROLOGUE_RIDERS).toHaveLength(8);
    expect(new Set(PROLOGUE_RIDERS.map((rider) => rider.id)).size).toBe(8);
    expect(proRiderById(UNCLE_ID)).toBeDefined();
  });

  it('팀 색은 기존 팔레트 색만 쓰고 팀마다 다르다', () => {
    PROLOGUE_RIDERS.forEach((rider) => expect(ALLOWED_TEAM_COLORS, rider.name).toContain(rider.teamColor));
    expect(new Set(PROLOGUE_RIDERS.map((rider) => rider.teamColor)).size).toBe(PROLOGUE_RIDERS.length);
  });
});

describe('프롤로그 문구', () => {
  const allLines = [...PROLOGUE_INTRO, ...PROLOGUE_INTERVIEW, ...PROLOGUE_OUTRO];

  it('대사는 비어 있지 않고 대화창에 맞게 두 줄 이하다', () => {
    allLines.forEach((line) => {
      expect(line.text.trim().length).toBeGreaterThan(0);
      expect(line.text.split('\n').length, line.text).toBeLessThanOrEqual(2);
      line.text.split('\n').forEach((row) => expect(row.length, row).toBeLessThanOrEqual(22));
    });
  });

  it('주인공 두리가 결심하는 대사로 끝나고, 목표 카드는 본편(공방 알바)부터 안내한다', () => {
    expect(PROLOGUE_OUTRO.at(-1)?.speaker).toBe('두리');
    expect(PROLOGUE_GOAL.steps[0]).toBe('공방 알바');
    expect(PROLOGUE_GOAL.steps.at(-1)).toBe(PROLOGUE_RACE.name);
  });

  it('해설의 {leader} 자리를 선수 이름으로 채운다', () => {
    expect(commentaryLine(PROLOGUE_COMMENTARY.climb, '루카')).toContain('루카');
    expect(commentaryLine(PROLOGUE_COMMENTARY.climb, '루카')).not.toContain('{leader}');
  });
});

describe('삼촌 픽셀 캐릭터', () => {
  it('필드(28×38)·초상화(24×26) 지도는 행 길이가 같고 모든 문자가 레전드에 있다', () => {
    const { field, portrait, legend } = characterPixelMaps('삼촌');
    expect(field).toHaveLength(38);
    field.forEach((row) => expect(row).toHaveLength(28));
    expect(portrait).toHaveLength(26);
    portrait.forEach((row) => expect(row).toHaveLength(24));
    [...field, ...portrait].join('').split('').forEach((ch) => {
      if (ch !== '.') expect(legend[ch], `문자 ${ch}`).toBeDefined();
    });
  });

  it('기존 캐릭터 지도와 같은 크기 규약을 따른다', () => {
    (['정비사', '점장', '고객'] as const).forEach((role) => {
      const { field, portrait } = characterPixelMaps(role);
      expect(field[0]).toHaveLength(28);
      expect(portrait[0]).toHaveLength(24);
    });
  });
});
