import Phaser from 'phaser';
import type { ClimaxLevel } from './race-climax';
import {
  FOCUS_LINES,
  START_BURST_PARTICLES,
  auraFor,
  calloutFor,
  fxBudgetFor,
  distancePoles,
  ghostTrailFor,
  poleLabel,
  poleScreenX,
  poleTone,
  showsCalloutForOthers,
  startLampsAt,
  sweatIntervalFor,
  trailFor,
  type Callout,
  type FxBudget,
  type FxTone,
  type RankChange,
} from './race-fx';
import type { RiderMotionState, RiderPosture } from './race-rider-motion';
import { snapToCell, type RacerView } from './race-rider-view';

// 레이스 중계 이펙트 레이어(Phaser).
// '언제·무엇을' 정하는 규칙은 race-fx(순수 모듈)가 맡고, 이 레이어는 그 값을 읽어 그리기만 합니다.
// RaceBroadcastScene이 중계를 만들 때 함께 만들고, 매 프레임 update()에 레이서·주인공·막판 강도를 넘깁니다.
// - 입자(먼지·바람 줄기·스파클·땀·컨페티)는 Phaser 파티클 에미터 5개로 한 번에 그립니다. 텍스처는 흰 픽셀 캔버스라 tint로 색을 정합니다.
// - 입자·잔상·오라 스파클의 시간은 경기 재생 시간(timeScale 적용)을 따라 슬로모션·사진 판정 정지에서 함께 느려집니다.
//   컨페티·콜아웃 칩·집중선·신호등·순위 팝업은 화면 연출이라 실제 시간으로 흐릅니다.
// - 모션 축소(prefers-reduced-motion)에서는 fxBudgetFor가 입자·잔상·집중선·오라를 끄고 정보성 연출만 남깁니다.
// - 레이서 픽셀 격자 규칙(정수 배율·회전 없음·2px 스냅)은 잔상(실루엣 복제)·표지판·칩 위치에도 그대로 적용합니다.

/** 중계 화면 레이아웃 중 이펙트 배치에 쓰는 값(px) */
export type FxLayout = {
  width: number;
  /** 시네마 바 안쪽 중계 화면 위·아래(집중선·신호등 기준) */
  viewTop: number;
  viewBottom: number;
  roadTop: number;
  roadBottom: number;
  font: string;
};

/** 이펙트가 읽는 레이서 최소 정보(BroadcastRacer가 그대로 들어옵니다) */
export type FxRacer = { data: { id: string }; view: RacerView; motion: RiderMotionState; progress: number };

/** 매 프레임 넘기는 중계 상태 */
export type FxFrame = {
  /** 실제 시간 경과(ms) */
  deltaMs: number;
  /** 경기 재생 시간 경과(ms, timeScale 적용) */
  scaledDeltaMs: number;
  /** 연출용 배속(슬로모션 0.3 · 정지 0 · 평상 1) */
  timeScale: number;
  /** 경기 중(결승 통과 뒤 홀드는 false) */
  racing: boolean;
  racers: FxRacer[];
  focus: FxRacer;
  climax: ClimaxLevel;
  /** 주인공 지면 속도(px/s): 잔상이 뒤로 흘러가는 속도 */
  groundSpeedPx: number;
};

// UI 스타일 가이드 팔레트 토큰
const INK = 0x3b2531;
const INK_TEXT = '#3b2531';
const CREAM = 0xfff1c6;
const CREAM_TEXT = '#fff1c6';
const PAPER = 0xf6d995;
const GOLD = 0xf4b84a;
const RED = 0xc95746;
const GREEN = 0x5e9a67;
const SKY = 0x86c9c8;
const DARK_WOOD = 0x573044;
const WOOD_LINE = 0x8a5231;
const SAND = 0xd9c197;

const TONE_COLOR: Record<FxTone, number> = { gold: GOLD, red: RED, sky: SKY, green: GREEN, cream: CREAM };
/** 톤별 글자색: 어두운 바탕(빨강·초록)은 크림, 밝은 바탕은 잉크 */
const TONE_TEXT: Record<FxTone, string> = { gold: INK_TEXT, red: CREAM_TEXT, sky: INK_TEXT, green: CREAM_TEXT, cream: INK_TEXT };

