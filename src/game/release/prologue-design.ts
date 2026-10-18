// 프롤로그 화면(출시 적용): 삼촌의 프로 대회를 먼저 보여 주고 본편으로 이어지는 첫 시작 연출 (390×810)
// 흐름: 거실 TV 앞(두리) → 그랑 리버 클래식 결승 3km 중계(삼촌이 주인공 레이서) → 시상대·우승 인터뷰
//       → 다시 거실(두리의 결심) → 목표 카드 → 공방으로 출근(홈)
// - 레이스 중계는 대회일 레이스와 같은 RaceBroadcastScene을 쓰고, 결과는 prologue-story의 대본(삼촌 우승)을 재생합니다.
// - 대사·해설·선수 이름은 prologue-story.ts에만 있습니다(가안). 이 파일은 배치와 연출만 담당합니다.
// - 언제든 건너뛰기로 목표 카드까지 갈 수 있고, 종료는 onFinish 훅 한 곳으로만 알립니다.
import Phaser from 'phaser';
import { drawCharacterPortrait, drawFieldCharacter, drawPixelMap, type PixelCharacterRole } from './art-character-pixel';
import { formatRaceTime, type RaceResult, type RaceSegmentId, type RacerResult } from './race-progress';
import {
  CADENCE_RPM,
  STANDING_START_UNTIL,
  TARGET_CRUISE_WHEEL_REV_PER_SEC,
  createMotionState,
  postureAt,
  type RiderMotionState,
  type RiderPosture,
} from './race-rider-motion';
import { RacerView, type RacerSpec } from './race-rider-view';
import { BROADCAST_LAYOUT, RaceBroadcastScene, widenHitArea, type BroadcastRacer } from './race-cinematic-broadcast';
import {
  PROLOGUE_COMMENTARY,
  PROLOGUE_GOAL,
  PROLOGUE_INTERVIEW,
  PROLOGUE_INTRO,
  PROLOGUE_OUTRO,
  PROLOGUE_RACE,
  UNCLE_ID,
  UNCLE_NAME,
  UNCLE_TEAM,
  buildPrologueRace,
  checkPrologueStory,
  commentaryLine,
  proRiderById,
  type PrologueLine,
  type PrologueSpeaker,
} from './prologue-story';

export type PrologueHooks = {
  /** 목표 카드에서 출근을 누르면 한 번 부릅니다. skipped: 건너뛰기로 왔는지 */
  onFinish?: (value: { skipped: boolean }) => void;
  onSfx?: (event: 'tap' | 'start' | 'reward' | 'complete') => void;
};

const WIDTH = 390;
const HEIGHT = 810;
const FONT = '"Arial Rounded MT Bold", "Noto Sans KR", sans-serif';
// 팔레트 토큰 (UI_STYLE_GUIDE 2절)
const INK = 0x3b2531; // INK
const INK_TEXT = '#3b2531';
const CREAM = 0xfff1c6; // CREAM
const CREAM_TEXT = '#fff1c6';
const PAPER = 0xf6d995; // PAPER
const WOOD = 0x8e5136; // WOOD
const DARK_WOOD = 0x573044; // DARK WOOD
const FLOOR = 0xb66f45; // FLOOR
const GOLD = 0xf4b84a; // GOLD
const GREEN = 0x5e9a67; // GREEN
const RED = 0xc95746; // RED
const SKY = 0x86c9c8; // SKY
const MUTED_TEXT = '#7b5140';
const SUCCESS_TEXT = '#3f7851';
const ALERT_TEXT = '#a14a38';
// 공방 화면들과 같은 벽·바닥 배경색(타이틀·설정·가이드 공용)
const WALL = 0xc78452;
const WALL_LINE = 0xb37246;
const BOARD_FLOOR = 0xa9683f;
const BOARD_LINE = 0x8a5231;
const HILL_FAR = 0x86ba6f;

// 대화창: 하단 세이프 존(750) 위에 둡니다
const DIALOG_Y = 680;
const DIALOG_W = 358;
const DIALOG_H = 120;
const TYPE_MS = 26;

// 거실 TV 화면 영역
const TV = { x: 195, y: 232, w: 320, h: 196 };

