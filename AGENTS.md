# AGENTS.md

## Project

**Dream Bike Garage (오늘부터 자전거 부자)** — 자전거샵 아르바이트 설정의 캐주얼 머지 웹게임입니다.

핵심 루프: 고객 주문 → 부품 생성 → 머지(2-to-1) → 자전거 조립 → 납품·급여 획득 → 드림 바이크 성장 → 새로운 주문

> [!WARNING]
> 기존 **Peloton Merge: Grand Tour World** 콘셉트(실제 브랜드·매치3 기반)는 Deprecated입니다.
> 모든 기획·구현은 Dream Bike Garage를 기준으로 합니다.

## Commands

- Install: `npm ci`
- Develop: `npm run dev`
- Test: `npm test`
- Build: `npm run build`

## 기준 문서

- 게임 규칙·시스템: `docs/game-design/MERGE_GAME_SYSTEM_DESIGN.md`
- MVP 범위: `docs/game-design/MVP.md`
- 출시 일정: `docs/development/RELEASE_PLAN_2026_11.md` (2026년 11월 앱인토스 출시 목표)
- 주간 회의 운영: `docs/development/WEEKLY_SYNC.md` (매주 목요일 진행 공유)
- 아키텍처: `docs/development/ARCHITECTURE.md`
- 협업 흐름: `docs/development/WORKFLOW.md`
- Lab 저장소와의 역할 경계: `docs/development/PROJECT_BOUNDARY.md`

## Rules

- MVP는 머지·주문·조립·컬렉션·드림 바이크 성장의 핵심 경험 검증에 집중합니다.
  매치3, 레이스, 샵 경영, 실제 브랜드, 광고·인앱결제, 서버 동기화는 구현하지 않습니다.
- 게임 규칙은 `src/domain`(Phaser 비의존), Phaser 표현은 `src/game`, UI와 스타일은 `src/ui`에 둡니다.
- 밸런스 데이터는 가능한 한 `src/data`의 명시적 타입으로 관리합니다.
- 기능 변경에는 테스트와 관련 문서 변경을 함께 포함합니다.
- 새 작업은 Issue와 연결하고 PR에 `Closes #번호`를 사용합니다.
- 구현 중 기획 판단이 필요한 항목은 임의로 확정하지 않고 Issue로 공유합니다.
- 여러 구현안의 비교 실험·기술 검증은 이 저장소가 아니라 Lab([aigemro/dream-bike-garage-lab](https://github.com/aigemro/dream-bike-garage-lab))에서 진행합니다.
  Lab 코드는 메인에 그대로 복사하지 않고, 채택된 개념만 메인 아키텍처에 맞게 재구현합니다.
