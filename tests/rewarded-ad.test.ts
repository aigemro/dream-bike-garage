// 보상형 광고 어댑터 단위 테스트: 가짜 SDK로 불러오기·표시·보상 이벤트 순서와 실패·중복·중단을 확인합니다.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AD_LOAD_TIMEOUT_MS, createFullScreenRewardedAd, type FullScreenAdSdk } from '../src/platform/rewarded-ad';

type Handlers = { onEvent: (event: { type: string }) => void; onError: (error: Error) => void };

// 호출을 기록하고, 테스트가 이벤트를 직접 보내는 가짜 SDK
function fakeSdk(supported = true) {
  const loads: Handlers[] = [];
  const shows: Handlers[] = [];
  const cleanups = { load: 0, show: 0 };
  const sdk: FullScreenAdSdk = {
    loadFullScreenAd: Object.assign((params: Handlers) => { loads.push(params); return () => { cleanups.load += 1; }; }, { isSupported: () => supported }),
    showFullScreenAd: Object.assign((params: Handlers) => { shows.push(params); return () => { cleanups.show += 1; }; }, { isSupported: () => supported }),
  } as unknown as FullScreenAdSdk;
  return { sdk, loads, shows, cleanups };
}

const flush = () => new Promise<void>((resolve) => { queueMicrotask(resolve); });

describe('보상형 광고 어댑터', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  async function startShow(port: ReturnType<typeof createFullScreenRewardedAd>, fake: ReturnType<typeof fakeSdk>, onReward = vi.fn(), signal?: AbortSignal) {
    const result = port.show(onReward, signal);
    await flush();
    fake.loads.at(-1)!.onEvent({ type: 'loaded' });
    await flush();
    await flush();
    return { result, onReward };
  }

  it('보상 이벤트를 받은 순간 한 번만 지급하고, 닫히면 rewarded로 끝난다', async () => {
    const fake = fakeSdk();
    const port = createFullScreenRewardedAd(fake.sdk, 'test-id');
    const { result, onReward } = await startShow(port, fake);
    const show = fake.shows[0];
    show.onEvent({ type: 'impression' });
    show.onEvent({ type: 'userEarnedReward' });
    show.onEvent({ type: 'userEarnedReward' }); // 중복 이벤트
    expect(onReward).toHaveBeenCalledTimes(1);
    show.onEvent({ type: 'dismissed' });
    await expect(result).resolves.toBe('rewarded');
    expect(fake.cleanups.show).toBe(1);
  });

  it('보상 없이 닫거나 클릭만 하면 지급하지 않는다', async () => {
    const fake = fakeSdk();
    const port = createFullScreenRewardedAd(fake.sdk, 'test-id');
    const { result, onReward } = await startShow(port, fake);
    fake.shows[0].onEvent({ type: 'clicked' });
    fake.shows[0].onEvent({ type: 'dismissed' });
    await expect(result).resolves.toBe('dismissed');
    expect(onReward).not.toHaveBeenCalled();
  });

  it('표시 실패는 failed, 보상 뒤 표시 실패는 rewarded다', async () => {
    const fake = fakeSdk();
    const port = createFullScreenRewardedAd(fake.sdk, 'test-id');
    const first = await startShow(port, fake);
    fake.shows[0].onEvent({ type: 'failedToShow' });
    await expect(first.result).resolves.toBe('failed');
    const second = await startShow(port, fake);
    fake.shows[1].onEvent({ type: 'userEarnedReward' });
    fake.shows[1].onError(new Error('host'));
    await expect(second.result).resolves.toBe('rewarded');
  });

  it('불러오기 오류·시간 초과·미지원은 failed이고 보상하지 않는다', async () => {
    const fake = fakeSdk();
    const port = createFullScreenRewardedAd(fake.sdk, 'test-id');
    const onReward = vi.fn();
    const errored = port.show(onReward);
    await flush();
    fake.loads[0].onError(new Error('no fill'));
    await expect(errored).resolves.toBe('failed');

    const timedOut = port.show(onReward);
    await flush();
    vi.advanceTimersByTime(AD_LOAD_TIMEOUT_MS);
    await expect(timedOut).resolves.toBe('failed');
    fake.loads[1].onEvent({ type: 'loaded' }); // 늦게 온 이벤트는 무시
    expect(fake.shows).toHaveLength(0);

    const unsupported = fakeSdk(false);
    await expect(createFullScreenRewardedAd(unsupported.sdk, 'test-id').show(onReward)).resolves.toBe('failed');
    await expect(createFullScreenRewardedAd(fake.sdk, '').show(onReward)).resolves.toBe('failed');
    expect(onReward).not.toHaveBeenCalled();
  });

  it('보여 주는 중에 들어온 두 번째 요청은 failed다', async () => {
    const fake = fakeSdk();
    const port = createFullScreenRewardedAd(fake.sdk, 'test-id');
    const { result } = await startShow(port, fake);
    await expect(port.show(vi.fn())).resolves.toBe('failed');
    fake.shows[0].onEvent({ type: 'dismissed' });
    await expect(result).resolves.toBe('dismissed');
  });

  it('중단하면 dismissed로 끝나고, 그 뒤 보상 이벤트는 무시한다', async () => {
    const fake = fakeSdk();
    const port = createFullScreenRewardedAd(fake.sdk, 'test-id');
    const abort = new AbortController();
    const { result, onReward } = await startShow(port, fake, vi.fn(), abort.signal);
    abort.abort();
    await expect(result).resolves.toBe('dismissed');
    fake.shows[0].onEvent({ type: 'userEarnedReward' });
    expect(onReward).not.toHaveBeenCalled();
  });

  it('미리 불러온 광고를 쓰고, 보여 준 뒤에는 다음 요청에서 새로 불러온다', async () => {
    const fake = fakeSdk();
    const port = createFullScreenRewardedAd(fake.sdk, 'test-id');
    port.preload();
    port.preload(); // 불러오는 중이면 다시 요청하지 않음
    expect(fake.loads).toHaveLength(1);
    fake.loads[0].onEvent({ type: 'loaded' });
    await flush();
    const result = port.show(vi.fn());
    await flush();
    await flush();
    expect(fake.loads).toHaveLength(1);
    expect(fake.shows).toHaveLength(1);
    fake.shows[0].onEvent({ type: 'dismissed' });
    await result;
    port.preload();
    expect(fake.loads).toHaveLength(2);
  });
});