// 우승 트로피 픽셀 지도 (14×14)
const TROPHY_MAP = [
  '...KKKKKKKK...',
  '.KKGYYGGGGgKK.',
  'KGKGYGGGGGgKGK',
  'KGKGYGGGGGgKGK',
  '.KKGGGGGGGgKK.',
  '...KGGGGGgK...',
  '....KGGGgK....',
  '.....KGgK.....',
  '.....KGgK.....',
  '....KKGgKK....',
  '...KGGGGGgK...',
  '..KwwwwwwwwK..',
  '..KWWWWWWWWK..',
  '..KKKKKKKKKK..',
];
const TROPHY_LEGEND: Record<string, number> = { K: INK, G: GOLD, Y: 0xffe6a8, g: 0xb8761a, w: DARK_WOOD, W: WOOD };

const SPEAKER_ROLE: Partial<Record<PrologueSpeaker, PixelCharacterRole>> = { 두리: '정비사', 삼촌: '삼촌' };
const SPEAKER_NAME: Partial<Record<PrologueSpeaker, string>> = { 두리: '두리', 삼촌: '삼촌', 중계: '중계석' };

type Stage = 'intro' | 'race' | 'interview' | 'outro' | 'goal';

export class PrologueScene extends RaceBroadcastScene {
  private stage: Stage = 'intro';
  private skipped = false;
  private finished = false;
  // 대화 진행
  private lines: PrologueLine[] = [];
  private lineIndex = 0;
  private linesDone?: () => void;
  private dialogObjects: Phaser.GameObjects.GameObject[] = [];
  private dialogBody?: Phaser.GameObjects.Text;
  private dialogFull = '';
  private typing?: Phaser.Time.TimerEvent;
  // 거실 TV 속 삼촌(페달링만 반복)
  private tvRider?: { view: RacerView; motion: RiderMotionState };
  private tvDashes: Phaser.GameObjects.Rectangle[] = [];
  // 레이스 중계 연출(역전 컷인·사진 판정 시점은 RaceBroadcastScene이 race-climax 규칙으로 타임라인에서 읽음)
  private storyRace?: RaceResult;
  private climbLeaderName = '';
  private uncleTag?: Phaser.GameObjects.Container;

  constructor(private readonly hooks: PrologueHooks = {}) {
    super('release-prologue');
  }

  create() {
    this.storyRace = buildPrologueRace();
    const check = checkPrologueStory(this.storyRace);
    this.climbLeaderName = proRiderById(check.climbLeaderId)?.name ?? '';
    this.showLivingRoom('before');
  }

  update(time: number, delta: number) {
    super.update(time, delta);
    this.animateTv(delta);
    // 결승선 카메라(홀드)에서는 삼촌이 오른쪽으로 빠져나가므로 이름표도 따라갑니다
    if (this.phase === 'finish-hold') {
      const focus = this.focusRacer();
      if (focus) this.placeUncleTag(focus);
    }
  }

  // ─── 중계 표시 규칙 (RaceBroadcastScene) ─────────────────────────────

  protected isFocus(racer: RacerResult): boolean {
    return racer.id === UNCLE_ID;
  }

  protected racerSpec(racer: RacerResult): RacerSpec {
    const rider = proRiderById(racer.id);
    if (racer.id === UNCLE_ID) return { category: racer.category, role: '삼촌', frameColor: racer.frameColor };
    return { category: racer.category, role: '선수', frameColor: racer.frameColor, teamColor: rider?.teamColor };
  }

  protected racerLabel(racer: RacerResult): string {
    if (racer.id === UNCLE_ID) return `삼촌 · ${racer.name}`;
    const rider = proRiderById(racer.id);
    return rider ? `${rider.name} · ${rider.team}` : racer.name;
  }

  protected hudBadge(): string {
    return 'FINAL';
  }

  // 결승 3km 지점부터 이미 달리는 중인 장면이라 카운트다운·스탠딩 스타트 없이 순항으로 시작합니다.
  protected countdownSteps(): string[] {
    return [];
  }

  protected postureFor(progress: number): RiderPosture {
    return progress < STANDING_START_UNTIL ? 'seated' : postureAt(progress);
  }

  protected initialMotion(index: number): RiderMotionState {
    return cruisingMotion(index * 1.3);
  }

  protected segmentBanner(segmentId: RaceSegmentId): string | undefined {
    if (segmentId === 'climb') return commentaryLine(PROLOGUE_COMMENTARY.climb, this.climbLeaderName);
    if (segmentId === 'descent') return PROLOGUE_COMMENTARY.descent;
    if (segmentId === 'sprint') return PROLOGUE_COMMENTARY.sprint;
    return undefined;
  }

  protected finishBanner(): string {
    return PROLOGUE_COMMENTARY.finish;
  }

