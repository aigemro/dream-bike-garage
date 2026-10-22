// Garage 효과 수치 (정적 밸런스 데이터 · Phaser 비의존) — #109
// 규칙: src/domain/garage-perks.ts · 카탈로그 연결: src/game/release/garage-perks.ts · 설계: docs/game-design/BIKE_COLLECTION_GROWTH.md
// 모든 값은 2026-10-23 설계 제안값(기획 확정 전)입니다. 수치를 바꿀 때는 이 파일만 고치고 npm test로 흐름 시뮬레이션을 확인합니다.
import type { GaragePerkConfig } from '../domain/garage-perks';
import { LEVEL2_BOX_RATE } from '../domain/merge-workbench';

export const GARAGE_PERK_CONFIG: GaragePerkConfig = {
  // 전시대 자전거 스타일 Lv 1당 손님 팁 +1% (3칸 × Lv.4 = 최대 12%)
  tipPerStyleLevel: 0.01,
  tipRounding: 10,
  // 작업대 기본 Lv.2 입고 20%. 대표 자전거 희귀도 Lv.2부터 Lv 1당 +5%p (Lv.4 = 35%)
  level2BoxBase: LEVEL2_BOX_RATE,
  level2BoxPerRarityLevel: 0.05,
  // 여러 출처가 겹쳐도 넘지 않는 상한. Lv.2 입고 45%면 체력 효율이 약 17% 오르고, 팁 25%면 하루 수입 약 +1,000입니다.
  caps: { tipRate: 0.25, level2BoxRate: 0.45, raceSpeedBonus: 5, settlementEnergy: 12 },
  // 카테고리별 보유(완성) 2·4·6대 — 각 카테고리는 도감 6대(드림 포함)
  categorySets: [
    { category: '로드', kind: 'raceSpeed', label: '레이스 속도', tiers: [{ owned: 2, value: 0.8 }, { owned: 4, value: 1.6 }, { owned: 6, value: 2.5 }] },
    { category: 'MTB', kind: 'settlementEnergy', label: '정산 체력 회복', tiers: [{ owned: 2, value: 4 }, { owned: 4, value: 8 }, { owned: 6, value: 12 }] },
    { category: '그래블', kind: 'level2Box', label: 'Lv.2 입고 확률', tiers: [{ owned: 2, value: 0.03 }, { owned: 4, value: 0.06 }, { owned: 6, value: 0.1 }] },
    { category: '미니벨로', kind: 'tip', label: '손님 팁', tiers: [{ owned: 2, value: 0.02 }, { owned: 4, value: 0.04 }, { owned: 6, value: 0.06 }] },
  ],
  // 드림 등급 3대의 시그니처 특성: 그 자전거를 대표로 둘 때만 발동
  signatures: [
    { bikeId: 'dream-machine', kind: 'raceSpeed', value: 2, label: '드림 머신 · 에어로 프레임' },
    { bikeId: 'expedition-gravel', kind: 'level2Box', value: 0.1, label: '익스페디션 그래블 · 탐험가의 눈' },
    { bikeId: 'dream-mini', kind: 'tip', value: 0.05, label: '드림 미니벨로 · 골목의 인기스타' },
  ],
  // 보유 대수 마일스톤(1회): 코인 적체를 늘리지 않도록 작업대 자원(무료 상자)으로 줍니다
  milestones: [
    { owned: 4, freeBoxes: 2 },
    { owned: 8, freeBoxes: 3 },
    { owned: 12, freeBoxes: 4 },
    { owned: 16, freeBoxes: 5 },
    { owned: 20, freeBoxes: 6 },
    { owned: 24, freeBoxes: 10 },
  ],
};
