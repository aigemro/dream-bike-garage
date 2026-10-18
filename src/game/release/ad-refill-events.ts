// 보상형 광고 체력 충전(#92) 이벤트 기록: 제안 노출 → 시청 요청 → SDK 노출 → 보상/닫힘/실패(돌아가기) → 플레이 지속.
// Phaser와 SDK에 의존하지 않고 기록 함수만 받아서, 컨트롤러·작업대가 부르는 순서를 가짜 SDK 테스트로 확인할 수 있습니다.
// 파라미터에는 개인 식별 정보를 넣지 않습니다(체력·남은 횟수 같은 게임 수치와 요청마다 새로 만드는 임의 식별자만).
import type { AnalyticsEventName, AnalyticsParams, RewardedAdFailReason, RewardedAdObserver, RewardedAdOutcome } from '../../platform';

export type AdRefillLog = (name: AnalyticsEventName, params?: AnalyticsParams) => void;

/** 체력 카드를 연 경로: 체력 표시를 누름(energy) · 체력 0에서 상자를 누름(box) */
export type AdOfferEntry = 'energy' | 'box';

/** 이벤트를 남길 때의 게임 수치 */
export type AdRefillSnapshot = { energy: number; left: number };

/** 광고 1회 요청의 기록기. 광고 어댑터에 observer를 넘기고, 보상·돌아가기·끝을 알려 줍니다. */
export type AdRefillRequestEvents = {
  /** 요청 식별자. 이벤트를 한 요청으로 묶고, 도메인 보상 중복 방지에도 같은 값을 씁니다. */
  readonly requestId: string;
  readonly observer: RewardedAdObserver;
  /** SDK 보상 이벤트를 받음. granted는 도메인이 실제로 체력을 지급했는지(중복·조건 미달이면 false) */
  rewarded(granted: boolean, snapshot: AdRefillSnapshot): void;
  /** 광고가 끝나지 않아 '돌아가기'를 누름 */
  escaped(): void;
  /** 광고가 끝남. 보상 없이 끝났으면 dismissed·failed를 남기고, 플레이 지속 확인을 시작합니다. */
  finished(outcome: RewardedAdOutcome | 'error'): void;
};

export type AdRefillEvents = {
  offerShown(entry: AdOfferEntry, snapshot: AdRefillSnapshot): void;
  requested(snapshot: AdRefillSnapshot): AdRefillRequestEvents;
  /** 부품 상자를 엶. 직전 광고 뒤 첫 상자면 플레이 지속(continue)을 한 번 남깁니다. */
  boxOpened(): void;
};

const snapshotParams = (snapshot: AdRefillSnapshot): AnalyticsParams => ({ energy: snapshot.energy, ads_left: snapshot.left });

export function createAdRefillEvents(log: AdRefillLog, now: () => number = Date.now, newId: () => string = randomRequestId): AdRefillEvents {
  let lastEntry: AdOfferEntry = 'energy';
  // 직전 광고의 결과·끝난 시각. 다음 상자 열기 또는 다음 광고 요청까지 유지합니다(앱 실행 동안만, 저장하지 않음).
  let followUp: { requestId: string; outcome: string; endedAt: number } | null = null;

  return {
    offerShown(entry, snapshot) {
      lastEntry = entry;
      log('ad_refill_offer', { entry, ...snapshotParams(snapshot) });
    },
    requested(snapshot) {
      followUp = null;
      const requestId = newId();
      const base = { request_id: requestId };
      let failure: RewardedAdFailReason | null = null;
      let escaped = false;
      let ended = false;
      log('ad_refill_request', { ...base, entry: lastEntry, ...snapshotParams(snapshot) });
      return {
        requestId,
        observer: {
          onImpression: () => { if (!ended) log('ad_refill_impression', base); },
          onFailure: (reason) => { failure = reason; },
        },
        rewarded(granted, after) {
          if (ended) return;
          log('ad_refill_reward', { ...base, granted, ...snapshotParams(after) });
        },
        escaped() {
          if (ended || escaped) return;
          escaped = true;
          log('ad_refill_escape', base);
        },
        finished(outcome) {
          if (ended) return;
          ended = true;
          if (outcome === 'dismissed') log('ad_refill_dismissed', { ...base, reason: escaped ? 'escape' : 'closed' });
          else if (outcome !== 'rewarded') log('ad_refill_failed', { ...base, reason: failure ?? 'error' });
          followUp = { requestId, outcome: outcome === 'error' ? 'failed' : outcome, endedAt: now() };
        },
      };
    },
    boxOpened() {
      if (!followUp) return;
      const { requestId, outcome, endedAt } = followUp;
      followUp = null;
      log('ad_refill_continue', { request_id: requestId, outcome, seconds_after_ad: Math.max(0, Math.round((now() - endedAt) / 1000)) });
    },
  };
}

function randomRequestId(): string {
  return `ad-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