  // 마지막 600m: 그 순간의 선두(대본상 루카) 이름을 넣어 추격 상황을 해설합니다
  protected finalStretchBanner(leaderName: string): string {
    return commentaryLine(PROLOGUE_COMMENTARY.final, leaderName);
  }

  // 역전 컷인: 대본상 결승 300m 안쪽에서 삼촌이 선두로 올라서는 순간
  protected overtakeCutIn(): { title: string; subtitle: string } {
    return { title: PROLOGUE_COMMENTARY.takeLeadTitle, subtitle: PROLOGUE_COMMENTARY.takeLead };
  }

  protected cutInPortrait() {
    return { role: '삼촌' as const, emotion: '기본' as const };
  }

  protected photoFinishLabel(): string {
    return PROLOGUE_COMMENTARY.photoFinish;
  }

  protected onClimaxEvent(event: 'final' | 'overtake' | 'photo-finish'): void {
    if (event === 'overtake') this.hooks.onSfx?.('start');
    if (event === 'photo-finish') this.hooks.onSfx?.('complete');
  }

  protected distanceLabel(meters: number, totalMeters: number): string {
    return `결승까지 ${(totalMeters - meters).toLocaleString()}m`;
  }

  protected decorateBroadcast(): void {
    // 삼촌 머리 위 이름표: 카메라가 따라가는 레이서가 누구인지 처음 보는 사람도 알 수 있게
    const label = this.text(0, 0, `삼촌 ${UNCLE_NAME}`, 11, INK_TEXT).setOrigin(0.5);
    const box = this.add.rectangle(0, 0, label.width + 16, 22, PAPER).setStrokeStyle(2, INK);
    const pointer = this.add.triangle(0, 15, -6, 0, 6, 0, 0, 7, PAPER).setStrokeStyle(2, INK);
    this.uncleTag = this.add.container(BROADCAST_LAYOUT.focusX, 0, [pointer, box, label]).setDepth(18);
    const focus = this.focusRacer();
    if (focus) this.placeUncleTag(focus);
    this.tweens.add({ targets: this.uncleTag, y: '-=4', duration: 520, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

    // 순위표 아래: 중계 건너뛰기(시각 168×36, 터치 영역 176×44)
    const skipY = BROADCAST_LAYOUT.boardBottom + 46;
    const skip = widenHitArea(this.add.rectangle(WIDTH / 2, skipY, 168, 36, PAPER).setStrokeStyle(3, INK).setDepth(21), 4);
    this.text(WIDTH / 2, skipY, '중계 건너뛰기 ✕', 11, INK_TEXT).setOrigin(0.5).setDepth(22);
    skip.on('pointerdown', () => this.skipToGoal());
  }

  protected onRaceStarted(): void {
    this.hooks.onSfx?.('start');
    this.showBanner(PROLOGUE_COMMENTARY.start, GOLD);
  }

  protected onRacingFrame(focus: BroadcastRacer): void {
    this.placeUncleTag(focus);
  }

  protected onBroadcastFinished(): void {
    this.showPodium();
  }

  private placeUncleTag(focus: BroadcastRacer) {
    if (!this.uncleTag) return;
    // x는 국면별 카메라(전체 무리 샷에서는 삼촌이 화면 왼쪽으로 밀림)를 따라 매 프레임 맞추고,
    // y는 트윈이 위아래로 흔드는 값과 별개로 레인 위치에서 한 번만 정합니다.
    this.uncleTag.setX(focus.view.container.x);
    if (this.uncleTag.getData('placed')) return;
    this.uncleTag.setY(this.laneY(focus.lane) - 104);
    this.uncleTag.setData('placed', true);
  }

  // 프롤로그는 구간 해설(오르막·내리막·스퍼트)이 이미 있어 샷 전환 해설은 띄우지 않습니다(라이벌 표식·샷 이름만)
  protected shotBanner(): string | undefined {
    return undefined;
  }

  // ─── 거실 (TV 앞) ─────────────────────────────────────────────────

  private showLivingRoom(moment: 'before' | 'after') {
    this.stage = moment === 'before' ? 'intro' : 'outro';
    this.resetStoryStage();
    this.drawRoom();
    this.drawTv(moment);
    // 벽에 건 삼촌 사진: '자랑스러운 삼촌'을 화면으로도 보여 줍니다
    this.add.rectangle(312, 470, 84, 96, PAPER).setStrokeStyle(4, WOOD).setDepth(2);
    this.add.rectangle(312, 462, 66, 70, SKY).setDepth(2);
    drawCharacterPortrait(this, 312, 462, '삼촌', moment === 'before' ? '기본' : '기쁨', 2, 3);
    this.text(312, 507, '우리 삼촌', 9, INK_TEXT).setOrigin(0.5).setDepth(3);
    // 두리: TV 앞 바닥에 서서 화면을 봅니다
    drawFieldCharacter(this, 98, 600, '정비사', 4, 5);
    this.drawStoryHeader(moment === 'before' ? '두리네 거실 · 결승 중계' : '두리네 거실 · 우승 직후');
    this.addAdvanceZone();
    if (moment === 'before') this.playLines(PROLOGUE_INTRO, () => this.zoomIntoBroadcast());
    else this.playLines(PROLOGUE_OUTRO, () => this.showGoal());
  }

  private drawRoom() {
    this.cameras.main.setBackgroundColor('#c78452');
    this.add.rectangle(WIDTH / 2, 300, WIDTH, 600, WALL).setDepth(0);
    for (let x = 24; x < WIDTH; x += 52) this.add.rectangle(x, 300, 2, 600, WALL_LINE, 0.35).setDepth(0);
    this.add.rectangle(WIDTH / 2, 705, WIDTH, 210, BOARD_FLOOR).setDepth(0);
    for (let y = 626; y < HEIGHT; y += 26) this.add.rectangle(WIDTH / 2, y, WIDTH, 2, BOARD_LINE, 0.5).setDepth(0);
  }

  private drawTv(moment: 'before' | 'after') {
    const left = TV.x - TV.w / 2;
    const top = TV.y - TV.h / 2;
    const bottom = TV.y + TV.h / 2;
    // 화면 속 배치(px): 지평선(도로 윗변) → 바퀴 축 → 도로 아랫변 → 하단 자막 띠(바퀴를 가리지 않게 아래로)
    const horizon = top + 116;
    const axle = top + 146;
    const captionHeight = 22;
    const roadBottom = bottom - captionHeight;
    // TV장과 테두리: TV는 낮은 장 위에 놓입니다
    this.add.rectangle(TV.x, bottom + 36, 268, 40, DARK_WOOD).setStrokeStyle(4, INK).setDepth(1);
    this.add.rectangle(TV.x - 66, bottom + 36, 4, 28, INK, 0.6).setDepth(1);
    this.add.rectangle(TV.x + 66, bottom + 36, 4, 28, INK, 0.6).setDepth(1);
    this.add.rectangle(TV.x, bottom + 15, 48, 10, INK).setDepth(1);
    this.add.rectangle(TV.x, TV.y, TV.w + 24, TV.h + 24, DARK_WOOD).setStrokeStyle(5, INK).setDepth(1);
    this.add.rectangle(TV.x, TV.y, TV.w, TV.h, SKY).setDepth(2);
    // 화면 속 풍경: 언덕 2겹 + 도로
    this.add.triangle(left + 70, horizon, 0, 50, 60, 0, 120, 50, HILL_FAR).setOrigin(0, 1).setDepth(2);
    this.add.triangle(left + 190, horizon, 0, 40, 55, 0, 110, 40, GREEN).setOrigin(0, 1).setDepth(2);
    this.add.rectangle(TV.x, (horizon + roadBottom) / 2, TV.w, roadBottom - horizon, FLOOR).setDepth(2);
    this.add.rectangle(TV.x, horizon, TV.w, 4, BOARD_LINE).setDepth(2);
    // LIVE 태그
    this.add.rectangle(left + 34, top + 18, 52, 20, RED).setStrokeStyle(2, INK).setDepth(4);
    this.text(left + 34, top + 18, '● LIVE', 9).setOrigin(0.5).setDepth(5);
    // 하단 자막 띠
    this.add.rectangle(TV.x, bottom - captionHeight / 2, TV.w, captionHeight, PAPER).setDepth(4);
    const caption = moment === 'before'
      ? `${PROLOGUE_RACE.name} · 결승까지 3km`
      : `우승! ${UNCLE_TEAM} ${UNCLE_NAME}`;
    this.text(TV.x, bottom - captionHeight / 2, caption, 11, INK_TEXT).setOrigin(0.5).setDepth(5);

    if (moment === 'before') {
      // 도로 중앙 대시가 흐르고 삼촌이 페달을 밟는 화면
      this.tvDashes = [];
      for (let index = 0; index < 6; index += 1) {
        this.tvDashes.push(this.add.rectangle(left + 12 + index * 56, axle + 6, 22, 4, CREAM, 0.6).setOrigin(0, 0.5).setDepth(3));
      }
      const view = new RacerView(this, this.riderTextures, { category: 'road', role: '삼촌', frameColor: RED });
      const motion = cruisingMotion(Math.PI * 0.35);
      view.update(motion);
      view.setPosition(TV.x - 6, axle);
      view.setDepth(3);
      this.tvRider = { view, motion };
      return;
    }
    // 우승 직후: 삼촌 얼굴과 트로피
    drawCharacterPortrait(this, TV.x - 50, TV.y - 6, '삼촌', '기쁨', 3, 3);
    drawPixelMap(this, TV.x + 58, TV.y - 4, TROPHY_MAP, TROPHY_LEGEND, 4, 3);
  }

  private animateTv(delta: number) {
    if (!this.tvRider || this.stage !== 'intro') return;
    const dt = delta / 1000;
    const { view, motion } = this.tvRider;
    motion.wheelAngle += motion.wheelRadPerSec * dt;
    motion.glintAngle += motion.wheelRadPerSec * dt;
    motion.crankAngle += motion.crankRadPerSec * dt;
    view.update(motion);
    const left = TV.x - TV.w / 2;
    const span = 56 * this.tvDashes.length;
    this.tvDashes.forEach((dash) => {
      let x = dash.x - 120 * dt;
      if (x < left - 22) x += span;
      dash.setX(x);
      // 화면 테두리 밖으로 나간 부분은 감춥니다
      dash.setVisible(x > left - 4 && x < left + TV.w - 18);
    });
  }

  // TV 화면으로 확대하며 중계 화면으로 넘어갑니다.
  private zoomIntoBroadcast() {
    const camera = this.cameras.main;
    camera.pan(TV.x, TV.y, 520, 'Sine.easeInOut');
    camera.zoomTo(1.6, 520, 'Sine.easeInOut');
    camera.fadeOut(520, 0xff, 0xf1, 0xc6);
    camera.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      if (this.stage !== 'intro') return;
      this.startRaceStage();
    });
  }

