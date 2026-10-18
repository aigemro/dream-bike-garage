// 프롤로그: 삼촌의 프로 대회 (순수 데이터·규칙 · Phaser 비의존)
// 처음 게임을 시작하면 주인공(두리)이 아니라 프로 선수인 삼촌이 달리는 대회를 먼저 중계로 보여 주고,
// 삼촌의 우승을 본 두리가 그 대회를 목표로 자전거 공방 알바를 시작하는 데서 본편이 이어집니다.
// - 대회·팀·선수 이름은 모두 가상입니다(실제 브랜드·팀·대회 요소는 라이선스 검토 전까지 쓰지 않음, GAME_CONCEPT 6절).
// - 결과는 연출 대본이라 항상 삼촌이 우승합니다. 시드 시뮬레이션 중 '오르막에서 밀렸다가 마지막 600m에 2위로 추격,
//   결승 300m 안쪽에서 역전해 0.5초 안쪽으로 이기는' 경기를 결정적으로 골라 같은 레이스 중계 화면(race-cinematic-broadcast)이
//   재생합니다. 막판 연출(역전 컷인·사진 판정)의 시점은 race-climax가 이 타임라인에서 읽습니다.
// - 문구는 기획 확정 전 가안입니다. 화면 코드는 이 파일의 문구만 읽으므로 여기만 고치면 됩니다.
import type { PixelCharacterEmotion } from './art-character-pixel';
import type { BikeCategory } from './bike-pixel-sprite';
import { finalStretchFrom, leadTakenProgress, standingsAt } from './race-climax';
import { randomFor, segmentAt, type RaceMeta, type RaceResult, type RaceSegmentId } from './race-progress';

/** 프롤로그 대회: 프로 대회의 마지막 3km를 중계합니다(참가비·상금 없음). */
export const PROLOGUE_RACE: RaceMeta = {
  id: 'grand-river-classic',
  name: '그랑 리버 클래식',
  heldEveryDays: 0,
  entryFee: 0,
  distanceMeters: 3000,
  racerCount: 8,
  rankRewards: [],
  finishReward: 0,
};

export const UNCLE_ID = 'uncle';
/** 삼촌의 선수 이름 (가안) */
export const UNCLE_NAME = '한바람';
/** 삼촌의 소속 팀 (가안) */
export const UNCLE_TEAM = '리버 스타';

export type ProRider = {
  id: string;
  name: string;
  team: string;
  /** 팀 저지·헬멧 색 (UI 팔레트 토큰과 기존 캐릭터 색만 사용) */
  teamColor: number;
  /** 자전거 프레임 색 */
  frameColor: number;
  category: BikeCategory;
  /** 평지 순항 속도(m/틱) */
  pace: number;
  /** 구간별 컨디션 배수: 오르막에 강한 선수, 내리막·스프린트에 강한 선수 같은 성격 */
  form: Record<RaceSegmentId, number>;
};

// 삼촌은 오르막에서 조금 밀리지만 내리막과 마지막 스퍼트에 강한 스프린터, 루카는 오르막에서 치고 나가는 우승 후보입니다.
export const PROLOGUE_RIDERS: ProRider[] = [
  { id: UNCLE_ID, name: UNCLE_NAME, team: UNCLE_TEAM, teamColor: 0xc95746, frameColor: 0xc95746, category: 'road', pace: 40, form: { start: 0.99, climb: 0.985, descent: 1.04, sprint: 1.1 } },
  { id: 'luka', name: '루카', team: '블루웨이브', teamColor: 0x4e8092, frameColor: 0xfff1c6, category: 'road', pace: 40, form: { start: 1.01, climb: 1.04, descent: 0.99, sprint: 1.0 } },
  { id: 'marco', name: '마르코', team: '그린힐', teamColor: 0x5e9a67, frameColor: 0x3b2531, category: 'road', pace: 39.4, form: { start: 1.0, climb: 1.02, descent: 1.0, sprint: 1.0 } },
  { id: 'cheolmin', name: '강철민', team: '아이언 기어', teamColor: 0x573044, frameColor: 0xa39985, category: 'road', pace: 39.2, form: { start: 1.01, climb: 0.98, descent: 1.03, sprint: 1.0 } },
  { id: 'leon', name: '레온', team: '선샤인', teamColor: 0xf4b84a, frameColor: 0x3b2531, category: 'road', pace: 39.2, form: { start: 1.0, climb: 1.0, descent: 1.0, sprint: 1.03 } },
  { id: 'jiju', name: '박질주', team: '스카이라인', teamColor: 0x86c9c8, frameColor: 0x4e8092, category: 'road', pace: 38.9, form: { start: 1.02, climb: 0.99, descent: 1.0, sprint: 0.99 } },
  { id: 'bawi', name: '윤바위', team: '캐니언', teamColor: 0xb66f45, frameColor: 0x573044, category: 'road', pace: 38.7, form: { start: 1.0, climb: 1.03, descent: 0.97, sprint: 0.98 } },
  { id: 'thomas', name: '토마스', team: '포레스트', teamColor: 0x8e5136, frameColor: 0x5e9a67, category: 'road', pace: 38.6, form: { start: 1.0, climb: 1.0, descent: 1.0, sprint: 1.0 } },
];

