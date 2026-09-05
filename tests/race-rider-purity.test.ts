// 레이스 라이더 순수 모듈은 Phaser를 값으로 import하지 않는다(Vitest node 환경·PNG 덤프 스크립트에서 로딩 가능해야 함)
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const PURE_MODULES = [
  'src/game/release/pixel-raster.ts',
  'src/game/release/bike-pixel-sprite.ts',
  'src/game/release/art-character-pixel.ts',
  'src/game/release/race-progress.ts',
  'src/game/release/race-rider-motion.ts',
  'src/game/release/race-rider-sprite.ts',
];

describe('Phaser 비의존 모듈 경계', () => {
  PURE_MODULES.forEach((file) => {
    it(`${file}에는 Phaser 값 import가 없다`, () => {
      const source = readFileSync(resolve(process.cwd(), file), 'utf8');
      // `import Phaser from 'phaser'` / `import { X } from 'phaser'` 금지, `import type`만 허용
      const valueImport = /^import\s+(?!type\b)[^;]*from\s+['"]phaser['"]/m;
      expect(valueImport.test(source), `${file}: Phaser 값 import 발견`).toBe(false);
    });
  });
});
