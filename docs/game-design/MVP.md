# MVP 범위

## 검증할 핵심 루프

Workshop → 부품 생성 → 같은 부품 Merge → 완성차 제작 → 주문 완료 → Garage 수집

## 포함

- 7×9 Merge Board
- Workshop 1개
- 부품 3종: 프레임, 휠, 구동계
- 부품 생산 순서: 프레임 → 휠 → 구동계 반복
- 동일 종류·동일 티어 아이템 2개 Merge
- T3 부품 3종으로 Entry 완성차 조립
- 완성차 3단계: Entry, Carbon, Flagship
- 1차 브랜드 1개
- 주문 3개
- Garage 20칸
- 새 게임 초기화

## 완료 조건

주문은 Entry → Carbon → Flagship 순서로 진행합니다. 현재 주문과 동일한
티어의 자전거를 납품하면 Garage에 수집되며, 세 주문을 모두 완료하면 MVP
핵심 루프 검증이 끝납니다.

## 조작

- `WORKSHOP`: 빈 칸에 T1 부품 생산
- 드래그: 빈 칸 이동 또는 동일 아이템 Merge
- `BUILD BIKE`: T3 부품 3종을 소비해 Entry Bike 제작
- `DELIVER`: 현재 주문 Bike를 Garage로 이동
- `RESET`: 진행 상황 초기화

## 제외

- Match-3 재료 수급
- 스태미너
- 광고와 인앱 결제
- LiveOps
- 서버와 로그인

제외 항목은 핵심 Merge 재미가 검증된 뒤 별도 Issue로 다룹니다.
