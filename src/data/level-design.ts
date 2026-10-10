// 레벨 디자인 데이터 — 영업일 주문표 (정적 밸런스 데이터 · Phaser 비의존)
// 설계 문서: docs/game-design/LEVEL_DESIGN.md · 규칙: src/domain/progression.ts · 검증: tests/level-design.test.ts, tests/level-design-flow.test.ts
// 주문은 순차·강제이므로 "영업 d일차의 주문 3건"을 정한 이 표가 곧 레벨 디자인입니다. 수치는 2026-10-10 설계 초안(기획 확정 전)입니다.
//
// 구조
// - ORDER_DEFINITIONS: 주문 정의 47종(도감 일반 자전거 20대 × 1~3 변형). 보상 티어: 입문 1,000 · 입문 변형(Lv.3 포함) 1,200 · 중급 1,400/1,500 · 고급 1,800 · 고급 Lv.4 2,000
// - DAY_PLANS: 영업 1~30일차 주문표. 1일차 슬롯 0은 시작 보드·첫 플레이 안내와 결합된 어반 로드(2/2/1/1) 고정
// - REPEAT_FROM_DAY: 21일차부터 마지막 영업일까지를 설계가 끝난 뒤 반복(튜토리얼성 입문 주문 없음)
// - CHAPTERS: 5일 단위 챕터와 직급 이름(화면 변경 없이 구간 이름으로만 사용)
// - CRAFT_COST_MULTIPLIER_BY_GRADE: Garage 제작 비용 등급 배수 · DREAM_BIKE_UNLOCKS: 드림 등급 3대 해금 규칙
import type { Chapter, CraftCostMultipliers, DayPlan, DreamBikeUnlockRule, LevelDesign, OrderDefinition } from '../domain/progression';

