# AGENTS.md

## Project

Peloton Merge: Grand Tour World는 웹 우선 Merge 게임입니다.

## Commands

- Install: `npm ci`
- Develop: `npm run dev`
- Test: `npm test`
- Build: `npm run build`

## Rules

- MVP에서는 Merge 핵심 루프를 우선하고 Match-3를 구현하지 않습니다.
- 게임 규칙은 `src/domain`, Phaser 표현은 `src/game`에 둡니다.
- 설계 데이터는 가능한 한 `src/data`의 명시적 타입으로 관리합니다.
- 기능 변경에는 테스트와 관련 문서 변경을 함께 포함합니다.
- 새 작업은 Issue와 연결하고 PR에 `Closes #번호`를 사용합니다.
