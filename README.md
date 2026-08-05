# Dream Bike Garage

> 오늘부터 자전거 부자

**드림 바이크를 갖기 위해 자전거샵에서 일하는 캐주얼 머지 게임**입니다.

플레이어는 자전거를 좋아하지만 원하는 자전거를 살 돈이 없습니다. 자전거샵에서 아르바이트를 시작해 고객 주문에 맞는 부품을 만들고, 머지로 필요한 부품을 완성한 뒤 자전거를 조립해 전달합니다. 주문을 완료해 받은 급여는 플레이어 자신의 드림 바이크를 성장시키는 데 사용합니다.

## 핵심 게임 루프

고객 주문 → 부품 생성 → 머지 → 자전거 조립 → 주문 완료 → 급여 획득 → 드림 바이크 성장 → 새로운 주문

## 핵심 시스템

- **머지**: 같은 부품을 합쳐 주문에 필요한 상위 부품을 만듭니다.
- **주문 제작**: 고객이 요청한 자전거와 필요한 부품을 확인하고 제한 조건 안에서 완성합니다.
- **자전거 조립**: 준비된 부품을 조합해 고객의 자전거를 완성합니다.
- **브랜드 컬렉션**: 다양한 자전거와 브랜드를 발견하고 수집합니다.
- **드림 바이크 성장**: 급여를 투자해 플레이어의 목표 자전거를 단계적으로 완성합니다.

## MVP

MVP는 다음 다섯 시스템의 핵심 경험을 검증합니다.

- 머지
- 주문
- 자전거 조립
- 컬렉션
- 드림 바이크 성장

레이스 시스템은 MVP 범위에서 제외합니다.

자세한 내용은 [게임 콘셉트 문서](docs/planning/GAME_CONCEPT.md), [MVP 범위](docs/game-design/MVP.md), [2026년 9월 MVP·앱인토스 출시 계획](docs/development/MVP_RELEASE_PLAN_2026_09.md)을 참고하세요.

> [!IMPORTANT]
> ## 📘 프로젝트 진행 대시보드
>
> **기획자 임성민 위원님의 PPT 제안과 설계자·개발자 김태훈 프로의 ChatGPT·Codex/Work 작업이 어떻게 결론과 GitHub 결과물로 이어졌는지 기록합니다.**
>
> 설계·개발 방향 변경, 날짜별 진행 과정, 현재 상태와 최종 결과물은 **[Notion 프로젝트 진행 대시보드에서 확인하세요 →](https://held-spaghetti-47e.notion.site/Dream-Bike-Garage-3b1ec666c8bb8051a5b9edaf4129a4b3)**

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

웹 MVP 검증 후 모바일 출시를 위한 Capacitor 적용을 검토합니다.

## 협업

- `main`: 배포 가능한 안정 브랜치
- `feat/*`: 기능 개발
- `design/*`: 설계와 게임 데이터
- `fix/*`: 버그 수정
- `chore/*`: 환경과 도구
- Issue → Branch → Pull Request → Review → Merge 순서로 작업합니다.

기존 **Peloton Merge: Grand Tour World** 콘셉트는 Deprecated 상태이며, 신규 기획과 구현은 **Dream Bike Garage: 오늘부터 자전거 부자**를 기준으로 합니다.

### 역할 구분

- **기획자**: 게임 콘셉트, 사용자 경험, 핵심 게임 루프, 콘텐츠, 밸런스 방향과 화면 요구사항을 정의합니다. 기획 문서를 작성하고 구현 결과가 기획 의도와 일치하는지 검토합니다.
- **설계·개발자**: 기획 내용을 시스템·화면·데이터 구조로 구체화하고, 기술 설계, 구현, 테스트, 배포를 담당합니다. 개발 과정에서 필요한 추가 결정 사항과 제약을 기획자에게 공유합니다.
- **공통**: GitHub Issue 우선순위 협의, 문서와 화면 리뷰, 주요 의사결정 기록을 함께 진행합니다.

기획 문서는 `docs/game-design`을 중심으로 관리하며, 설계·개발 산출물은 `src`, `src/data`, `tests`, `.github/workflows`, `docs/development`, `prompts`를 중심으로 관리합니다.

자세한 내용은 [프로젝트 역할과 운영 경계](docs/development/PROJECT_BOUNDARY.md), [MVP 범위](docs/game-design/MVP.md), [아키텍처](docs/development/ARCHITECTURE.md), [협업 흐름](docs/development/WORKFLOW.md)을 참고하세요.

## 디자인·사운드 운영

디자인과 사운드는 Lab에서 여러 방안을 비교한 뒤, 채택된 최종 에셋과 적용 코드만 메인 저장소에서 관리합니다. 원본 제작 파일, 라이선스, 별도 에셋 저장소 분리 기준은 [디자인·사운드 에셋 운영 규칙](docs/development/ASSET_WORKFLOW.md)을 참고하세요.
