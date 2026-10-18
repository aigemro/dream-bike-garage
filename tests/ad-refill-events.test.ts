// 보상형 광고 이벤트 기록 테스트: 가짜 SDK(전면 광고 + Analytics.log)로 제안 → 요청 → 노출 → 보상/닫힘/실패 → 플레이 지속 순서를 확인합니다.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAdRefillEvents } from '../src/game/release/ad-refill-events';
import { ANALYTICS_LOG_TYPE, createSdkEventLogger, type AnalyticsLogSdk } from '../src/platform/analytics';
import { createFullScreenRewardedAd, type FullScreenAdSdk } from '../src/platform/rewarded-ad';
import type { RewardedAdPort } from '../src/platform/types';

type Handlers = { onEvent: (event: { type: string }) => void; onError: (error: Error) => void };
type Logged = Parameters<AnalyticsLogSdk>[0];

// 전면 광고 호출을 기록하고 테스트가 이벤트를 직접 보내는 가짜 SDK와, 보낸 로그를 모으는 가짜 Analytics.log
function fakeToss(supported = true) {
  const loads: Handlers[] = [];
  const shows: Handlers[] = [];
  const sdk = {
    loadFullScreenAd: Object.assign((params: Handlers) => { loads.push(params); return () => {}; }, { isSupported: () => supported }),
    showFullScreenAd: Object.assign((params: Handlers) => { shows.push(params); return () => {}; }, { isSupported: () => supported }),
  } as unknown as FullScreenAdSdk;
  const logs: Logged[] = [];
  const logEvent = createSdkEventLogger(async (params) => { logs.push(params); });
  return { sdk, loads, shows, logs, logEvent };
}

const flush = () => new Promise<void>((resolve) => { queueMicrotask(resolve); });
const names = (logs: Logged[]) => logs.map((log) => log.log_name);
const snapshot = { energy: 3, rewarded: 0 };

// 컨트롤러 watchRewardedAd와 같은 순서로 요청 → show(observer) → 보상 → 끝을 잇습니다.
async function watch(port: RewardedAdPort, events: ReturnType<typeof createAdRefillEvents>, signal?: AbortSignal) {
  const request = events.requested(snapshot);
  const onReward = vi.fn(() => request.rewarded(true, { energy: 13, rewarded: 1 }));
  const result = port.show(onReward, signal, request.observer).catch(() => 'error' as const)
    .then((outcome) => { request.finished(outcome); return outcome; });
  return { request, onReward, result };
}