export const ORDER_DEFINITIONS: readonly OrderDefinition[] = [
  // ── 입문 ──
  { id: 'urban-road-1', bikeId: 'urban-road', name: '통학용 어반 로드', category: 'city', grade: '입문', levels: { frame: 2, wheel: 2, drivetrain: 1, handlebar: 1 }, reward: 1000, note: '작업량 6. Day 1 슬롯 0 고정(변경 불가). 시작 보드 지급 부품만으로 합성→자동 장착→납품을 배운다. 이후 Day 10 단골 재주문' },
  { id: 'urban-road-2', bikeId: 'urban-road', name: '출근용 어반 로드', category: 'city', grade: '입문', levels: { frame: 1, wheel: 2, drivetrain: 1, handlebar: 2 }, reward: 1000, note: '작업량 6. Day 1 마지막 슬롯. 핸들바 Lv.2로 부품마다 요구가 다름을 보여 주고 이월 부품으로 첫 도감 등록을 만든다' },
  { id: 'touring-road-1', bikeId: 'touring-road', name: '주말 라이딩용 투어링 로드', category: 'road', grade: '입문', levels: { frame: 2, wheel: 1, drivetrain: 2, handlebar: 1 }, reward: 1000, note: '작업량 6. 로드(road 렌더) 첫 등장(Day 2 마감). 구동계 Lv.2. 대회일(Day 15·20) 쉬운 마감 단골' },
  { id: 'touring-road-2', bikeId: 'touring-road', name: '국토종주 준비용 투어링 로드', category: 'road', grade: '입문', levels: { frame: 2, wheel: 2, drivetrain: 2, handlebar: 1 }, reward: 1000, note: '작업량 7. Lv.2 3종 — 합성 3회로 연쇄 보너스를 자연스럽게 경험(Day 3 등록)' },
  { id: 'hardtail-mtb-1', bikeId: 'hardtail-mtb', name: '뒷산 입문용 하드테일 MTB', category: 'mtb', grade: '입문', levels: { frame: 2, wheel: 2, drivetrain: 1, handlebar: 1 }, reward: 1000, note: '작업량 6. MTB 카테고리 첫 등장(Day 2). 어반 로드와 같은 요구라 Day 1 이월 부품 재활용을 배운다' },
  { id: 'hardtail-mtb-2', bikeId: 'hardtail-mtb', name: '동호회 신입용 하드테일 MTB', category: 'mtb', grade: '입문', levels: { frame: 2, wheel: 1, drivetrain: 1, handlebar: 2 }, reward: 1000, note: '작업량 6. 쉬운 마감용(Day 3 등록). 이후 Day 10·19 단골 재주문 필러' },
  { id: 'allroad-gravel-1', bikeId: 'allroad-gravel', name: '출퇴근 겸용 올로드 그래블', category: 'gravel', grade: '입문', levels: { frame: 1, wheel: 2, drivetrain: 2, handlebar: 1 }, reward: 1000, note: '작업량 6. 그래블 카테고리 첫 등장(Day 3). 프레임 Lv.1로 충분한 주문' },
  { id: 'allroad-gravel-2', bikeId: 'allroad-gravel', name: '한강 라이딩용 올로드 그래블', category: 'gravel', grade: '입문', levels: { frame: 2, wheel: 2, drivetrain: 2, handlebar: 1 }, reward: 1000, note: '작업량 7. Lv.2 3종(Day 4 등록)' },
  { id: 'singlespeed-gravel-1', bikeId: 'singlespeed-gravel', name: '카페 투어용 싱글스피드 그래블', category: 'gravel', grade: '입문', levels: { frame: 2, wheel: 2, drivetrain: 1, handlebar: 1 }, reward: 1000, note: '작업량 6. 싱글스피드 = 구동계 Lv.1(맥락 일치). 첫 대회날·Ch3~4 쉬운 마감용' },
  { id: 'singlespeed-gravel-2', bikeId: 'singlespeed-gravel', name: '자취생 첫 자전거 싱글스피드 그래블', category: 'gravel', grade: '입문', levels: { frame: 2, wheel: 2, drivetrain: 1, handlebar: 2 }, reward: 1000, note: '작업량 7. Lv.2 3종(Day 6 등록)' },
  { id: 'city-mini-1', bikeId: 'city-mini', name: '장보기용 시티 미니벨로', category: 'minivelo', grade: '입문', levels: { frame: 1, wheel: 2, drivetrain: 1, handlebar: 2 }, reward: 1000, note: '작업량 6. 미니벨로 카테고리 첫 등장(Day 4, 쉬운 마지막 슬롯)' },
  { id: 'city-mini-2', bikeId: 'city-mini', name: '골목 산책용 시티 미니벨로', category: 'minivelo', grade: '입문', levels: { frame: 2, wheel: 2, drivetrain: 1, handlebar: 2 }, reward: 1000, note: '작업량 7. Lv.2 3종(Day 5 등록)' },
  { id: 'folding-mini-1', bikeId: 'folding-mini', name: '지하철 환승용 폴딩 미니벨로', category: 'minivelo', grade: '입문', levels: { frame: 2, wheel: 1, drivetrain: 1, handlebar: 2 }, reward: 1000, note: '작업량 6. 첫 대회날 마감용. 이후 Day 13·20 쉬운 마감 단골' },
  { id: 'folding-mini-2', bikeId: 'folding-mini', name: '캠핑카 적재용 폴딩 미니벨로', category: 'minivelo', grade: '입문', levels: { frame: 2, wheel: 1, drivetrain: 2, handlebar: 2 }, reward: 1000, note: '작업량 7. 접이식 소형 휠 맥락으로 휠 Lv.1. Day 6 등록 → 입문 7대 완성' },
  { id: 'urban-road-3', bikeId: 'urban-road', name: '서류 배달용 어반 로드', category: 'city', grade: '입문', levels: { frame: 3, wheel: 2, drivetrain: 1, handlebar: 1 }, reward: 1200, note: '작업량 8. 입문 변형 \'단골 손님\'(Lv.3 포함). Day 15 첫 등장, 반복 구간 마감 슬롯(Day 22·30)' },
  { id: 'touring-road-3', bikeId: 'touring-road', name: '국토 종주 완주 기념 투어링 로드', category: 'road', grade: '입문', levels: { frame: 1, wheel: 3, drivetrain: 2, handlebar: 1 }, reward: 1200, note: '작업량 8. 입문 변형(휠 Lv.3). 반복 구간 마감 슬롯(Day 27)' },
  { id: 'hardtail-mtb-3', bikeId: 'hardtail-mtb', name: '트레일 파크 연습용 하드테일 MTB', category: 'mtb', grade: '입문', levels: { frame: 2, wheel: 3, drivetrain: 1, handlebar: 1 }, reward: 1200, note: '작업량 8. 입문 변형(휠 Lv.3). Day 16 첫 등장, 반복 구간 Day 21·29' },
  { id: 'allroad-gravel-3', bikeId: 'allroad-gravel', name: '장마철 통근용 올로드 그래블', category: 'gravel', grade: '입문', levels: { frame: 1, wheel: 2, drivetrain: 3, handlebar: 1 }, reward: 1200, note: '작업량 8. 입문 변형(구동계 Lv.3). 반복 구간 대회일 마감(Day 25)' },
  { id: 'singlespeed-gravel-3', bikeId: 'singlespeed-gravel', name: '메신저 배달용 싱글스피드 그래블', category: 'gravel', grade: '입문', levels: { frame: 3, wheel: 1, drivetrain: 1, handlebar: 2 }, reward: 1200, note: '작업량 8. 입문 변형(프레임 Lv.3). 반복 구간 바쁜 날 마감(Day 26)' },
  { id: 'city-mini-3', bikeId: 'city-mini', name: '시장 상인용 시티 미니벨로', category: 'minivelo', grade: '입문', levels: { frame: 1, wheel: 3, drivetrain: 1, handlebar: 2 }, reward: 1200, note: '작업량 8. 입문 변형(휠 Lv.3). 반복 구간 Day 23·28' },
  { id: 'folding-mini-3', bikeId: 'folding-mini', name: '차박 캠핑용 폴딩 미니벨로', category: 'minivelo', grade: '입문', levels: { frame: 1, wheel: 1, drivetrain: 3, handlebar: 2 }, reward: 1200, note: '작업량 8. 입문 변형(구동계 Lv.3). 반복 구간 대회 전날 마감(Day 24)' },
  // ── 중급 ──
  { id: 'trail-mtb-1', bikeId: 'trail-mtb', name: '주말 트레일용 트레일 MTB', category: 'mtb', grade: '중급', levels: { frame: 3, wheel: 2, drivetrain: 2, handlebar: 1 }, reward: 1400, note: '작업량 9. 현행 ORDER_METAS 순번 1(3/2/2/1·1,400) 그대로 유지. Day 1 슬롯 1에서 상자·체력·Lv.3을 처음 경험' },
  { id: 'trail-mtb-2', bikeId: 'trail-mtb', name: '산악 동호회용 트레일 MTB', category: 'mtb', grade: '중급', levels: { frame: 3, wheel: 2, drivetrain: 1, handlebar: 1 }, reward: 1400, note: '작업량 8. Day 2 등록(첫 중급 등록, 제작 1,500 목표). 이후 Day 9·21·25·29 중급 마감 단골' },
  { id: 'xc-mtb-1', bikeId: 'xc-mtb', name: '동네 대회 출전용 크로스컨트리 MTB', category: 'mtb', grade: '중급', levels: { frame: 3, wheel: 2, drivetrain: 1, handlebar: 2 }, reward: 1400, note: '작업량 9. 중급 MTB 두 번째 종류(Day 6). Day 18·29 중급 서브' },
  { id: 'xc-mtb-2', bikeId: 'xc-mtb', name: '학생 선수용 크로스컨트리 MTB', category: 'mtb', grade: '중급', levels: { frame: 3, wheel: 3, drivetrain: 1, handlebar: 1 }, reward: 1500, note: '작업량 10. 게임 첫 Lv.3 2종 동시 요구(Day 8 → XC 등록). 나머지는 Lv.1로 보드 압박 최소화' },
  { id: 'fat-bike-1', bikeId: 'fat-bike', name: '겨울 눈길용 팻바이크', category: 'mtb', grade: '중급', levels: { frame: 2, wheel: 3, drivetrain: 1, handlebar: 1 }, reward: 1400, note: '작업량 8. 카탈로그 힌트 \'겨울 주문\'. 휠 Lv.3 마감 주문(Day 8 첫 등장, Day 13·23·28)' },
  { id: 'fat-bike-2', bikeId: 'fat-bike', name: '해변 라이딩용 팻바이크', category: 'mtb', grade: '중급', levels: { frame: 2, wheel: 3, drivetrain: 2, handlebar: 2 }, reward: 1500, note: '작업량 10. 현행 순번 2(2/3/2/2)와 같은 형태(Day 11 등록)' },
  { id: 'classic-randonneur-1', bikeId: 'classic-randonneur', name: '브레베 완주용 클래식 랜도너', category: 'road', grade: '중급', levels: { frame: 2, wheel: 3, drivetrain: 2, handlebar: 1 }, reward: 1400, note: '작업량 9. 중급 로드 첫 등장(Day 4, 대회 전날), 휠 Lv.3 첫 요구. 반복 구간 대회일 메인(Day 25)' },
  { id: 'classic-randonneur-2', bikeId: 'classic-randonneur', name: '빵집 사장님 배달용 클래식 랜도너', category: 'road', grade: '중급', levels: { frame: 2, wheel: 3, drivetrain: 1, handlebar: 1 }, reward: 1400, note: '작업량 8. 마감 주문(Day 7 등록, Day 19·24)' },
  { id: 'gravel-explorer-1', bikeId: 'gravel-explorer', name: '비포장 탐험용 그래블 익스플로러', category: 'gravel', grade: '중급', levels: { frame: 3, wheel: 2, drivetrain: 2, handlebar: 1 }, reward: 1400, note: '작업량 9. 중급 그래블 첫 등장(Day 7). 반복 구간 대회일 메인(Day 30)' },
  { id: 'gravel-explorer-2', bikeId: 'gravel-explorer', name: '제주 일주용 그래블 익스플로러', category: 'gravel', grade: '중급', levels: { frame: 3, wheel: 1, drivetrain: 3, handlebar: 1 }, reward: 1500, note: '작업량 10. 프레임+구동계 Lv.3 동시 요구. 반복 구간 중급 메인(Day 22)' },
  { id: 'gravel-explorer-3', bikeId: 'gravel-explorer', name: '주말 농장 출퇴근용 그래블 익스플로러', category: 'gravel', grade: '중급', levels: { frame: 1, wheel: 3, drivetrain: 2, handlebar: 1 }, reward: 1400, note: '작업량 8. 마감 주문(Day 9 등록, 대회 전날)' },
  { id: 'bikepacking-gravel-1', bikeId: 'bikepacking-gravel', name: '1박 2일 백패킹용 그래블', category: 'gravel', grade: '중급', levels: { frame: 2, wheel: 2, drivetrain: 2, handlebar: 2 }, reward: 1400, note: '작업량 8. 4종 Lv.2 — 연쇄 보너스용 마감 주문(Day 7 첫 등장, Day 22·27). 카탈로그 힌트 \'연속 주문\'은 Day 7 → Day 10 2차 납품 흐름으로 표현' },
  { id: 'bikepacking-gravel-2', bikeId: 'bikepacking-gravel', name: '장기 여행용 백패킹 그래블', category: 'gravel', grade: '중급', levels: { frame: 3, wheel: 2, drivetrain: 2, handlebar: 2 }, reward: 1500, note: '작업량 10. 2차 대회날 메인(Day 10 등록, 12대)' },
  { id: 'cargo-mini-1', bikeId: 'cargo-mini', name: '배달용 카고 미니벨로', category: 'minivelo', grade: '중급', levels: { frame: 3, wheel: 2, drivetrain: 1, handlebar: 2 }, reward: 1400, note: '작업량 9. 카탈로그 힌트 \'배달 주문\'. 중급 미니벨로 첫 등장(Day 9), 같은 배달업체가 Day 14에 재주문해 같은 정의로 등록' },
  { id: 'classic-mini-1', bikeId: 'classic-mini', name: '빈티지 애호가용 클래식 미니벨로', category: 'minivelo', grade: '중급', levels: { frame: 2, wheel: 2, drivetrain: 2, handlebar: 2 }, reward: 1400, note: '작업량 8. 마감 주문(Day 8 첫 등장, Day 17·26·30)' },
  { id: 'classic-mini-2', bikeId: 'classic-mini', name: '카페 사장님용 클래식 미니벨로', category: 'minivelo', grade: '중급', levels: { frame: 2, wheel: 3, drivetrain: 2, handlebar: 2 }, reward: 1500, note: '작업량 10. 휠 Lv.3 + Lv.2 3종(Day 12 등록, 반복 구간 Day 24 메인)' },
  // ── 고급 ──
  { id: 'aero-sprinter-1', bikeId: 'aero-sprinter', name: '동호회 스프린터용 에어로 스프린터', category: 'road', grade: '고급', levels: { frame: 2, wheel: 3, drivetrain: 2, handlebar: 2 }, reward: 1800, note: '작업량 10. 고급 등급 첫 등장(Day 11). 형태는 현행 순번 2 \'엔듀런스 로드\'와 같아 등급(보상)만 새롭다' },
  { id: 'aero-sprinter-2', bikeId: 'aero-sprinter', name: '크리테리움 출전용 에어로 스프린터', category: 'road', grade: '고급', levels: { frame: 2, wheel: 4, drivetrain: 1, handlebar: 1 }, reward: 2000, note: '작업량 12. 휠 Lv.4(딥림 휠). 두 번째로 만나는 Lv.4(Day 16 등록 → 로드 4대 완성). 반복 구간 바쁜 날 메인(Day 26)' },
  { id: 'enduro-mtb-1', bikeId: 'enduro-mtb', name: '바이크파크 시즌권용 엔듀로 MTB', category: 'mtb', grade: '고급', levels: { frame: 3, wheel: 2, drivetrain: 2, handlebar: 2 }, reward: 1800, note: '작업량 10. 3차 대회날 메인(Day 15). 반복 구간 고급 메인(Day 23)' },
  { id: 'enduro-mtb-2', bikeId: 'enduro-mtb', name: '엔듀로 대회 출전용 엔듀로 MTB', category: 'mtb', grade: '고급', levels: { frame: 3, wheel: 3, drivetrain: 2, handlebar: 2 }, reward: 1800, note: '작업량 12. Lv.3 2종 + Lv.2 2종, Lv.4 없는 12(Day 17 등록)' },
  { id: 'downhill-mtb-1', bikeId: 'downhill-mtb', name: '다운힐 코스 입문용 다운힐 MTB', category: 'mtb', grade: '고급', levels: { frame: 4, wheel: 2, drivetrain: 1, handlebar: 1 }, reward: 2000, note: '작업량 12. 게임 첫 Lv.4(Day 13). 나머지 3종은 가볍게 두어 Lv.4 하나에 집중. 반복 구간 첫날 메인(Day 21)' },
  { id: 'downhill-mtb-2', bikeId: 'downhill-mtb', name: '프로팀 연습용 다운힐 MTB', category: 'mtb', grade: '고급', levels: { frame: 4, wheel: 1, drivetrain: 2, handlebar: 1 }, reward: 2000, note: '작업량 12. 프레임 Lv.4 재도전(Day 18 등록, 의도된 바쁜 날 28)' },
  { id: 'adventure-gravel-1', bikeId: 'adventure-gravel', name: '오지 횡단용 어드벤처 그래블', category: 'gravel', grade: '고급', levels: { frame: 3, wheel: 2, drivetrain: 3, handlebar: 1 }, reward: 1800, note: '작업량 11. 프레임+구동계 Lv.3(Day 14 첫 등장, 반복 구간 Day 28 메인)' },
  { id: 'adventure-gravel-2', bikeId: 'adventure-gravel', name: '대륙 횡단용 어드벤처 그래블', category: 'gravel', grade: '고급', levels: { frame: 3, wheel: 2, drivetrain: 3, handlebar: 2 }, reward: 1800, note: '작업량 12. Lv.4 없는 12 — Day 18·20 사이에 Lv.4가 3일 연속되지 않도록 3/2/3/2로 둠(Day 19 등록 → 그래블 5대 완성)' },
  { id: 'tour-mini-1', bikeId: 'tour-mini', name: '기차 여행용 투어 미니벨로', category: 'minivelo', grade: '고급', levels: { frame: 2, wheel: 2, drivetrain: 3, handlebar: 2 }, reward: 1800, note: '작업량 10. 고급 미니벨로 첫 등장(Day 12), 구동계 Lv.3. 반복 구간 고급 메인(Day 27)' },
  { id: 'tour-mini-2', bikeId: 'tour-mini', name: '세계 일주용 투어 미니벨로', category: 'minivelo', grade: '고급', levels: { frame: 2, wheel: 1, drivetrain: 4, handlebar: 1 }, reward: 2000, note: '작업량 12. 구동계 Lv.4(와이드 기어비). 20대 등록을 마무리하는 Day 20 대회날 메인 → 미니벨로 5대 완성' },
];

