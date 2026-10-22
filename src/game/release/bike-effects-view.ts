// 자전거 외형 이펙트(Phaser 표현) — #109
// 강화 스탯이 자전거 겉모습에 드러나게 합니다. 무엇을 얼마나 그릴지는 순수 규칙(domain/garage-perks의 bikeVisualSpec)이 정하고,
// 이 모듈은 그 숫자대로 반짝임(희귀도)·속도선(성능)·오라와 골드 링(성장 단계)을 그리고 컬러웨이(스타일)를 바꿉니다.
// 홈 Garage·수집 성장·전시대처럼 자전거를 한 대씩 크게 보여 주는 화면에서 씁니다(도감 격자는 텍스처 캐시라 적용하지 않음).
import Phaser from 'phaser';
import type { BikeVisualSpec } from '../../domain/garage-perks';
import { makeWarmColorway, shadeColor, type BikeColorway } from './bike-pixel-sprite';

// 팔레트 토큰: GOLD · CREAM · RED (UI 스타일 가이드 2절)
const GOLD = 0xf4b84a;
const CREAM = 0xfff1c6;
const RED = 0xc95746;
const PALE_GOLD = 0xf6d995;

/**
 * 스타일 단계에 따른 컬러웨이. 0은 기본, 1 골드 림·밝은 스포크, 2 + 골드 핸들바·스템, 3 + 붉은 안장·밝은 프레임 하이라이트.
 * 프레임 색 자체는 바꾸지 않아 도감에서 알아보던 자전거 그대로 "꾸며진" 느낌을 냅니다.
 */
export function styledColorway(frameColor: number, styleTier: BikeVisualSpec['styleTier']): BikeColorway {
  const colorway = makeWarmColorway(frameColor);
  if (styleTier >= 1) { colorway.rim = GOLD; colorway.spoke = PALE_GOLD; }
  if (styleTier >= 2) { colorway.bar = GOLD; colorway.stem = GOLD; colorway.headBadge = CREAM; }
  if (styleTier >= 3) { colorway.saddle = RED; colorway.saddleShade = shadeColor(RED, 0.72); colorway.frameLight = shadeColor(frameColor, 1.45); }
  return colorway;
}

export type BikeEffectLayout = {
  /** 오라·골드 링 반지름(px). 기본 25 × cell */
  ringRadius?: number;
  /** 오라 중심의 세로 오프셋(바퀴 축 기준, px). 기본 −8 × cell */
  ringOffsetY?: number;
};

/** 그린 이펙트 묶음. 씬 update(time)에서 update를 불러 반짝임을 움직이고, 다시 그리기 전에 destroy로 지웁니다. */
export type BikeEffectLayer = {
  objects: Phaser.GameObjects.GameObject[];
  update: (time: number) => void;
  destroy: () => void;
};

/**
 * 자전거 주변 이펙트를 그립니다. (x, y)는 스프라이트 앵커(가로 중앙·바퀴 축), cell은 스프라이트 셀 크기(px).
 * depth는 자전거보다 아래(오라)와 위(반짝임)로 나눠 씁니다: 오라 depth − 1, 속도선 depth − 1, 반짝임 depth + 1.
 */
export function drawBikeEffects(
  scene: Phaser.Scene,
  x: number,
  y: number,
  cell: number,
  spec: BikeVisualSpec,
  depth: number,
  layout: BikeEffectLayout = {},
): BikeEffectLayer {
  const objects: Phaser.GameObjects.GameObject[] = [];
  const ringRadius = layout.ringRadius ?? 25 * cell;
  const centerY = y + (layout.ringOffsetY ?? -8 * cell);
  const pulses: Array<{ target: Phaser.GameObjects.Rectangle; phase: number; speed: number; min: number }> = [];

  // 성장 단계: 고급은 연한 오라, 드림은 골드 링(홈·성장 화면의 기존 표현을 공용 규칙으로 옮김)
  if (spec.stage === 2) objects.push(scene.add.circle(x, centerY, ringRadius, GOLD, 0.07).setStrokeStyle(2, GOLD, 0.4).setDepth(depth - 1));
  if (spec.stage >= 3) objects.push(scene.add.circle(x, centerY, ringRadius, GOLD, 0.14).setStrokeStyle(3, GOLD).setDepth(depth - 1));

  // 성능: 뒤쪽(왼쪽) 속도선. 성능이 높을수록 줄이 늘고 길어집니다.
  for (let index = 0; index < spec.speedLines; index += 1) {
    const length = (10 + index * 4) * cell;
    const lineX = x - 36 * cell - length / 2;
    const lineY = y - (16 - index * 6) * cell;
    const line = scene.add.rectangle(lineX, lineY, length, Math.max(2, cell * 0.8), CREAM, 0.7).setDepth(depth - 1);
    objects.push(line);
    pulses.push({ target: line, phase: index * 0.9, speed: 1 / 180, min: 0.25 });
  }

  // 희귀도: 오라 둘레의 반짝임. 최대 단계면 골드·크림을 번갈아 씁니다.
  for (let index = 0; index < spec.sparkles; index += 1) {
    const angle = -Math.PI / 2 + (index / Math.max(1, spec.sparkles)) * Math.PI * 2 + (index % 2) * 0.35;
    const sparkleX = x + Math.cos(angle) * ringRadius * 0.82;
    const sparkleY = centerY + Math.sin(angle) * ringRadius * 0.62;
    const size = index % 3 === 0 ? 6 : 4;
    const color = spec.sparkleAlternate && index % 2 === 1 ? CREAM : GOLD;
    const sparkle = scene.add.rectangle(Math.round(sparkleX), Math.round(sparkleY), size, size, color).setDepth(depth + 1);
    objects.push(sparkle);
    pulses.push({ target: sparkle, phase: index * 1.3, speed: 1 / 260, min: 0.3 });
  }

  return {
    objects,
    update: (time) => {
      pulses.forEach((pulse) => {
        if (!pulse.target.active) return;
        const wave = 0.5 + 0.5 * Math.sin(time * pulse.speed + pulse.phase);
        pulse.target.setAlpha(pulse.min + (1 - pulse.min) * wave);
      });
    },
    destroy: () => {
      objects.forEach((object) => { if (object.active) object.destroy(); });
      objects.length = 0;
      pulses.length = 0;
    },
  };
}