const DOT_KEY = 'race-fx-dot';
const BAR_KEY = 'race-fx-bar';
const DROP_KEY = 'race-fx-drop';
const AURA_KEY = 'race-fx-aura';
/** 잔상 실루엣 시작 투명도. 수명의 앞부분은 진하게 유지하고 끝에서 빠르게 사라집니다(alpha = 시작값 × (1 − t)^0.7) */
const GHOST_ALPHA = 0.6;
/** 오라 텍스처 크기(셀). 몸통 쪽은 타원, 뒤(왼쪽)로 갈수록 가늘어지는 꼬리 */
const AURA_W = 80;
const AURA_H = 36;
/** 오라 타원 중심(셀, 텍스처 기준). 꼬리가 왼쪽으로 흐르도록 오른쪽에 둡니다 */
const AURA_CX = 58;
/** 먼지·바람 줄기 깊이: 레이서(10~10.8) 위, 콜아웃·라이벌 표식(17~18) 아래. 레이서 뒤에 두면 무리 속에서 가려져 보이지 않습니다 */
const TRAIL_DEPTH = 11;
/** 콜아웃 칩이 다 떠오른 뒤 머무는 시간(실제 ms)과 사라지는 시간 */
const CALLOUT_HOLD_MS = 900;
const CALLOUT_FADE_MS = 300;
/** 콜아웃 번쩍임 시간(실제 ms) */
const FLASH_MS = 80;
/** 집중선 깜빡임 주기(실제 ms) */
const FOCUS_FLICKER_MS = 70;

type Ghost = { container: Phaser.GameObjects.Container; worldX: number; ageMs: number; lifeMs: number };
type Pole = { container: Phaser.GameObjects.Container; remaining: number };

export class RaceFxLayer {
  readonly budget: FxBudget;
  private readonly dust: Phaser.GameObjects.Particles.ParticleEmitter;
  private readonly wind: Phaser.GameObjects.Particles.ParticleEmitter;
  private readonly sparkle: Phaser.GameObjects.Particles.ParticleEmitter;
  private readonly sweat: Phaser.GameObjects.Particles.ParticleEmitter;
  private readonly confettiEmitter: Phaser.GameObjects.Particles.ParticleEmitter;
  // 레이서별 상태
  private readonly lastPosture = new Map<string, RiderPosture>();
  private readonly trailTimers = new Map<string, number>();
  private sweatTimer = 0;
  private sparkleTimer = 0;
  // 주인공 스퍼트 오라·잔상
  private aura?: Phaser.GameObjects.Image;
  private auraTone?: FxTone;
  private auraTween?: Phaser.Tweens.Tween;
  private ghosts: Ghost[] = [];
  private ghostTimer = 0;
  // 코스 오브젝트·출발 신호등
  private poles: Pole[] = [];
  private startLine?: Phaser.GameObjects.Container;
  private lights?: Phaser.GameObjects.Container;
  private lamps: Phaser.GameObjects.Arc[] = [];
  private destroyed = false;

