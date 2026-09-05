import Phaser from 'phaser';
import type { PixelCharacterRole } from './art-character-pixel';
import type { BikeCategory } from './bike-pixel-sprite';
import type { BikeStats } from './meta-progress';
import {
  RACE_SEGMENTS,
  RIVERSIDE_ENDURANCE_RACE,
  applyRaceEntry,
  applyRaceReward,
  formatRaceTime,
  progressAt,
  segmentAt,
  simulateRace,
  type RaceResult,
  type RacerResult,
} from './race-progress';
import {
  advanceMotion,
  createMotionState,
  groundSpeedPx,
  postureAt,
  wheelRevsPerKmForCruise,
  type RiderMotionState,
} from './race-rider-motion';
import { RaceRiderTextures, RacerView, snapToCell, type RacerSpec } from './race-rider-view';

// 레이스 E안 — 시네마틱 스포츠 중계형 (메인 채택안).
// 결과는 race-progress.simulateRace가 먼저 확정하고, 이 씬은 타임라인을 재생만 합니다.
// 라이더·바퀴·페달링은 race-rider-motion(운동 모델) → race-rider-sprite(픽셀 프레임) → race-rider-view(Phaser)로
// 이어지는 한 줄기라, 바퀴 각속도·케이던스·지면 스크롤·자세가 하나의 굴림 조건으로 묶여 있습니다.
// - 국면별 자세: 스탠딩 스타트 → 착좌 → 오르막(상체 세움·저케이던스) → 내리막(에어로 코스팅) → 스탠딩 스프린트
// - 바퀴: 속도에 따라 crisp/fast/blur 티어 프레임, 반사판이 회전 인지를 담당
// - 배속 x1/x2/x4: 바퀴·지면은 그대로 빨라지고 다리는 150rpm 상한으로 읽히는 속도를 유지
// - 완주 후 1.6초 코스팅 홀드 뒤 결과·보상 정산

export type RaceCinematicHooks = {
  initialCoins?: number;
  stats?: BikeStats;
  dayNumber?: number;
  seed?: number;
  onSettled?: (value: { rank: number; reward: number; coins: number }) => void;
};

const META = RIVERSIDE_ENDURANCE_RACE;
const WIDTH = 390;
const HEIGHT = 810;

const INK = 0x3b2531;
const INK_TEXT = '#3b2531';
const CREAM = 0xfff1c6;
const CREAM_TEXT = '#fff1c6';
const MUTED_TEXT = '#7b5140';
const RED = 0xc95746;
const GREEN = 0x5e9a67;
const GOLD = 0xf4b84a;
const PALE_GOLD = 0xf6d995;
const WOOD = 0xa9683f;
const WOOD_LINE = 0x8a5231;
const DARK_WOOD = 0x573044;
const SKY = 0x86c9c8;
const HILL_FAR = 0x86ba6f;
const ROAD = 0xb66f45;
const ROAD_EDGE = 0x8a5231;
const GRASS = 0x477a50;

// 레이스 뷰 레이아웃(px)
const PLAYER_X = 150;
/** 레인 0의 바퀴 축 y. 레인이 늘수록 5px씩 내려오며(근경) 플레이어는 마지막 레인 */
const LANE_BASE_Y = 338;
const LANE_STEP = 5;
const LANE_COUNT = META.racerCount;
const ROAD_TOP = 300;
const ROAD_BOTTOM = 418;
/** 진행률 1.0 차이가 화면 px로 환산되는 길이 */
const SPREAD_PX = 3000;
/** 상대 위치 소프트 클램프(tanh) 반경 */
const SPREAD_CLAMP_PX = 180;
const DASH_SPACING = 52;
const FINISH_HOLD_MS = 1600;
const COUNTDOWN_STEP_MS = 620;

type ScenePhase = 'entry' | 'countdown' | 'racing' | 'finish-hold' | 'result';

type Racer = {
  data: RacerResult;
  view: RacerView;
  motion: RiderMotionState;
  progress: number;
  lane: number;
};

function roleFor(racer: RacerResult, index: number): PixelCharacterRole {
  if (racer.isPlayer) return '정비사';
  return index % 2 === 0 ? '고객' : '점장';
}

