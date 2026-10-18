import Phaser from 'phaser';
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
  type RaceMeta,
  type RaceResult,
  type RaceSegmentId,
  type RacerResult,
} from './race-progress';
import {
  advanceMotion,
  createMotionState,
  groundSpeedPx,
  postureAt,
  wheelRevsPerKmForCruise,
  type RiderMotionState,
  type RiderPosture,
} from './race-rider-motion';
import { RaceRiderTextures, RacerView, snapToCell, type RacerSpec } from './race-rider-view';

// 레이스 중계 화면(출시 적용) — 시네마틱 스포츠 중계형.
// 결과는 race-progress.simulateRace가 먼저 확정하고, 이 씬은 타임라인을 재생만 합니다.
// 중계(월드·레이서·HUD·순위표·재생 루프)는 RaceBroadcastScene이 맡고, 화면마다 다른 앞뒤 장면은 하위 씬이 맡습니다.
// - RaceCinematicScene: 대회일 레이스(참가 → 중계 → 결과·보상)
// - PrologueScene(prologue-design.ts): 첫 시작 프롤로그(삼촌의 프로 대회 → 시상 → 두리의 결심)
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
  playerBike?: { name: string; category: BikeCategory; frameColor: number };
  entryFeePaid?: boolean;
  onEntered?: (value: { coins: number; entryFee: number }) => void;
  onExit?: () => void;
  onSettled?: (value: { rank: number; reward: number; coins: number }) => void;
};

const META = RIVERSIDE_ENDURANCE_RACE;
const WIDTH = 390;
const HEIGHT = 810;

// 다른 출시 화면과 같은 글꼴
const FONT = '"Arial Rounded MT Bold", "Noto Sans KR", sans-serif';
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
/** 레인 0의 바퀴 축 y. 레인이 늘수록 5px씩 내려오며(근경) 주인공 레이서는 마지막 레인 */
const LANE_BASE_Y = 338;
const LANE_STEP = 5;
const ROAD_TOP = 300;
const ROAD_BOTTOM = 418;
/** 진행률 1.0 차이가 화면 px로 환산되는 길이 */
const SPREAD_PX = 3000;
/** 상대 위치 소프트 클램프(tanh) 반경 */
const SPREAD_CLAMP_PX = 180;
const DASH_SPACING = 52;
const FINISH_HOLD_MS = 1600;
const COUNTDOWN_STEP_MS = 620;
/** 실시간 순위표 줄 수(상위 3명 + 나) 와 갱신 주기 */
const BOARD_ROWS = 4;
const BOARD_REFRESH_MS = 200;

/** 중계 화면 레이아웃 중 하위 씬이 배치에 쓰는 값(px) */
export const BROADCAST_LAYOUT = {
  width: WIDTH,
  height: HEIGHT,
  focusX: PLAYER_X,
  roadTop: ROAD_TOP,
  roadBottom: ROAD_BOTTOM,
  /** 순위표 패널 아래 가장자리 */
  boardBottom: ROAD_BOTTOM + 112 + 120,
};

/** 중계 재생 단계: 준비(하위 씬 화면) → 카운트다운 → 경기 → 완주 홀드 → 종료(하위 씬 화면) */
export type BroadcastPhase = 'setup' | 'countdown' | 'racing' | 'finish-hold' | 'after';

export type BroadcastRacer = {
  data: RacerResult;
  view: RacerView;
  motion: RiderMotionState;
  progress: number;
  lane: number;
};

function softClamp(value: number, limit: number): number {
  return limit * Math.tanh(value / limit);
}

// 시각 크기가 작은 버튼도 터치 영역은 44px 이상이 되도록 hitArea만 넓힌다
export function widenHitArea(shape: Phaser.GameObjects.Rectangle, pad: number) {
  shape.setInteractive({
    hitArea: new Phaser.Geom.Rectangle(-pad, -pad, shape.width + pad * 2, shape.height + pad * 2),
    hitAreaCallback: Phaser.Geom.Rectangle.Contains,
    useHandCursor: true,
  });
  return shape;
}

