// 릴리스 저장 상태 v4 복구·이전 테스트
// 기존(v2·v3, 주문 1건 = 1 Day) 플레이어의 진행이 머지 작업대·Day 세션·영업일 주문표 도입 뒤에도 이어지는지 확인합니다.
import { describe, expect, it } from 'vitest';
import { alignWorkbenchToDay, createReleaseState, expectedOrderSequence, restoreReleaseState } from '../src/game/release/release-state';
import { WORKBENCH_ORDERS, WORKBENCH_SCHEDULE } from '../src/game/release/workbench-orders';
import { ORDER_METAS, orderMetaAt } from '../src/game/release/meta-progress';
import { mergeParts, orderIndexOf } from '../src/domain/merge-workbench';
import { firstSequenceOfDay } from '../src/domain/progression';
import { createReadyDay, recordOrderDelivery, settleDay, startDay } from '../src/domain/day-session';

const NOW = 5_000_000;

describe('주문 데이터 단일 출처', () => {
  it('작업대 주문표는 주문 메타의 요구 레벨·보상과 위치까지 같다', () => {
    expect(WORKBENCH_ORDERS.map((order) => order.reward)).toEqual(ORDER_METAS.map((meta) => meta.reward));
    expect(WORKBENCH_ORDERS.map((order) => order.levels)).toEqual(ORDER_METAS.map((meta) => meta.partLevels));
    expect(WORKBENCH_SCHEDULE.orders).toBe(WORKBENCH_ORDERS);
    ORDER_METAS.forEach((meta, index) => expect(meta.orderIndex).toBe(index));
  });

  it('첫 주문은 시작 보드와 결합된 어반 로드(프레임2·휠셋2·구동계1·핸들바1)다', () => {
    expect(orderMetaAt(0)).toMatchObject({ bikeId: 'urban-road', day: 1, slot: 0, partLevels: { frame: 2, wheel: 2, drivetrain: 1, handlebar: 1 } });
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

  it('v3 저장은 코인·납품 수·Day 번호·대회 기록을 잇고, 그 영업일의 주문표 첫 주문부터 시작한다', () => {
    const v3 = { version: 3, coins: 4200, completedOrders: 7, orderIndex: 1, tutorialDone: true, autoPlacement: true, bgm: false, sfx: true, vibration: false, dayNumber: 8, lastRaceDay: 5, raceEntryDay: null };
    const state = restoreReleaseState(JSON.stringify(v3), NOW);
    expect(state).toMatchObject({ coins: 4200, completedOrders: 7, tutorialDone: true, bgm: false, lastRaceDay: 5, raceEntryDay: null });
    expect(state.day).toMatchObject({ dayNumber: 8, status: 'ready', ordersCompleted: 0 });
    // 주문표는 영업일 기준이므로 8일차 첫 주문(누적 순번 21)부터 이어간다
    expect(state.workbench.order).toBe(firstSequenceOfDay(8));
    expect(state.orderIndex).toBe(orderIndexOf(firstSequenceOfDay(8), WORKBENCH_SCHEDULE));
    expect('autoPlacement' in state).toBe(false);
  });

  it('v4 저장은 작업대·오늘 진행을 그대로 복구하고, 영업 중이던 Day는 일시정지로 연다', () => {
    const saved = createReleaseState(NOW);
    saved.coins = 1000;
    saved.day = startDay(saved.day, '2026-10-09T00:00:00.000Z');
    mergeParts(saved.workbench, WORKBENCH_SCHEDULE, 0, 1);
    mergeParts(saved.workbench, WORKBENCH_SCHEDULE, 2, 3);
    saved.day = recordOrderDelivery(saved.day, 1000).day;
    const state = restoreReleaseState(JSON.stringify(saved), NOW);
    expect(state.workbench.board).toEqual(saved.workbench.board);
    expect(state.workbench.order).toBe(1);
    expect(state.orderIndex).toBe(1);
    expect(state.day).toMatchObject({ status: 'paused', pauseReason: 'restore', ordersCompleted: 1, earnings: 1000 });
  });

  it('정산까지 끝난 Day는 급여를 다시 주지 않고 다음 Day 준비로 열며, 작업대는 다음 영업일 첫 주문을 가리킨다', () => {
    const saved = createReleaseState(NOW);
    let day = startDay(saved.day, '2026-10-09T00:00:00.000Z');
    for (const reward of [1000, 1400, 1800]) day = recordOrderDelivery(day, reward).day;
    const settled = settleDay(day, [], '2026-10-09T00:10:00.000Z');
    saved.day = settled.day;
    saved.dayHistory = settled.history;
    saved.coins = 4200;
    saved.workbench.order = 3;
    const state = restoreReleaseState(JSON.stringify(saved), NOW);
    expect(state.coins).toBe(4200);
    expect(state.day).toMatchObject({ dayNumber: 2, status: 'ready', earnings: 0 });
    expect(state.dayHistory).toHaveLength(1);
    expect(state.workbench.order).toBe(firstSequenceOfDay(2));
  });

  it('마감 직후 앱을 닫은 Day는 마감 상태로 남겨 다음 진입 때 정산한다', () => {
    const saved = createReleaseState(NOW);
    let day = startDay(saved.day, '2026-10-09T00:00:00.000Z');
    for (const reward of [1000, 1400, 1800]) day = recordOrderDelivery(day, reward).day;
    saved.day = day;
    expect(restoreReleaseState(JSON.stringify(saved), NOW).day.status).toBe('closing');
  });
});

describe('작업대 순번과 영업일 맞추기', () => {
  it('Day 상태가 가리키는 순번은 영업일 첫 주문 + 오늘 납품 수다', () => {
    let day = startDay(createReadyDay(3), '2026-10-09T00:00:00.000Z');
    expect(expectedOrderSequence(day)).toBe(firstSequenceOfDay(3));
    day = recordOrderDelivery(day, 1000).day;
    expect(expectedOrderSequence(day)).toBe(firstSequenceOfDay(3) + 1);
  });

  it('순번이 어긋난 저장은 영업일 첫 주문으로 되돌리고 장착 상태·되돌리기 기록을 비운다', () => {
    const state = createReleaseState(NOW);
    // 손상된 저장처럼 순번만 앞서가고 이전 주문 사양 기준의 장착 상태가 남은 상황
    state.workbench.order = 4;
    state.workbench.installed = { frame: true, wheel: false, drivetrain: true, handlebar: true };
    state.workbench.undo = { board: [...state.workbench.board], installed: { ...state.workbench.installed }, order: 3, combo: 0, freeBoxes: 0, guarantees: 0 };
    const nextDay = createReadyDay(2);
    expect(alignWorkbenchToDay(state.workbench, nextDay)).toBe(true);
    expect(state.workbench.order).toBe(firstSequenceOfDay(2));
    expect(state.workbench.installed).toEqual({ frame: false, wheel: false, drivetrain: false, handlebar: false });
    expect(state.workbench.undo).toBeNull();
    expect(alignWorkbenchToDay(state.workbench, nextDay)).toBe(false);
  });

  it('반복 구간의 영업일(31일차 이후)도 주문표 반복 규칙으로 복구한다', () => {
    const v3 = { version: 3, coins: 0, completedOrders: 102, orderIndex: 0, dayNumber: 35 };
    const state = restoreReleaseState(JSON.stringify(v3), NOW);
    expect(state.workbench.order).toBe(firstSequenceOfDay(35));
    expect(state.orderIndex).toBe(orderIndexOf(firstSequenceOfDay(35), WORKBENCH_SCHEDULE));
    // 35일차 = 반복 구간 2바퀴째의 25일차 주문표
    expect(orderMetaAt(state.orderIndex)?.day).toBe(25);
  });
});