  constructor(private readonly scene: Phaser.Scene, private readonly layout: FxLayout, reducedMotion = prefersReducedMotion()) {
    this.budget = fxBudgetFor(reducedMotion);
    this.ensureTextures();
    // 먼지: 뒷바퀴 접지점에서 뒤·위로 튀어 가라앉습니다(도로 톤)
    this.dust = scene.add.particles(0, 0, DOT_KEY, {
      lifespan: { min: 300, max: 480 }, speedX: { min: -80, max: -30 }, speedY: { min: -50, max: -15 }, gravityY: 90,
      scale: { start: 2, end: 1 }, alpha: { start: 0.75, end: 0 }, tint: [PAPER, CREAM, SAND], emitting: false,
    }).setDepth(TRAIL_DEPTH);
    // 바람 줄기: 고속에서 뒤로 길게 늘어나는 크림색 줄
    this.wind = scene.add.particles(0, 0, BAR_KEY, {
      lifespan: { min: 200, max: 320 }, speedX: { min: -300, max: -200 }, speedY: { min: -6, max: 6 },
      scaleX: { start: 2, end: 3 }, scaleY: 2, alpha: { start: 0.7, end: 0 }, tint: CREAM, emitting: false,
    }).setDepth(TRAIL_DEPTH);
    // 스파클: 마지막 150m 오라에서 위로 흩어지는 금빛 점
    this.sparkle = scene.add.particles(0, 0, DOT_KEY, {
      lifespan: { min: 420, max: 700 }, speedX: { min: -50, max: 10 }, speedY: { min: -110, max: -50 },
      scale: { start: 2, end: 0.5 }, alpha: { start: 1, end: 0 }, tint: [GOLD, CREAM, PAPER], emitting: false,
    }).setDepth(17);
    // 땀방울: 머리 옆에서 뒤·위로 튀어 떨어지는 하늘색 점
    this.sweat = scene.add.particles(0, 0, DROP_KEY, {
      lifespan: 460, speedX: { min: -70, max: -30 }, speedY: { min: -90, max: -40 }, gravityY: 220,
      scale: 2, alpha: { start: 1, end: 0.2 }, tint: SKY, emitting: false,
    }).setDepth(17);
    // 골 컨페티: 결승 마커에서 위로 터져 떨어지는 네 색 조각(실제 시간)
    this.confettiEmitter = scene.add.particles(0, 0, DOT_KEY, {
      lifespan: { min: 1000, max: 1600 }, speedX: { min: -160, max: 160 }, speedY: { min: -300, max: -140 }, gravityY: 320,
      scale: { start: 2.5, end: 1.5 }, rotate: { start: 0, end: 540 }, alpha: { start: 1, end: 0.3 },
      tint: [GOLD, RED, GREEN, SKY, CREAM], emitting: false,
    }).setDepth(18);
  }

  /** 입자 텍스처는 흰 픽셀이라 tint로 색을 정합니다. 씬 재시작에서도 한 번만 만듭니다 */
  private ensureTextures() {
    const textures = this.scene.textures;
    const paint = (key: string, width: number, height: number, draw: (context: CanvasRenderingContext2D) => void) => {
      if (textures.exists(key)) return;
      const texture = textures.createCanvas(key, width, height);
      if (!texture) return;
      const context = texture.getContext();
      context.fillStyle = '#ffffff';
      draw(context);
      texture.refresh();
      texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
    };
    paint(DOT_KEY, 3, 3, (context) => context.fillRect(0, 0, 3, 3));
    paint(BAR_KEY, 8, 1, (context) => context.fillRect(0, 0, 8, 1));
    paint(DROP_KEY, 2, 3, (context) => context.fillRect(0, 0, 2, 3));
    // 오라: 몸통 쪽은 타원, 뒤(왼쪽)로 갈수록 가늘어지는 꼬리. 안쪽은 채우고 바깥은 체커 디더로 옅어집니다(blur 바퀴 티어와 같은 디더 문법)
    paint(AURA_KEY, AURA_W, AURA_H, (context) => {
      const cy = (AURA_H - 1) / 2;
      const rx = AURA_W - AURA_CX;
      const ry = AURA_H / 2;
      // 0 바깥 · 1 성긴 점 · 2 체커 · 3 채움
      const level = (x: number, y: number): number => {
        if (x >= AURA_CX) {
          const r = Math.hypot((x - AURA_CX) / rx, (y - cy) / ry);
          return r < 0.5 ? 3 : r < 0.8 ? 2 : r < 1 ? 1 : 0;
        }
        // 꼬리: 몸통에서 멀어질수록 반높이가 줄어듭니다
        const half = ry * Math.pow(x / AURA_CX, 0.9);
        const dy = Math.abs(y - cy);
        if (dy >= half) return 0;
        const inner = dy / half;
        return inner < 0.35 && x > AURA_CX - 24 ? 3 : inner < 0.7 ? 2 : 1;
      };
      for (let y = 0; y < AURA_H; y += 1) for (let x = 0; x < AURA_W; x += 1) {
        const value = level(x, y);
        const on = value === 3 || (value === 2 && (x + y) % 2 === 0) || (value === 1 && x % 2 === 0 && y % 2 === 0);
        if (on) context.fillRect(x, y, 1, 1);
      }
    });
  }

  private text(x: number, y: number, value: string, size: number, color = CREAM_TEXT) {
    return this.scene.add.text(x, y, value, { fontFamily: this.layout.font, fontSize: `${size}px`, color, fontStyle: 'bold' });
  }