type BoardRow = {
  bg: Phaser.GameObjects.Rectangle;
  rank: Phaser.GameObjects.Text;
  name: Phaser.GameObjects.Text;
  value: Phaser.GameObjects.Text;
};

const DEFAULT_SEGMENT_BANNERS: Partial<Record<RaceSegmentId, string>> = {
  climb: '오르막! 상체를 세우고 페달을 밟습니다',
  descent: '내리막! 에어로 자세로 코스팅',
  sprint: '피니시 스퍼트 구간!',
};

/**
 * 시네마틱 중계 공통 씬. 확정된 RaceResult를 받아 월드·레이서·HUD·실시간 순위표를 만들고 타임라인을 재생합니다.
 * 카메라는 '주인공 레이서'(isFocus)를 따라가며, 그 레이서가 결승선을 넘고 홀드가 끝나면 onBroadcastFinished를 부릅니다.
 * 하위 씬은 레이서 외형·이름·배지·해설과 앞뒤 장면만 정합니다.
 */
export abstract class RaceBroadcastScene extends Phaser.Scene {
  protected phase: BroadcastPhase = 'setup';
  protected result?: RaceResult;
  protected racers: BroadcastRacer[] = [];
  protected playMs = 0;
  protected speedMult = 1;
  private riderTextureCache?: RaceRiderTextures;
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
  // 실시간 순위표(상위 3명 + 주인공 레이서)
  private boardRows: BoardRow[] = [];
  private boardTimerMs = 0;
  private speedButton?: Phaser.GameObjects.Rectangle;
  private speedButtonText?: Phaser.GameObjects.Text;

  // ─── 하위 씬이 정하는 표시 규칙 ─────────────────────────────────────

  /** 레이서 외형(자전거·역할·팀 색) */
  protected abstract racerSpec(racer: RacerResult, index: number): RacerSpec;
  /** 순위표·결과에 쓰는 레이서 이름 */
  protected abstract racerLabel(racer: RacerResult): string;
  /** HUD 좌상단 배지 문구 (대회일 레이스는 `DAY n`) */
  protected abstract hudBadge(): string;
  /** 주인공 레이서가 결승선을 넘고 홀드가 끝났을 때 */
  protected abstract onBroadcastFinished(): void;

  /** 카메라가 따라가는 주인공 레이서 */
  protected isFocus(racer: RacerResult): boolean {
    return racer.isPlayer;
  }

  /** 출발 카운트다운. 빈 배열이면 이미 달리는 중인 장면으로 바로 시작합니다. */
  protected countdownSteps(): string[] {
    return ['3', '2', '1', 'GO!'];
  }

  /** 진행률 → 자세 */
  protected postureFor(progress: number): RiderPosture {
    return postureAt(progress);
  }

  /** 레이서별 시작 운동 상태 */
  protected initialMotion(index: number): RiderMotionState {
    return createMotionState(index * 1.3, this.postureFor(0));
  }

  /** 주인공 레이서가 구간에 들어설 때 띄우는 해설(없으면 띄우지 않음) */
  protected segmentBanner(segmentId: RaceSegmentId): string | undefined {
    return DEFAULT_SEGMENT_BANNERS[segmentId];
  }

  protected finishBanner(): string {
    return '결승선 통과!';
  }

  protected distanceLabel(meters: number, totalMeters: number): string {
    return `${meters.toLocaleString()} / ${totalMeters.toLocaleString()}m`;
  }

  /** 중계 HUD를 다 그린 뒤 하위 씬이 덧붙일 요소(건너뛰기 버튼 등) */
  protected decorateBroadcast(): void {}

  /** 카운트다운이 끝나고(또는 바로) 경기가 시작될 때 */
  protected onRaceStarted(): void {}

  /** 경기 중 매 프레임, 레이서 위치를 옮긴 뒤 */
  protected onRacingFrame(_focus: BroadcastRacer): void {}

  // ─── 공통 유틸 ────────────────────────────────────────────────────

  protected get riderTextures(): RaceRiderTextures {
    this.riderTextureCache ??= new RaceRiderTextures(this);
    return this.riderTextureCache;
  }

  protected raceMeta(): RaceMeta {
    return this.result?.meta ?? META;
  }

