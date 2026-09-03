// Release Day session: Lab의 10초 테스트 값을 유지하되 기존 MVP 저장 상태와 분리합니다.
export const DAY_DURATION_MS = 10_000;
export type DayStatus = 'ready' | 'active' | 'paused' | 'settlement';
export type DayState = {
  dayNumber: number;
  status: DayStatus;
  remainingMs: number;
  earnings: number;
  ordersCompleted: number;
  startedAt: string | null;
};
export type DayHistoryEntry = { dayNumber: number; earnings: number; ordersCompleted: number; endedAt: string };
export type DaySessionState = { version: 1; current: DayState; history: DayHistoryEntry[] };

export function createReadyDay(dayNumber = 1): DayState {
  return { dayNumber, status: 'ready', remainingMs: DAY_DURATION_MS, earnings: 0, ordersCompleted: 0, startedAt: null };
}
export function createDaySession(): DaySessionState { return { version: 1, current: createReadyDay(), history: [] }; }
export function parseDaySession(raw: string | null): DaySessionState {
  if (!raw) return createDaySession();
  try {
    const value = JSON.parse(raw) as Partial<DaySessionState>;
    if (value.version !== 1 || !value.current) return createDaySession();
    const current = value.current as Partial<DayState>;
    return {
      version: 1,
      current: {
        dayNumber: Math.max(1, Math.floor(Number(current.dayNumber) || 1)),
        status: ['ready', 'active', 'paused', 'settlement'].includes(String(current.status)) ? current.status as DayStatus : 'ready',
        remainingMs: Math.min(DAY_DURATION_MS, Math.max(0, Number(current.remainingMs) || 0)),
        earnings: Math.max(0, Math.floor(Number(current.earnings) || 0)),
        ordersCompleted: Math.max(0, Math.floor(Number(current.ordersCompleted) || 0)),
        startedAt: typeof current.startedAt === 'string' ? current.startedAt : null,
      },
      history: Array.isArray(value.history) ? value.history.slice(-14) as DayHistoryEntry[] : [],
    };
  } catch { return createDaySession(); }
}
export function finishDay(session: DaySessionState): DaySessionState {
  if (session.current.status === 'settlement') return session;
  const ended = { dayNumber: session.current.dayNumber, earnings: session.current.earnings, ordersCompleted: session.current.ordersCompleted, endedAt: new Date().toISOString() };
  return { ...session, current: { ...session.current, status: 'settlement', remainingMs: 0 }, history: [...session.history, ended].slice(-14) };
}
export function nextDay(session: DaySessionState): DaySessionState {
  return { ...session, current: createReadyDay(session.current.dayNumber + 1) };
}