export const DAY_PLANS: readonly DayPlan[] = [
  { day: 1, slots: ['urban-road-1', 'trail-mtb-1', 'urban-road-2'], intent: '튜토리얼: 지급 부품만으로 합성·자동 장착·납품 → 상자·체력·Lv.3(트레일 3/2/2/1) → 이월 부품으로 쉬운 마감 + 어반 로드 첫 도감 등록' },
  { day: 2, slots: ['hardtail-mtb-1', 'trail-mtb-2', 'touring-road-1'], intent: 'MTB 카테고리 등장(어반과 같은 2/2/1/1로 이월 재활용). 트레일 2회째 납품 = 첫 중급 등록(제작 1,500 목표). 로드 투어링 첫 등장. 이 날 중간에 누적 체력 30을 넘어 첫 회복 대기를 만난다' },
  { day: 3, slots: ['touring-road-2', 'allroad-gravel-1', 'hardtail-mtb-2'], intent: '가벼운 날(19). 그래블 카테고리 등장. 투어링·하드테일 동시 등록 → 코인 여유로 첫 제작(NEXT GOAL) 유도' },
  { day: 4, slots: ['classic-randonneur-1', 'allroad-gravel-2', 'city-mini-1'], intent: '대회 전날. 중급 로드(랜도너) 공개 = 휠 Lv.3 첫 요구. 올로드 등록. 미니벨로 카테고리를 쉬운 마지막 슬롯으로 공개. 정산에서 참가비 500·대표 자전거 강화 안내' },
  { day: 5, slots: ['city-mini-2', 'singlespeed-gravel-1', 'folding-mini-1'], intent: '첫 대회날(리버사이드 3K). 가벼운 입문 3건(19). 시티 미니벨로 등록, 싱글스피드·폴딩 첫 등장' }, // 대회일
  { day: 6, slots: ['xc-mtb-1', 'folding-mini-2', 'singlespeed-gravel-2'], intent: '견습공 시작. 중급 XC 첫 등장. 싱글스피드·폴딩 등록 → 입문 7대 도감 완성' },
  { day: 7, slots: ['gravel-explorer-1', 'bikepacking-gravel-1', 'classic-randonneur-2'], intent: '중급 그래블(익스플로러) 첫 등장, 백패킹 첫 등장(4종 Lv.2 연쇄 보너스). 랜도너 등록' },
  { day: 8, slots: ['xc-mtb-2', 'fat-bike-1', 'classic-mini-1'], intent: '게임 첫 Lv.3 2종 동시 요구(3/3/1/1) → XC 등록. 팻바이크(겨울 주문)·클래식 미니 첫 등장은 8작업량 마감으로 보드 회복' },
  { day: 9, slots: ['cargo-mini-1', 'gravel-explorer-3', 'trail-mtb-2'], intent: '대회 전날. 배달용 카고 미니벨로 첫 등장, 익스플로러 등록. 중급 마감으로 25 — 참가비·강화 여유' },
  { day: 10, slots: ['bikepacking-gravel-2', 'hardtail-mtb-2', 'urban-road-1'], intent: '2차 대회날. 중급 메인 1건(백패킹 등록, 12대) + 입문 단골 2건으로 가볍게(22)' }, // 대회일
  { day: 11, slots: ['aero-sprinter-1', 'fat-bike-2', 'singlespeed-gravel-1'], intent: '기술자 시작. 고급 등급 첫 등장(에어로 2/3/2/2·1,800, 형태는 익숙). 팻바이크 등록' },
  { day: 12, slots: ['tour-mini-1', 'classic-mini-2', 'city-mini-1'], intent: '고급 미니벨로(투어 미니) 첫 등장, 클래식 미니 등록(14대)' },
  { day: 13, slots: ['downhill-mtb-1', 'fat-bike-1', 'folding-mini-1'], intent: '게임 첫 Lv.4(다운힐 프레임 4/2/1/1·2,000). 나머지 2건은 8·6으로 하루를 26에 묶는다' },
  { day: 14, slots: ['adventure-gravel-1', 'cargo-mini-1', 'hardtail-mtb-1'], intent: '대회 전날. 고급 그래블(어드벤처, 프레임+구동계 Lv.3) 첫 등장. 카고 등록(15대). 강화 안내' },
  { day: 15, slots: ['enduro-mtb-1', 'urban-road-3', 'touring-road-1'], intent: '3차 대회날. 고급 엔듀로 첫 등장(10) + \'단골 손님\' 입문 변형(Lv.3 포함·1,200) 첫 등장 + 쉬운 마감(24)' }, // 대회일
  { day: 16, slots: ['aero-sprinter-2', 'hardtail-mtb-3', 'allroad-gravel-1'], intent: '수석 기술자 시작. 휠 Lv.4(에어로 등록, 16대) — 로드 4대 전부 등록 → 드림 머신 조건 1 충족. 하드테일 변형' },
  { day: 17, slots: ['enduro-mtb-2', 'classic-mini-1', 'singlespeed-gravel-1'], intent: 'Lv.4 없는 12(3/3/2/2) → 엔듀로 등록(17대)' },
  { day: 18, slots: ['downhill-mtb-2', 'xc-mtb-1', 'city-mini-2'], intent: '의도된 바쁜 날(28). 프레임 Lv.4 재도전 → 다운힐 등록(18대). 체력 한 통이 모자라면 회복 후 이어서 마감하는 경험' },
  { day: 19, slots: ['adventure-gravel-2', 'classic-randonneur-2', 'hardtail-mtb-2'], intent: '대회 전날. 어드벤처 등록(19대) = 그래블 5대 전부 → 익스페디션 조건 1 충족. Lv.4 없이 12로 보드 회복' },
  { day: 20, slots: ['tour-mini-2', 'touring-road-1', 'folding-mini-1'], intent: '4차 대회날. 구동계 Lv.4로 투어 미니 등록 → 일반 20대 도감 완성 = 미니벨로 5대 전부 → 드림 미니 조건 1 충족. 마스터 승급' }, // 대회일
  { day: 21, slots: ['downhill-mtb-1', 'trail-mtb-2', 'hardtail-mtb-3'], intent: '마스터(반복 구간 시작). 바쁜 날(28): Lv.4 메인 + 중급 마감 + 단골 변형' },
  { day: 22, slots: ['gravel-explorer-2', 'bikepacking-gravel-1', 'urban-road-3'], intent: '중급 메인(Lv.3 2종) + 8·8 마감(26)' },
  { day: 23, slots: ['enduro-mtb-1', 'fat-bike-1', 'city-mini-3'], intent: '고급 10 메인 + 중급 8 + 단골 변형(26)' },
  { day: 24, slots: ['classic-mini-2', 'classic-randonneur-2', 'folding-mini-3'], intent: '대회 전날(26). 중급 메인 + 마감 2건. 참가비·강화 안내' },
  { day: 25, slots: ['classic-randonneur-1', 'trail-mtb-2', 'allroad-gravel-3'], intent: '5차 대회날. 9·8·8로 가볍게(25)' }, // 대회일
  { day: 26, slots: ['aero-sprinter-2', 'classic-mini-1', 'singlespeed-gravel-3'], intent: '바쁜 날(28): 휠 Lv.4 메인 + 8·8 마감' },
  { day: 27, slots: ['tour-mini-1', 'bikepacking-gravel-1', 'touring-road-3'], intent: '고급 10 메인 + 마감 2건(26)' },
  { day: 28, slots: ['adventure-gravel-1', 'fat-bike-1', 'city-mini-3'], intent: '약간 바쁜 날(27): Lv.3 2종 고급 메인' },
  { day: 29, slots: ['xc-mtb-1', 'trail-mtb-2', 'hardtail-mtb-3'], intent: '대회 전날. 중급 메인 + 마감 2건(25)' },
  { day: 30, slots: ['gravel-explorer-1', 'classic-mini-1', 'urban-road-3'], intent: '6차 대회날. 9·8·8로 가볍게(25). 다음 날부터 Day 21 주문표 반복' }, // 대회일
];

