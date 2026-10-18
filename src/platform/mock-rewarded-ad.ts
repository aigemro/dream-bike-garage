// 웹 개발용 모의 보상형 광고: 실제 광고 대신 결과를 직접 골라 게임 쪽 흐름(보상·닫기·실패)을 확인합니다.
// 개발 서버에서, 또는 배포 웹에서 주소에 ?mockAd 를 붙였을 때만 씁니다. 운영 광고와 무관합니다.
import type { RewardedAdOutcome, RewardedAdPort } from './types';

export function createMockRewardedAd(): RewardedAdPort {
  let busy = false;
  return {
    preload() {},
    show(onReward, signal) {
      if (busy) return Promise.resolve<RewardedAdOutcome>('failed');
      busy = true;
      return new Promise<RewardedAdOutcome>((resolve) => {
        const layer = document.createElement('div');
        layer.setAttribute('role', 'dialog');
        layer.setAttribute('aria-label', '모의 보상형 광고');
        layer.style.cssText = 'position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;background:rgba(10,10,10,.82);font-family:sans-serif';
        const box = document.createElement('div');
        box.style.cssText = 'width:min(320px,86vw);padding:20px;border-radius:12px;background:#fff;color:#222;text-align:center;display:grid;gap:10px';
        const title = document.createElement('strong');
        title.textContent = '모의 광고 (웹 개발용)';
        const note = document.createElement('span');
        note.textContent = '결과를 골라 보상 흐름을 확인합니다';
        note.style.cssText = 'font-size:13px;color:#666';
        box.append(title, note);
        const finish = (outcome: RewardedAdOutcome) => {
          if (!busy) return;
          busy = false;
          signal?.removeEventListener('abort', onAbort);
          layer.remove();
          resolve(outcome);
        };
        const onAbort = () => finish('dismissed');
        signal?.addEventListener('abort', onAbort, { once: true });
        const button = (label: string, outcome: RewardedAdOutcome) => {
          const element = document.createElement('button');
          element.type = 'button';
          element.textContent = label;
          element.style.cssText = 'padding:12px;border:0;border-radius:8px;font-size:15px;background:#eee;cursor:pointer';
          element.addEventListener('click', () => {
            if (outcome === 'rewarded') onReward();
            finish(outcome);
          });
          box.append(element);
        };
        button('끝까지 보기 (보상)', 'rewarded');
        button('중간에 닫기', 'dismissed');
        button('불러오기 실패', 'failed');
        layer.append(box);
        document.body.append(layer);
      });
    },
  };
}