function softClamp(value: number, limit: number): number {
  return limit * Math.tanh(value / limit);
}

export class RaceCinematicScene extends Phaser.Scene {
  private phase: ScenePhase = 'entry';
  private coins = 0;
  private result?: RaceResult;
  private racers: Racer[] = [];
  private textures2?: RaceRiderTextures;
  private playMs = 0;
  private speedMult = 1;
  private finishHoldMs = 0;
  private finishGroundOffset?: number;
  private groundOffset = 0;
  private revsPerKm = 0;
  private currentSegmentId = '';

  // 월드 레이어
  private hillFar?: Phaser.GameObjects.Container;
  private hillNear?: Phaser.GameObjects.Container;
  private dashes: Phaser.GameObjects.Rectangle[] = [];
  private grass: Phaser.GameObjects.Rectangle[] = [];
  private finishMarker?: Phaser.GameObjects.Container;

  // HUD
  private rankText?: Phaser.GameObjects.Text;
  private distanceText?: Phaser.GameObjects.Text;
  private clockText?: Phaser.GameObjects.Text;
  private segmentText?: Phaser.GameObjects.Text;
  private motionText?: Phaser.GameObjects.Text;
  private progressFill?: Phaser.GameObjects.Rectangle;
  private progressDots: Phaser.GameObjects.Rectangle[] = [];

  constructor(private readonly hooks: RaceCinematicHooks = {}) {
    super('release-race-e');
  }

  create() {
    this.coins = this.hooks.initialCoins ?? 2480;
    this.textures2 ??= new RaceRiderTextures(this);
    this.buildEntry();
  }

  // ─── 공통 유틸 ────────────────────────────────────────────────────

  private clearStage() {
    this.time.removeAllEvents();
    this.tweens.killAll();
    // DisplayList.removeAll(true)의 true는 destroy가 아니라 콜백 생략입니다.
    this.children.getAll().forEach((child) => child.destroy());
    this.cameras.main.resetFX();
  }

  private text(x: number, y: number, value: string, size = 12, color = CREAM_TEXT) {
    return this.add.text(x, y, value, { fontFamily: 'Arial, sans-serif', fontSize: `${size}px`, color, fontStyle: 'bold' });
  }

  private woodBackdrop(depth = 0) {
    this.add.rectangle(WIDTH / 2, HEIGHT / 2, WIDTH, HEIGHT, WOOD).setDepth(depth);
    for (let y = 0; y < HEIGHT; y += 26) this.add.rectangle(WIDTH / 2, y, WIDTH, 2, WOOD_LINE, 0.45).setDepth(depth);
  }

  private playerStats(): BikeStats {
    return this.hooks.stats ?? { 성능: 3, 스타일: 2, 희귀도: 2 };
  }

  private dayNumber(): number {
    return this.hooks.dayNumber ?? 5;
  }

  // ─── 참가 화면 ────────────────────────────────────────────────────