/** 이 영업일부터 마지막 영업일까지가 설계 끝 뒤 무한 반복되는 구간입니다(10일 주기 = 대회 2회). */
export const REPEAT_FROM_DAY = 21;

export const CHAPTERS: readonly Chapter[] = [
  {
    id: 'ch1',
    name: '첫 출근 — 기본기 익히기',
    rankName: '알바생',
    dayFrom: 1,
    dayTo: 5,
    goal: '합성·상자·Lv.3·이월·도감 등록·제작·강화·대회 참가의 한 바퀴를 5일 안에 모두 경험한다. 입문 5대(어반·투어링·하드테일·올로드·시티 미니)와 첫 중급(트레일 MTB)까지 6대를 등록하고, 1일차 정산 뒤 첫 제작, 홈 NEXT GOAL이 참가비·강화를 안내, Day 5 첫 대회. 매일 작업량 19~22(체력 18~20)로 \'한 번 접속 = 하루 영업\' 리듬을 몸에 익힌다',
    teaches: ['맞닿은 같은 부품 2개 합성 → 요구 레벨 이상이면 자동 장착 → 4종 장착 = 납품·급여 (Day 1 슬롯 0, 상자 없이 끝남)', '상자 1개 = 체력 1, 미장착 종류 70% 우선 입고, Lv.3은 두 단계 합성 (Day 1 슬롯 1 트레일 3/2/2/1 — 현행 순번 1 유지)', '남은 부품은 다음 주문으로 이월, 같은 자전거 2회 납품 = 이해도 100% 도감 등록 (Day 1 슬롯 2 어반 로드 1/2/1/2)', '체력 0 → 10분당 1 회복 대기, 반품으로 자리 비우기 (Day 2 중반, 누적 체력 39)', '연쇄 보너스: 상자 없이 합성 3회 = 무료 상자 (Lv.2 3종 주문, Day 3~4)', '코인으로 등록 자전거 부품 제작(보유), 대표 자전거 강화와 참가비 500 (홈 NEXT GOAL 안내, 1일차 첫 납품 직후부터)', 'Day 5마다 자동 레이스(리버사이드 3K)'],
    unlocks: ['카테고리: 로드(city·road, Day 1~2) → MTB(Day 2) → 그래블(Day 3) → 미니벨로(Day 4)', '등급: 입문(1,000), 중급(트레일 Day 1~2 · 랜도너 Day 4, 1,400)', '1차 대회(Day 5)'],
  },
  {
    id: 'ch2',
    name: '중급 손님 받기',
    rankName: '견습공',
    dayFrom: 6,
    dayTo: 10,
    goal: '입문 7대 도감 완성(Day 6)과 중급 4대 추가 등록(랜도너 Day 7 · XC Day 8 · 익스플로러 Day 9 · 백패킹 Day 10)으로 Day 10 대회일에 12대. 하루 작업량 23~26(체력 21~24)이 표준이 되는 구간이며, 대회 전날(Day 9) 25 · 대회일(Day 10) 22로 리듬을 지킨다',
    teaches: ['하루 3건 중 2건이 중급(Lv.3 포함)인 리듬 — 어려운 것 먼저, 8작업량 마감', 'Lv.3 2종 동시 요구(3/3/1/1, Day 8)가 보드를 어떻게 압박하는지 — 입고가 두 종류로 갈려 인접이 깨지므로 반품으로 자리 확보', '휠·구동계 Lv.3처럼 프레임이 아닌 부품이 핵심인 주문(팻바이크·익스플로러 변형)', '대회 전날은 참가비·강화 여유, 대회일은 중급 메인 1건 + 단골 2건으로 가볍게'],
    unlocks: ['중급 8종 전부 등장(XC Day 6, 익스플로러·백패킹 Day 7, 팻바이크·클래식 미니 Day 8, 카고 Day 9)', '2차 대회(Day 10)'],
  },
  {
    id: 'ch3',
    name: '고급 주문과 Lv.4',
    rankName: '기술자',
    dayFrom: 11,
    dayTo: 15,
    goal: '고급 등급(1,800~2,000)과 Lv.4를 하루 하나씩 도입하면서 하루 작업량 ≤26을 지킨다. 팻바이크(Day 11)·클래식 미니(Day 12)·카고(Day 14) 등록으로 Day 15 대회일에 15대. 고급 5종이 모두 한 번씩 첫 등장(이해도 50%)해 다음 챕터의 \'2차 납품 = 등록\' 동기를 만든다',
    teaches: ['고급 등급 = 보상이 큰 손님(Day 11 에어로 2/3/2/2 — 형태는 현행 순번 2와 같아 등급만 새로움)', 'Lv.4 요구(Day 13 다운힐 4/2/1/1·2,000): Lv.3 2개를 인접하게 만들어야 하므로 합성 위치를 미리 계획. 나머지 3종은 Lv.1~2로 가볍게', '프레임+구동계 Lv.3 동시 요구(Day 14 어드벤처 3/2/3/1)', '입문 변형 \'단골 손님\'(Day 15 서류 배달용 어반 로드 3/2/1/1·1,200): 같은 자전거라도 손님에 따라 요구·보상이 다르다'],
    unlocks: ['고급 등급: 에어로(Day 11) · 투어 미니(Day 12) · 다운힐(Day 13) · 어드벤처(Day 14) · 엔듀로(Day 15)', 'Lv.4 요구와 2,000 보상(Day 13)', '입문 변형 1,200 티어(Day 15)', '3차 대회(Day 15) — 출시 후 등급 리그 1차전 자리'],
  },
  {
    id: 'ch4',
    name: '도감 완성 주간',
    rankName: '수석 기술자',
    dayFrom: 16,
    dayTo: 20,
    goal: '고급 5대 2차 납품으로 Day 20 대회일에 일반 20대 도감 완성. 매일 12작업량 메인 1건 + 쉬운 2건. 로드(Day 16 에어로)·그래블(Day 19 어드벤처)·미니벨로(Day 20 투어 미니) 카테고리가 차례로 완성되어 드림 3대의 등록 조건 1이 열린다',
    teaches: ['Lv.4가 휠(Day 16)·프레임(Day 18)·구동계(Day 20) 어느 부품에나 올 수 있음', 'Lv.4 없는 12작업량(3/3/2/2 Day 17, 3/2/3/2 Day 19) — Lv.4 연속을 피해 보드를 회복시키는 날', '의도된 바쁜 날(Day 18, 작업량 28)에서 체력 한 통이 모자라면 회복 후 이어서 마감', '카테고리 전부 등록 + 그 카테고리 보유 자전거 드림 단계 = 드림 자전거 등록(화면 안내 미구현 · 열린 결정 11)'],
    unlocks: ['일반 20대 전부 도감 등록(Day 20)', '드림 머신(Day 16~) · 익스페디션 그래블(Day 19~) · 드림 미니벨로(Day 20~) 등록 조건 1 충족', '4차 대회(Day 20)', '마스터 승급(챕터 이름 · 화면 표시 미구현)'],
  },
  {
    id: 'ch5',
    name: '마스터의 공방 (반복 구간)',
    rankName: '마스터',
    dayFrom: 21,
    dayTo: 30,
    goal: '입문 Lv.2 이하 주문 없이 고급·중급·입문 변형(단골)으로 짜인 10일 주기(대회 2회 포함)를 무한 반복한다. 하루 수입 4,000~4,600(평균 4,260)으로 Ch3~4(평균 4,220)보다 높고, 바쁜 날 28(Day 21·26)·약간 바쁜 날 27(Day 28)·대회일 25로 리듬이 유지된다. 코인은 드림 3대 제작(각 4,000)·풀강(각 6,300)과 컬렉션 강화로 흐른다',
    teaches: ['새 규칙 없음. Lv.4(2일) · Lv.3 2종 메인 · 고급 10~11 메인 · 대회(2일)의 리듬 반복', '드림 3대 해금·풀강이 NEXT GOAL의 중심이 된다'],
    unlocks: ['드림 등급 3대(규칙 충족 시, 구간 무관)', '5·6차 대회(Day 25·30) 이후 5일마다 반복', '(출시 후) 등급 리그·시즌 주문을 끼워 넣을 접점 — Day 31 = Day 21 패턴'],
  },
];