  protected clearStage() {
    this.time.removeAllEvents();
    this.tweens.killAll();
    // DisplayList.removeAll(true)의 true는 destroy가 아니라 콜백 생략입니다.
    this.children.getAll().forEach((child) => child.destroy());
    this.cameras.main.resetFX();
  }

  protected text(x: number, y: number, value: string, size = 12, color = CREAM_TEXT) {
    return this.add.text(x, y, value, { fontFamily: FONT, fontSize: `${size}px`, color, fontStyle: 'bold' });
  }

  protected woodBackdrop(depth = 0) {
    this.add.rectangle(WIDTH / 2, HEIGHT / 2, WIDTH, HEIGHT, WOOD).setDepth(depth);
    for (let y = 0; y < HEIGHT; y += 26) this.add.rectangle(WIDTH / 2, y, WIDTH, 2, WOOD_LINE, 0.45).setDepth(depth);
  }

  protected showBanner(message: string, color: number) {
    const banner = this.add.rectangle(WIDTH / 2, 130, 270, 32, color).setStrokeStyle(3, INK).setDepth(50).setAlpha(0);
    const label = this.text(WIDTH / 2, 130, message, 11, INK_TEXT).setOrigin(0.5).setDepth(51).setAlpha(0);
    this.tweens.add({ targets: [banner, label], alpha: 1, y: '-=6', duration: 240, ease: 'Cubic.easeOut' });
    this.time.delayedCall(1500, () => {
      this.tweens.add({ targets: [banner, label], alpha: 0, duration: 300, onComplete: () => { banner.destroy(); label.destroy(); } });
    });
  }

  protected focusRacer(): BroadcastRacer | undefined {
    return this.racers.find((racer) => this.isFocus(racer.data));
  }

  // ─── 중계 시작 ─────────────────────────────────────────────────────

  /** 확정된 결과로 중계 화면을 새로 만들고 카운트다운(또는 바로 출발)을 시작합니다. */
  protected startBroadcast(result: RaceResult) {
    this.result = result;
    this.phase = 'countdown';
    this.clearStage();
    this.racers = [];
    this.dashes = [];
    this.grass = [];
    this.progressDots = [];
    this.boardRows = [];
    this.boardTimerMs = 0;
    this.playMs = 0;
    this.speedMult = 1;
    this.groundOffset = 0;
    this.finishHoldMs = 0;
    this.finishGroundOffset = undefined;
    this.currentSegmentId = '';
    // 주인공 레이서 순항이 1.8 rev/s가 되도록 rev/km를 역산하고 모든 레이서에 같은 값을 씁니다
    const focus = result.racers.find((racer) => this.isFocus(racer)) ?? result.racers[0];
    this.revsPerKm = wheelRevsPerKmForCruise(focus.speedScore, result.tickMs);

    // 화면 전환 중에 필요한 텍스처를 모두 굽습니다(라이더 시트 8장 ≈ 200ms)
    const specs = result.racers.map((racer, index) => this.racerSpec(racer, index));
    this.riderTextures.prewarm(specs);

    this.buildWorld();
    this.buildRacers(specs);
    this.buildHud();
    this.decorateBroadcast();

    const steps = this.countdownSteps();
    if (steps.length === 0) {
      this.beginRacing();
      return;
    }
    steps.forEach((step, index) => {
      this.time.delayedCall(COUNTDOWN_STEP_MS * index, () => {
        const label = this.text(WIDTH / 2, 236, step, step === 'GO!' ? 40 : 52).setOrigin(0.5).setDepth(60).setStroke(INK_TEXT, 8);
        this.tweens.add({ targets: label, scale: { from: 0.5, to: 1.15 }, alpha: { from: 1, to: 0 }, duration: 560, ease: 'Cubic.easeOut', onComplete: () => label.destroy() });
        if (index === steps.length - 1) this.beginRacing();
      });
    });
  }