  private buildEntry() {
    this.phase = 'entry';
    this.woodBackdrop();
    this.text(WIDTH / 2, 32, 'RIVERSIDE 3K · CINEMATIC RACE', 15).setOrigin(0.5);
    this.text(WIDTH / 2, 60, `DAY ${this.dayNumber()} · 스포츠 중계형 자동 레이스`, 10).setOrigin(0.5);

    // 출전 라이더 미리보기: 레이스와 같은 픽셀 프레임(착좌·정지)
    this.add.rectangle(WIDTH / 2, 230, 330, 190, SKY).setStrokeStyle(4, INK);
    this.add.rectangle(WIDTH / 2, 296, 322, 52, ROAD);
    this.add.rectangle(WIDTH / 2, 271, 322, 4, ROAD_EDGE);
    const preview = new RacerView(this, this.textures2!, { category: 'road', role: '정비사', frameColor: RED });
    const previewMotion = createMotionState(Math.PI * 0.35, 'seated');
    preview.update(previewMotion);
    preview.setPosition(WIDTH / 2 - 8, 282);
    this.text(WIDTH / 2, 338, '나 · 드림 로드 · 정비사', 10, INK_TEXT).setOrigin(0.5).setBackgroundColor('#fff1c6').setPadding(6, 3, 6, 3);

    this.text(WIDTH / 2, 392, '3,000m 리버사이드 3K 챌린지', 20).setOrigin(0.5);
    this.text(WIDTH / 2, 426, `참가비 ${META.entryFee} 코인 · 8명 출전`, 11).setOrigin(0.5);

    const prizeRows: Array<[string, string]> = [
      ['1위', `${META.rankRewards[0].toLocaleString()}`],
      ['2위', `${META.rankRewards[1].toLocaleString()}`],
      ['3위', `${META.rankRewards[2].toLocaleString()}`],
      ['완주', `${META.finishReward}`],
    ];
    prizeRows.forEach(([rank, prize], index) => {
      const x = 66 + index * 86;
      this.add.rectangle(x, 470, 78, 26, index === 0 ? GOLD : PALE_GOLD).setStrokeStyle(2, INK);
      this.text(x, 470, `${rank} ${prize}`, 9, INK_TEXT).setOrigin(0.5);
    });
    const coinText = this.text(WIDTH / 2, 508, `보유 코인 ${this.coins.toLocaleString()}`, 12).setOrigin(0.5);

    const button = this.add.rectangle(WIDTH / 2, 566, 300, 52, GREEN).setStrokeStyle(4, INK).setInteractive({ useHandCursor: true });
    this.text(WIDTH / 2, 566, '레이스 시작', 16).setOrigin(0.5);
    const message = this.text(WIDTH / 2, 610, '카메라 조작 없이 자동 중계를 관람합니다.', 10).setOrigin(0.5);

    this.add.rectangle(WIDTH / 2, 700, 358, 96, DARK_WOOD).setStrokeStyle(3, INK);
    this.text(30, 664, 'RIDER MOTION', 9, '#f6d995');
    this.text(30, 684, '오르막과 내리막을 지나 결승선까지 달려보세요.\n자전거를 성장시키면 더 높은 순위에 도전할 수 있어요.\n중계 속도는 경기 중 x1·x2·x4로 바꿀 수 있어요.', 9).setLineSpacing(4);

    button.on('pointerdown', () => {
      if (this.phase !== 'entry') return;
      const entry = applyRaceEntry(this.coins, META);
      if (!entry.ok) {
        message.setText(`코인이 부족합니다. 보유 ${entry.coins} / 참가비 ${entry.entryFee}`);
        return;
      }
      this.coins = entry.coins;
      coinText.setText(`보유 코인 ${this.coins.toLocaleString()}`);
      this.result = simulateRace({
        seed: this.hooks.seed ?? 20260903,
        playerStats: this.playerStats(),
        playerCategory: 'road',
        playerFrameColor: RED,
        meta: META,
      });
      this.startRace();
    });
  }

  // ─── 레이스 시작 ───────────────────────────────────────────────────

  private startRace() {
    const result = this.result!;
    this.phase = 'countdown';
    this.clearStage();
    this.racers = [];
    this.dashes = [];
    this.grass = [];
    this.progressDots = [];
    this.playMs = 0;
    this.speedMult = 1;
    this.groundOffset = 0;
    this.finishHoldMs = 0;
    this.finishGroundOffset = undefined;
    this.currentSegmentId = '';
    // 플레이어 순항이 1.8 rev/s가 되도록 rev/km를 역산하고 모든 레이서에 같은 값을 씁니다
    const player = result.racers.find((racer) => racer.isPlayer)!;
    this.revsPerKm = wheelRevsPerKmForCruise(player.speedScore, result.tickMs);

    // 화면 전환 중에 필요한 텍스처를 모두 굽습니다(라이더 시트 8장 ≈ 200ms)
    const specs: RacerSpec[] = result.racers.map((racer, index) => ({
      category: racer.category as BikeCategory,
      role: roleFor(racer, index),
      frameColor: racer.frameColor,
    }));
    this.textures2!.prewarm(specs);

    this.buildWorld();
    this.buildRacers(specs);
    this.buildHud();

    const steps = ['3', '2', '1', 'GO!'];
    steps.forEach((step, index) => {
      this.time.delayedCall(COUNTDOWN_STEP_MS * index, () => {
        const label = this.text(WIDTH / 2, 236, step, step === 'GO!' ? 40 : 52).setOrigin(0.5).setDepth(60).setStroke(INK_TEXT, 8);
        this.tweens.add({ targets: label, scale: { from: 0.5, to: 1.15 }, alpha: { from: 1, to: 0 }, duration: 560, ease: 'Cubic.easeOut', onComplete: () => label.destroy() });
        if (step === 'GO!') {
          this.phase = 'racing';
          this.playMs = 0;
        }
      });
    });
  }

