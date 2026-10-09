// 호스트(앱인토스)가 알려 주는 Safe Area를 CSS 변수로 옮깁니다.
// styles.css의 #app 여백이 env(safe-area-inset-*)와 이 값 중 큰 쪽을 씁니다.
import type { GamePlatform, SafeAreaInsets, Unsubscribe } from './types';

const SIDES = ['top', 'right', 'bottom', 'left'] as const;

function apply(root: HTMLElement, insets: SafeAreaInsets) {
  SIDES.forEach((side) => root.style.setProperty(`--host-safe-${side}`, `${Math.max(0, insets[side])}px`));
}

export function bindSafeAreaCss(platform: GamePlatform, root: HTMLElement = document.documentElement): Unsubscribe {
  const current = platform.getSafeAreaInsets();
  if (current) apply(root, current);
  return platform.onSafeAreaChange((insets) => apply(root, insets));
}
