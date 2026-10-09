// 머지 작업대 주문 목록 (순수 데이터 · Phaser 비의존)
// 주문 메타(이름·보상·부품별 요구 레벨)를 작업대 규칙(domain/merge-workbench)이 쓰는 형태로 바꿉니다.
import type { WorkbenchOrder } from '../../domain/merge-workbench';
import { ORDER_METAS } from './meta-progress';

export const WORKBENCH_ORDERS: readonly WorkbenchOrder[] = ORDER_METAS.map((meta) => ({
  levels: { ...meta.partLevels },
  reward: meta.reward,
}));
