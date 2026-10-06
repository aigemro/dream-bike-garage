// Day 남은 시간 표기·종료 임박 기준 단위 테스트
// 게임 화면 HUD와 홈 상단 바가 같은 규칙으로 시간을 보여주는지 확인합니다.
import { describe, expect, it } from 'vitest';
import { formatDayClock, isDayUrgent } from '../src/game/release/day-session';

describe('Day 남은 시간 표기', () => {
  it('1분 이상 Day도 mm:ss로 표기한다', () => {
    expect(formatDayClock(180_000)).toBe('03:00');
    expect(formatDayClock(75_000)).toBe('01:15');
    expect(formatDayClock(10_000)).toBe('00:10');
  });

  it('1초 미만 남은 시간은 올림해 0초가 되기 직전까지 1초로 보인다', () => {
    expect(formatDayClock(59_001)).toBe('01:00');
    expect(formatDayClock(1)).toBe('00:01');
  });

  it('0 이하 남은 시간은 00:00으로 표기한다', () => {
    expect(formatDayClock(0)).toBe('00:00');
    expect(formatDayClock(-500)).toBe('00:00');
  });
});

describe('Day 종료 임박 기준', () => {
  it('짧은 Day는 최소 3초부터 강조한다', () => {
    expect(isDayUrgent(3000, 10_000)).toBe(true);
    expect(isDayUrgent(3001, 10_000)).toBe(false);
  });

  it('긴 Day는 길이의 10%부터 강조한다', () => {
    expect(isDayUrgent(18_000, 180_000)).toBe(true);
    expect(isDayUrgent(18_001, 180_000)).toBe(false);
  });
});
