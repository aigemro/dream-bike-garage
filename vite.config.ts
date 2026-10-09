import { defineConfig } from 'vitest/config';

// 빌드 대상
// - 기본(GitHub Pages): base '/dream-bike-garage/', 결과물 dist
// - --mode toss(앱인토스 번들): 상대 경로 base, 결과물 dist-toss
//   개발 서버(`npm run dev:toss`)에서는 devtools가 SDK를 mock으로 바꾸고 기기·토스 상단 바 시뮬레이션 패널을 띄웁니다.
// - --mode android(안드로이드 테스트 APK, Capacitor): 상대 경로 base, 결과물 dist-android
export default defineConfig(async ({ command, mode }) => {
  const toss = mode === 'toss';
  const android = mode === 'android';
  // devtools는 Node 24 이상 전용 개발 도구라, 앱인토스 개발 서버에서만 불러옵니다.
  const plugins = toss && command === 'serve'
    ? [(await import('@apps-in-toss/devtools/unplugin')).default.vite()]
    : [];

  return {
    base: toss || android ? './' : '/dream-bike-garage/',
    plugins,
    build: {
      outDir: toss ? 'dist-toss' : android ? 'dist-android' : 'dist',
    },
    test: {
      include: ['tests/**/*.test.ts'],
    },
  };
});
