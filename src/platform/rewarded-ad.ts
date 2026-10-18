// 보상형 광고 어댑터: 앱인토스 SDK 전면 광고 API(loadFullScreenAd·showFullScreenAd)를 RewardedAdPort로 감쌉니다.
// SDK를 직접 불러오지 않고 함수를 받아서, 웹 빌드에 SDK가 들어가지 않고 가짜 SDK로 테스트할 수 있습니다.
// 공식 권장: load → show → load → show, 보상은 userEarnedReward 이벤트에서만 지급(dismissed만으로 지급 금지).
import type { RewardedAdOutcome, RewardedAdPort } from './types';

/** 앱인토스 공식 테스트용 리워드 광고 그룹 ID. 테스트에서 운영 ID를 쓰면 제재를 받을 수 있습니다. */
export const TEST_REWARDED_AD_GROUP_ID = 'ait-ad-test-rewarded-id';
/** 광고 불러오기 제한 시간 */
export const AD_LOAD_TIMEOUT_MS = 15_000;

type AdCall<Event> = ((params: {
  options?: { adGroupId: string };
  onEvent: (event: Event) => void;
  onError: (error: Error) => void;
}) => () => void) & { isSupported: () => boolean };

export type FullScreenAdSdk = {
  loadFullScreenAd: AdCall<{ type: 'loaded' }>;
  showFullScreenAd: AdCall<{ type: string }>;
};

export function createFullScreenRewardedAd(sdk: FullScreenAdSdk, adGroupId: string, loadTimeoutMs = AD_LOAD_TIMEOUT_MS): RewardedAdPort {
  let loaded = false;
  let loading: Promise<boolean> | null = null;
  let busy = false;

  const supported = () => {
    try { return sdk.loadFullScreenAd.isSupported() && sdk.showFullScreenAd.isSupported(); } catch { return false; }
  };

  // 한 요청이 자기 콜백을 소유합니다. 늦게 온 이벤트·중복 이벤트는 done으로 무시합니다.
  function load(): Promise<boolean> {
    if (loaded) return Promise.resolve(true);
    if (loading) return loading;
    const request = new Promise<boolean>((resolve) => {
      let done = false;
      let cleanup: (() => void) | undefined;
      const finish = (ok: boolean) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        cleanup?.();
        loaded = ok;
        resolve(ok);
      };
      const timer = setTimeout(() => finish(false), loadTimeoutMs);
      try {
        cleanup = sdk.loadFullScreenAd({
          options: { adGroupId },
          onEvent: (event) => { if (event.type === 'loaded') finish(true); },
          onError: () => finish(false),
        });
        if (done) cleanup();
      } catch {
        finish(false);
      }
    });
    loading = request;
    void request.then(() => { if (loading === request) loading = null; });
    return request;
  }

  return {
    preload() {
      if (!busy && adGroupId && supported()) void load();
    },
    async show(onReward, signal) {
      if (busy || !adGroupId || !supported()) return 'failed';
      busy = true;
      try {
        if (!(await load())) return 'failed';
        if (signal?.aborted) return 'dismissed';
        loaded = false; // 한 번 보여 준 광고는 다시 쓸 수 없어 다음 요청에서 새로 불러옵니다.
        return await new Promise<RewardedAdOutcome>((resolve) => {
          let done = false;
          let earned = false;
          let cleanup: (() => void) | undefined;
          const finish = (outcome: RewardedAdOutcome) => {
            if (done) return;
            done = true;
            signal?.removeEventListener('abort', onAbort);
            cleanup?.();
            resolve(earned ? 'rewarded' : outcome);
          };
          const onAbort = () => finish('dismissed');
          signal?.addEventListener('abort', onAbort, { once: true });
          try {
            cleanup = sdk.showFullScreenAd({
              options: { adGroupId },
              onEvent: (event) => {
                if (done) return;
                if (event.type === 'userEarnedReward') {
                  if (earned) return;
                  earned = true;
                  try { onReward(); } catch { /* 보상 반영 실패가 광고 흐름을 막지 않게 합니다. */ }
                } else if (event.type === 'dismissed') {
                  finish('dismissed');
                } else if (event.type === 'failedToShow') {
                  finish('failed');
                }
              },
              onError: () => finish('failed'),
            });
            if (done) cleanup();
          } catch {
            finish('failed');
          }
          // 표시 단계에는 시간 제한을 두지 않습니다. 시간만으로는 보상 여부를 알 수 없기 때문입니다(중단은 signal로).
        });
      } finally {
        busy = false;
      }
    },
  };
}
