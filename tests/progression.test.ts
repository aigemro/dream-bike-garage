// 레벨 디자인 진행 규칙 단위 테스트 (설계 수치와 무관한 규칙만)
// 순번 ↔ 영업일 변환, 주문표 펼치기와 반복 구간, 챕터 판정, 데이터 검증 규칙을 작은 가짜 설계로 확인합니다.
import { describe, expect, it } from 'vitest';
import { createWorkbench, mergeParts, orderIndexOf, type WorkbenchSchedule } from '../src/domain/merge-workbench';
import {
  ORDERS_PER_DAY,
  buildOrderSchedule,
  chapterForDay,
  dayOfSequence,
  estimateEnergy,
  firstSequenceOfDay,
  levelDesignIssues,
  ordersOfDay,
  scheduledOrderAt,
  slotOfSequence,
  summarizeDay,
  workUnits,
  type CatalogEntryForValidation,
  type LevelDesign,
  type OrderDefinition,
} from '../src/domain/progression';

const order = (id: string, bikeId: string, levels: [number, number, number, number], reward: number, grade: OrderDefinition['grade'] = '입문', category: OrderDefinition['category'] = 'road'): OrderDefinition =>
  ({ id, bikeId, name: id, category, grade, levels: { frame: levels[0], wheel: levels[1], drivetrain: levels[2], handlebar: levels[3] }, reward });

const CATALOG: CatalogEntryForValidation[] = [
  { id: 'dream-road', category: '로드', grade: '중급' },
  { id: 'urban-road', category: '로드', grade: '입문' },
  { id: 'trail-mtb', category: 'MTB', grade: '중급' },
  { id: 'dream-machine', category: '로드', grade: '드림' },
];

// 영업 3일차짜리 작은 설계: 1일차 학습 → 2일차 반복 → 3일차부터 반복 구간
const TINY: LevelDesign = {
  orders: [
    order('urban-first', 'urban-road', [2, 2, 1, 1], 1000, '입문', 'city'),
    order('trail', 'trail-mtb', [3, 2, 2, 1], 1400, '중급', 'mtb'),
    order('trail-pro', 'trail-mtb', [2, 3, 2, 2], 1800, '고급', 'mtb'),
  ],
  days: [
    { day: 1, slots: ['urban-first', 'trail', 'urban-first'], intent: '학습' },
    { day: 2, slots: ['trail', 'urban-first', 'trail'], intent: '반복' },
    { day: 3, slots: ['trail-pro', 'trail', 'trail'], intent: '후반' },
  ],
  repeatFromDay: 3,
  chapters: [
    { id: 'c1', name: '첫 영업', rankName: '알바생', dayFrom: 1, dayTo: 2, goal: '규칙 학습', teaches: ['합성'], unlocks: [] },
    { id: 'c2', name: '단골', rankName: '견습공', dayFrom: 3, dayTo: 3, goal: '반복', teaches: [], unlocks: ['고급'] },
  ],
};
const OPTIONS = { deliveriesToRegister: 2, maxDayWorkUnits: 28, excludedBikeIds: ['dream-road'] };

describe('순번 ↔ 영업일', () => {
  it('하루 주문 수는 Day 세션 목표와 같고, 순번 0~2가 1일차다', () => {
    expect(ORDERS_PER_DAY).toBe(3);
    expect([0, 1, 2, 3, 5, 6].map(dayOfSequence)).toEqual([1, 1, 1, 2, 2, 3]);
    expect([0, 1, 2, 3].map(slotOfSequence)).toEqual([0, 1, 2, 0]);
    expect(firstSequenceOfDay(1)).toBe(0);
    expect(firstSequenceOfDay(4)).toBe(9);
  });

  it('작업량은 Lv.n 부품을 Lv.1 2^(n-1)개로 세고, 체력은 0.93배로 추정한다', () => {
    expect(workUnits({ frame: 2, wheel: 2, drivetrain: 1, handlebar: 1 })).toBe(6);
    expect(workUnits({ frame: 4, wheel: 2, drivetrain: 2, handlebar: 1 })).toBe(13);
    expect(estimateEnergy(27)).toBe(25);
  });
});

