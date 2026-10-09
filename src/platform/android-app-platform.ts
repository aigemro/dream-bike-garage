// 안드로이드 테스트 앱(Capacitor) 플랫폼
// 앱인토스 출시 전에 휴대폰에서 앱 형태로 플레이해 보기 위한 빌드에서만 씁니다(npm run build:android).
// 저장·진동은 웹과 같고, 뒤로가기·앱 종료·앱 전환만 Capacitor App 플러그인으로 받습니다.
import { App } from '@capacitor/app';
import { createBrowserPlatform } from './browser-platform';
import type { GamePlatform, Unsubscribe } from './types';

// Capacitor 리스너 등록은 비동기라, 등록이 끝난 뒤에 해제되도록 감쌉니다.
function listen(register: () => Promise<{ remove: () => Promise<void> }>): Unsubscribe {
  const handle = register();
  return () => { void handle.then((h) => h.remove()).catch(() => {}); };
}

export function createAndroidAppPlatform(): GamePlatform {
  const browser = createBrowserPlatform();
  return {
    ...browser,
    kind: 'android-app',
    onAppVisibilityChange(listener) {
      // WebView의 visibilitychange에 더해 앱 상태 변화(홈 버튼·다른 앱 전환)도 받습니다. 같은 값이 두 번 와도 게임 쪽은 멱등입니다.
      const offDocument = browser.onAppVisibilityChange(listener);
      const offApp = listen(() => App.addListener('appStateChange', ({ isActive }) => listener(isActive)));
      return () => { offDocument(); offApp(); };
    },
    onBack(listener) {
      // 리스너를 등록하면 안드로이드 기본 뒤로가기(앱 종료)가 막히고 게임이 직접 처리합니다.
      return listen(() => App.addListener('backButton', () => listener()));
    },
    async close() {
      await App.exitApp();
    },
    // 세로 고정은 AndroidManifest의 screenOrientation으로 처리합니다.
    async lockPortrait() {},
  };
}