describe('보상형 광고 이벤트 기록', () => {
  let clock = 0;
  const now = () => clock;
  let seq = 0;
  const newId = () => `req-${++seq}`;
  beforeEach(() => { clock = 1_000; seq = 0; vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('보상까지 본 광고: 제안 → 요청 → 노출 → 보상 순서로 남기고, 다음 상자 열기를 플레이 지속으로 한 번 남긴다', async () => {
    const toss = fakeToss();
    const events = createAdRefillEvents(toss.logEvent, now, newId);
    const port = createFullScreenRewardedAd(toss.sdk, 'test-id');
    events.offerShown('box', { energy: 0, rewarded: 0 });
    const { onReward, result } = await watch(port, events);
    await flush();
    toss.loads[0].onEvent({ type: 'loaded' });
    await flush();
    await flush();
    toss.shows[0].onEvent({ type: 'show' });
    toss.shows[0].onEvent({ type: 'impression' });
    toss.shows[0].onEvent({ type: 'impression' }); // 중복 노출은 한 번만
    toss.shows[0].onEvent({ type: 'userEarnedReward' });
    toss.shows[0].onEvent({ type: 'dismissed' });
    await expect(result).resolves.toBe('rewarded');
    expect(onReward).toHaveBeenCalledTimes(1);
    clock += 42_400;
    events.boxOpened();
    events.boxOpened(); // 두 번째 상자는 기록하지 않음

    expect(names(toss.logs)).toEqual(['ad_refill_offer', 'ad_refill_request', 'ad_refill_impression', 'ad_refill_reward', 'ad_refill_continue']);
    expect(toss.logs[0]).toEqual({ log_name: 'ad_refill_offer', log_type: 'impression', params: { entry: 'box', energy: 0, ads_rewarded: 0 } });
    expect(toss.logs[1]).toEqual({ log_name: 'ad_refill_request', log_type: 'click', params: { request_id: 'req-1', entry: 'box', energy: 3, ads_rewarded: 0 } });
    expect(toss.logs[3].params).toEqual({ request_id: 'req-1', granted: true, energy: 13, ads_rewarded: 1 });
    expect(toss.logs[4].params).toEqual({ request_id: 'req-1', outcome: 'rewarded', seconds_after_ad: 42 });
    // 요청 단위 이벤트는 모두 같은 요청 식별자로 묶입니다.
    expect(new Set(toss.logs.slice(1).map((log) => log.params.request_id))).toEqual(new Set(['req-1']));
  });

  it('보상 없이 닫으면 dismissed(closed)를 남기고 보상 이벤트는 없다', async () => {
    const toss = fakeToss();
    const events = createAdRefillEvents(toss.logEvent, now, newId);
    const port = createFullScreenRewardedAd(toss.sdk, 'test-id');
    const { onReward, result } = await watch(port, events);
    await flush();
    toss.loads[0].onEvent({ type: 'loaded' });
    await flush();
    await flush();
    toss.shows[0].onEvent({ type: 'impression' });
    toss.shows[0].onEvent({ type: 'dismissed' });
    await expect(result).resolves.toBe('dismissed');
    expect(onReward).not.toHaveBeenCalled();
    expect(names(toss.logs)).toEqual(['ad_refill_request', 'ad_refill_impression', 'ad_refill_dismissed']);
    expect(toss.logs[2].params).toEqual({ request_id: 'req-1', reason: 'closed' });
  });

  it('불러오기·표시 실패와 미지원은 failed에 이유를 남긴다', async () => {
    const toss = fakeToss();
    const events = createAdRefillEvents(toss.logEvent, now, newId);
    const port = createFullScreenRewardedAd(toss.sdk, 'test-id');

    const loadFail = await watch(port, events);
    await flush();
    toss.loads[0].onError(new Error('no fill'));
    await expect(loadFail.result).resolves.toBe('failed');

    const showFail = await watch(port, events);
    await flush();
    toss.loads[1].onEvent({ type: 'loaded' });
    await flush();
    await flush();
    toss.shows[0].onEvent({ type: 'failedToShow' });
    await expect(showFail.result).resolves.toBe('failed');

    const unsupported = fakeToss(false);
    const unsupportedEvents = createAdRefillEvents(unsupported.logEvent, now, newId);
    const none = await watch(createFullScreenRewardedAd(unsupported.sdk, 'test-id'), unsupportedEvents);
    await expect(none.result).resolves.toBe('failed');

    const failed = toss.logs.filter((log) => log.log_name === 'ad_refill_failed').map((log) => log.params.reason);
    expect(failed).toEqual(['load', 'show']);
    expect(unsupported.logs.at(-1)).toMatchObject({ log_name: 'ad_refill_failed', params: { reason: 'unsupported' } });
    expect(names(toss.logs)).not.toContain('ad_refill_impression');
  });

  it('60초 뒤 돌아가기: escape를 남기고 dismissed 이유는 escape다. 돌아간 뒤 온 보상은 지급·기록하지 않는다', async () => {
    const toss = fakeToss();
    const events = createAdRefillEvents(toss.logEvent, now, newId);
    const port = createFullScreenRewardedAd(toss.sdk, 'test-id');
    const abort = new AbortController();
    const { request, onReward, result } = await watch(port, events, abort.signal);
    await flush();
    toss.loads[0].onEvent({ type: 'loaded' });
    await flush();
    await flush();
    request.escaped();
    abort.abort();
    await expect(result).resolves.toBe('dismissed');
    toss.shows[0].onEvent({ type: 'userEarnedReward' });
    expect(onReward).not.toHaveBeenCalled();
    expect(names(toss.logs)).toEqual(['ad_refill_request', 'ad_refill_escape', 'ad_refill_dismissed']);
    expect(toss.logs[1].log_type).toBe('click');
    expect(toss.logs[2].params.reason).toBe('escape');
  });

  it('광고 뒤 상자를 열지 않고 다음 광고를 요청하면 이전 광고의 플레이 지속은 남기지 않는다', () => {
    const logs: string[] = [];
    const events = createAdRefillEvents((name) => logs.push(name), now, newId);
    events.boxOpened(); // 광고 전 상자 열기는 기록하지 않음
    events.requested(snapshot).finished('dismissed');
    events.requested(snapshot).finished('rewarded');
    events.boxOpened();
    expect(logs).toEqual(['ad_refill_request', 'ad_refill_dismissed', 'ad_refill_request', 'ad_refill_continue']);
  });

  it('show가 예외로 끝나면 failed(error)를 남긴다', () => {
    const logs: Array<[string, unknown]> = [];
    const events = createAdRefillEvents((name, params) => logs.push([name, params]), now, newId);
    const request = events.requested(snapshot);
    request.finished('error');
    request.finished('dismissed'); // 끝난 요청은 다시 기록하지 않음
    expect(logs.at(-1)).toEqual(['ad_refill_failed', { request_id: 'req-1', reason: 'error' }]);
    expect(logs).toHaveLength(2);
  });
});

describe('Analytics.log 어댑터', () => {
  it('모든 이벤트에 log_type을 정하고, SDK 오류(동기·비동기)는 삼킨다', async () => {
    expect(Object.values(ANALYTICS_LOG_TYPE).every((type) => ['impression', 'click', 'event'].includes(type))).toBe(true);
    const throwing = createSdkEventLogger(() => { throw new Error('bridge'); });
    const rejecting = createSdkEventLogger(() => Promise.reject(new Error('unsupported')));
    expect(() => throwing('ad_refill_request')).not.toThrow();
    expect(() => rejecting('ad_refill_request', { energy: 1 })).not.toThrow();
    await flush();
  });

  it('호출한 파라미터 객체를 그대로 넘기지 않고 복사한다', () => {
    const sent: Logged[] = [];
    const logEvent = createSdkEventLogger((params) => { sent.push(params); });
    const params = { energy: 1 };
    logEvent('ad_refill_offer', params);
    params.energy = 99;
    expect(sent[0]).toEqual({ log_name: 'ad_refill_offer', log_type: 'impression', params: { energy: 1 } });
  });
});