export function proRiderById(id: string): ProRider | undefined {
  return PROLOGUE_RIDERS.find((rider) => rider.id === id);
}

const TICK_MS = 600;
/** 틱마다 속도가 흔들리는 폭(±) */
const PACE_NOISE = 0.05;
/** 대본 시드 탐색 시작값과 최대 시도 수 */
export const PROLOGUE_SEED = 20261118;
const MAX_SEED_ATTEMPTS = 2000;

/** 대본 조건: 우승 격차가 이 범위면 '사진 판정급으로 아슬아슬하게 이겼다'로 읽힙니다(사진 판정 슬로모션 범위 안). */
export const PROLOGUE_MARGIN_MS = { min: 200, max: 600 };
/** 스퍼트 시작(진행률 0.65) 때 삼촌이 선두와 떨어져 있어야 하는 거리 범위(m): 화면 안(소프트 클램프 180px)에서 추격이 보이게 */
export const PROLOGUE_SPRINT_GAP_M = { min: 40, max: 80 };
/** 마지막 600m에 들어설 때 삼촌은 2위여야 하고 선두와의 거리는 이 범위(m): 선두 표식과 속도선이 켜질 때 '바짝 쫓는' 그림 */
export const PROLOGUE_FINAL_GAP_M = { min: 15, max: 40 };
/** 삼촌이 마지막으로 선두에 올라서는 진행률 범위: 결승 300m~120m 전의 역전이라 컷인 뒤 곧바로 결승이 이어집니다 */
export const PROLOGUE_LEAD_TAKEN_AT = { min: 0.9, max: 0.96 };

/** 프로 선수 8명의 시드 시뮬레이션. race-progress.simulateRace와 같은 틱·타임라인 형식으로 돌려줍니다. */
export function simulatePrologueRace(seed: number): RaceResult {
  const meta = PROLOGUE_RACE;
  const rnd = randomFor(seed);
  const runners = PROLOGUE_RIDERS.map((rider) => ({ rider, distance: 0, finish: null as number | null, timeline: [0] }));
  let tick = 0;
  while (tick < 240 && runners.some((runner) => runner.finish === null)) {
    tick += 1;
    runners.forEach((runner) => {
      if (runner.finish !== null) {
        runner.timeline.push(1);
        return;
      }
      const segment = segmentAt(runner.distance / meta.distanceMeters);
      const step = runner.rider.pace * segment.speedFactor * runner.rider.form[segment.id] * (1 + (rnd() * 2 - 1) * PACE_NOISE);
      const before = runner.distance;
      runner.distance = Math.min(meta.distanceMeters, runner.distance + step);
      if (runner.distance >= meta.distanceMeters) {
        runner.finish = Math.round((tick - 1 + (meta.distanceMeters - before) / step) * TICK_MS);
        runner.timeline.push(1);
      } else {
        runner.timeline.push(runner.distance / meta.distanceMeters);
      }
    });
  }
  runners.forEach((runner) => { if (runner.finish === null) runner.finish = tick * TICK_MS; });
  const ordered = [...runners].sort((a, b) => a.finish! - b.finish!);
  const racers = runners.map((runner) => ({
    id: runner.rider.id,
    name: runner.rider.name,
    isPlayer: false,
    category: runner.rider.category,
    frameColor: runner.rider.frameColor,
    speedScore: runner.rider.pace,
    rank: ordered.indexOf(runner) + 1,
    finishTimeMs: runner.finish!,
    timeline: runner.timeline,
  }));
  const uncle = racers.find((racer) => racer.id === UNCLE_ID)!;
  return { meta, seed, tickMs: TICK_MS, totalTicks: tick, racers, playerRank: uncle.rank, playerTimeMs: uncle.finishTimeMs };
}