  private beginRacing() {
    this.phase = 'racing';
    this.playMs = 0;
    this.onRaceStarted();
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
    // 고정 레인: 다른 레이서는 인덱스 순서로 레인 0~(n-2)(원경→근경), 주인공 레이서는 마지막 레인(최근경)
    const laneCount = result.racers.length;
    let otherLane = 0;
    result.racers.forEach((racer, index) => {
      const lane = this.isFocus(racer) ? laneCount - 1 : otherLane++;
      const view = new RacerView(this, this.riderTextures, specs[index]);
      const motion = this.initialMotion(index);
      view.update(motion);
      view.setDepth(10 + lane * 0.1);
      view.setPosition(this.racerX(0, 0), this.laneY(lane));
      this.racers.push({ data: racer, view, motion, progress: 0, lane });
    });
  }

  protected laneY(lane: number): number {
    return LANE_BASE_Y + lane * LANE_STEP;
  }

  protected racerX(progress: number, focusProgress: number): number {
    return PLAYER_X + softClamp((progress - focusProgress) * SPREAD_PX, SPREAD_CLAMP_PX);
  }

  private buildHud() {
    const meta = this.raceMeta();
    this.add.rectangle(WIDTH / 2, 47, WIDTH, 94, DARK_WOOD, 0.94).setDepth(20);
    this.add.rectangle(44, 17, 66, 22, RED).setStrokeStyle(2, INK).setDepth(21);
    this.text(44, 17, this.hudBadge(), 10).setOrigin(0.5).setDepth(22);
    this.add.rectangle(183, 17, 192, 22, GOLD).setStrokeStyle(2, INK).setDepth(21);
    this.text(183, 17, `LIVE · ${meta.name}`, 10, INK_TEXT).setOrigin(0.5).setDepth(22);
    this.rankText = this.text(366, 8, '-위', 14).setOrigin(1, 0).setDepth(22);

    // 진행 바 + 참가자 점(주인공 레이서는 빨간 큰 점)
    this.add.rectangle(10, 43, 370, 8, INK).setOrigin(0, 0.5).setDepth(21);
    this.progressFill = this.add.rectangle(10, 43, 0, 6, GREEN).setOrigin(0, 0.5).setDepth(22);
    RACE_SEGMENTS.slice(1).forEach((segment) => this.add.rectangle(10 + segment.from * 370, 43, 2, 12, PALE_GOLD, 0.8).setDepth(23));
    this.result!.racers.forEach((racer) => {
      this.progressDots.push(this.isFocus(racer)
        ? this.add.rectangle(10, 43, 8, 14, RED).setStrokeStyle(2, CREAM).setDepth(25)
        : this.add.rectangle(10, 43, 5, 9, 0xd9c197).setDepth(24));
    });
    // 거리·경과 시계는 수치이므로 최소 11px (브리프 규칙 4). y 54~69 범위라 HUD 패널(0~94)·중앙 구간 배지와 겹치지 않음
    this.distanceText = this.text(12, 54, this.distanceLabel(0, meta.distanceMeters), 11).setDepth(22);
    this.clockText = this.text(378, 54, '00:00.0', 11).setOrigin(1, 0).setDepth(22);
    this.segmentText = this.text(WIDTH / 2, 62, '출발 준비', 10, INK_TEXT).setOrigin(0.5, 0).setDepth(22).setBackgroundColor('#f6d995').setPadding(8, 3, 8, 3);

    // 하단 패널: 국면·라이더 상태·배속
    this.add.rectangle(103, ROAD_BOTTOM + 66, 178, 64, CREAM).setStrokeStyle(3, WOOD_LINE).setDepth(21);
    this.text(24, ROAD_BOTTOM + 42, '현재 국면', 10, MUTED_TEXT).setDepth(22);
    this.motionText = this.text(24, ROAD_BOTTOM + 60, '스탠딩 스타트', 11, INK_TEXT).setDepth(22);
    this.speedButton = this.add.rectangle(287, ROAD_BOTTOM + 66, 178, 64, GREEN).setStrokeStyle(3, INK).setInteractive({ useHandCursor: true }).setDepth(21);
    this.speedButton.on('pointerdown', () => this.cycleSpeed());
    this.speedButtonText = this.text(287, ROAD_BOTTOM + 66, '중계 속도 x1', 12).setOrigin(0.5).setDepth(22);

    this.buildLeaderboard();
  }

