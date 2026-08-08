# CLAUDE.md

에이전트 공통 규칙은 [AGENTS.md](AGENTS.md)를 단일 기준으로 따릅니다. 이 문서는 Claude가 작업할 때 필요한 맥락과 문서 지도를 보강합니다.

## 프로젝트 한 줄 요약

**Dream Bike Garage (오늘부터 자전거 부자)** — Phaser 3 + TypeScript + Vite 기반 캐주얼 머지 웹게임. 2026년 11월 앱인토스(Apps in Toss) 출시가 목표입니다(8월 기획 확정 → 9월 MVP 개발 완료 → 10월 품질 향상 → 11월 출시).

## 저장소 체제

| 저장소 | 역할 |
|---|---|
| **dream-bike-garage** (이 저장소, 메인) | 기획·설계 기준, 채택안 결정, 최종 출시 코드. 단일 기준(source of truth) |
| [dream-bike-garage-lab](https://github.com/aigemro/dream-bike-garage-lab) | 프로토타입 A/B/C 비교 실험, 기술 검증. 결과만 메인에 재구현 |

- 역할 경계 상세: [docs/development/PROJECT_BOUNDARY.md](docs/development/PROJECT_BOUNDARY.md)
- 이슈 접두어: 메인은 `[기획]` `[설계]` `[적용]`, Lab은 `[실험]` `[기술]` `[검증]`
- Lab 코드를 메인에 복사하지 않습니다. 채택된 개념만 메인 아키텍처·테스트·데이터 정책에 맞게 재구현합니다.

## 팀과 역할

2인 팀입니다. 상세는 [docs/development/WORKFLOW.md](docs/development/WORKFLOW.md) 참고.

- **기획자**: 콘셉트, 게임 루프, 콘텐츠·밸런스 방향, 화면 요구사항 (`docs/game-design`, Issue)
- **설계·개발자**: 시스템·화면·데이터 구조 설계, 구현, 테스트, 배포 (`src`, `tests`, `.github/workflows`, `docs/development`, `prompts`)
- 구현 중 기획 판단이 필요하면 임의로 확정하지 말고 Issue로 공유합니다.

## 문서 지도

| 알고 싶은 것 | 문서 |
|---|---|
| 게임 규칙·시스템 설계 | [docs/game-design/MERGE_GAME_SYSTEM_DESIGN.md](docs/game-design/MERGE_GAME_SYSTEM_DESIGN.md) |
| MVP 범위 | [docs/game-design/MVP.md](docs/game-design/MVP.md) |
| 게임 콘셉트 | [docs/game-design/GAME_CONCEPT.md](docs/game-design/GAME_CONCEPT.md) |
| 메인 화면 구조 초안 | [docs/game-design/SCREEN_STRUCTURE.md](docs/game-design/SCREEN_STRUCTURE.md) |
| 주간 회의 기록 | [docs/meetings/](docs/meetings/) |
| 출시 일정·마일스톤 | [docs/development/RELEASE_PLAN_2026_11.md](docs/development/RELEASE_PLAN_2026_11.md) |
| 주간 목요일 회의 운영 | [docs/development/WEEKLY_SYNC.md](docs/development/WEEKLY_SYNC.md) |
| 코드 구조 원칙 | [docs/development/ARCHITECTURE.md](docs/development/ARCHITECTURE.md) |
| 앱인토스 출시 가이드 | [docs/development/APPS_IN_TOSS_WEBVIEW_GUIDE.md](docs/development/APPS_IN_TOSS_WEBVIEW_GUIDE.md) |
| 에셋(디자인·사운드) 운영 | [docs/development/ASSET_WORKFLOW.md](docs/development/ASSET_WORKFLOW.md) |
| 웹 우선 결정 배경 | [docs/decisions/0001-web-first.md](docs/decisions/0001-web-first.md) |

`docs/planning/game-marketing-plan.md`(Peloton Merge 기획)는 **Deprecated**이므로 참조 기준으로 삼지 않습니다.

## 코드 작업 시 핵심 원칙

- `src/domain`은 Phaser에 의존하지 않는 순수 게임 규칙입니다. 규칙 변경은 반드시 `tests/`의 Vitest 테스트와 함께 갱신합니다.
- Phaser Scene(`src/game`)은 입력·렌더링만 담당하고, 상태 변경은 도메인 함수 호출로 처리합니다.
- 검증 순서: `npm test` → `npm run build` (CI가 PR·main push에서 동일하게 실행)
- `main` 병합 시 GitHub Pages 자동 배포됩니다 (`vite.config.ts`의 `base: '/dream-bike-garage/'` 유지).

## 협업 흐름

Issue → Branch(`feat/*`, `design/*`, `fix/*`, `chore/*`) → PR(`Closes #번호`) → Review → Merge

진행 기록은 Notion 대시보드에서 관리합니다 (README 링크 참고).