  private rearPoint(racer: FxRacer) {
    const offset = racer.view.rearContactOffset();
    return { x: racer.view.container.x + offset.dx, y: racer.view.container.y + offset.dy };
  }

  private headPoint(racer: FxRacer) {
    const offset = racer.view.headOffset();
    return { x: racer.view.container.x + offset.dx, y: racer.view.container.y + offset.dy };
  }

  // ─── 출발: 신호등·대시 먼지 ──────────────────────────────────────────────

  /** 카운트다운 위에 램프 3개 신호등을 띄웁니다. 단계는 setStartStep이 바꿉니다 */
  showStartLights(stepCount: number) {
    if (stepCount <= 0) return;
    const panel = this.scene.add.rectangle(0, 0, 100, 32, DARK_WOOD).setStrokeStyle(3, INK);
    this.lamps = [-28, 0, 28].map((dx) => this.scene.add.circle(dx, 0, 9, INK).setStrokeStyle(2, WOOD_LINE));
    this.lights = this.scene.add.container(this.layout.width / 2, this.layout.viewTop + 48, [panel, ...this.lamps]).setDepth(58);
    this.lights.setScale(0.7);
    this.scene.tweens.add({ targets: this.lights, scale: 1, duration: 220, ease: 'Back.easeOut' });
  }

  /** 카운트다운 단계마다 램프 색을 바꾸고, GO 단계에서는 잠시 뒤 신호등을 거둡니다 */
  setStartStep(stepIndex: number, stepCount: number) {
    if (!this.lights) return;
    startLampsAt(stepIndex, stepCount).forEach((lamp, index) => {
      const circle = this.lamps[index];
      if (!circle) return;
      circle.setFillStyle(lamp === 'red' ? RED : lamp === 'green' ? GREEN : INK);
      if (lamp !== 'off') {
        circle.setScale(1.3);
        this.scene.tweens.add({ targets: circle, scale: 1, duration: 160, ease: 'Cubic.easeOut' });
      }
    });
    if (stepIndex >= stepCount - 1) {
      const lights = this.lights;
      this.lights = undefined;
      this.scene.tweens.add({ targets: lights, alpha: 0, y: '-=12', delay: 460, duration: 260, ease: 'Sine.easeIn', onComplete: () => lights.destroy(true) });
    }
  }

  /** GO 순간 모든 레이서 뒷바퀴에서 먼지 뭉치 */
  startBurst(racers: FxRacer[]) {
    if (!this.budget.particles) return;
    racers.forEach((racer) => {
      const point = this.rearPoint(racer);
      this.dust.emitParticleAt(point.x, point.y, START_BURST_PARTICLES);
    });
  }

  // ─── 코스 오브젝트: 남은 거리 표지판·출발선 ──────────────────────────────────

  /** 남은 거리 표지판(1km 단위·600m·300m·150m)과 출발선. 위치는 updateCourseMarks가 매 프레임 맞춥니다 */
  buildCourseMarks(distanceMeters: number) {
    const { roadTop, roadBottom } = this.layout;
    const post = (container: Phaser.GameObjects.Container, label: string, fill: number, textColor: string, lineAlpha: number, lineWidth: number) => {
      container.add(this.scene.add.rectangle(0, roadTop + 4, lineWidth, roadBottom - roadTop - 8, CREAM, lineAlpha).setOrigin(0.5, 0));
      container.add(this.scene.add.rectangle(0, roadTop - 30, 4, 34, INK).setOrigin(0.5, 0));
      const text = this.text(0, roadTop - 36, label, 9, textColor).setOrigin(0.5);
      container.add(this.scene.add.rectangle(0, roadTop - 36, Math.max(30, text.width + 10), 16, fill).setStrokeStyle(2, INK));
      container.add(text);
    };
    this.poles = distancePoles(distanceMeters).map((remaining) => {
      const tone = poleTone(remaining);
      const container = this.scene.add.container(0, 0).setDepth(4).setVisible(false);
      post(container, poleLabel(remaining), TONE_COLOR[tone], TONE_TEXT[tone], 0.35, 2);
      return { container, remaining };
    });
    this.startLine = this.scene.add.container(0, 0).setDepth(4);
    post(this.startLine, 'START', GREEN, CREAM_TEXT, 0.7, 6);
  }