/** 의도된 바쁜 날(작업량 27~28, 체력 약 25~26). Lv.4 또는 고급 Lv.3 2종 메인이 있는 날이며, 마감 슬롯은 작업량 8 이하로 둡니다. */
export const HEAVY_DAYS: readonly number[] = [18, 21, 26, 28];
/** 보통 날의 작업량 상한(0.93 × 26 ≈ 24 체력, 체력 한 통 30에 여유 6). 넘는 날은 HEAVY_DAYS로 선언해야 검증을 통과합니다. */
export const MAX_DAY_WORK_UNITS = 26;

/**
 * Garage 제작 비용 등급 배수. 부품 기본 비용(프레임 400 · 휠셋 300 · 구동계 200 · 핸들바 100 = 1,000)에 곱합니다.
 * 입문 1,000 · 중급 1,500 · 고급 2,000 · 드림 4,000(드림 해금 시점의 하루 급여 ≈ 4,200과 같은 무게).
 */
export const CRAFT_COST_MULTIPLIER_BY_GRADE: CraftCostMultipliers = { 입문: 1, 중급: 1.5, 고급: 2, 드림: 4 };

/**
 * 코인 적체 방지 안내 기준. 홈 NEXT GOAL은 제작 → 대표 자전거 드림 단계 강화 → 다음 자전거 납품 순으로 안내하는데,
 * 코인이 이 값 이상 쌓이면 납품 안내보다 보유 자전거 강화를 먼저 권합니다(하루 수입 약 4,000의 1.25일치).
 * 흐름 시뮬레이션(tests/level-design-flow.test.ts)에서 안내만 따르는 플레이어의 잔고가 이 값 근처에 머뭅니다.
 */
