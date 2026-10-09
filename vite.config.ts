import { defineConfig } from 'vitest/config';

// 빌드 대상
// - 기본(GitHub Pages): base '/dream-bike-garage/', 결과물 dist
// - --mode toss(앱인토스 번들): 상대 경로 base, 결과물 dist-toss
//   개발 서버(`npm run dev:toss`)에서는 devtools가 SDK를 mock으로 바꾸고 기기·토스 상단 바 시뮬레이션 패널을 띄웁니다.
export default defineConfig(async ({ command, mode }) => {
  const toss = mode === 'toss';
  // devtools는 Node 24 이상 전용 개발 도구라, 앱인토스 개발 서버에서만 불러옵니다.
  const plugins = toss && command === 'serve'
    ? [(await import('@apps-in-toss/devtools/unplugin')).default.vite()]
    : [];

  return {
    base: toss ? './' : '/dream-bike-garage/',
    plugins,
    build: {
      outDir: toss ? 'dist-toss' : 'dist',
    },
    test: {
      include: ['tests/**/*.test.ts'],
    },
  };
});
