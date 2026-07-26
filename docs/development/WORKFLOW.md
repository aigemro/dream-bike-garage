# Collaboration Workflow

1. GitHub Issue에 목표와 완료 조건을 작성합니다.
2. `feat/*`, `design/*`, `fix/*`, `chore/*` 브랜치를 만듭니다.
3. 작은 단위로 커밋하고 Pull Request를 엽니다.
4. 상대가 문서·화면·테스트를 확인합니다.
5. PR 본문에 `Closes #이슈번호`를 넣고 `main`에 병합합니다.
6. CI 성공 후 GitHub Pages가 자동 배포됩니다.

## 역할

- 설계자: `docs/game-design`, `src/data`, `prompts/design` 중심
- 개발자: `src`, `tests`, `.github/workflows`, `docs/development` 중심
- 공통: Issue, PR 리뷰, Decision Log

## Project 보드

Backlog → Ready → In Progress → Review → Done

보류 작업은 Hold 상태로 분리합니다.
