# 머지 작업대(E안)와 Day 세션 적용

> 기준일: 2026-10-09 · 관련 이슈: [#77](https://github.com/aigemro/dream-bike-garage/issues/77) 플레이 제한 구조, [#30](https://github.com/aigemro/dream-bike-garage/issues/30) 머지 코어 채택, [#70](https://github.com/aigemro/dream-bike-garage/issues/70) Day·레이스 연결  
> Lab 근거: 머지 코어 E v3([Lab #251](https://github.com/aigemro/dream-bike-garage-lab/issues/251)), Day C안 주문 N건 = 하루 일정([Lab #258](https://github.com/aigemro/dream-bike-garage-lab/issues/258)), [Lab Day 메인 적용안](https://github.com/aigemro/dream-bike-garage-lab/blob/main/docs/DAY_SESSION_MAIN_APPLICATION.md)

Lab 코드를 복사하지 않고, 채택한 규칙만 메인 구조(`src/domain` 순수 규칙 + Phaser 화면 + 컨트롤러)에 맞춰 다시 만들었습니다.

## 1. 바뀐 플레이 흐름

| 항목 | 이전(메인) | 지금 |
|---|---|---|
| 머지 코어 | 모양 부품(1~3칸) + 택배 4종 주문 + 자유 이동·회전 | **E안**: 부품 상자 1종, 가운데→바깥 순서로 자동 입고, 이동 금지, 상하좌우 2개 합성 |
| 하루(Day) | 주문 1건 납품 = 1 Day | **주문 3건 납품 = 하루 일정**, 하루가 끝나면 정산 |
| 정산 화면 | 주문마다 급여 봉투 | 하루 마감 때 오늘 수입 봉투 (급여는 납품 순간 바로 지급) |
| 플레이 제한 | 없음 | **알바 체력 하나**: 30, 상자당 1, 실제 10분당 1 회복 |
| 레이스 | Day 5마다 = 주문 5건마다 | Day 5마다 = 주문 약 15건마다 (참가비·상금은 #77에서 다시 정함) |

화면 흐름: 홈 PLAY → (첫 플레이 안내) → 작업대 → 주문 3건 납품 → 하루 정산 → 다음 영업 시작 또는 홈.
작업대의 `← 홈`이나 앱 전환으로 나가면 Day가 일시정지되고, 다시 들어오면 같은 Day를 이어서 합니다.

## 2. 모듈

| 파일 | 역할 |
|---|---|
| `src/domain/merge-workbench.ts` | 작업대 규칙(입고 순서·합성·장착·납품 확정·연쇄 보너스·체력·되돌리기·저장 복구). 코인·Day는 다루지 않음 |
| `src/domain/day-session.ts` | Day 규칙(준비 → 영업 중 ⇄ 일시정지 → 마감 → 정산 → 다음 Day). 기존 `src/game/release/day-session.ts`를 대체 |
| `src/game/release/release-state.ts` | 저장 상태 v4와 이전 저장(v2·v3) 이전 |
| `src/game/release/workbench-orders.ts` | 주문 메타를 작업대 주문 형태로 변환 |
| `src/game/release/merge-workbench-screen.ts` | 작업대 화면(390×810, 게임 화면 B안과 같은 배치·팔레트) |
| `src/game/release/mvp-release-integration.ts` | 화면 전환, 납품 반영(코인·이해도·Day 통계), 일시정지·정산 |

주문별 부품 요구 레벨은 `meta-progress.ts`의 `ORDER_METAS[].partLevels`가 단일 출처입니다. 이전 게임 화면이 쓰는 `merge-prototype.ts`의 `ORDERS`도 여기서 만듭니다.

## 3. 작업대 규칙과 수치

| 규칙 | 값 |
|---|---|
| 보드 | 6×7 = 42칸 |
| 부품 레벨 | Lv.1~4, 같은 종류·같은 레벨 2개 → 한 단계 위 |
| 입고 순서 | 보드 가운데(2.5열, 3행)에서 가까운 칸부터, 같은 고리는 12시부터 시계 방향 |
| 입고 확률 | Lv.1 80% · Lv.2 20%, 70%는 아직 장착하지 않은 부품, 미장착 부품이 4번 연속 안 나오면 다음에 보장 |
| 장착 | 요구 레벨 이상이 되면 즉시 장착, 여러 개면 가장 낮은 레벨부터 |
| 연쇄 보너스 | 상자를 열지 않고 이어 합성: 3연쇄 무료 상자, 5연쇄 필수 부품 확정 |
| 반품 | 두 번 눌러 확인, 체력은 돌려주지 않음 |
| 되돌리기 | 직전 합성·반품 1회. 상자를 열거나 **납품이 확정된 행동은 되돌릴 수 없음** |
| 시작 보드 | 첫 주문(어반 로드)을 지급 부품만으로 마칠 수 있는 구성. 기존 플레이어는 이어서 할 주문부터 같은 보드를 받음 |

## 4. 납품과 Day 계약

Lab 메인 적용안 4.2절의 계약을 따릅니다.

1. 납품은 합성·상자 열기 시점에 도메인이 동기적으로 확정하고, 화면은 그 결과를 연출만 합니다.
2. 영업 중(`active`)이 아니면 상자 열기·합성·반품·되돌리기를 받지 않습니다.
3. 납품 1건마다 화면이 `onDelivered`를 정확히 한 번 호출하고, 컨트롤러가 코인·납품 수·이해도·오늘 통계를 한 번에 반영해 저장합니다.
4. 오늘 주문 수를 채우면 `closing`으로 넘어가 입력을 막고, 약 2초 연출 뒤 정산합니다. 그 사이 화면을 떠나면 다음 진입 때 정산합니다.

## 5. 저장

- 키는 기존 `dbg-lab-mvp-release-integration-v1`를 그대로 쓰고 `version: 4`로 올렸습니다. 작업대와 Day 상태가 같은 항목에 있어 납품 1건이 한 번의 저장으로 기록됩니다.
- 이전 저장(v2·v3)은 코인·납품 수·Day 번호·주문 순서·대회 기록·설정을 잇습니다. `autoPlacement`(이전 택배 자동 배치)는 더 이상 쓰지 않습니다.
- 복구 규칙: 영업 중이던 Day는 일시정지로, 정산까지 끝난 Day는 다음 Day 준비로 엽니다(급여 중복 없음). 마감 상태는 다음 진입 때 정산합니다.
- 저장소를 쓸 수 없는 환경에서도 메모리 진행으로 플레이를 이어갑니다.

## 6. 남은 결정과 후속 작업

- #77에서 확정할 수치: 하루 주문 수(현재 3, `DAY_ORDER_TARGET`), 체력 최대·소모·회복(현재 30/1/10분), 레이스 참가비·상금.
- 보상형 광고 체력 충전(#73)은 체력이 바닥난 순간을 연결 지점으로 둡니다.
- 기획 문서 `docs/game-design/MERGE_GAME_SYSTEM_DESIGN.md`의 5~8절(택배 주문·모양 부품·제한 시간)은 이번 변경 전 기준이라 기획 쪽 갱신이 필요합니다.
- 이전 게임 화면(`game-screen-mobile.ts`, `merge-prototype.ts`, `auto-placement.ts`, `part-selection.ts`)은 컨트롤러에서 더 이상 쓰지 않습니다. 채택이 확정되면 정리합니다.
