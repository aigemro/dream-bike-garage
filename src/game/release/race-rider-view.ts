import Phaser from 'phaser';
import type { PixelCharacterRole } from './art-character-pixel';
import { bikeRig, makeWarmColorway, type BikeCategory } from './bike-pixel-sprite';
import {
  crankPhaseIndex,
  glintPhaseIndex,
  wheelPhaseIndex,
  type RiderMotionState,
  type RiderPosture,
  type WheelTier,
} from './race-rider-motion';
import {
  RIDER_CELL,
  bakeBikeBody,
  bakeRiderSheet,
  bakeShadow,
  bakeWheelSheet,
  riderFrameName,
  wheelFrameName,
  wheelSheetKey,
  type BodyImage,
  type RgbaSheet,
  type RiderSheet,
  type WheelSheet,
} from './race-rider-sprite';

// 레이스 라이더 Phaser 뷰.
// 순수 모듈(race-rider-sprite)이 만든 RGBA 시트를 캔버스 텍스처로 등록하고, 레이서 한 명을
// 이미지 6장(그림자·뒷바퀴 스포크·앞바퀴 스포크·원경·자전거 몸체·근경)으로 조립합니다.
// 매 프레임 비용은 위상·티어·자세가 바뀔 때의 setFrame 호출뿐입니다(Graphics 재드로잉 없음).
// 픽셀 정합 규칙: 모든 이미지는 origin(0,0)·정수 셀 오프셋·정수 배 스케일(RIDER_CELL)이며,
// 컨테이너는 회전·비정수 스케일을 쓰지 않고 위치도 셀(2px) 배수로 스냅합니다.

const SHADOW_KEY = 'race-rider-shadow';

/** RGBA 시트를 캔버스 텍스처로 올리고 프레임을 등록합니다. 이미 있으면 그대로 돌려줍니다. */
export function registerSheetTexture(scene: Phaser.Scene, key: string, sheet: RgbaSheet | BodyImage): Phaser.Textures.CanvasTexture {
  const existing = scene.textures.exists(key) ? (scene.textures.get(key) as Phaser.Textures.CanvasTexture) : undefined;
  if (existing) return existing;
  const texture = scene.textures.createCanvas(key, sheet.width, sheet.height);
  if (!texture) throw new Error(`캔버스 텍스처를 만들 수 없습니다: ${key}`);
  const context = texture.getContext();
  const imageData = context.createImageData(sheet.width, sheet.height);
  imageData.data.set(sheet.data);
  context.putImageData(imageData, 0, 0);
  texture.refresh();
  if ('frames' in sheet) {
    Object.entries(sheet.frames).forEach(([name, frame]) => texture.add(name, 0, frame.x, frame.y, frame.width, frame.height));
  }
  texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
  return texture;
}

export type RacerSpec = { category: BikeCategory; role: PixelCharacterRole; frameColor: number };

/**
 * 씬 단위 텍스처 캐시. 라이더 시트는 (카테고리, 역할), 바퀴 시트는 바퀴 스타일, 몸체는 (카테고리, 프레임 색)으로 캐시합니다.
 * 참가 화면·레이스 시작 시 prewarm으로 필요한 조합을 먼저 굽습니다.
 */
export class RaceRiderTextures {
  private readonly riderSheets = new Map<string, RiderSheet>();
  private readonly wheelSheets = new Map<string, WheelSheet>();
  private readonly bodies = new Map<string, BodyImage>();
  private shadowImage?: BodyImage;

  constructor(private readonly scene: Phaser.Scene) {}

  riderSheetKey(category: BikeCategory, role: PixelCharacterRole): string {
    return `race-rider-${category}-${role}`;
  }

  riderSheet(category: BikeCategory, role: PixelCharacterRole): { key: string; sheet: RiderSheet } {
    const key = this.riderSheetKey(category, role);
    let sheet = this.riderSheets.get(key);
    if (!sheet) {
      sheet = bakeRiderSheet(category, role);
      this.riderSheets.set(key, sheet);
    }
    registerSheetTexture(this.scene, key, sheet);
    return { key, sheet };
  }

  wheelSheet(category: BikeCategory): { key: string; sheet: WheelSheet } {
    const style = bikeRig(category).wheel;
    const key = `race-wheel-${wheelSheetKey(style)}`;
    let sheet = this.wheelSheets.get(key);
    if (!sheet) {
      sheet = bakeWheelSheet(style);
      this.wheelSheets.set(key, sheet);
    }
    registerSheetTexture(this.scene, key, sheet);
    return { key, sheet };
  }

  body(category: BikeCategory, frameColor: number): { key: string; image: BodyImage } {
    const key = `race-body-${category}-${frameColor.toString(16)}`;
    let image = this.bodies.get(key);
    if (!image) {
      image = bakeBikeBody(category, makeWarmColorway(frameColor));
      this.bodies.set(key, image);
    }
    registerSheetTexture(this.scene, key, image);
    return { key, image };
  }

  shadow(): { key: string; image: BodyImage } {
    const image = this.shadowImage ??= bakeShadow();
    registerSheetTexture(this.scene, SHADOW_KEY, image);
    return { key: SHADOW_KEY, image };
  }

