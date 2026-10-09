// 웹 브라우저(GitHub Pages·로컬 개발) 플랫폼: localStorage와 DOM 이벤트로 구현합니다.
import type { AsyncKeyValueStorage, GamePlatform, HapticKind } from './types';

type SyncStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

const HAPTIC_MS: Record<HapticKind, number> = { tap: 10, success: 30, error: 60 };

// 동기 저장소를 비동기 인터페이스로 감쌉니다. 저장소에 접근할 수 없으면(프라이빗 모드 등) 읽기는 null, 쓰기는 실패로 알립니다.
export function createAsyncStorage(resolve: () => SyncStorage | undefined): AsyncKeyValueStorage {
  return {
    async getItem(key) {
      try { return resolve()?.getItem(key) ?? null; } catch { return null; }
    },
    async setItem(key, value) {
      const storage = resolve();
      if (!storage) throw new Error('저장소를 사용할 수 없습니다.');
      storage.setItem(key, value);
    },
    async removeItem(key) {
      resolve()?.removeItem(key);
    },
  };
}

function browserLocalStorage(): SyncStorage | undefined {
  try { return globalThis.localStorage; } catch { return undefined; }
}

export function createBrowserPlatform(): GamePlatform {
  return {
    kind: 'browser',
    storage: createAsyncStorage(browserLocalStorage),
    async getPlayerKey() { return null; },
    onAppVisibilityChange(listener) {
      const onVisibility = () => listener(!document.hidden);
      const onPageHide = () => listener(false);
      document.addEventListener('visibilitychange', onVisibility);
      window.addEventListener('pagehide', onPageHide);
      return () => {
        document.removeEventListener('visibilitychange', onVisibility);
        window.removeEventListener('pagehide', onPageHide);
      };
    },
    onBack() { return () => {}; },
    async close() {},
    haptic(kind) {
      try { navigator.vibrate?.(HAPTIC_MS[kind]); } catch { /* 진동을 지원하지 않는 브라우저 */ }
    },
    getSafeAreaInsets() { return null; },
    onSafeAreaChange() { return () => {}; },
    async lockPortrait() {},
  };
}
