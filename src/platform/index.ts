// 실행 환경에 맞는 플랫폼을 고릅니다.
// 앱인토스 빌드(--mode toss)에서만 SDK 어댑터를 불러와, 웹 빌드에는 SDK 코드가 들어가지 않게 합니다.
import { createBrowserPlatform } from './browser-platform';
import type { GamePlatform } from './types';

export async function createPlatform(): Promise<GamePlatform> {
  if (import.meta.env.MODE === 'toss') {
    const { createAppsInTossPlatform } = await import('./apps-in-toss-platform');
    return createAppsInTossPlatform();
  }
  return createBrowserPlatform();
}

export type { AsyncKeyValueStorage, GamePlatform, HapticKind, PlatformKind, SafeAreaInsets, Unsubscribe } from './types';