  /** 필요한 조합을 한 번에 굽습니다(화면 전환 중에 호출해 히치를 숨깁니다). */
  prewarm(specs: RacerSpec[]): void {
    this.shadow();
    specs.forEach((spec) => {
      this.riderSheet(spec.category, spec.role);
      this.wheelSheet(spec.category);
      this.body(spec.category, spec.frameColor);
    });
  }
}

/** 셀(2px) 배수로 스냅 */
export function snapToCell(value: number): number {
  return Math.round(value / RIDER_CELL) * RIDER_CELL;
}

/**
 * 레이서 한 명의 표시 단위. 컨테이너 원점 = 자전거 앵커(가로 중앙, 바퀴 축).
 * update(state)는 운동 상태에서 자세·크랭크 위상·바퀴 위상·티어를 읽어 프레임만 교체합니다.
 */
export class RacerView {
  readonly container: Phaser.GameObjects.Container;
  private readonly far: Phaser.GameObjects.Image;
  private readonly near: Phaser.GameObjects.Image;
  private readonly wheels: Phaser.GameObjects.Image[];
  private readonly riderTexture: Phaser.Textures.Texture;
  private readonly wheelTexture: Phaser.Textures.Texture;
  private readonly frameCache = new Map<string, Phaser.Textures.Frame>();
  private lastRiderKey = '';
  private lastWheelKey = '';
  readonly wheelRadiusPx: number;

  constructor(scene: Phaser.Scene, textures: RaceRiderTextures, readonly spec: RacerSpec) {
    const rig = bikeRig(spec.category);
    const cell = RIDER_CELL;
    const rider = textures.riderSheet(spec.category, spec.role);
    const wheel = textures.wheelSheet(spec.category);
    const body = textures.body(spec.category, spec.frameColor);
    const shadow = textures.shadow();
    this.riderTexture = scene.textures.get(rider.key);
    this.wheelTexture = scene.textures.get(wheel.key);
    this.wheelRadiusPx = rig.wheel.radius * cell;

    const place = (image: Phaser.GameObjects.Image, dxCells: number, dyCells: number) => {
      image.setOrigin(0, 0).setScale(cell).setPosition(dxCells * cell, dyCells * cell);
      return image;
    };
    const shadowImage = place(scene.add.image(0, 0, shadow.key), shadow.image.anchor.dx, rig.wheel.radius - 1);
    // 바퀴 프레임 중심 셀이 축 셀과 겹치도록 좌상단을 (축 − 중심)에 둡니다
    this.wheels = [rig.rear, rig.front].map(([ax, ay]) => place(
      scene.add.image(0, 0, wheel.key, wheelFrameName('crisp', 0)),
      ax - wheel.sheet.center - rig.gridWidth / 2,
      ay - wheel.sheet.center - rig.axleY,
    ));
    this.far = place(scene.add.image(0, 0, rider.key, riderFrameName('seated', 'far', 0)), rider.sheet.anchor.dx, rider.sheet.anchor.dy);
    const bodyImage = place(scene.add.image(0, 0, body.key), body.image.anchor.dx, body.image.anchor.dy);
    this.near = place(scene.add.image(0, 0, rider.key, riderFrameName('seated', 'near', 0)), rider.sheet.anchor.dx, rider.sheet.anchor.dy);

    this.container = scene.add.container(0, 0, [shadowImage, ...this.wheels, this.far, bodyImage, this.near]);
  }

  private frame(texture: Phaser.Textures.Texture, name: string): Phaser.Textures.Frame {
    const key = `${texture.key}/${name}`;
    let frame = this.frameCache.get(key);
    if (!frame) {
      frame = texture.get(name);
      this.frameCache.set(key, frame);
    }
    return frame;
  }

  /** 운동 상태를 프레임에 반영합니다. 바뀐 것이 없으면 아무 호출도 하지 않습니다. */
  update(state: RiderMotionState): void {
    this.setRiderFrame(state.posture, crankPhaseIndex(state));
    const phase = state.tier === 'blur' ? glintPhaseIndex(state) : wheelPhaseIndex(state);
    this.setWheelFrame(state.tier, phase);
  }

  setRiderFrame(posture: RiderPosture, phase: number): void {
    const key = `${posture}/${phase}`;
    if (key === this.lastRiderKey) return;
    this.lastRiderKey = key;
    this.far.setFrame(this.frame(this.riderTexture, riderFrameName(posture, 'far', phase)), false, false);
    this.near.setFrame(this.frame(this.riderTexture, riderFrameName(posture, 'near', phase)), false, false);
  }

  setWheelFrame(tier: WheelTier, phase: number): void {
    const key = `${tier}/${phase}`;
    if (key === this.lastWheelKey) return;
    this.lastWheelKey = key;
    const frame = this.frame(this.wheelTexture, wheelFrameName(tier, phase));
    this.wheels.forEach((wheel) => wheel.setFrame(frame, false, false));
  }

  /** 컨테이너 위치(셀 배수로 스냅) */
  setPosition(x: number, y: number): void {
    this.container.setPosition(snapToCell(x), snapToCell(y));
  }

  setDepth(depth: number): void {
    this.container.setDepth(depth);
  }

  setVisible(visible: boolean): void {
    this.container.setVisible(visible);
  }

  setAlpha(alpha: number): void {
    this.container.setAlpha(alpha);
  }

  destroy(): void {
    this.container.destroy(true);
  }
}
