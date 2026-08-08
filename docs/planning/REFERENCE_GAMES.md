# 레퍼런스 게임 분석과 MVP 적용 제안

> 문서 상태: 검토용 (설계·개발자 작성)  
> 작성일: 2026-08-08  
> 목적: 주문 기반 머지-2 장르의 검증된 설계를 벤치마크해 [MVP 개발 계획](../development/MVP_DEV_PLAN.md)의 근거로 사용  
> 기획 확정: 이 문서의 제안은 확정안이 아니며, 관련 이슈와 목요일 회의([2026년 11월 출시 계획](../development/RELEASE_PLAN_2026_11.md)의 M0·M1 게이트)에서 결정합니다.

## 1. 벤치마크 대상

| 게임 | 개발사 | 우리가 참고할 것 |
|---|---|---|
| **Travel Town** | Magmatic Games | 주문 기반 머지-2의 기준작. 상시 노출 주문 카드(코인 주문 3 + 특수 주문 1), 탭 생성기와 쿨다운·충전식 변형, 납품 보상 리듬 |
| **Love & Pies** | Trailmix | 9×7(63칸) 보드를 잠금 칸 해제로 넓혀가는 온보딩, 생성기 6종·아이템 체인 9종 규모, 주문 슬롯 5개, 짧은 세션 다회 유도 설계 |
| **Merge Mansion** | Metacore | 깊은 아이템 체인 구조, 생성기 자체도 머지 대상인 중첩 설계, 과제(태스크) 기반 메타 진행 |
| **Gossip Harbor** | Microfun | 주문(요리) 기반 머지-2 + 스토리 메타의 결합 방식 |
| **EverMerge** | Big Fish | 에너지·타이머·자원이 진행을 다중으로 게이트하는 구조 (MVP에서 피할 것의 반면교사) |

### 보조 레퍼런스 (소재·연출)

| 게임 | 참고할 것 |
|---|---|
| **Bike Mechanic Simulator 2023** (PC) | 주문 기반 자전거 조립·수리의 부품 구성과 작업 흐름. 수십 개 부품을 프레임·휠·구동계 단위로 다루는 감각 |
| **Assemble with Care** (ustwo) | 부품을 하나씩 장착할 때의 조립 만족감 연출 |

### 시장 관찰

- 머지 장르의 주류는 **머지-2(2-to-1) + 고객 주문 + 메타 진행** 조합으로 수렴했습니다.
- 자전거를 소재로 한 주문형 머지 게임은 확인되지 않았습니다. 소재 차별화 여지가 있습니다.
- 자전거 조립 게임은 PC 시뮬레이터 장르에만 존재합니다. 캐주얼 모바일로 옮긴 사례가 없습니다.

## 2. 시스템별 벤치마크와 MVP 적용 제안

| 시스템 | 레퍼런스 관찰 | 현재 설계·구현 | MVP 적용 제안 | 검증 위치 |
|---|---|---|---|---|
| 주문 | Travel Town은 주문 4건 상시 노출, Love & Pies는 슬롯 5개. 주문 카드에 아이템 이미지·보상이 항상 보임 | 설계서: 한 번에 1건, 주문 카드에 이미지·부품·레벨·시간·보상 표시 | **1건 집중 유지** (앱인토스 짧은 세션에 적합). 주문 카드의 상시 노출·진행률 표시는 레퍼런스 수준으로 구현 | Lab 머지 코어 B/C (완료), 메인 S4 스프린트 |
| 부품 수급 (생성기) | 장르 표준은 탭 생성기 + 쿨다운 + 에너지. 충전식(N회 탭)·무에너지(쿨다운만) 변형 존재 | 설계서 5장: 카테고리 선택형 온라인 주문 + 택배 상자 개봉. 현행 구현: 버튼 1개로 즉시 순환 생성 | 카테고리 선택(운 실패감 제거)은 유지하되, **생성 템포·연출을 A/B/C로 비교** 후 결정 | Lab 신규 트랙 (부품 수급) |
| 보드 | Love & Pies는 9×7=63칸 중 대부분 잠금 상태로 시작, 머지로 해제하며 온보딩과 성장감을 겸함 | 설계서 6×7=42칸 vs 현행 구현 7×9=63칸 (8/13 결정 예정) | **7×9 격자 + 잠금 칸 시작(6×7 상당)** 절충안 검토. 온보딩·보드 확장 성장·두 안 통합을 동시에 해결 | Lab 머지 코어 검증 이슈 (신규) |
| 머지 규칙 | 머지-2(2-to-1)가 장르 표준. 3-to-1은 하드코어 수집형에서만 부분 사용 | 2-to-1 확정. 구 기획의 3-to-1 하이브리드는 미사용 | 2-to-1 유지 (레퍼런스가 뒷받침) | 확정 유지 |
| 타이머·보상 | 장르 표준은 **주문 무타이머** (이벤트만 제한 시간). 시간 압박 대신 에너지로 페이스 조절 | 설계서 §7~8: 소프트 타이머 + 시간 vs 품질 보너스 선택이 핵심 게임성 | 소프트 타이머는 **차별화 요소로 유지**하되 실패 없음 원칙 준수. 레퍼런스와 다른 지점이므로 별도 프로토타입 검증 필수 | Lab 보상·성장 Prototype C (신규) |
| 수집·메타 | Love & Pies 리모델링, Merge Mansion 저택 과제 등 메타 진행이 리텐션의 핵심 | 컬렉션(도감·차고·드림 바이크 성장)이 메타 역할 | 컬렉션 3안 비교 완료 상태 유지. 스토리 메타는 MVP 제외 | Lab 수집 A/B/C (완료) |
| 세션 설계 | Love & Pies는 생성기 쿨다운으로 하루 다회 짧은 세션 유도 | 주문 1건 = 2~3분 = 1세션 | **에너지 없이 주문 단위 세션 유지**. 앱인토스 짧은 세션 특성과 부합 | 메인 S7 스프린트에서 확인 |
| 저장 | 장르 표준은 서버 저장이나 MVP는 로컬 저장으로 충분 | localStorage 예정 | 로컬 저장 + WebView 복구 검증 | Lab 플랫폼 #3, #5 |