  /** 결승선 화면 x와 코스 월드 길이(px)로 표지판·출발선을 놓습니다(결승선 마커와 같은 거리 계산) */
  updateCourseMarks(lineX: number, courseWorldPx: number, distanceMeters: number) {
    const place = (container: Phaser.GameObjects.Container, x: number) => {
      const visible = x > -60 && x < this.layout.width + 60;
      container.setVisible(visible);
      if (visible) container.setX(snapToCell(x));
    };
    this.poles.forEach((pole) => place(pole.container, poleScreenX(lineX, courseWorldPx, pole.remaining, distanceMeters)));
    if (this.startLine) place(this.startLine, lineX - courseWorldPx);
  }

  // ─── 매 프레임 ─────────────────────────────────────────────────────────

  update(frame: FxFrame) {
    if (this.destroyed) return;
    // 입자 시간은 경기 재생 배속을 따릅니다(슬로모션·정지에서 함께 느려짐). 컨페티는 축하 연출이라 실제 시간
    [this.dust, this.wind, this.sparkle, this.sweat].forEach((emitter) => { emitter.timeScale = frame.timeScale; });
    this.updateCallouts(frame);
    if (frame.racing && this.budget.particles) {
      this.updateTrails(frame);
      this.updateSweat(frame);
    }
    this.updateAura(frame);
    this.updateGhosts(frame);
  }

  /** 자세가 바뀐 레이서에 콜아웃 칩. 주인공은 모두, 다른 레이서는 라스트 스퍼트만(화면 안에 있을 때) */
  private updateCallouts(frame: FxFrame) {
    frame.racers.forEach((racer) => {
      const id = racer.data.id;
      const posture = racer.motion.posture;
      const previous = this.lastPosture.get(id);
      this.lastPosture.set(id, posture);
      if (previous === undefined || previous === posture || !frame.racing) return;
      const callout = calloutFor(previous, posture, racer.progress);
      if (!callout) return;
      const isFocus = racer === frame.focus;
      if (!isFocus && (!showsCalloutForOthers(callout) || !racer.view.container.visible)) return;
      this.callout(racer, callout, isFocus);
    });
  }

  /** 뒷바퀴 접지점 먼지·바람 줄기(간격은 경기 재생 시간) */
  private updateTrails(frame: FxFrame) {
    frame.racers.forEach((racer) => {
      const id = racer.data.id;
      const finished = racer.progress >= 1;
      const spec = racer.view.container.visible ? trailFor(racer.motion.posture, racer.motion.tier, finished) : undefined;
      if (!spec) {
        this.trailTimers.delete(id);
        return;
      }
      const timer = (this.trailTimers.get(id) ?? 0) - frame.scaledDeltaMs;
      if (timer > 0) {
        this.trailTimers.set(id, timer);
        return;
      }
      this.trailTimers.set(id, spec.intervalMs);
      const point = this.rearPoint(racer);
      if (spec.kind === 'dust') this.dust.emitParticleAt(point.x, point.y - 2, 1);
      else this.wind.emitParticleAt(point.x - 6, point.y - 20 - Math.random() * 40, 1);
    });
  }

  /** 주인공 땀방울(오르막·스퍼트) */
  private updateSweat(frame: FxFrame) {
    const interval = sweatIntervalFor(frame.focus.motion.posture, frame.focus.progress >= 1);
    if (interval === undefined) {
      this.sweatTimer = 0;
      return;
    }
    this.sweatTimer -= frame.scaledDeltaMs;
    if (this.sweatTimer > 0) return;
    this.sweatTimer = interval;
    const head = this.headPoint(frame.focus);
    this.sweat.emitParticleAt(head.x - 8, head.y - 6, 1);
  }