  // 실시간 순위표 패널: 상위 3명 + 주인공 레이서(상위권이면 4위까지). 값은 updateLeaderboard가 틱마다 채운다
  private buildLeaderboard() {
    const top = ROAD_BOTTOM + 112;
    this.add.rectangle(WIDTH / 2, top + 60, 358, 120, DARK_WOOD).setStrokeStyle(3, INK).setDepth(21);
    this.text(30, top + 10, 'LIVE RANKING', 10, '#f6d995').setDepth(22);
    // 값 칸은 달리는 중엔 진행 거리, 완주 후엔 기록을 보여 주므로 두 값을 포괄하는 헤더로 둔다
    this.text(360, top + 10, '진행 · 기록', 10, '#f6d995').setOrigin(1, 0).setDepth(22);
    for (let index = 0; index < BOARD_ROWS; index += 1) {
      const y = top + 38 + index * 22;
      const bg = this.add.rectangle(WIDTH / 2, y, 334, 20, PALE_GOLD, 0.12).setDepth(21);
      const rank = this.text(34, y, '', 11).setOrigin(0, 0.5).setDepth(22);
      const name = this.text(68, y, '', 11).setOrigin(0, 0.5).setDepth(22);
      const value = this.text(356, y, '', 11).setOrigin(1, 0.5).setDepth(22);
      this.boardRows.push({ bg, rank, name, value });
    }
    const focus = this.focusRacer();
    if (focus) this.updateLeaderboard(focus);
  }

  /** 현재 시점의 순위: 나보다 앞선(진행률이 크거나, 둘 다 완주했으면 기록이 빠른) 참가자 수 + 1 */
  protected liveRankOf(target: BroadcastRacer): number {
    return 1 + this.racers.filter((other) => other !== target
      && (other.progress > target.progress + 1e-9
        || (other.progress >= 1 && target.progress >= 1 && other.data.finishTimeMs < target.data.finishTimeMs))).length;
  }

  /** 현재 선두 레이서 */
  protected liveLeader(): BroadcastRacer | undefined {
    return this.racers.find((racer) => this.liveRankOf(racer) === 1);
  }

