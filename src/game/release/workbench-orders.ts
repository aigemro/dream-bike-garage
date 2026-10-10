// 머지 작업대 주문표 (순수 데이터 · Phaser 비의존)
// 레벨 디자인 주문표(ORDER_SCHEDULE)를 작업대 규칙(domain/merge-workbench)이 받는 형태로 내보냅니다.
// 누적 주문 순번이 설계 구간을 지나면 repeatFrom부터 끝까지를 반복합니다(첫날 주문으로 돌아가지 않음).
import type { WorkbenchOrder, WorkbenchSchedule } from '../../domain/merge-workbench';
import { ORDER_SCHEDULE } from './meta-progress';

export const WORKBENCH_SCHEDULE: WorkbenchSchedule = ORDER_SCHEDULE.workbench;

/** 주문표를 평평하게 펼친 목록(위치 = 주문 메타 orderIndex) */
export const WORKBENCH_ORDERS: readonly WorkbenchOrder[] = WORKBENCH_SCHEDULE.orders;