  private buildWorld() {
    this.add.rectangle(WIDTH / 2, ROAD_TOP / 2, WIDTH, ROAD_TOP, SKY).setDepth(0);
    this.add.rectangle(88, 92, 56, 12, CREAM, 0.75).setDepth(0);
    this.add.rectangle(292, 128, 72, 12, CREAM, 0.75).setDepth(0);

    // 언덕 2겹: 주기(160px / 150px)에 맞춰 modulo 스크롤
    this.hillFar = this.add.container(0, 0).setDepth(1);
    this.hillNear = this.add.container(0, 0).setDepth(2);
    for (let index = 0; index < 8; index += 1) {
      this.hillFar.add(this.add.triangle(index * 160 - 70, ROAD_TOP + 2, 0, 86, 80, 0, 160, 86, HILL_FAR).setOrigin(0, 1));
      this.hillNear.add(this.add.triangle(index * 150 - 40, ROAD_TOP + 6, 0, 62, 75, 0, 150, 62, GREEN).setOrigin(0, 1));
    }

    // 도로: 위·아래 가장자리, 중앙 대시(지면 속도로 흐름)
    this.add.rectangle(WIDTH / 2, (ROAD_TOP + ROAD_BOTTOM) / 2, WIDTH, ROAD_BOTTOM - ROAD_TOP, ROAD).setDepth(3);
    this.add.rectangle(WIDTH / 2, ROAD_TOP + 2, WIDTH, 4, ROAD_EDGE).setDepth(3);
    this.add.rectangle(WIDTH / 2, ROAD_BOTTOM - 2, WIDTH, 4, ROAD_EDGE).setDepth(3);
    for (let index = 0; index < 10; index += 1) {
      this.dashes.push(this.add.rectangle(index * DASH_SPACING, 360, 24, 4, CREAM, 0.6).setOrigin(0, 0.5).setDepth(3));
    }
    // 전경 풀밭 띠: 지면보다 1.4배 빠른 패럴랙스로 속도감을 보강
    this.add.rectangle(WIDTH / 2, ROAD_BOTTOM + 10, WIDTH, 20, GRASS).setDepth(19);
    for (let index = 0; index < 14; index += 1) {
      this.grass.push(this.add.rectangle(index * 30, ROAD_BOTTOM + 4 + (index % 3) * 3, 4 + (index % 2) * 2, 8, 0x5e9a67).setOrigin(0, 1).setDepth(19));
    }

    // 결승선 마커(진행률 1.0 위치의 월드 오브젝트)
    const marker = this.add.container(0, 0).setDepth(4);
    marker.add(this.add.rectangle(0, ROAD_TOP - 8, 8, 70, INK).setOrigin(0.5, 0));
    const flag = this.add.graphics();
    for (let row = 0; row < 3; row += 1) for (let column = 0; column < 5; column += 1) {
      flag.fillStyle((row + column) % 2 === 0 ? INK : CREAM, 1);
      flag.fillRect(column * 8, ROAD_TOP - 8 + row * 8, 8, 8);
    }
    marker.add(flag);
    marker.add(this.text(20, ROAD_TOP - 26, 'FINISH', 9).setOrigin(0.5).setStroke(INK_TEXT, 4));
    marker.add(this.add.rectangle(0, ROAD_TOP + 4, 6, ROAD_BOTTOM - ROAD_TOP - 8, CREAM, 0.7).setOrigin(0.5, 0));
    this.finishMarker = marker;

    // 하단 정보 패널(나무 바닥)
    this.add.rectangle(WIDTH / 2, (ROAD_BOTTOM + 20 + HEIGHT) / 2, WIDTH, HEIGHT - ROAD_BOTTOM - 20, WOOD).setDepth(19);
    for (let y = ROAD_BOTTOM + 30; y < HEIGHT; y += 26) this.add.rectangle(WIDTH / 2, y, WIDTH, 2, WOOD_LINE, 0.5).setDepth(19);
  }