  private updateLeaderboard(focus: BroadcastRacer) {
    // 카운트다운 중에는 모두 진행 0이라 순위가 의미 없다. 출발 순서(참가자 목록 순)만 보여 주고 출발 후부터 순위를 계산한다
    const waiting = this.phase === 'countdown' || this.playMs <= 0;
    const ordered = waiting ? [...this.racers] : [...this.racers].sort((a, b) => {
      if (a.progress >= 1 && b.progress >= 1) return a.data.finishTimeMs - b.data.finishTimeMs;
      return b.progress - a.progress;
    });
    const rows = ordered.slice(0, BOARD_ROWS - 1);
    if (rows.includes(focus)) {
      const next = ordered[BOARD_ROWS - 1];
      if (next) rows.push(next);
    } else {
      rows.push(focus);
    }
    rows.forEach((racer, index) => {
      const row = this.boardRows[index];
      if (!row) return;
      const isFocus = racer === focus;
      const finished = racer.progress >= 1;
      row.bg.setFillStyle(isFocus ? GOLD : PALE_GOLD, isFocus ? 0.35 : 0.12);
      // 출발 전에는 순위 대신 '—'
      row.rank.setText(waiting ? '—' : `${finished ? racer.data.rank : this.liveRankOf(racer)}위`);
      row.name.setText(this.racerLabel(racer.data)).setColor(isFocus ? '#f4b84a' : CREAM_TEXT);
      // 완주한 참가자는 거리 대신 '완주 + 기록'을 보여 준다(헤더 '진행 · 기록'과 대응)
      row.value.setText(finished
        ? `완주 ${formatRaceTime(racer.data.finishTimeMs)}`
        : `${Math.round(racer.progress * this.raceMeta().distanceMeters).toLocaleString()}m`);
    });
  }

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
    const distanceMeters = this.raceMeta().distanceMeters;
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
        distanceMeters,
        revsPerKm: this.revsPerKm,
        posture: finished ? 'seated' : this.postureFor(racer.progress),
        coasting: finished || holding,
      });
      racer.view.update(racer.motion);
    });

    const focus = this.focusRacer()!;
    this.racers.forEach((racer) => {
      const x = this.racerX(racer.progress, focus.progress);
      racer.view.setPosition(x, this.laneY(racer.lane));
      racer.view.setVisible(x > -140 && x < WIDTH + 140);
    });

    // 굴림 결합: 주인공 레이서 바퀴가 도는 만큼 지면·언덕·전경이 흐릅니다
    const groundSpeed = groundSpeedPx(focus.motion, focus.view.wheelRadiusPx);
    this.groundOffset += (groundSpeed * delta) / 1000;
    this.scrollWorld(groundSpeed, focus);

    this.updateHud(focus, delta);
    if (this.phase === 'racing') this.onRacingFrame(focus);

    if (this.phase === 'racing' && focus.progress >= 1) {
      this.phase = 'finish-hold';
      this.finishGroundOffset = this.groundOffset;
      this.finishHoldMs = FINISH_HOLD_MS;
      this.cameras.main.flash(220, 255, 241, 198, false);
      this.showBanner(this.finishBanner(), GOLD);
    } else if (this.phase === 'finish-hold') {
      this.finishHoldMs -= delta;
      if (this.finishHoldMs <= 0) {
        this.phase = 'after';
        this.onBroadcastFinished();
      }
    }
  }

  private scrollWorld(groundSpeed: number, focus: BroadcastRacer) {
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
    if (this.finishMarker) {
      const focusWorldDistance = this.raceMeta().distanceMeters / 1000 * this.revsPerKm * Math.PI * 2 * focus.view.wheelRadiusPx;
      const x = PLAYER_X + (1 - focus.progress) * focusWorldDistance
        - (this.finishGroundOffset === undefined ? 0 : this.groundOffset - this.finishGroundOffset);
      this.finishMarker.setVisible(x < WIDTH + 60);
      this.finishMarker.setX(snapToCell(x));
    }
  }

  private updateHud(focus: BroadcastRacer, delta: number) {
    const result = this.result!;
    const meta = this.raceMeta();
    this.rankText?.setText(`${focus.progress >= 1 ? focus.data.rank : this.liveRankOf(focus)}위 / ${result.racers.length}`);
    // 순위표는 텍스트 재생성 비용을 줄이기 위해 일정 주기로만 갱신한다
    this.boardTimerMs += delta;
    if (this.boardTimerMs >= BOARD_REFRESH_MS) {
      this.boardTimerMs = 0;
      this.updateLeaderboard(focus);
    }
    this.progressFill?.setDisplaySize(Math.max(1, focus.progress * 370), 6);
    this.racers.forEach((racer, index) => this.progressDots[index]?.setX(10 + racer.progress * 370));
    const meters = Math.min(meta.distanceMeters, Math.round(focus.progress * meta.distanceMeters));
    this.distanceText?.setText(this.distanceLabel(meters, meta.distanceMeters));
    this.clockText?.setText(formatRaceTime(Math.min(this.playMs, focus.data.finishTimeMs)));

    const segment = segmentAt(Math.min(focus.progress, 0.999));
    if (segment.id !== this.currentSegmentId && focus.progress < 1) {
      this.currentSegmentId = segment.id;
      this.segmentText?.setText(segment.name);
      const banner = segment.id === 'start' ? undefined : this.segmentBanner(segment.id);
      if (banner) this.showBanner(banner, segment.speedFactor < 1 ? PALE_GOLD : GOLD);
    }
    const postureLabel: Record<string, string> = { seated: '착좌 페달링', climb: '오르막 · 상체 세움', tuck: '에어로 · 코스팅', sprint: '스탠딩 스프린트' };
    const rpm = Math.round((focus.motion.crankRadPerSec / (Math.PI * 2)) * 60);
    const tierLabel: Record<string, string> = { crisp: '스핀업', fast: '순항', blur: '고속' };
    this.motionText?.setText(`${focus.progress >= 1 ? '완주 · 코스팅' : postureLabel[focus.motion.posture]}\n${rpm}rpm · 바퀴 ${tierLabel[focus.motion.tier]}`);
    if (focus.motion.posture === 'sprint' && focus.progress >= 0.85 && this.phase === 'racing') this.cameras.main.shake(40, 0.0012);
  }
}