describe('주문표 펼치기와 반복 구간', () => {
  const schedule = buildOrderSchedule(TINY);

  it('영업일·슬롯 순서대로 순번을 붙이고 반복 시작 순번을 계산한다', () => {
    expect(schedule.entries).toHaveLength(9);
    expect(schedule.entries[4]).toMatchObject({ id: 'urban-first', sequence: 4, day: 2, slot: 1 });
    expect(schedule.repeatFrom).toBe(6);
    expect(schedule.workbench.orders[1]).toEqual({ levels: { frame: 3, wheel: 2, drivetrain: 2, handlebar: 1 }, reward: 1400 });
  });

  it('설계 구간이 끝나면 반복 구간(3일차)만 돌고 첫날로 돌아가지 않는다', () => {
    expect([6, 7, 8, 9, 10, 11, 12, 300].map((sequence) => orderIndexOf(sequence, schedule.workbench))).toEqual([6, 7, 8, 6, 7, 8, 6, 6]);
    expect(scheduledOrderAt(schedule, 10)?.id).toBe('trail');
    expect(ordersOfDay(schedule, 40).map((entry) => entry.id)).toEqual(['trail-pro', 'trail', 'trail']);
    expect(scheduledOrderAt(schedule, -1)).toBeUndefined();
  });

  it('배열 주문 목록은 이전처럼 처음부터 끝까지 순환한다', () => {
    const list = schedule.workbench.orders.slice(0, 3);
    expect([0, 2, 3, 7, -1].map((sequence) => orderIndexOf(sequence, list))).toEqual([0, 2, 0, 1, 2]);
  });

  it('반복 구간 시작이 주문표 밖이면 마지막 주문으로 잘라 안전하게 반복한다', () => {
    const edge: WorkbenchSchedule = { orders: schedule.workbench.orders.slice(0, 3), repeatFrom: 99 };
    expect(orderIndexOf(5, edge)).toBe(2);
    expect(orderIndexOf(0, { orders: [], repeatFrom: 0 })).toBe(0);
  });

  it('작업대는 주문표를 그대로 받아 첫 주문을 시작 보드로 납품하고 다음 순번 주문으로 넘어간다', () => {
    const state = createWorkbench(schedule.workbench, 1_000);
    mergeParts(state, schedule.workbench, 0, 1);
    const events = mergeParts(state, schedule.workbench, 2, 3)!;
    expect(events.find((event) => event.type === 'delivered')).toMatchObject({ order: 0, orderIndex: 0, reward: 1000 });
    expect(state.order).toBe(1);
    // 다음 주문(트레일 MTB)으로 넘어가고, 남은 지급 부품(프레임·휠셋 Lv.1)은 보드에 이월된다
    expect(state.installed).toEqual({ frame: false, wheel: false, drivetrain: false, handlebar: false });
    expect(state.board.filter(Boolean)).toHaveLength(2);
  });

  it('하루 요약은 작업량·체력 추정·보상 합을 돌려준다', () => {
    expect(summarizeDay(schedule, 1)).toMatchObject({ day: 1, workUnits: 6 + 9 + 6, energyEstimate: estimateEnergy(21), reward: 3400 });
  });

  it('정의되지 않은 주문 id가 있으면 펼치기에서 바로 실패한다', () => {
    expect(() => buildOrderSchedule({ ...TINY, days: [{ day: 1, slots: ['urban-first', 'nope', 'trail'], intent: '' }] })).toThrow(/nope/);
  });
});