  /** 주인공 스퍼트 오라: 마지막 600m 금색 → 마지막 150m 빨강 + 스파클. 레이서 뒤에서 맥박칩니다 */
  private updateAura(frame: FxFrame) {
    const spec = this.budget.aura ? auraFor(frame.climax, frame.focus.progress >= 1) : undefined;
    if (!spec) {
      if (this.aura) {
        this.auraTween?.stop();
        this.aura.destroy();
        this.aura = undefined;
        this.auraTone = undefined;
      }
      return;
    }
    if (!this.aura) {
      this.aura = this.scene.add.image(0, 0, AURA_KEY).setScale(2).setBlendMode(Phaser.BlendModes.ADD).setDepth(9.8).setAlpha(0);
    }
    if (this.auraTone !== spec.tone) {
      this.auraTone = spec.tone;
      this.aura.setTint(TONE_COLOR[spec.tone]);
      this.auraTween?.stop();
      this.auraTween = this.scene.tweens.add({ targets: this.aura, alpha: { from: spec.alpha * 0.55, to: spec.alpha }, duration: spec.pulseMs, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    }
    // 타원 중심이 레이서 몸통(앵커 기준 +2, −44)에 오고 꼬리가 뒤로 흐르도록 텍스처 중심만큼 왼쪽으로 둡니다
    const focus = frame.focus.view.container;
    this.aura.setPosition(snapToCell(focus.x + 2 - (AURA_CX - AURA_W / 2) * 2), snapToCell(focus.y - 44));
    if (spec.sparkleIntervalMs !== undefined && frame.racing && this.budget.particles) {
      this.sparkleTimer -= frame.scaledDeltaMs;
      if (this.sparkleTimer <= 0) {
        this.sparkleTimer = spec.sparkleIntervalMs;
        this.sparkle.emitParticleAt(focus.x - 20 + Math.random() * 44, focus.y - 30 - Math.random() * 40, 1);
      }
    }
  }

  /** 주인공 잔상: 스탠딩 스프린트 + 마지막 600m. 실루엣이 지면 속도로 뒤로 흘러가며 사라집니다 */
  private updateGhosts(frame: FxFrame) {
    const drift = (frame.groundSpeedPx * frame.scaledDeltaMs) / 1000;
    this.ghosts = this.ghosts.filter((ghost) => {
      ghost.ageMs += frame.scaledDeltaMs;
      if (ghost.ageMs >= ghost.lifeMs) {
        ghost.container.destroy(true);
        return false;
      }
      ghost.worldX -= drift;
      ghost.container.setX(snapToCell(ghost.worldX)).setAlpha(GHOST_ALPHA * Math.pow(1 - ghost.ageMs / ghost.lifeMs, 0.7));
      return true;
    });
    const spec = frame.racing && this.budget.ghosts ? ghostTrailFor(frame.focus.motion.posture, frame.climax, frame.focus.progress >= 1) : undefined;
    if (!spec) {
      this.ghostTimer = 0;
      return;
    }
    this.ghostTimer -= frame.scaledDeltaMs;
    if (this.ghostTimer > 0) return;
    this.ghostTimer = spec.intervalMs;
    while (this.ghosts.length >= spec.count) this.ghosts.shift()?.container.destroy(true);
    const container = frame.focus.view.cloneSilhouette(TONE_COLOR[spec.tone], GHOST_ALPHA).setDepth(frame.focus.view.container.depth - 0.01);
    this.ghosts.push({ container, worldX: container.x, ageMs: 0, lifeMs: spec.lifeMs });
  }

  // ─── 이벤트 연출 ────────────────────────────────────────────────────────

  /** 스킬 발동식 콜아웃: 레이서 머리 위로 떠오르는 칩 + 레이서 번쩍임. 칩은 레이서 컨테이너에 넣어 함께 움직입니다 */
  callout(racer: FxRacer, callout: Callout, emphasize: boolean) {
    const head = racer.view.headOffset();
    const label = this.text(0, 0, callout.label, emphasize ? 11 : 10, TONE_TEXT[callout.tone]).setOrigin(0.5);
    const box = this.scene.add.rectangle(0, 0, label.width + 14, emphasize ? 22 : 18, TONE_COLOR[callout.tone]).setStrokeStyle(2, INK);
    const chip = this.scene.add.container(snapToCell(head.dx - 20), head.dy - 20, [box, label]).setScale(0.6).setAlpha(0);
    racer.view.container.add(chip);
    this.scene.tweens.add({ targets: chip, y: head.dy - 54, scale: 1, alpha: 1, duration: 180, ease: 'Back.easeOut' });
    this.scene.tweens.add({ targets: chip, y: head.dy - 72, alpha: 0, delay: 180 + CALLOUT_HOLD_MS, duration: CALLOUT_FADE_MS, ease: 'Sine.easeIn', onComplete: () => chip.destroy(true) });
    racer.view.setFlash(CREAM);
    this.scene.time.delayedCall(FLASH_MS, () => racer.view.setFlash());
  }

  /** 집중선: 중계 화면 가장자리에서 중앙으로 모이는 잉크 선이 깜빡이다 사라집니다(역전 컷인·사진 판정) */
  focusLines(kind: keyof typeof FOCUS_LINES) {
    if (!this.budget.focusLines) return;
    const spec = FOCUS_LINES[kind];
    const { width, viewTop, viewBottom } = this.layout;
    const cx = width / 2;
    const cy = (viewTop + viewBottom) / 2;
    const graphics = this.scene.add.graphics().setDepth(51.5);
    const draw = () => {
      graphics.clear();
      graphics.fillStyle(INK, spec.alpha);
      for (let index = 0; index < spec.count; index += 1) {
        const angle = (index / spec.count) * Math.PI * 2 + Math.random() * 0.12;
        const inner = 70 + Math.random() * 40;
        const edge = this.edgeDistance(angle, cx, cy);
        if (edge <= inner) continue;
        const halfWidth = 2 + Math.random() * 3;
        const px = -Math.sin(angle) * halfWidth;
        const py = Math.cos(angle) * halfWidth;
        const ex = cx + Math.cos(angle) * edge;
        const ey = cy + Math.sin(angle) * edge;
        graphics.fillTriangle(ex + px, ey + py, ex - px, ey - py, cx + Math.cos(angle) * inner, cy + Math.sin(angle) * inner);
      }
    };
    draw();
    const flicker = this.scene.time.addEvent({ delay: FOCUS_FLICKER_MS, repeat: Math.floor(spec.durationMs / FOCUS_FLICKER_MS), callback: draw });
    this.scene.time.delayedCall(spec.durationMs, () => {
      flicker.remove();
      graphics.destroy();
    });
  }

  /** 중계 화면 사각형(viewTop~viewBottom × 0~width) 가장자리까지의 거리 */
  private edgeDistance(angle: number, cx: number, cy: number): number {
    const { width, viewTop, viewBottom } = this.layout;
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    const tx = dx > 1e-6 ? (width - cx) / dx : dx < -1e-6 ? -cx / dx : Infinity;
    const ty = dy > 1e-6 ? (viewBottom - cy) / dy : dy < -1e-6 ? (viewTop - cy) / dy : Infinity;
    return Math.min(tx, ty);
  }

  /** 순위 변동 팝업: HUD 순위 옆에서 '▲ 3위' / '▼ 5위' 칩이 떠오릅니다 */
  rankChange(change: RankChange, x: number, y: number) {
    const label = this.text(0, 0, change.label, 11, TONE_TEXT[change.tone]).setOrigin(0.5);
    const box = this.scene.add.rectangle(0, 0, label.width + 14, 20, TONE_COLOR[change.tone]).setStrokeStyle(2, INK);
    const chip = this.scene.add.container(x, y + 10, [box, label]).setDepth(26).setAlpha(0);
    this.scene.tweens.add({ targets: chip, y, alpha: 1, duration: 160, ease: 'Cubic.easeOut' });
    this.scene.tweens.add({ targets: chip, y: y - 10, alpha: 0, delay: 160 + CALLOUT_HOLD_MS, duration: CALLOUT_FADE_MS, ease: 'Sine.easeIn', onComplete: () => chip.destroy(true) });
  }

  /** 골 컨페티: 주어진 자리에서 count개가 터져 떨어집니다(실제 시간) */
  confetti(x: number, y: number, count: number) {
    if (count <= 0) return;
    this.confettiEmitter.emitParticleAt(x, y, count);
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.auraTween?.stop();
    [this.dust, this.wind, this.sparkle, this.sweat, this.confettiEmitter, this.aura, this.startLine, this.lights].forEach((object) => object?.destroy());
    this.ghosts.forEach((ghost) => ghost.container.destroy(true));
    this.poles.forEach((pole) => pole.container.destroy(true));
    this.ghosts = [];
    this.poles = [];
  }
}

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
}