/** 대회일 레이스: 참가(참가비) → 중계 → 결과·보상 */
export class RaceCinematicScene extends RaceBroadcastScene {
  private coins = 0;

  constructor(private readonly hooks: RaceCinematicHooks = {}) {
    super('release-race-e');
  }

  create() {
    // 훅이 없으면 중립값(0 코인)에서 시작한다
    this.coins = this.hooks.initialCoins ?? 0;
    this.buildEntry();
  }

  private playerStats(): BikeStats {
    return this.hooks.stats ?? { 성능: 3, 스타일: 2, 희귀도: 2 };
  }

  private dayNumber(): number {
    return this.hooks.dayNumber ?? 1;
  }

  private playerBike() {
    return this.hooks.playerBike ?? { name: '드림 로드', category: 'road' as BikeCategory, frameColor: RED };
  }

  protected racerSpec(racer: RacerResult, index: number): RacerSpec {
    const role = racer.isPlayer ? '정비사' : index % 2 === 0 ? '고객' : '점장';
    return { category: racer.category as BikeCategory, role, frameColor: racer.frameColor };
  }

  protected racerLabel(racer: RacerResult): string {
    return racer.isPlayer ? `나 · ${this.playerBike().name}` : racer.name;
  }

  protected hudBadge(): string {
    return `DAY ${this.dayNumber()}`;
  }

  protected onBroadcastFinished(): void {
    this.showResult();
  }

  // ─── 참가 화면 ────────────────────────────────────────────────────

