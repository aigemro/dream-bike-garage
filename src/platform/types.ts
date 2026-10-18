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

// 분석 이벤트 이름. 앱인토스 로그 가이드 권장대로 '분류_행동' 형태로 짓습니다.
// 보상형 광고 체력 충전(#92) 흐름: 제안 노출 → 시청 요청 → SDK 노출 → 보상/닫힘/실패(돌아가기) → 플레이 지속
export type AnalyticsEventName =
  | 'ad_refill_offer' // 체력 카드에 광고 버튼이 '가능'으로 보임
  | 'ad_refill_request' // 광고 버튼을 눌러 시청을 요청함
  | 'ad_refill_impression' // SDK impression(광고가 실제로 화면에 노출됨)
  | 'ad_refill_reward' // SDK userEarnedReward(보상 지급 시점)
  | 'ad_refill_dismissed' // 보상 없이 닫힘·중단
  | 'ad_refill_failed' // 미지원·불러오기·표시 실패
  | 'ad_refill_escape' // 광고가 끝나지 않아 60초 뒤 '돌아가기'를 누름
  | 'ad_refill_continue'; // 광고 뒤 같은 세션에서 부품 상자를 다시 엶

// 이벤트 파라미터. 개인 식별 정보(이름·연락처·기기 ID 등)는 넣지 않습니다. 앱인토스는 anonymous_key를 스스로 붙입니다.
export type AnalyticsParams = Record<string, string | number | boolean>;

// 보상형 광고 실패 이유: 미지원(SDK·광고 그룹 ID 없음) · 불러오기 실패(오류·시간 초과) · 표시 실패 · 이미 재생 중
export type RewardedAdFailReason = 'unsupported' | 'load' | 'show' | 'busy';

// 보상 지급과 무관한 광고 진행 신호. 분석 기록용이며, 보상은 onReward(userEarnedReward)에서만 지급합니다.
export interface RewardedAdObserver {
  // SDK impression: 광고가 실제로 화면에 노출됨
  onImpression?(): void;
  // 결과가 failed일 때, 끝나기 직전에 이유를 알려 줍니다.
  onFailure?(reason: RewardedAdFailReason): void;
}

// 보상형 광고 결과: rewarded(보상 이벤트를 받음) · dismissed(보상 없이 닫힘·중단) · failed(미지원·불러오기·표시 실패)
export type RewardedAdOutcome = 'rewarded' | 'dismissed' | 'failed';

// 보상형 광고. 앱인토스에서는 SDK 전면 광고(리워드 광고 그룹)로, 웹 개발 중에는 모의 광고로 구현합니다.
export interface RewardedAdPort {
  // 광고를 미리 불러옵니다. 이미 불러왔거나 불러오는 중이면 아무 일도 하지 않습니다.
  preload(): void;
  // 광고를 보여 주고, 닫히거나 실패하면 결과를 돌려줍니다.
  // onReward는 SDK 보상 이벤트를 받은 순간 요청마다 최대 한 번 호출됩니다(닫힘보다 먼저 올 수 있음).
  // signal로 중단하면 이후 이벤트는 무시합니다. observer는 노출·실패 이유를 알려 줄 뿐 결과·보상에 영향을 주지 않습니다.
  show(onReward: () => void, signal?: AbortSignal, observer?: RewardedAdObserver): Promise<RewardedAdOutcome>;
}

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
  // 보상형 광고. 광고를 쓸 수 없는 환경(안드로이드 테스트 앱, 배포 웹)에서는 null
  readonly rewardedAd: RewardedAdPort | null;
  // 분석 이벤트 기록. 앱인토스에서는 SDK Analytics.log로 보내고, 웹·안드로이드 테스트 앱에서는 개발 중 콘솔에만 남깁니다.
  // 기록 실패가 게임을 막지 않도록 예외를 던지지 않고 결과도 기다리지 않습니다.
  logEvent(name: AnalyticsEventName, params?: AnalyticsParams): void;
}