export type PrologueStoryCheck = {
  uncleWins: boolean;
  /** 삼촌과 2위의 기록 차(ms) */
  marginMs: number;
  /** 오르막이 끝날 때(진행률 0.45) 삼촌의 순위 */
  rankAfterClimb: number;
  /** 스퍼트 구간이 시작될 때(진행률 0.65) 선두와의 거리(m) */
  gapAtSprintMeters: number;
  /** 오르막이 끝날 때 선두 선수 id */
  climbLeaderId: string;
  /** 마지막 600m에 들어설 때 삼촌의 순위 */
  rankAtFinal: number;
  /** 마지막 600m에 들어설 때 선두와의 거리(m) */
  gapAtFinalMeters: number;
  /** 삼촌이 마지막으로 선두에 올라선(이후 끝까지 지킨) 시점의 진행률 */
  leadTakenAt: number;
};

/** 대본 조건을 계산합니다: 삼촌 우승·사진 판정급 격차·오르막에서 밀린 뒤 마지막 600m 추격·결승 직전 역전. */
export function checkPrologueStory(result: RaceResult): PrologueStoryCheck {
  const ordered = [...result.racers].sort((a, b) => a.rank - b.rank);
  const uncle = result.racers.find((racer) => racer.id === UNCLE_ID)!;
  const runnerUp = ordered.find((racer) => racer.id !== UNCLE_ID)!;
  const afterClimb = standingsAt(result, UNCLE_ID, 0.45);
  const atSprint = standingsAt(result, UNCLE_ID, 0.65);
  const atFinal = standingsAt(result, UNCLE_ID, finalStretchFrom(result.meta.distanceMeters));
  const uncleAtSprint = atSprint.find((entry) => entry.id === UNCLE_ID)!;
  const uncleAtFinal = atFinal.find((entry) => entry.id === UNCLE_ID)!;
  return {
    leadTakenAt: leadTakenProgress(result, UNCLE_ID),
    uncleWins: uncle.rank === 1,
    marginMs: runnerUp.finishTimeMs - uncle.finishTimeMs,
    rankAfterClimb: afterClimb.findIndex((entry) => entry.id === UNCLE_ID) + 1,
    gapAtSprintMeters: (atSprint[0].progress - uncleAtSprint.progress) * result.meta.distanceMeters,
    climbLeaderId: afterClimb[0].id,
    rankAtFinal: atFinal.findIndex((entry) => entry.id === UNCLE_ID) + 1,
    gapAtFinalMeters: (atFinal[0].progress - uncleAtFinal.progress) * result.meta.distanceMeters,
  };
}

export function isPrologueStoryRace(check: PrologueStoryCheck): boolean {
  return check.uncleWins
    && check.marginMs >= PROLOGUE_MARGIN_MS.min && check.marginMs <= PROLOGUE_MARGIN_MS.max
    && check.rankAfterClimb >= 3
    && check.climbLeaderId !== UNCLE_ID
    && check.gapAtSprintMeters >= PROLOGUE_SPRINT_GAP_M.min && check.gapAtSprintMeters <= PROLOGUE_SPRINT_GAP_M.max
    && check.rankAtFinal === 2
    && check.gapAtFinalMeters >= PROLOGUE_FINAL_GAP_M.min && check.gapAtFinalMeters <= PROLOGUE_FINAL_GAP_M.max
    && check.leadTakenAt >= PROLOGUE_LEAD_TAKEN_AT.min && check.leadTakenAt <= PROLOGUE_LEAD_TAKEN_AT.max;
}

/**
 * 프롤로그 대회 결과. 시드를 PROLOGUE_SEED부터 차례로 시뮬레이션해 대본 조건을 처음 만족하는 경기를 고릅니다(결정적).
 * 조건을 만족하는 경기가 없으면 선수 수치가 잘못된 것이므로 예외를 던집니다(테스트가 막음).
 */