  private buildRacers(specs: RacerSpec[]) {
    const result = this.result!;
    // 고정 레인: NPC는 인덱스 순서로 레인 0~6(원경→근경), 플레이어는 마지막 레인(최근경)
    let npcLane = 0;
    result.racers.forEach((racer, index) => {
      const lane = racer.isPlayer ? LANE_COUNT - 1 : npcLane++;
      const view = new RacerView(this, this.textures2!, specs[index]);
      const motion = createMotionState(index * 1.3, postureAt(0));
      view.update(motion);
      view.setDepth(10 + lane * 0.1);
      view.setPosition(this.racerX(0, 0), this.laneY(lane));
      this.racers.push({ data: racer, view, motion, progress: 0, lane });
    });
  }

  private laneY(lane: number): number {
    return LANE_BASE_Y + lane * LANE_STEP;
  }

  private racerX(progress: number, playerProgress: number): number {
    return PLAYER_X + softClamp((progress - playerProgress) * SPREAD_PX, SPREAD_CLAMP_PX);
  }

  private buildHud() {
    this.add.rectangle(WIDTH / 2, 47, WIDTH, 94, DARK_WOOD, 0.94).setDepth(20);
    this.add.rectangle(44, 17, 66, 22, RED).setStrokeStyle(2, INK).setDepth(21);
    this.text(44, 17, `DAY ${this.dayNumber()}`, 9).setOrigin(0.5).setDepth(22);
    this.add.rectangle(183, 17, 192, 22, GOLD).setStrokeStyle(2, INK).setDepth(21);
    this.text(183, 17, `LIVE · ${META.name}`, 10, INK_TEXT).setOrigin(0.5).setDepth(22);
    this.rankText = this.text(366, 8, '-위', 14).setOrigin(1, 0).setDepth(22);

    // 진행 바 + 참가자 점(플레이어는 빨간 큰 점)
    this.add.rectangle(10, 43, 370, 8, INK).setOrigin(0, 0.5).setDepth(21);
    this.progressFill = this.add.rectangle(10, 43, 0, 6, GREEN).setOrigin(0, 0.5).setDepth(22);
    RACE_SEGMENTS.slice(1).forEach((segment) => this.add.rectangle(10 + segment.from * 370, 43, 2, 12, PALE_GOLD, 0.8).setDepth(23));
    this.result!.racers.forEach((racer) => {
      this.progressDots.push(racer.isPlayer
        ? this.add.rectangle(10, 43, 8, 14, RED).setStrokeStyle(2, CREAM).setDepth(25)
        : this.add.rectangle(10, 43, 5, 9, 0xd9c197).setDepth(24));
    });
    this.distanceText = this.text(12, 54, `0 / ${META.distanceMeters.toLocaleString()}m`, 9).setDepth(22);
    this.clockText = this.text(378, 54, '00:00.0', 9).setOrigin(1, 0).setDepth(22);
    this.segmentText = this.text(WIDTH / 2, 62, '출발 준비', 9, INK_TEXT).setOrigin(0.5, 0).setDepth(22).setBackgroundColor('#f6d995').setPadding(8, 3, 8, 3);

    // 하단 패널: 국면·라이더 상태·배속
    this.add.rectangle(103, ROAD_BOTTOM + 66, 178, 64, CREAM).setStrokeStyle(3, WOOD_LINE).setDepth(21);
    this.text(24, ROAD_BOTTOM + 42, '현재 국면', 9, MUTED_TEXT).setDepth(22);
    this.motionText = this.text(24, ROAD_BOTTOM + 60, '스탠딩 스타트', 11, INK_TEXT).setDepth(22);
    this.speedButton = this.add.rectangle(287, ROAD_BOTTOM + 66, 178, 64, GREEN).setStrokeStyle(3, INK).setInteractive({ useHandCursor: true }).setDepth(21);
    this.speedButton.on('pointerdown', () => this.cycleSpeed());
    this.speedButtonText = this.text(287, ROAD_BOTTOM + 66, '중계 속도 x1', 12).setOrigin(0.5).setDepth(22);

    this.add.rectangle(WIDTH / 2, ROAD_BOTTOM + 160, 358, 96, DARK_WOOD).setStrokeStyle(3, INK).setDepth(21);
    this.text(30, ROAD_BOTTOM + 122, 'BROADCAST NOTE', 8, '#f6d995').setDepth(22);
    this.text(30, ROAD_BOTTOM + 142, '바퀴가 도는 만큼만 땅이 흘러가고, 케이던스는 자세를 따릅니다.\n오르막은 상체를 세우고, 내리막은 에어로 자세로 코스팅,\n마지막 450m는 안장에서 일어나 스퍼트합니다.', 8).setLineSpacing(4).setDepth(22);
  }

