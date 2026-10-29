# Architecture

## 원칙

- 웹에서 핵심 루프를 빠르게 검증하고 이후 Capacitor로 모바일 패키징할 수 있게 유지합니다.
- Phaser Scene은 입력과 렌더링을 담당합니다.
- `src/domain`은 프레임워크와 분리된 게임 규칙을 담당합니다.
- `src/data`는 설계자가 검토 가능한 정적 밸런스 데이터를 담당합니다.
- UI와 스타일은 `src/ui`에서 관리합니다.

## 디렉터리

- `src/game`: Phaser 설정과 Scene
- `src/domain`: Merge, Board, Order, Garage 규칙
- `src/data`: 아이템과 밸런스 데이터
- `src/ui`: DOM UI와 스타일
- `src/platform`: 실행 환경 어댑터(웹 브라우저·앱인토스)와 계정 슬롯 저장. 앱인토스 SDK는 `apps-in-toss-platform.ts`, Capacitor(안드로이드 테스트 앱)는 `android-app-platform.ts`에서만 호출
- `android`: 안드로이드 테스트 APK용 Capacitor 프로젝트 ([안내](ANDROID_TEST_APK.md))
- `docs/game-design`: 설계자가 관리하는 게임 명세
- `docs/development`: 개발자가 관리하는 기술 문서
- `prompts`: 재사용 가능한 AI 작업 프롬프트
- `tests`: 도메인 단위 테스트

## 상태 흐름

`src/main.ts`가 시작하는 `src/game/release/mvp-release-integration.ts`가 화면(`ReleaseScreen`)을 전환하고 진행 상태를 들고 있습니다.

- `src/game/release/release-state.ts`: 저장되는 진행 상태 `ReleaseState`(코인·납품 수·Day·작업대·설정 등)와 생성·복구(이전 저장 형식 변환 포함) 함수. Phaser에 의존하지 않습니다.
- `src/domain/merge-workbench.ts`: 머지 작업대 규칙(상자 열기·합성·장착·납품·알바 체력)
- `src/domain/day-session.ts`: Day 세션 규칙(주문 3건 = 하루, 준비 → 영업 → 마감 → 정산)
- `src/platform/save-store.ts`: 계정 슬롯 저장소. 부팅 때 저장 항목(`release`·`collection`·`growth`)을 한 번에 읽고, 쓰기는 메모리에 바로 반영한 뒤 저장소(앱인토스 Storage·localStorage)에 순서대로 내보냅니다.

Phaser 화면은 입력을 도메인 함수로 처리하고 변경·납품을 훅(`onChange`·`onDelivered`)으로 알립니다. 통합 모듈은 코인·Day 통계를 반영하고 `SaveStore`로 저장합니다. 규칙은 Phaser에 의존하지 않아 Vitest로 독립 검증합니다. 작업대·Day 세션 상세는 [MERGE_WORKBENCH_DAY_SESSION.md](MERGE_WORKBENCH_DAY_SESSION.md)를 따릅니다.
