# Peloton Merge: Grand Tour World

글로벌 자전거 브랜드와 세계 코스를 기반으로 한 Merge 게임 프로젝트입니다.

## MVP

Workshop에서 부품을 생성하고 같은 부품을 합쳐 완성차를 만든 뒤, 주문을 완료하고 Garage 컬렉션을 확장합니다.

- 7×9 Merge Board
- Workshop 1개
- 부품 3종: 프레임, 휠, 구동계
- 완성차 3단계: Entry, Carbon, Flagship
- 주문 3개와 Garage 20칸
- MVP 제외: Match-3, 스태미너, 광고, 과금

### 플레이 방법

1. `WORKSHOP`을 눌러 Frame → Wheel → Drive 순서로 T1 부품을 생산합니다.
2. 같은 종류·티어의 아이템을 서로 드래그하면 상위 티어 1개로 합쳐집니다.
3. T3 Frame·Wheel·Drive를 하나씩 만든 뒤 `BUILD BIKE`로 Entry Bike를 조립합니다.
4. 같은 Bike 두 대를 합쳐 Carbon, 다시 두 대를 합쳐 Flagship으로 진화시킵니다.
5. 현재 주문과 같은 티어의 Bike가 있으면 `DELIVER`로 납품합니다.
6. Entry·Carbon·Flagship 주문을 모두 완료하면 MVP 핵심 루프가 끝납니다.

우측 아래 `RESET`으로 언제든 새 게임을 시작할 수 있습니다.

## 시작하기

```bash
npm ci
npm run dev
```

검증 명령:

```bash
npm test
npm run build
```

## 기술 스택

TypeScript · Vite · Phaser · Vitest · GitHub Actions · GitHub Pages

웹 MVP 검증 후 모바일 출시는 Capacitor 적용을 검토합니다.

## 협업

- `main`: 배포 가능한 안정 브랜치
- `feat/*`: 기능 개발
- `design/*`: 설계와 게임 데이터
- `fix/*`: 버그 수정
- `chore/*`: 환경과 도구
- Issue → Branch → Pull Request → Review → Merge 순서로 작업합니다.

설계자는 `docs/game-design`, `src/data`, `prompts`를 중심으로 작업하고 개발자는 `src`, `tests`, `.github/workflows`, `docs/development`를 관리합니다.

자세한 내용은 [MVP 범위](docs/game-design/MVP.md), [아키텍처](docs/development/ARCHITECTURE.md), [협업 흐름](docs/development/WORKFLOW.md)을 참고하세요.