export function buildPrologueRace(): RaceResult {
  for (let attempt = 0; attempt < MAX_SEED_ATTEMPTS; attempt += 1) {
    const result = simulatePrologueRace(PROLOGUE_SEED + attempt);
    if (isPrologueStoryRace(checkPrologueStory(result))) return result;
  }
  throw new Error('프롤로그 대본 조건을 만족하는 경기를 찾지 못했습니다. PROLOGUE_RIDERS 수치를 확인하세요.');
}

// ─── 대사·중계 문구 (가안) ─────────────────────────────────────────────

/** 대사 화자: 내레이션(초상화 없음), 두리(주인공), 삼촌, 중계(캐스터) */
export type PrologueSpeaker = '내레이션' | '두리' | '삼촌' | '중계';
export type PrologueLine = { speaker: PrologueSpeaker; text: string; emotion?: PixelCharacterEmotion };

/** 거실 TV 앞: 중계를 보기 전 */
export const PROLOGUE_INTRO: PrologueLine[] = [
  { speaker: '내레이션', text: '자전거를 좋아하는 두리에게는\n자랑스러운 삼촌이 있다.' },
  { speaker: '내레이션', text: `프로 사이클 팀 ${UNCLE_TEAM}의 에이스,\n${UNCLE_NAME} 선수.` },
  { speaker: '중계', text: `${PROLOGUE_RACE.name} 결승!\n이제 결승선까지 단 3km 남았습니다!` },
  { speaker: '두리', text: '삼촌이 선두 그룹에 있어!\n삼촌, 힘내!', emotion: '기쁨' },
];

/** 시상대: 우승 인터뷰 */
export const PROLOGUE_INTERVIEW: PrologueLine[] = [
  { speaker: '중계', text: `${PROLOGUE_RACE.name} 우승은\n${UNCLE_TEAM}의 ${UNCLE_NAME}!` },
  { speaker: '삼촌', text: '응원해 준 조카 두리, 보고 있지?\n언젠가 이 무대에서 같이 달리자!', emotion: '기쁨' },
];

/** 다시 거실: 두리의 결심 */
export const PROLOGUE_OUTRO: PrologueLine[] = [
  { speaker: '두리', text: '나도 삼촌처럼\n저 대회에 나갈 거야!', emotion: '기쁨' },
  { speaker: '내레이션', text: '하지만 대회에 나갈 자전거는\n아직 꿈도 못 꿀 만큼 비싸다…' },
  { speaker: '두리', text: '그래! 자전거 공방에서 알바하면서\n내 드림 바이크를 직접 만들자!', emotion: '기본' },
];

/** 마지막 목표 카드: 본편(공방 알바)으로 이어지는 안내 */
export const PROLOGUE_GOAL = {
  tag: 'NEW GOAL',
  title: `${PROLOGUE_RACE.name} 출전`,
  detail: '공방 알바로 급여를 모아 드림 바이크를 키우고,\n5일마다 열리는 동네 대회부터 도전하세요.',
  steps: ['공방 알바', '드림 바이크', '동네 대회', PROLOGUE_RACE.name],
  button: '▶ 공방으로 출근',
};

/**
 * 레이스 중계 해설. 구간에 들어설 때(start·climb·descent·sprint), 마지막 600m(final), 역전 컷인(takeLead*),
 * 결승 통과(finish)·사진 판정(photoFinish)에 띄웁니다. {leader}는 그 시점의 선두 선수 이름.
 * 배너는 한 줄(약 24자)이고, 컷인 제목은 큰 글자라 6자 안쪽으로 둡니다.
 */
export const PROLOGUE_COMMENTARY = {
  start: '결승까지 3km! 선두 그룹이 달립니다',
  climb: '오르막! {leader} 선수가 치고 나갑니다',
  descent: `내리막! ${UNCLE_NAME}, 거리를 좁힙니다`,
  sprint: `마지막 스퍼트! ${UNCLE_NAME}이 승부를 겁니다`,
  final: `결승까지 600m! {leader} 선두, ${UNCLE_NAME} 추격!`,
  takeLeadTitle: '역전!',
  takeLead: `${UNCLE_NAME}, 선두로 올라섭니다!`,
  finish: `${UNCLE_NAME} 우승!! 대역전입니다!`,
  photoFinish: 'PHOTO FINISH',
};

/** 해설 문구의 {leader} 자리를 채웁니다. */
export function commentaryLine(template: string, leaderName: string): string {
  return template.replace('{leader}', leaderName);
}
