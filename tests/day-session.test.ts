// Day 세션 규칙 단위 테스트
// 주문 N건 = 하루 일정(#77 C안)의 상태 전이·정산·복원과, 화면 공용 시간 표기 규칙을 확인합니다.
import { describe, expect, it } from 'vitest';
import {
  DAY_ORDER_TARGET,
  MAX_DAY_HISTORY,
  canAcceptPlayInput,
  createReadyDay,
  formatDayClock,
  isDayUrgent,
  normalizeRestoredDay,
  parseDaySession,
  pauseDay,
  prepareNextDay,
  recordOrderDelivery,
  resumeDay,
  settleDay,
  startDay,
  trackActiveTime,
  type DayHistoryEntry,
} from '../src/domain/day-session';

const AT = '2026-10-09T00:00:00.000Z';

describe('Day 세션: 주문 N건 = 하루 일정', () => {
  it('준비 상태에서만 시작하고, 영업 중에만 플레이 입력을 받는다', () => {
    const ready = createReadyDay(4);
    expect(ready.orderTarget).toBe(DAY_ORDER_TARGET);
    expect(canAcceptPlayInput(ready)).toBe(false);
    const active = startDay(ready, AT);
    expect(active.status).toBe('active');
    expect(canAcceptPlayInput(active)).toBe(true);
    expect(startDay(active, '2026-10-10T00:00:00.000Z').startedAt).toBe(AT);
  });

  it('일시정지 중에는 입력을 막고 시간을 기록하지 않으며, 재개하면 이어진다', () => {
    const paused = pauseDay(startDay(createReadyDay(), AT), 'background');
    expect(paused).toMatchObject({ status: 'paused', pauseReason: 'background' });
    expect(canAcceptPlayInput(paused)).toBe(false);
    expect(trackActiveTime(paused, 5000).elapsedActiveMs).toBe(0);
    const resumed = resumeDay(paused);
    expect(resumed).toMatchObject({ status: 'active', pauseReason: null });
    expect(trackActiveTime(resumed, 5000).elapsedActiveMs).toBe(5000);
    expect(trackActiveTime(resumed, Number.NaN).elapsedActiveMs).toBe(0);
  });

  it('주문 수를 채우면 마감되고 그 뒤 납품은 오늘 통계에 넣지 않는다', () => {
    let day = startDay(createReadyDay(1, 3), AT);
    day = recordOrderDelivery(day, 1000).day;
    const second = recordOrderDelivery(day, 1400.7);
    expect(second).toMatchObject({ counted: true, targetReached: false });
    const third = recordOrderDelivery(second.day, 1800);
    expect(third.targetReached).toBe(true);
    expect(third.day).toMatchObject({ status: 'closing', ordersCompleted: 3, earnings: 4200 });
    expect(canAcceptPlayInput(third.day)).toBe(false);
    expect(recordOrderDelivery(third.day, 1000)).toMatchObject({ counted: false, targetReached: false });
  });

  it('일시정지 중 확정된 납품도 기록하고, 음수 보상은 0으로 본다', () => {
    const paused = pauseDay(startDay(createReadyDay(), AT), 'screen-navigation');
    const result = recordOrderDelivery(paused, -500);
    expect(result.counted).toBe(true);
    expect(result.day).toMatchObject({ ordersCompleted: 1, earnings: 0, status: 'paused' });
    expect(recordOrderDelivery(createReadyDay(), 1000).counted).toBe(false);
  });

  it('정산은 마감된 Day만 한 번 기록하고, 정산 뒤에만 다음 Day로 넘어간다', () => {
    const closing = recordOrderDelivery(startDay(createReadyDay(2, 1), AT), 1000).day;
    expect(prepareNextDay(closing)).toBe(closing);
    const first = settleDay(closing, [], AT);
    expect(first.settled).toBe(true);
    expect(first.history).toEqual([{ dayNumber: 2, ordersCompleted: 1, earnings: 1000, elapsedActiveMs: 0, endedAt: AT }]);
    expect(settleDay(first.day, first.history, AT).settled).toBe(false);
    expect(settleDay(closing, first.history, AT).history).toHaveLength(1);
    expect(prepareNextDay(first.day)).toMatchObject({ dayNumber: 3, status: 'ready', ordersCompleted: 0, earnings: 0 });
  });

  it('정산 이력은 최근 14일만 남긴다', () => {
    const history: DayHistoryEntry[] = Array.from({ length: MAX_DAY_HISTORY }, (_, index) => ({ dayNumber: index + 1, ordersCompleted: 3, earnings: 0, elapsedActiveMs: 0, endedAt: AT }));
    const closing = recordOrderDelivery(startDay(createReadyDay(15, 1), AT), 0).day;
    const result = settleDay(closing, history, AT);
    expect(result.history).toHaveLength(MAX_DAY_HISTORY);
    expect(result.history[0].dayNumber).toBe(2);
    expect(result.history.at(-1)?.dayNumber).toBe(15);
  });

  it('영업 중 저장된 Day는 일시정지로 복원한다', () => {
    expect(normalizeRestoredDay(startDay(createReadyDay(), AT))).toMatchObject({ status: 'paused', pauseReason: 'restore' });
    expect(normalizeRestoredDay(createReadyDay()).status).toBe('ready');
  });

  it('손상된 저장은 기존 Day 번호의 준비 상태로 시작하고, 값은 안전하게 보정한다', () => {
    expect(parseDaySession(null, 7).current).toMatchObject({ dayNumber: 7, status: 'ready' });
    expect(parseDaySession({ current: 'x' }, 3).current.dayNumber).toBe(3);
    const parsed = parseDaySession({
      current: { dayNumber: 5.8, status: 'unknown', orderTarget: 999, ordersCompleted: -2, earnings: 12.9, elapsedActiveMs: -1, pauseReason: 'nope' },
      history: [null, { dayNumber: 0 }, { dayNumber: 4, ordersCompleted: 3, earnings: 4200, elapsedActiveMs: 1000, endedAt: AT }],
    });
    expect(parsed.current).toMatchObject({ dayNumber: 5, status: 'ready', orderTarget: 20, ordersCompleted: 0, earnings: 12, elapsedActiveMs: 0, pauseReason: null });
    expect(parsed.history).toEqual([{ dayNumber: 4, ordersCompleted: 3, earnings: 4200, elapsedActiveMs: 1000, endedAt: AT }]);
  });
});

describe('Day 시간 표기', () => {
  it('1분 이상도 mm:ss로 표기한다', () => {
    expect(formatDayClock(180_000)).toBe('03:00');
    expect(formatDayClock(75_000)).toBe('01:15');
    expect(formatDayClock(10_000)).toBe('00:10');
  });

  it('1초 미만은 올림하고, 0 이하는 00:00으로 표기한다', () => {
    expect(formatDayClock(59_001)).toBe('01:00');
    expect(formatDayClock(1)).toBe('00:01');
    expect(formatDayClock(0)).toBe('00:00');
    expect(formatDayClock(-500)).toBe('00:00');
  });

  it('종료 임박 강조는 Day 길이의 10%(최소 3초)부터다', () => {
    expect(isDayUrgent(3000, 10_000)).toBe(true);
    expect(isDayUrgent(3001, 10_000)).toBe(false);
    expect(isDayUrgent(18_000, 180_000)).toBe(true);
    expect(isDayUrgent(18_001, 180_000)).toBe(false);
  });
});
