// 앱인토스(토스 앱 WebView) 플랫폼: SDK 호출은 이 파일에만 둡니다.
// 웹 빌드에는 포함되지 않도록 platform/index.ts에서 앱인토스 빌드일 때만 불러옵니다.
// 개발 서버(npm run dev:toss)에서는 @apps-in-toss/devtools가 SDK를 mock으로 바꿉니다.
import { Analytics, Device, SafeArea, Screen, Storage, User, graniteEvent, loadFullScreenAd, showFullScreenAd } from '@apps-in-toss/web-framework';
import { createSdkEventLogger } from './analytics';
import { TEST_REWARDED_AD_GROUP_ID, createFullScreenRewardedAd } from './rewarded-ad';
import type { GamePlatform, HapticKind, SafeAreaInsets } from './types';

// 리워드 광고 그룹 ID: 운영 빌드에서만 VITE_TOSS_REWARDED_AD_GROUP_ID로 콘솔 발급 ID를 넣고, 없으면 공식 테스트 ID를 씁니다.
const REWARDED_AD_GROUP_ID = import.meta.env.VITE_TOSS_REWARDED_AD_GROUP_ID || TEST_REWARDED_AD_GROUP_ID;

const HAPTIC_TYPE = { tap: 'tickWeak', success: 'success', error: 'error' } as const satisfies Record<HapticKind, string>;

function toInsets(value: { top?: number; right?: number; bottom?: number; left?: number } | null | undefined): SafeAreaInsets | null {
  if (!value) return null;
  return { top: value.top ?? 0, right: value.right ?? 0, bottom: value.bottom ?? 0, left: value.left ?? 0 };
}

export function createAppsInTossPlatform(): GamePlatform {
  return {
    kind: 'apps-in-toss',
    storage: {
      getItem: (key) => Storage.getItem(key),
      setItem: (key, value) => Storage.setItem(key, value),
      removeItem: (key) => Storage.removeItem(key),
    },
    async getPlayerKey() {
      // 토스앱 5.232.0 미만이거나 오류면 null → 기기 공용 슬롯으로 진행하고, 다음 실행에서 키가 나오면 그 슬롯으로 옮깁니다.
      try {
        if (!User.getAnonymousKey.isSupported()) return null;
        const result = await User.getAnonymousKey();
        return result?.type === 'HASH' && result.hash ? result.hash : null;
      } catch {
        return null;
      }
    },
    onAppVisibilityChange(listener) {
      // 앱인토스 SDK에는 앱 전환 전용 이벤트가 없어 WebView의 visibilitychange를 씁니다(실기기 확인 대상).
      const onVisibility = () => listener(!document.hidden);
      const onPageHide = () => listener(false);
      document.addEventListener('visibilitychange', onVisibility);
      window.addEventListener('pagehide', onPageHide);
      return () => {
        document.removeEventListener('visibilitychange', onVisibility);
        window.removeEventListener('pagehide', onPageHide);
      };
    },
    onBack(listener) {
      return graniteEvent.addEventListener('backEvent', { onEvent: listener });
    },
    async close() {
      await Screen.close();
    },
    haptic(kind) {
      void Device.triggerHaptic({ type: HAPTIC_TYPE[kind] }).catch(() => {});
    },
    getSafeAreaInsets() {
      try { return toInsets(SafeArea.get()); } catch { return null; }
    },
    async lockPortrait() {
      try {
        if (Screen.setOrientation.isSupported()) await Screen.setOrientation({ type: 'portrait' });
      } catch {
        // 토스앱 5.215.0 미만: 콘솔의 화면 방향 설정에 맡깁니다.
      }
    },
    rewardedAd: createFullScreenRewardedAd({ loadFullScreenAd, showFullScreenAd }, REWARDED_AD_GROUP_ID),
    // 샌드박스에서는 SDK가 콘솔에만 출력하고, 토스앱 5.208.0 미만에서는 조용히 무시됩니다. anonymous_key는 SDK가 붙입니다.
    logEvent: createSdkEventLogger((params) => Analytics.log(params)),
    onSafeAreaChange(listener) {
      try {
        return SafeArea.subscribe({ onEvent: (insets) => { const value = toInsets(insets); if (value) listener(value); } });
      } catch {
        return () => {};
      }
    },
  };
}