describe('챕터', () => {
  it('영업일이 속한 챕터를 돌려주고, 설계 끝 뒤에는 마지막 챕터가 이어진다', () => {
    expect(chapterForDay(TINY.chapters, 1)?.id).toBe('c1');
    expect(chapterForDay(TINY.chapters, 2)?.id).toBe('c1');
    expect(chapterForDay(TINY.chapters, 3)?.id).toBe('c2');
    expect(chapterForDay(TINY.chapters, 99)?.id).toBe('c2');
    expect(chapterForDay(TINY.chapters, 0)?.id).toBe('c1');
  });
});

describe('레벨 디자인 검증', () => {
  it('작은 설계는 문제 없이 통과한다', () => {
    expect(levelDesignIssues(TINY, CATALOG, OPTIONS)).toEqual([]);
  });

  it('첫 주문이 어반 로드(2·2·1·1)가 아니면 보고한다', () => {
    const broken = { ...TINY, days: [{ ...TINY.days[0], slots: ['trail', 'urban-first', 'urban-first'] }, ...TINY.days.slice(1)] };
    expect(levelDesignIssues(broken, CATALOG, OPTIONS).some((issue) => issue.includes('첫 주문'))).toBe(true);
  });

  it('등록에 필요한 납품 횟수가 모자라는 자전거, 작업량 초과, 반복 구간의 튜토리얼 주문을 보고한다', () => {
    const sparse: LevelDesign = {
      ...TINY,
      orders: [...TINY.orders, order('heavy', 'trail-mtb', [4, 3, 3, 3], 3000, '고급', 'mtb')],
      days: [
        { day: 1, slots: ['urban-first', 'heavy', 'heavy'], intent: '' },
        { day: 2, slots: ['urban-first', 'urban-first', 'urban-first'], intent: '' },
      ],
      repeatFromDay: 2,
      chapters: [{ ...TINY.chapters[0], dayTo: 2 }],
    };
    const issues = levelDesignIssues(sparse, CATALOG, OPTIONS);
    expect(issues.some((issue) => issue.includes('영업 1일차 작업량'))).toBe(true);
    expect(issues.some((issue) => issue.includes('반복 구간') && issue.includes('urban-first'))).toBe(true);
    // 바쁜 날로 선언하면 작업량 초과는 보고하지 않는다
    expect(levelDesignIssues(sparse, CATALOG, { ...OPTIONS, heavyDays: [1] }).some((issue) => issue.includes('영업 1일차 작업량'))).toBe(false);
    const missing = levelDesignIssues({ ...TINY, days: TINY.days.map((plan) => ({ ...plan, slots: ['urban-first', 'urban-first', 'urban-first'] })) }, CATALOG, OPTIONS);
    expect(missing.some((issue) => issue.startsWith('trail-mtb 납품 0회'))).toBe(true);
  });

  it('요구 레벨 범위·Lv.4 중복·카테고리 불일치·드림 등급 주문·챕터 빈틈을 보고한다', () => {
    const bad: LevelDesign = {
      ...TINY,
      orders: [
        ...TINY.orders,
        order('lv5', 'trail-mtb', [5, 1, 1, 1], 100, '고급', 'mtb'),
        order('double4', 'trail-mtb', [4, 4, 1, 1], 100, '고급', 'mtb'),
        order('wrong-cat', 'trail-mtb', [2, 2, 1, 1], 100, '입문', 'road'),
        order('dreamy', 'dream-machine', [2, 2, 1, 1], 100, '입문', 'road'),
      ],
      chapters: [TINY.chapters[0], { ...TINY.chapters[1], dayFrom: 4, dayTo: 4 }],
    };
    const issues = levelDesignIssues(bad, CATALOG, OPTIONS);
    expect(issues).toEqual(expect.arrayContaining([
      expect.stringContaining('요구 레벨 범위 밖'),
      expect.stringContaining('Lv.4 요구가 2개 이상'),
      expect.stringContaining('카테고리 불일치'),
      expect.stringContaining('드림 등급은 주문으로'),
      expect.stringContaining('챕터 c2의 시작'),
    ]));
  });
});