  private speedButton?: Phaser.GameObjects.Rectangle;
  private speedButtonText?: Phaser.GameObjects.Text;

  private cycleSpeed() {
    if (this.phase !== 'racing') return;
    this.speedMult = this.speedMult === 1 ? 2 : this.speedMult === 2 ? 4 : 1;
    this.speedButtonText?.setText(`중계 속도 x${this.speedMult}`);
    this.speedButtonText?.setColor(this.speedMult === 2 ? INK_TEXT : CREAM_TEXT);
    this.speedButton?.setFillStyle(this.speedMult === 4 ? RED : this.speedMult === 2 ? GOLD : GREEN);
    if (this.speedMult === 4) this.cameras.main.shake(140, 0.004);
  }

  // ─── 재생 루프 ────────────────────────────────────────────────────

  update(_time: number, delta: number) {
    if (!this.result) return;
    if (this.phase !== 'racing' && this.phase !== 'finish-hold') return;
    const result = this.result;
    if (this.phase === 'racing') this.playMs += delta * this.speedMult;
    const tick = this.playMs / result.tickMs;
    const holding = this.phase === 'finish-hold';

    this.racers.forEach((racer) => {
      // 홀드 중에는 타임라인을 멈추고 관성만 재생합니다
      if (!holding) racer.progress = progressAt(racer.data.timeline, tick, racer.data.finishTimeMs / result.tickMs);
      const finished = racer.progress >= 1;
      advanceMotion(racer.motion, {
        progress: racer.progress,
        deltaMs: delta,
        speedMult: this.speedMult,
        distanceMeters: META.distanceMeters,
        revsPerKm: this.revsPerKm,
        posture: finished ? 'seated' : postureAt(racer.progress),
        coasting: finished || holding,
      });
      racer.view.update(racer.motion);
    });

    const player = this.racers.find((racer) => racer.data.isPlayer)!;
    this.racers.forEach((racer) => {
      const x = this.racerX(racer.progress, player.progress);
      racer.view.setPosition(x, this.laneY(racer.lane));
      racer.view.setVisible(x > -140 && x < WIDTH + 140);
    });

    // 굴림 결합: 플레이어 바퀴가 도는 만큼 지면·언덕·전경이 흐릅니다
    const groundSpeed = groundSpeedPx(player.motion, player.view.wheelRadiusPx);
    this.groundOffset += (groundSpeed * delta) / 1000;
    this.scrollWorld(groundSpeed);

    this.updateHud(player);

    if (this.phase === 'racing' && player.progress >= 1) {
      this.phase = 'finish-hold';
      this.finishGroundOffset = this.groundOffset;
      this.finishHoldMs = FINISH_HOLD_MS;
      this.cameras.main.flash(220, 255, 241, 198, false);
      this.showBanner('결승선 통과!', GOLD);
    } else if (this.phase === 'finish-hold') {
      this.finishHoldMs -= delta;
      if (this.finishHoldMs <= 0) this.showResult();
    }
  }

