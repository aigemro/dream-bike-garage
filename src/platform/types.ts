// 실행 환경(웹 브라우저 · 앱인토스 · 안드로이드 테스트 앱) 공통 인터페이스
// 게임 코드는 이 인터페이스만 사용합니다. 앱인토스 SDK는 apps-in-toss-platform.ts,
// Capacitor(안드로이드 테스트 앱)는 android-app-platform.ts에서만 호출합니다.

export type PlatformKind = 'browser' | 'apps-in-toss' | 'android-app';

// 앱인토스 Storage와 같은 모양의 비동기 문자열 저장소
export interface AsyncKeyValueStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

export type SafeAreaInsets = { top: number; right: number; bottom: number; left: number };

// 게임에서 쓰는 진동 종류. 앱인토스에서는 SDK 햅틱 타입으로 바꿔 보냅니다.
export type HapticKind = 'tap' | 'success' | 'error';

export type Unsubscribe = () => void;

export interface GamePlatform {
  readonly kind: PlatformKind;
  readonly storage: AsyncKeyValueStorage;
  // 사용자별 저장 슬롯을 나누는 키. 식별할 수 없으면 null(기기 공용 슬롯 사용)
  getPlayerKey(): Promise<string | null>;
  // 앱이 화면에서 사라지거나(백그라운드·화면 꺼짐) 다시 보일 때
  onAppVisibilityChange(listener: (visible: boolean) => void): Unsubscribe;
  // 시스템 뒤로가기(안드로이드 뒤로 버튼 등). 브라우저에서는 발생하지 않습니다.
  onBack(listener: () => void): Unsubscribe;
  // 미니앱 닫기. 브라우저에서는 아무 일도 하지 않습니다.
  close(): Promise<void>;
  haptic(kind: HapticKind): void;
  // 호스트가 알려 주는 Safe Area. 모르면 null(CSS env() 값에 맡김)
  getSafeAreaInsets(): SafeAreaInsets | null;
  onSafeAreaChange(listener: (insets: SafeAreaInsets) => void): Unsubscribe;
  // 화면 방향을 세로로 고정합니다. 지원하지 않는 환경에서는 아무 일도 하지 않습니다.
  lockPortrait(): Promise<void>;
}
