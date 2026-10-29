// 분석 이벤트 기록 어댑터: 게임의 logEvent 호출을 앱인토스 SDK Analytics.log 형식으로 바꿉니다.
// SDK를 직접 불러오지 않고 함수를 받아서, 웹 빌드에 SDK가 들어가지 않고 가짜 SDK로 테스트할 수 있습니다.
// 근거: SDK 3.8.0에서 eventLog는 deprecated("Analytics.log를 사용해주세요")이고, Analytics.log가 같은 기능을 제공합니다.
// Analytics.impression·click은 현재 경로·https 기준의 DOM 요소용이라, 캔버스(Phaser) 버튼에는 log_type을 직접 지정하는 log를 씁니다.
import type { AnalyticsEventName, AnalyticsParams, GamePlatform } from './types';

/** Analytics.log의 log_type 중 이 게임이 쓰는 값 */
export type AnalyticsLogType = 'impression' | 'click' | 'event';

/** 이벤트별 log_type: 화면 노출은 impression, 사용자의 누름은 click, 나머지는 event */
export const ANALYTICS_LOG_TYPE: Record<AnalyticsEventName, AnalyticsLogType> = {
  ad_refill_offer: 'impression',
  ad_refill_request: 'click',
  ad_refill_impression: 'event',
  ad_refill_reward: 'event',
  ad_refill_dismissed: 'event',
  ad_refill_failed: 'event',
  ad_refill_escape: 'click',
  ad_refill_continue: 'event',
};

export type AnalyticsLogSdk = (params: {
  log_name: string;
  log_type: AnalyticsLogType;
  params: Record<string, string | number | boolean>;
}) => Promise<void> | void;

/** SDK Analytics.log를 GamePlatform.logEvent로 감쌉니다. 오류(동기·비동기)는 삼켜 게임을 막지 않습니다. */
export function createSdkEventLogger(log: AnalyticsLogSdk): GamePlatform['logEvent'] {
  return (name, params = {}) => {
    try {
      void Promise.resolve(log({ log_name: name, log_type: ANALYTICS_LOG_TYPE[name], params: { ...params } })).catch(() => {});
    } catch {
      // 미지원 버전·브리지 오류: 기록만 빠지고 게임은 계속합니다.
    }
  };
}

/** 웹·안드로이드 테스트 앱: 개발 중에만 콘솔에 남기고, 배포 빌드에서는 아무 일도 하지 않습니다. */
export function consoleEventLogger(name: AnalyticsEventName, params: AnalyticsParams = {}): void {
  if (!import.meta.env.DEV) return;
  console.info(`[event] ${name}`, params);
}