export const UPGRADE_HINT_COIN_THRESHOLD = 5000;

/**
 * 드림 등급 3대 해금(카테고리 마스터 보상): 그 카테고리의 일반 자전거가 모두 도감 등록되어 있고,
 * 같은 카테고리의 보유 자전거 1대가 강화로 드림 단계(스탯 합 10)에 닿으면 이해도 100%로 도감 등록됩니다.
 * 두 조건을 모두 두는 이유: 시작 보유 드림 로드가 로드라서 단계 조건만 두면 드림 머신이 4~6일차에 열려 희소성이 사라집니다.
 * MTB에는 드림 자전거가 없어 규칙 대상이 아닙니다(열린 결정).
 */
export const DREAM_BIKE_UNLOCKS: readonly DreamBikeUnlockRule[] = [
  { bikeId: 'dream-machine', category: '로드', requiredStage: 3, requireCategoryRegistered: true },
  { bikeId: 'expedition-gravel', category: '그래블', requiredStage: 3, requireCategoryRegistered: true },
  { bikeId: 'dream-mini', category: '미니벨로', requiredStage: 3, requireCategoryRegistered: true },
];

export const LEVEL_DESIGN: LevelDesign = {
  orders: ORDER_DEFINITIONS,
  days: DAY_PLANS,
  repeatFromDay: REPEAT_FROM_DAY,
  chapters: CHAPTERS,
};