  private startRaceStage() {
    this.stage = 'race';
    this.resetStoryStage();
    this.startBroadcast(this.storyRace ?? buildPrologueRace());
    this.cameras.main.fadeIn(320, 0xff, 0xf1, 0xc6);
  }

  // ─── 시상대 ───────────────────────────────────────────────────────

  private showPodium() {
    const result = this.result ?? this.storyRace!;
    this.stage = 'interview';
    this.resetStoryStage();
    this.hooks.onSfx?.('reward');
    const ordered = [...result.racers].sort((a, b) => a.rank - b.rank);
    const [winner, second, third] = ordered;

    // 하늘·언덕·바닥
    this.cameras.main.setBackgroundColor('#86c9c8');
    this.add.rectangle(WIDTH / 2, 280, WIDTH, 560, SKY).setDepth(0);
    this.add.rectangle(80, 214, 64, 12, CREAM, 0.75).setDepth(0);
    this.add.rectangle(318, 250, 80, 12, CREAM, 0.75).setDepth(0);
    for (let index = 0; index < 4; index += 1) {
      this.add.triangle(index * 120 - 40, 560, 0, 90, 70, 0, 140, 90, HILL_FAR).setOrigin(0, 1).setDepth(0);
    }
    this.add.rectangle(WIDTH / 2, 685, WIDTH, 250, FLOOR).setDepth(0);
    for (let y = 586; y < HEIGHT; y += 26) this.add.rectangle(WIDTH / 2, y, WIDTH, 2, BOARD_LINE, 0.5).setDepth(0);

    // 대회 현수막과 우승 문구
    this.add.rectangle(WIDTH / 2, 84, 330, 30, DARK_WOOD).setStrokeStyle(3, INK).setDepth(2);
    this.text(WIDTH / 2, 84, 'GRAND RIVER CLASSIC · FINAL', 11, '#f6d995').setOrigin(0.5).setDepth(3);
    this.text(WIDTH / 2, 128, `우승 · 삼촌 ${UNCLE_NAME}`, 20).setOrigin(0.5).setStroke(INK_TEXT, 5).setDepth(3);
    const margin = second ? ((second.finishTimeMs - winner.finishTimeMs) / 1000).toFixed(1) : '0.0';
    this.text(WIDTH / 2, 160, `${UNCLE_TEAM} · 기록 ${formatRaceTime(winner.finishTimeMs)} · 2위와 ${margin}초 차`, 11)
      .setOrigin(0.5).setStroke(INK_TEXT, 4).setDepth(3);

    // 시상대: 가운데 1위(삼촌), 왼쪽 2위, 오른쪽 3위
    this.podiumBlock(195, 500, 112, 120, GOLD, '1', INK_TEXT);
    if (second) this.podiumBlock(82, 518, 104, 84, PAPER, '2', INK_TEXT, second);
    if (third) this.podiumBlock(308, 528, 104, 64, WOOD, '3', CREAM_TEXT, third);
    drawFieldCharacter(this, 195, 440, '삼촌', 4, 6);
    const trophy = drawPixelMap(this, 195, 262, TROPHY_MAP, TROPHY_LEGEND, 3, 7);
    this.tweens.add({ targets: trophy, y: 254, duration: 640, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

    // 꽃가루
    for (let index = 0; index < 18; index += 1) {
      const confetti = this.add.rectangle(30 + (index * 47) % 330, 40, 8, 8, [GOLD, RED, GREEN, 0x4e8092][index % 4]).setStrokeStyle(1, INK).setDepth(8);
      this.tweens.add({ targets: confetti, y: 560 + (index % 5) * 20, angle: 180 + index * 40, alpha: { from: 1, to: 0.15 }, duration: 1600 + index * 90, ease: 'Sine.easeIn', onComplete: () => confetti.destroy() });
    }

    this.addSkipButton(340, 30);
    this.addAdvanceZone();
    this.cameras.main.fadeIn(320, 0xff, 0xf1, 0xc6);
    this.playLines(PROLOGUE_INTERVIEW, () => this.showLivingRoom('after'));
  }

  private podiumBlock(x: number, y: number, width: number, height: number, fill: number, rank: string, rankColor: string, racer?: RacerResult) {
    this.add.rectangle(x, y, width, height, fill).setStrokeStyle(4, INK).setDepth(4);
    this.text(x, y - height / 2 + 24, rank, 24, rankColor).setOrigin(0.5).setDepth(5);
    if (!racer) return;
    const rider = proRiderById(racer.id);
    if (rider) this.add.rectangle(x, y - height / 2 + 5, width - 8, 6, rider.teamColor).setDepth(5);
    this.text(x, y - height / 2 - 26, racer.name, 11).setOrigin(0.5).setStroke(INK_TEXT, 4).setDepth(5);
    if (rider) this.text(x, y - height / 2 - 12, rider.team, 9).setOrigin(0.5).setStroke(INK_TEXT, 3).setDepth(5);
  }

  // ─── 목표 카드 ────────────────────────────────────────────────────

  private skipToGoal() {
    if (this.stage === 'goal') return;
    this.skipped = true;
    this.hooks.onSfx?.('tap');
    // 중계 중이면 재생 루프를 멈춥니다(update는 racing·finish-hold에서만 진행).
    this.phase = 'after';
    this.showGoal();
  }

  private showGoal() {
    this.stage = 'goal';
    this.resetStoryStage();
    this.drawRoom();
    this.drawTv('after');
    drawFieldCharacter(this, 98, 600, '정비사', 4, 5);
    this.add.rectangle(WIDTH / 2, HEIGHT / 2, WIDTH, HEIGHT, 0x1d1016, 0.62).setDepth(20);

    this.add.rectangle(WIDTH / 2 + 3, 404, 340, 420, INK).setDepth(21);
    this.add.rectangle(WIDTH / 2, 400, 340, 420, CREAM).setStrokeStyle(4, INK).setDepth(22);
    this.add.rectangle(WIDTH / 2, 216, 120, 24, GOLD).setStrokeStyle(2, INK).setDepth(23);
    this.text(WIDTH / 2, 216, PROLOGUE_GOAL.tag, 11, INK_TEXT).setOrigin(0.5).setDepth(24);
    this.text(WIDTH / 2, 254, PROLOGUE_GOAL.title, 20, INK_TEXT).setOrigin(0.5).setDepth(24);
    this.text(WIDTH / 2, 298, PROLOGUE_GOAL.detail, 11, MUTED_TEXT).setOrigin(0.5).setAlign('center').setLineSpacing(4).setDepth(24);

    // 목표까지의 길: 1 공방 알바(지금) → 2 드림 바이크 → 3 동네 대회 → 4 그랑 리버 클래식
    const firstY = 352;
    const gap = 44;
    this.add.rectangle(72, firstY + gap * 1.5, 4, gap * 3, WOOD).setDepth(23);
    PROLOGUE_GOAL.steps.forEach((step, index) => {
      const y = firstY + index * gap;
      const last = index === PROLOGUE_GOAL.steps.length - 1;
      const current = index === 0;
      this.add.circle(72, y, 15, last ? GOLD : current ? GREEN : WOOD).setStrokeStyle(3, INK).setDepth(24);
      this.text(72, y, `${index + 1}`, 12, last ? INK_TEXT : CREAM_TEXT).setOrigin(0.5).setDepth(25);
      this.text(100, y, step, 13, INK_TEXT).setOrigin(0, 0.5).setDepth(24);
      if (current) this.text(316, y, '지금 시작!', 11, SUCCESS_TEXT).setOrigin(1, 0.5).setDepth(24);
      if (last) this.text(316, y, '최종 목표', 11, ALERT_TEXT).setOrigin(1, 0.5).setDepth(24);
    });

    const button = this.add.rectangle(WIDTH / 2, 566, 280, 52, GOLD).setStrokeStyle(4, INK).setDepth(24).setInteractive({ useHandCursor: true });
    this.text(WIDTH / 2, 566, PROLOGUE_GOAL.button, 16, INK_TEXT).setOrigin(0.5).setDepth(25);
    this.tweens.add({ targets: button, scale: { from: 1, to: 1.04 }, duration: 620, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    button.on('pointerdown', () => this.finish());
  }

  private finish() {
    if (this.finished) return;
    this.finished = true;
    this.hooks.onSfx?.('complete');
    this.hooks.onFinish?.({ skipped: this.skipped });
  }

  // ─── 공통: 머리말·건너뛰기·대화창 ──────────────────────────────────

  private resetStoryStage() {
    this.typing = undefined;
    this.dialogObjects = [];
    this.dialogBody = undefined;
    this.tvRider = undefined;
    this.tvDashes = [];
    this.uncleTag = undefined;
    this.clearStage();
    // TV 확대 연출(줌·팬)은 resetFX가 되돌리지 않으므로 직접 원래 화면으로 돌려놓습니다.
    const camera = this.cameras.main;
    camera.zoomEffect.reset();
    camera.panEffect.reset();
    camera.setZoom(1);
    camera.centerOn(WIDTH / 2, HEIGHT / 2);
  }

  private drawStoryHeader(subtitle: string) {
    this.add.rectangle(WIDTH / 2, 30, WIDTH, 60, CREAM).setStrokeStyle(4, INK).setDepth(40);
    this.add.rectangle(62, 30, 92, 24, WOOD).setStrokeStyle(2, INK).setDepth(41);
    this.text(62, 30, 'PROLOGUE', 11).setOrigin(0.5).setDepth(42);
    this.text(118, 20, '삼촌의 결승 레이스', 13, INK_TEXT).setDepth(42);
    this.text(118, 38, subtitle, 10, MUTED_TEXT).setDepth(42);
    this.addSkipButton(340, 30);
  }

  // 건너뛰기: 가이드 오버레이와 같은 크기·문구. 시각 84×32, 터치 영역 92×44
  private addSkipButton(x: number, y: number) {
    const button = this.add.rectangle(x, y, 84, 32, PAPER).setStrokeStyle(2, INK).setDepth(43)
      .setInteractive({ hitArea: new Phaser.Geom.Rectangle(-4, -6, 92, 44), hitAreaCallback: Phaser.Geom.Rectangle.Contains, useHandCursor: true });
    this.text(x, y, '건너뛰기 ✕', 11, INK_TEXT).setOrigin(0.5).setDepth(44);
    button.on('pointerdown', () => this.skipToGoal());
  }

  // 화면 어디를 눌러도 대사가 넘어가도록 전체 화면 입력 영역을 깝니다(버튼보다 아래 깊이).
  private addAdvanceZone() {
    this.add.rectangle(WIDTH / 2, HEIGHT / 2, WIDTH, HEIGHT, INK, 0.001).setDepth(30)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => this.advanceLine());
  }

  private playLines(lines: PrologueLine[], done: () => void) {
    this.lines = lines;
    this.lineIndex = 0;
    this.linesDone = done;
    this.renderLine();
  }

  private advanceLine() {
    if (!this.lines.length) return;
    // 글자가 찍히는 중이면 먼저 문장을 끝까지 보여 줍니다.
    if (this.typing) {
      this.typing.remove(false);
      this.typing = undefined;
      this.dialogBody?.setText(this.dialogFull);
      return;
    }
    this.hooks.onSfx?.('tap');
    this.lineIndex += 1;
    if (this.lineIndex >= this.lines.length) {
      const done = this.linesDone;
      this.lines = [];
      this.linesDone = undefined;
      this.clearDialog();
      done?.();
      return;
    }
    this.renderLine();
  }

  private clearDialog() {
    this.typing?.remove(false);
    this.typing = undefined;
    this.dialogObjects.forEach((object) => object.destroy());
    this.dialogObjects = [];
    this.dialogBody = undefined;
  }

  private renderLine() {
    this.clearDialog();
    const line = this.lines[this.lineIndex];
    if (!line) return;
    const role = SPEAKER_ROLE[line.speaker];
    const name = SPEAKER_NAME[line.speaker];
    const left = WIDTH / 2 - DIALOG_W / 2;
    const top = DIALOG_Y - DIALOG_H / 2;
    const objects: Phaser.GameObjects.GameObject[] = [];
    objects.push(this.add.rectangle(WIDTH / 2 + 3, DIALOG_Y + 4, DIALOG_W, DIALOG_H, INK).setDepth(31));
    objects.push(this.add.rectangle(WIDTH / 2, DIALOG_Y, DIALOG_W, DIALOG_H, line.speaker === '내레이션' ? PAPER : CREAM).setStrokeStyle(4, INK).setDepth(32));
    let textX = left + 22;
    let wrap = DIALOG_W - 44;
    if (role) {
      objects.push(this.add.rectangle(left + 50, DIALOG_Y, 80, 92, PAPER).setStrokeStyle(3, WOOD).setDepth(33));
      objects.push(drawCharacterPortrait(this, left + 50, DIALOG_Y, role, line.emotion ?? '기본', 3, 34));
      textX = left + 104;
      wrap = DIALOG_W - 104 - 18;
    }
    if (name) {
      const tag = this.add.rectangle(left + 14, top - 2, 0, 24, WOOD).setOrigin(0, 0.5).setStrokeStyle(2, INK).setDepth(34);
      const label = this.text(left + 26, top - 2, name, 11).setOrigin(0, 0.5).setDepth(35);
      tag.setSize(label.width + 24, 24);
      objects.push(tag, label);
    }
    const body = this.add.text(textX, top + 24, '', {
      fontFamily: FONT, fontSize: '13px', color: INK_TEXT, fontStyle: 'bold', lineSpacing: 6, wordWrap: { width: wrap },
    }).setDepth(35);
    if (line.speaker === '내레이션') body.setColor(MUTED_TEXT);
    const cursor = this.text(left + DIALOG_W - 22, top + DIALOG_H - 20, '▼', 11, MUTED_TEXT).setOrigin(0.5).setDepth(35);
    this.tweens.add({ targets: cursor, alpha: { from: 1, to: 0.2 }, duration: 480, yoyo: true, repeat: -1 });
    const counter = this.text(left + DIALOG_W - 38, top + DIALOG_H - 20, `${this.lineIndex + 1}/${this.lines.length}`, 9, MUTED_TEXT).setOrigin(1, 0.5).setDepth(35);
    objects.push(body, cursor, counter);
    this.dialogObjects = objects;
    this.dialogBody = body;
    this.dialogFull = line.text;

    // 한 글자씩 찍기
    let shown = 0;
    this.typing = this.time.addEvent({
      delay: TYPE_MS,
      repeat: line.text.length - 1,
      callback: () => {
        shown += 1;
        body.setText(line.text.slice(0, shown));
        if (shown >= line.text.length) this.typing = undefined;
      },
    });
  }
}

/** 이미 순항 중인 라이더의 운동 상태(바퀴 1.8 rev/s · 착좌 85rpm) */
function cruisingMotion(crankAngle: number): RiderMotionState {
  const motion = createMotionState(crankAngle, 'seated');
  motion.wheelRadPerSec = TARGET_CRUISE_WHEEL_REV_PER_SEC * Math.PI * 2;
  motion.crankRadPerSec = (CADENCE_RPM.seated / 60) * Math.PI * 2;
  motion.tier = 'fast';
  return motion;
}

export function startPrologue(parent: string, hooks: PrologueHooks = {}) {
  return new Phaser.Game({
    type: Phaser.AUTO,
    width: WIDTH,
    height: HEIGHT,
    parent,
    pixelArt: true,
    roundPixels: true,
    backgroundColor: '#c78452',
    scene: new PrologueScene(hooks),
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  });
}
