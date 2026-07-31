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

### 역할 구분

- **기획자**: 게임 콘셉트, 사용자 경험, 핵심 게임 루프, 콘텐츠, 밸런스 방향과 화면 요구사항을 정의합니다. 기획 문서를 작성하고 구현 결과가 기획 의도와 일치하는지 검토합니다.
- **설계·개발자**: 기획 내용을 시스템·화면·데이터 구조로 구체화하고, 기술 설계, 구현, 테스트, 배포를 담당합니다. 개발 과정에서 필요한 추가 결정 사항과 제약을 기획자에게 공유합니다.
- **공통**: GitHub Issue 우선순위 협의, 문서와 화면 리뷰, 주요 의사결정 기록을 함께 진행합니다.

기획 문서는 `docs/game-design`을 중심으로 관리하며, 설계·개발 산출물은 `src`, `src/data`, `tests`, `.github/workflows`, `docs/development`, `prompts`를 중심으로 관리합니다.

자세한 내용은 [MVP 범위](docs/game-design/MVP.md), [아키텍처](docs/development/ARCHITECTURE.md), [협업 흐름](docs/development/WORKFLOW.md)을 참고하세요.
