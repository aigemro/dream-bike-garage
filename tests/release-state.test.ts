// 릴리스 저장 상태 v4 복구·이전 테스트
// 기존(v2·v3, 주문 1건 = 1 Day) 플레이어의 진행이 머지 작업대·Day 세션 도입 뒤에도 이어지는지 확인합니다.
import { describe, expect, it } from 'vitest';
import { createReleaseState, restoreReleaseState } from '../src/game/release/release-state';
import { WORKBENCH_ORDERS } from '../src/game/release/workbench-orders';
import { ORDER_METAS } from '../src/game/release/meta-progress';
import { mergeParts } from '../src/domain/merge-workbench';
import { recordOrderDelivery, settleDay, startDay } from '../src/domain/day-session';

const NOW = 5_000_000;

describe('주문 데이터 단일 출처', () => {
  it('작업대 주문은 주문 메타의 요구 레벨·보상과 같다', () => {
    expect(WORKBENCH_ORDERS.map((order) => order.reward)).toEqual(ORDER_METAS.map((meta) => meta.reward));
    expect(WORKBENCH_ORDERS[1].levels).toEqual({ frame: 3, wheel: 2, drivetrain: 2, handlebar: 1 });
  });
});

describe('릴리스 저장 복구', () => {
  it('저장이 없거나 손상됐으면 Day 1 준비 상태와 첫 주문 작업대로 시작한다', () => {
    for (const raw of [null, '{broken', JSON.stringify({ version: 1, coins: 999 })]) {
      const state = restoreReleaseState(raw, NOW);
      expect(state).toMatchObject({ version: 4, coins: 0, orderIndex: 0, day: { dayNumber: 1, status: 'ready', orderTarget: 3 } });
      expect(state.workbench.order).toBe(0);
    }
  });

  it('v3 저장은 코인·납품 수·Day 번호·대회 기록·주문 순서를 잇는다', () => {
    const v3 = { version: 3, coins: 4200, completedOrders: 7, orderIndex: 1, tutorialDone: true, autoPlacement: true, bgm: false, sfx: true, vibration: false, dayNumber: 8, lastRaceDay: 5, raceEntryDay: null };
    const state = restoreReleaseState(JSON.stringify(v3), NOW);
    expect(state).toMatchObject({ coins: 4200, completedOrders: 7, orderIndex: 1, tutorialDone: true, bgm: false, lastRaceDay: 5, raceEntryDay: null });
    expect(state.day).toMatchObject({ dayNumber: 8, status: 'ready', ordersCompleted: 0 });
    // 이어서 할 주문(트레일 MTB)의 Lv.1 핸들바가 지급 부품으로 바로 장착된다
    expect(state.workbench.order).toBe(1);
    expect(state.workbench.installed.handlebar).toBe(true);
    expect('autoPlacement' in state).toBe(false);
  });

  it('v4 저장은 작업대·오늘 진행을 그대로 복구하고, 영업 중이던 Day는 일시정지로 연다', () => {
    const saved = createReleaseState(NOW);
    saved.coins = 1000;
    saved.day = startDay(saved.day, '2026-10-09T00:00:00.000Z');
    mergeParts(saved.workbench, WORKBENCH_ORDERS, 0, 1);
    mergeParts(saved.workbench, WORKBENCH_ORDERS, 2, 3);
    saved.day = recordOrderDelivery(saved.day, 1000).day;
    const state = restoreReleaseState(JSON.stringify(saved), NOW);
    expect(state.workbench.board).toEqual(saved.workbench.board);
    expect(state.workbench.order).toBe(1);
    expect(state.orderIndex).toBe(1);
    expect(state.day).toMatchObject({ status: 'paused', pauseReason: 'restore', ordersCompleted: 1, earnings: 1000 });
  });

  it('정산까지 끝난 Day는 급여를 다시 주지 않고 다음 Day 준비로 연다', () => {
    const saved = createReleaseState(NOW);
    let day = startDay(saved.day, '2026-10-09T00:00:00.000Z');
    for (const reward of [1000, 1400, 1800]) day = recordOrderDelivery(day, reward).day;
    const settled = settleDay(day, [], '2026-10-09T00:10:00.000Z');
    saved.day = settled.day;
    saved.dayHistory = settled.history;
    saved.coins = 4200;
    const state = restoreReleaseState(JSON.stringify(saved), NOW);
    expect(state.coins).toBe(4200);
    expect(state.day).toMatchObject({ dayNumber: 2, status: 'ready', earnings: 0 });
    expect(state.dayHistory).toHaveLength(1);
  });

  it('마감 직후 앱을 닫은 Day는 마감 상태로 남겨 다음 진입 때 정산한다', () => {
    const saved = createReleaseState(NOW);
    let day = startDay(saved.day, '2026-10-09T00:00:00.000Z');
    for (const reward of [1000, 1400, 1800]) day = recordOrderDelivery(day, reward).day;
    saved.day = day;
    expect(restoreReleaseState(JSON.stringify(saved), NOW).day.status).toBe('closing');
  });
});