  private scrollWorld(groundSpeed: number) {
    const offset = this.groundOffset;
    if (this.hillFar) this.hillFar.x = -((offset * 0.25) % 160);
    if (this.hillNear) this.hillNear.x = -((offset * 0.5) % 150);
    // 대시: 빠를수록 길게 늘여(모션 스트레치) 고배속 깜빡임을 줄입니다
    const dashLength = groundSpeed > 400 ? Math.min(44, 24 + groundSpeed / 60) : 24;
    const dashSpan = DASH_SPACING * this.dashes.length;
    this.dashes.forEach((dash, index) => {
      const x = (((index * DASH_SPACING - offset) % dashSpan) + dashSpan) % dashSpan - DASH_SPACING;
      dash.setX(snapToCell(x));
      dash.setDisplaySize(dashLength, 4);
      dash.setAlpha(groundSpeed > 400 ? 0.4 : 0.6);
    });
    const grassSpan = 30 * this.grass.length;
    this.grass.forEach((tuft, index) => {
      const x = (((index * 30 - offset * 1.4) % grassSpan) + grassSpan) % grassSpan - 30;
      tuft.setX(snapToCell(x));
    });
    const player = this.racers.find((racer) => racer.data.isPlayer);
    if (this.finishMarker && player) {
      const playerWorldDistance = META.distanceMeters / 1000 * this.revsPerKm * Math.PI * 2 * player.view.wheelRadiusPx;
      const x = PLAYER_X + (1 - player.progress) * playerWorldDistance
        - (this.finishGroundOffset === undefined ? 0 : this.groundOffset - this.finishGroundOffset);
      this.finishMarker.setVisible(x < WIDTH + 60);
      this.finishMarker.setX(snapToCell(x));
    }
  }

  private updateHud(player: Racer) {
    const result = this.result!;
    const liveRank = 1 + this.racers.filter((racer) => !racer.data.isPlayer
      && (racer.progress > player.progress + 1e-9
        || (racer.progress >= 1 && player.progress >= 1 && racer.data.finishTimeMs < player.data.finishTimeMs))).length;
    this.rankText?.setText(`${player.progress >= 1 ? result.playerRank : liveRank}위 / ${META.racerCount}`);
    this.progressFill?.setDisplaySize(Math.max(1, player.progress * 370), 6);
    this.racers.forEach((racer, index) => this.progressDots[index]?.setX(10 + racer.progress * 370));
    const meters = Math.min(META.distanceMeters, Math.round(player.progress * META.distanceMeters));
    this.distanceText?.setText(`${meters.toLocaleString()} / ${META.distanceMeters.toLocaleString()}m`);
    this.clockText?.setText(formatRaceTime(Math.min(this.playMs, player.data.finishTimeMs)));

    const segment = segmentAt(Math.min(player.progress, 0.999));
    if (segment.id !== this.currentSegmentId && player.progress < 1) {
      this.currentSegmentId = segment.id;
      this.segmentText?.setText(segment.name);
      const banners: Record<string, string> = {
        climb: '오르막! 상체를 세우고 페달을 밟습니다',
        descent: '내리막! 에어로 자세로 코스팅',
        sprint: '피니시 스퍼트 구간!',
      };
      if (segment.id !== 'start') this.showBanner(banners[segment.id] ?? segment.name, segment.speedFactor < 1 ? PALE_GOLD : GOLD);
    }
    const postureLabel: Record<string, string> = { seated: '착좌 페달링', climb: '오르막 · 상체 세움', tuck: '에어로 · 코스팅', sprint: '스탠딩 스프린트' };
    const rpm = Math.round((player.motion.crankRadPerSec / (Math.PI * 2)) * 60);
    const tierLabel: Record<string, string> = { crisp: '스핀업', fast: '순항', blur: '고속' };
    this.motionText?.setText(`${player.progress >= 1 ? '완주 · 코스팅' : postureLabel[player.motion.posture]}\n${rpm}rpm · 바퀴 ${tierLabel[player.motion.tier]}`);
    if (player.motion.posture === 'sprint' && player.progress >= 0.85 && this.phase === 'racing') this.cameras.main.shake(40, 0.0012);
  }

