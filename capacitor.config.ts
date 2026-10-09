// 안드로이드 테스트 앱(APK) 설정
// 앱인토스 출시 전에 실제 휴대폰에서 앱 형태로 플레이해 보기 위한 빌드입니다. 스토어 배포용이 아닙니다.
// 웹 빌드(npm run build:android → dist-android)를 그대로 앱에 담습니다.
import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.aigemro.dreambikegarage.test',
  appName: '자전거 부자 TEST',
  webDir: 'dist-android',
  android: {
    // 상태 바·하단 내비게이션 바 영역을 --safe-area-inset-* CSS 변수로 받습니다(styles.css에서 여백으로 사용).
    // WebView 디버깅은 개발용 빌드에서만 켭니다.
    webContentsDebuggingEnabled: false,
  },
  plugins: {
    SystemBars: {
      insetsHandling: 'css',
      // index.html이 viewport-fit=cover를 쓰므로 처음부터 edge-to-edge로 맞춰 화면이 튀지 않게 합니다.
      initialViewportFitValueHint: 'cover',
    },
  },
};

export default config;