  private buildEntry() {
    this.phase = 'setup';
    this.woodBackdrop();
    this.text(WIDTH / 2, 32, 'RIVERSIDE 3K · RACE DAY', 15).setOrigin(0.5);
    // 부제는 짧게 두어(약 135px) 왼쪽 `← 홈` 버튼(x 16~100)과 20px 이상 간격을 확보한다
    this.text(WIDTH / 2, 60, `DAY ${this.dayNumber()} · 대회일 · 자동 중계`, 11).setOrigin(0.5);

    // 출전 라이더 미리보기: 레이스와 같은 픽셀 프레임(착좌·정지)
    this.add.rectangle(WIDTH / 2, 230, 330, 190, SKY).setStrokeStyle(4, INK);
    this.add.rectangle(WIDTH / 2, 296, 322, 52, ROAD);
    this.add.rectangle(WIDTH / 2, 271, 322, 4, ROAD_EDGE);
    const bike = this.playerBike();
    const preview = new RacerView(this, this.riderTextures, { category: bike.category, role: '정비사', frameColor: bike.frameColor });
    const previewMotion = createMotionState(Math.PI * 0.35, 'seated');
    preview.update(previewMotion);
    preview.setPosition(WIDTH / 2 - 8, 282);
    this.text(WIDTH / 2, 338, `나 · ${bike.name} · 정비사`, 11, INK_TEXT).setOrigin(0.5).setBackgroundColor('#fff1c6').setPadding(6, 3, 6, 3);

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
      this.add.rectangle(x, 470, 78, 28, index === 0 ? GOLD : PALE_GOLD).setStrokeStyle(2, INK);
      this.text(x, 470, `${rank} ${prize}`, 11, INK_TEXT).setOrigin(0.5);
    });
    const coinText = this.text(WIDTH / 2, 508, `보유 코인 ${this.coins.toLocaleString()}`, 12).setOrigin(0.5);

    // 뒤로가기: 다른 화면과 같은 `← 홈` 라벨, 터치 영역은 44px 이상
    const back = widenHitArea(this.add.rectangle(58, 60, 84, 36, PALE_GOLD).setStrokeStyle(3, INK), 6);
    this.text(58, 60, '← 홈', 11, INK_TEXT).setOrigin(0.5);
    back.on('pointerdown', () => this.hooks.onExit?.());

    const button = this.add.rectangle(WIDTH / 2, 566, 300, 52, GREEN).setStrokeStyle(4, INK).setInteractive({ useHandCursor: true });
    this.text(WIDTH / 2, 566, '레이스 시작', 16).setOrigin(0.5);
    const message = this.text(WIDTH / 2, 610, '카메라 조작 없이 자동 중계를 관람합니다.', 11).setOrigin(0.5);

    // 코스 안내: 구간 순서와 구간별 속도 변화를 플레이어 문구로 설명한다
    this.add.rectangle(WIDTH / 2, 702, 358, 104, DARK_WOOD).setStrokeStyle(3, INK);
    // 제목 11px(658~672) 아래 본문 4줄(678~746)이 패널(650~754) 안에 들어온다
    this.text(30, 658, '코스 안내', 11, '#f6d995');
    const course = RACE_SEGMENTS.map((segment) => segment.name).join(' → ');
    this.text(30, 678, `${course}\n오르막에선 속도가 떨어지고, 내리막에선 빨라집니다.\n자전거를 성장시키면 더 높은 순위에 도전할 수 있어요.\n중계 속도는 경기 중 x1·x2·x4로 바꿀 수 있어요.`, 11).setLineSpacing(4);

    button.on('pointerdown', () => {
      if (this.phase !== 'setup') return;
      const entry = this.hooks.entryFeePaid
        ? { ok: true as const, coins: this.coins, entryFee: META.entryFee }
        : applyRaceEntry(this.coins, META);
      if (!entry.ok) {
        message.setText(`코인이 부족합니다. 보유 ${entry.coins} / 참가비 ${entry.entryFee}`);
        return;
      }
      this.coins = entry.coins;
      if (!this.hooks.entryFeePaid) this.hooks.onEntered?.({ coins: entry.coins, entryFee: entry.entryFee });
      coinText.setText(`보유 코인 ${this.coins.toLocaleString()}`);
      this.startBroadcast(simulateRace({
        seed: this.hooks.seed ?? 20260903,
        playerStats: this.playerStats(),
        playerCategory: bike.category,
        playerFrameColor: bike.frameColor,
        meta: META,
      }));
    });
  }

  // ─── 결과·정산 ────────────────────────────────────────────────────

  private showResult() {
    if (!this.result) return;
    const result = this.result;
    this.clearStage();
    this.racers = [];
    this.woodBackdrop();
    const player = result.racers.find((racer) => racer.isPlayer)!;
    const isPodium = player.rank <= 3;

    // 다른 화면과 같은 DAY 태그를 상단에 작게 둔다
    this.add.rectangle(44, 24, 66, 22, RED).setStrokeStyle(2, INK);
    this.text(44, 24, `DAY ${this.dayNumber()}`, 10).setOrigin(0.5);
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
      this.text(96, y, this.racerLabel(racer), 11, INK_TEXT).setOrigin(0, 0.5);
      this.text(330, y, formatRaceTime(racer.finishTimeMs), 11, MUTED_TEXT).setOrigin(1, 0.5);
    });

    const reward = applyRaceReward(this.coins, player.rank, META);
    this.text(WIDTH / 2, 372, `${isPodium ? '상금' : '완주 수당'} +${reward.reward.toLocaleString()} 코인`, 18).setOrigin(0.5);
    if (!isPodium) this.text(WIDTH / 2, 400, `참가비 ${META.entryFee}코인보다 적어요 — 자전거를 성장시켜 보세요`, 11).setOrigin(0.5);
    else {
      for (let index = 0; index < 14; index += 1) {
        const confetti = this.add.rectangle(60 + (index * 53) % 270, 60, 8, 8, [GOLD, RED, GREEN, 0x4e8092][index % 4]).setStrokeStyle(1, INK);
        this.tweens.add({ targets: confetti, y: 520 + (index % 5) * 24, angle: 180 + index * 40, alpha: { from: 1, to: 0.1 }, duration: 1400 + index * 90, ease: 'Sine.easeIn', onComplete: () => confetti.destroy() });
      }
    }

    const button = this.add.rectangle(WIDTH / 2, 470, 280, 50, GREEN).setStrokeStyle(4, INK).setInteractive({ useHandCursor: true });
    this.text(WIDTH / 2, 470, '보상 받고 홈으로', 14).setOrigin(0.5);
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
