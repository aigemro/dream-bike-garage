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
- `docs/game-design`: 설계자가 관리하는 게임 명세
- `docs/development`: 개발자가 관리하는 기술 문서
- `prompts`: 재사용 가능한 AI 작업 프롬프트
- `tests`: 도메인 단위 테스트

## MVP 상태 흐름

`GameState`는 보드 아이템, 주문 완료 목록, Garage 수집 목록과 ID 생성 상태를
보유합니다. Phaser Scene은 버튼·드래그 입력을 도메인 함수에 전달하고 반환된
새 상태를 다시 렌더링합니다. Merge·조립·납품 규칙은 Phaser에 의존하지 않아
Vitest로 독립 검증할 수 있습니다.