  private showBanner(message: string, color: number) {
    const banner = this.add.rectangle(WIDTH / 2, 130, 270, 32, color).setStrokeStyle(3, INK).setDepth(50).setAlpha(0);
    const label = this.text(WIDTH / 2, 130, message, 11, INK_TEXT).setOrigin(0.5).setDepth(51).setAlpha(0);
    this.tweens.add({ targets: [banner, label], alpha: 1, y: '-=6', duration: 240, ease: 'Cubic.easeOut' });
    this.time.delayedCall(1500, () => {
      this.tweens.add({ targets: [banner, label], alpha: 0, duration: 300, onComplete: () => { banner.destroy(); label.destroy(); } });
    });
  }

  // ─── 결과·정산 ────────────────────────────────────────────────────

  private showResult() {
    if (this.phase === 'result' || !this.result) return;
    this.phase = 'result';
    const result = this.result;
    this.clearStage();
    this.racers = [];
    this.woodBackdrop();
    const player = result.racers.find((racer) => racer.isPlayer)!;
    const isPodium = player.rank <= 3;

    this.text(WIDTH / 2, 90, 'PHOTO FINISH', 28).setOrigin(0.5);
    this.text(WIDTH / 2, 140, `${player.rank}위 · ${formatRaceTime(player.finishTimeMs)}`, 22).setOrigin(0.5);

    // 결과 보드: 상위 3명 + 내 기록
    this.add.rectangle(WIDTH / 2, 262, 330, 150, CREAM).setStrokeStyle(4, INK);
    const ordered = [...result.racers].sort((a, b) => a.rank - b.rank);
    const rows = ordered.filter((racer) => racer.rank <= 3 || racer.isPlayer);
    rows.forEach((racer, index) => {
      const y = 208 + index * 30;
      this.add.rectangle(WIDTH / 2, y, 300, 24, racer.isPlayer ? 0xffe6a8 : PALE_GOLD, racer.isPlayer ? 1 : 0.7).setStrokeStyle(2, racer.isPlayer ? WOOD_LINE : 0xd9c197);
      this.text(58, y, `${racer.rank}위`, 11, racer.rank === 1 ? '#b8761a' : INK_TEXT).setOrigin(0, 0.5);
      this.text(96, y, racer.isPlayer ? '나 · 드림 로드' : racer.name, 11, INK_TEXT).setOrigin(0, 0.5);
      this.text(330, y, formatRaceTime(racer.finishTimeMs), 11, MUTED_TEXT).setOrigin(1, 0.5);
    });

    const reward = applyRaceReward(this.coins, player.rank, META);
    this.text(WIDTH / 2, 372, `${isPodium ? '상금' : '완주 수당'} +${reward.reward.toLocaleString()} 코인`, 18).setOrigin(0.5);
    if (!isPodium) this.text(WIDTH / 2, 400, `참가비 ${META.entryFee}코인보다 적어요 — 자전거를 성장시켜 보세요`, 10).setOrigin(0.5);
    else {
      for (let index = 0; index < 14; index += 1) {
        const confetti = this.add.rectangle(60 + (index * 53) % 270, 60, 8, 8, [GOLD, RED, GREEN, 0x4e8092][index % 4]).setStrokeStyle(1, INK);
        this.tweens.add({ targets: confetti, y: 520 + (index % 5) * 24, angle: 180 + index * 40, alpha: { from: 1, to: 0.1 }, duration: 1400 + index * 90, ease: 'Sine.easeIn', onComplete: () => confetti.destroy() });
      }
    }

    const button = this.add.rectangle(WIDTH / 2, 470, 280, 50, GREEN).setStrokeStyle(4, INK).setInteractive({ useHandCursor: true });
    this.text(WIDTH / 2, 470, '보상 받고 Garage로', 14).setOrigin(0.5);
    let claimed = false;
    button.on('pointerdown', () => {
      if (claimed) return;
      claimed = true;
      this.coins = reward.coins;
      this.hooks.onSettled?.({ rank: player.rank, reward: reward.reward, coins: reward.coins });
      button.setFillStyle(GOLD);
    });
  }
}

export function startRaceCinematicBroadcast(parent: string, hooks: RaceCinematicHooks = {}) {
  return new Phaser.Game({
    type: Phaser.AUTO,
    width: WIDTH,
    height: HEIGHT,
    parent,
    pixelArt: true,
    roundPixels: true,
    scene: new RaceCinematicScene(hooks),
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  });
}