## 3. MVP에 도입하지 않는 것 (레퍼런스에 있어도)

| 요소 | 도입하지 않는 이유 |
|---|---|
| 에너지 시스템 | 과금·리텐션 장치이며 MVP 검증 목표(핵심 루프 재미)와 무관. 짧은 세션은 주문 단위로 이미 달성 |
| 보상형 광고·IAP | 출시 계획 제외 범위 |
| 복수 주문 동시 처리 | 출시 계획 제외 범위. 1건 집중이 조립 몰입에 유리 |
| 3-to-1 머지 | 장르 표준(2-to-1)과 어긋나고 재료 요구량이 급증 |
| 스토리 대화 메타 | 제작 비용 대비 MVP 검증 기여 낮음. 컬렉션이 메타 역할 수행 |
| 서버 저장·계정 | 출시 계획 제외 범위 (게스트 + 로컬 우선) |

## 4. 출시 일정과의 연결

[2026년 11월 출시 계획](../development/RELEASE_PLAN_2026_11.md)의 스프린트 경계와 게이트를 변경하지 않습니다. 이 문서는 다음 시점에 입력을 제공합니다.

- **8/13 회의 (M0)**: 문서 불일치 4건 중 **보드 크기** 결정에 잠금 칸 절충안(7×9 격자 + 잠금 시작)을 레퍼런스 근거와 함께 안건으로 올립니다.
- **S1~S2 (8/13~8/26) Lab 검증**: 신규 실험(부품 수급 A/B/C, 보드 잠금 칸 검증, 보상 Prototype C)을 기획 동결(8/27, M1) 전에 비교 완료합니다.
- **8/20·8/27 회의**: 부품 수급 방식(시스템 설계서 14절 "주문용 에너지·코인 소비 방식" 포함), 소프트 타이머·품질 보너스 채택 여부를 결정합니다.
- **S4~S7 (9월)**: 채택안을 [MVP 개발 계획](../development/MVP_DEV_PLAN.md)의 스프린트 작업으로 구현합니다.

## 5. 관련 이슈

- 메인 [#41](https://github.com/aigemro/dream-bike-garage/issues/41): [설계] 레퍼런스 벤치마크 기준과 MVP 개발 계획 확정
- 메인 [#40](https://github.com/aigemro/dream-bike-garage/issues/40): [기획] 8월 기획 확정 항목 추적
- 메인 [#42](https://github.com/aigemro/dream-bike-garage/issues/42): [적용] Lab 부품 수급 방식 결과 선택 및 최종 게임 적용
- 메인 [#43](https://github.com/aigemro/dream-bike-garage/issues/43)~[#46](https://github.com/aigemro/dream-bike-garage/issues/46): [적용] S4~S7 스프린트
- Lab [#70](https://github.com/aigemro/dream-bike-garage-lab/issues/70): Parts Supply 비교 실험 트랙 (A [#71](https://github.com/aigemro/dream-bike-garage-lab/issues/71) / B [#72](https://github.com/aigemro/dream-bike-garage-lab/issues/72) / C [#73](https://github.com/aigemro/dream-bike-garage-lab/issues/73))
- Lab [#74](https://github.com/aigemro/dream-bike-garage-lab/issues/74): 보드 크기·잠금 칸 온보딩 비교 검증
- Lab [#75](https://github.com/aigemro/dream-bike-garage-lab/issues/75): 보상·성장 Prototype C (소프트 타이머·시간 vs 품질)

## 출처

- [Travel Town Deconstruction: Merge-2 Whales — Gamigion](https://www.gamigion.com/travel-town-deconstruction-merge-2-whales/)
- [Deconstructing Travel Town — PocketGamer.biz](https://www.pocketgamer.biz/deconstructing-magmatic-games-travel-town/)
- [Deep Dive: Love & Pies — Naavik](https://naavik.co/deep-dives/deep-dive-love-and-pies-merge2/)
- [How EverMerge Made $50M in 7 Months — Deconstructor of Fun](https://www.deconstructoroffun.com/blog/2020/12/6/how-evermerge-made-50m-in-just-7-months)
- [Merge Games Market — Udonis](https://www.blog.udonis.co/mobile-marketing/mobile-games/merge-games-market)
- [Bike Mechanic Simulator 2023 — Steam](https://store.steampowered.com/app/1636170/Bike_Mechanic_Simulator_2023/)
