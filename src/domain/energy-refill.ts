// 알바 체력 소진 안내 규칙 (Lab #263 A안 재구현 · 순수 로직, Phaser 비의존)
// 체력이 바닥나고 무료 상자도 없으면 상자를 열 수 없습니다. 이때 화면은 소진 안내 카드로
// 다음 +1·가득 참까지 남은 시간과 '합성은 체력 없이 계속할 수 있음'을 알려 줍니다.
// 보상형 광고 충전(#92)은 이 카드에 버튼을 더하는 방식으로 연결합니다.
import { ENERGY_MAX, ENERGY_RECOVERY_MS, type WorkbenchState } from './merge-workbench';

/** 상자를 열 수 없는 체력 소진 상태(체력 0, 무료 상자도 없음) */
export function isEnergyEmpty(state: Pick<WorkbenchState, 'energy' | 'freeBoxes'>): boolean {
  return state.energy < 1 && state.freeBoxes < 1;
}

/**
 * 체력이 가득 찰 때까지 남은 시간(ms). 가득 차 있으면 0.
 * energyAnchor는 마지막 회복 기준 시각이라, 다음 +1까지 남은 시간에 나머지 칸의 회복 시간을 더한 값과 같습니다.
 */
export function msUntilFullEnergy(state: Pick<WorkbenchState, 'energy' | 'energyAnchor'>, now: number): number {
  if (state.energy >= ENERGY_MAX) return 0;
  const sinceAnchor = Math.max(0, now - state.energyAnchor);
  return Math.max(0, (ENERGY_MAX - state.energy) * ENERGY_RECOVERY_MS - sinceAnchor);
}

/** 남은 시간을 'N시간 M분' 또는 'M분'으로 표시합니다(분 단위 올림). */
export function formatDuration(ms: number): string {
  const minutes = Math.ceil(Math.max(0, ms) / 60_000);
  const hours = Math.floor(minutes / 60);
  return hours > 0 ? `${hours}시간 ${minutes % 60}분` : `${minutes}분`;
}
