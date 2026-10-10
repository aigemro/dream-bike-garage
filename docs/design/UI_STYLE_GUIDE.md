# UI 스타일 가이드 (출시 경로 화면 공통 규칙)

기준일: 2026-10-10 (브랜치 `design/screen-polish`, 전체 화면 디자인 정리 1차 적용 기준)

이 문서는 출시 경로에 연결된 Phaser 화면이 **같은 게임의 화면처럼 보이도록** 지키는 공통 규칙을 정리합니다. 게임 규칙·밸런스·화면 구성(어떤 요소가 있는지)은 다루지 않으며, 그 기준은 [MERGE_GAME_SYSTEM_DESIGN.md](../game-design/MERGE_GAME_SYSTEM_DESIGN.md)와 [MVP.md](../game-design/MVP.md)를 따릅니다. 캔버스 해상도·스케일·세이프 존·입력 규칙은 [SCREEN_LAYOUT_STRATEGY.md](../development/SCREEN_LAYOUT_STRATEGY.md) 5절을 그대로 따르며 여기서 반복하지 않습니다.

## 1. 목적과 적용 범위

- 목적: Lab 프로토타입(A/B/C안 비교용)을 출시 경로에 연결하면서 남은 프로토타입 라벨·데모 문구·가짜 HUD 값을 없애고, 화면마다 달랐던 글자 크기·뒤로가기·터치 영역 규칙을 하나로 맞춥니다.
- 적용 대상: `src/game/release/mvp-release-integration.ts`의 `ReleaseScreen`이 여는 아래 화면 전부. 릴리스에서 쓰지 않는 파일(home-design-bike/dusk/modern/retro, merge-prototype.ts, game-screen-mobile.ts, MergeBoardScene)과 각 파일 안의 미사용 모드·`preview` 분기는 대상이 아닙니다.
- 논리 해상도: 390×810 세로 고정. 이 문서의 좌표·크기는 모두 논리 px입니다.

| 화면 (`ReleaseScreen`) | 파일 | 비고 |
|---|---|---|
| 타이틀·로딩 `title` | `src/game/release/title-loading-design.ts` | 앱인토스 대표 이미지 후보 구도 |
| 홈 `home` | `src/game/release/home-design-prototype.ts` | `warm-pixel-garage` 모드만 출시 사용. **HUD 기준 화면** |
| 첫 플레이 안내 `guide` | `src/game/release/guide-overlay-design.ts` | 작업대 정적 모사 위 말풍선 오버레이 |
| 머지 작업대 `game` | `src/game/release/merge-workbench-screen.ts` | HUD는 작업대 역할에 맞춘 변형(DAY/주문/오늘 수입) |
| 하루 정산 `reward` | `src/game/release/reward-settlement-design.ts` | 급여 봉투 연출 |
| 수집 3모드 `catalog` / `showcase` / `dream` | `src/game/release/bike-collection-design-prototype.ts` | 도감 / 전시 / 성장 탭 |
| 프로필 `profile` | `src/game/release/profile-design-prototype.ts` | `warm-id-card` 모드만 출시 사용 |
| 설정 `settings` | `src/game/release/settings-design.ts` | 서랍장 구성 |
| 레이스 `race` | `src/game/release/race-cinematic-broadcast.ts` | 진입 → 중계 → 결과 |

## 2. 팔레트 토큰

새 색을 추가하지 않습니다. 화면마다 상수 이름이 조금씩 다르므로(`P.paper` / `GOLD` / `CREAM` 등) 이 표의 **토큰 이름**을 기준으로 읽고, 코드 상수가 어느 토큰인지 주석으로 밝힙니다.

| 토큰 | HEX | 용도 |
|---|---|---|
| INK | `#3b2531` | 글자 기본색, 테두리·외곽선, 어두운 배경 글자의 외곽선 |
| CREAM | `#fff1c6` | 화면 바탕, 밝은 패널, 어두운 패널 위 글자색 |
| PAPER | `#f6d995` | 카드·HUD 띠·일반 버튼 바탕, 비활성 버튼 바탕 |
| WOOD | `#8e5136` | 패널 테두리, 활성 버튼·제목 띠 바탕 |
| DARK WOOD | `#573044` | 버튼 그림자, 진행 바 바탕, 깊은 그늘 |
| FLOOR | `#b66f45` | 바닥·배경 띠 |
| GOLD | `#f4b84a` | 주 버튼(PLAY 등) 바탕, 강조 패널 |
| GREEN | `#5e9a67` | 진행 바 채움, 성공·완료 |
| RED | `#c95746` | 경고·대회일·주의 태그, 반품 확인 상태 |
| SKY | `#86c9c8` | 사진 칸·하늘·보조 패널 |

글자에만 쓰는 보조 색(기존 코드에 이미 있는 값, 새로 만들지 않음): MUTED `#7b5140`(보조 설명), 태그 갈색 `#795044`(HUD 소제목), 금액 `#a16028`(코인·보상), SUCCESS `#3f7851`(상태 문구·완료), ALERT `#a14a38`(비용·경고).

주의: `merge-workbench-screen.ts`·`reward-settlement-design.ts`·`guide-overlay-design.ts`의 `GOLD` 상수는 이 표의 **PAPER**(`#f6d995`)이고, `AMBER` 상수가 이 표의 **GOLD**(`#f4b84a`)입니다. 홈·수집·프로필의 `P.gold`는 표와 같습니다.

## 3. 폰트와 글자 크기 단계

- 폰트는 한 가지만 씁니다. `FONT = '"Arial Rounded MT Bold", "Noto Sans KR", sans-serif'` (새 폰트 추가 금지).
- 굵은 글자가 어두운 배경 위에 놓일 때는 1px 외곽선(stroke)을 둡니다. 홈 `label()` 헬퍼처럼 크림 글자에는 INK 외곽선, INK 글자에는 CREAM 외곽선을 씁니다.

| 단계 | 크기 | 용도 | 최소 규칙 |
|---|---|---|---|
| 태그 | 9px | 영문 소제목(`TODAY'S ORDER`, `COIN`, `NEXT GOAL`), 캡션, 버전 표기 | 보조 태그·캡션 하한. **7–8px 금지** |
| 보조 | 10px | 상태 보조 설명(`점선 칸에 자동 배치`), 연쇄 안내 띠 | 보조 설명 허용 하한 |
| 본문 | 11px | 본문, 버튼 라벨, 수치, 안내 문구, `← 홈` | 본문·버튼·수치 하한 |
| 강조 | 12px | HUD 상태 문구(`영업 준비 · 주문 0/3`), 주문 제목 보조, DAY 배지 | — |
| 제목 | 14px | HUD 코인 수치, 카드 제목 | — |
| 큰 제목 | 15–18px | 주문명, 닉네임, 주 버튼(PLAY 16px), 결과 제목 | — |

- 크기를 키우다 겹치면 글자를 줄이지 말고 간격을 조정합니다. 긴 문구는 홈의 `fitLabel()`처럼 **최소 크기까지만** 줄이고 그래도 넘치면 줄바꿈합니다.
- 줄바꿈 폭은 옆 버튼과 12px 이상 띄웁니다(작업대 안내 문구 `wordWrap.width 258` ↔ 오른쪽 버튼 왼쪽 가장자리 282).

## 4. 상단 HUD 규칙 (홈 기준)

홈의 `renderTopBar()`가 기준이며, 수집 3모드·프로필은 같은 좌표·구성을 그대로 씁니다.

| 요소 | 좌표 (x, y) | 크기·색 | 값 출처 |
|---|---|---|---|
| HUD 띠 | 중심 (195, 39), 366×54 | PAPER 바탕, INK 테두리 3px | — |
| `DAY n` 태그 | (28, 18) | 9px bold, `#795044` | `hooks.dayNumber` (없으면 `1`) |
| 상태 문구 | (28, 36) | 12px bold, SUCCESS `#3f7851` | `hooks.dayStatusLabel` (없으면 `영업 준비`) |
| `COIN` 태그 | (274, 18) | 9px bold, `#795044` | 고정 |
| 코인 수치 | (274, 36) | 14px bold, `#a16028`, `toLocaleString()` | `hooks.coins` (없으면 `0`) |
| 설정 ⚙ 버튼 | 중심 (352, 39), 34×34 | 홈에서만, `onSettings` 훅이 있을 때 | — |

- 상태 문구는 통합 컨트롤러 `homeDayStatusLabel()` 한 곳에서 계산합니다. 형식은 `영업 준비 · 주문 0/3`, 대회일은 `대회일 · 주문 1/3`. 화면 쪽에서 문구를 다시 조립하지 않습니다.
- 가짜 값 금지: `ENERGY 72 / 100`, 코인 `2,480` 같은 데모 수치를 두지 않습니다. 훅이 없으면 `DAY 1` / `영업 준비` / `0` 중립값입니다.
- 작업대는 역할에 맞춘 변형(`WORK` 태그 + 공방 이름 / `DAY n` 배지 + `주문 n/N` + `오늘 수입`)을 유지하고, 가이드 오버레이의 모의 HUD는 작업대와 같은 구성을 모사합니다. 레이스는 상단에 `DAY n` 태그만 작게 둡니다.

## 5. 뒤로가기 라벨과 터치 영역

- 뒤로가기 라벨은 모든 화면에서 **`← 홈`** 하나입니다(`← HOME`, `← Garage` 금지). 가이드의 `건너뛰기 ✕`는 뒤로가기가 아니므로 그대로 두되, 작업대의 `← 홈` 자리(헤더 우상단)에 놓아 다른 요소를 가리지 않게 합니다.
- 터치 영역은 논리 **44×44px 이상**입니다. 시각 크기를 키울 필요는 없고 `hitArea`만 넓힙니다. Phaser `Rectangle` 게임 오브젝트의 `hitArea` 좌표는 도형의 **좌상단 기준**이므로, 시각 크기 `w×h`를 가운데 두고 양쪽으로 넓히려면 원점을 음수로 옮깁니다.

```ts
// 터치 영역 최소 크기(논리 px): 시각 크기가 작은 버튼도 hitArea는 이 크기 이상으로 둔다
const MIN_HIT = 44;

// 시각 크기 w×h 버튼을 가운데 기준으로 44×44 이상으로 넓힌다 (home-design-prototype.ts button() 패턴)
const hitW = Math.max(w, MIN_HIT);
const hitH = Math.max(h, MIN_HIT);
const box = this.add.rectangle(x, y, w, h, P.paper)
  .setStrokeStyle(3, P.ink)
  .setInteractive({
    hitArea: new Phaser.Geom.Rectangle((w - hitW) / 2, (h - hitH) / 2, hitW, hitH),
    hitAreaCallback: Phaser.Geom.Rectangle.Contains,
    useHandCursor: true,
  })
  .on('pointerdown', action);
```

- 같은 뜻의 다른 표기도 허용합니다. 작업대 `← 홈`(시각 60×20)은 `new Phaser.Geom.Rectangle(-2, -12, 64, 44)`, 정산·레이스는 `widenHitArea(shape, pad)` 헬퍼로 사방 `pad`만큼 넓힙니다. 새 화면은 셋 중 하나를 그대로 씁니다.
- 하단 탭(수집 3모드 `도감 / 전시 / 성장`)과 주요 버튼은 시각 높이 자체를 44로 둡니다(`button(72, 772, 112, 44, …)`).

## 6. 비활성 버튼 스타일

회색 위 회색처럼 라벨이 사라지는 비활성 표현을 쓰지 않습니다. 작업대 `styleSmallButton()`이 기준입니다.

| 상태 | 바탕 | 테두리 | 글자 |
|---|---|---|---|
| 비활성 | PAPER `#f6d995`, 알파 0.6 | INK, 알파 0.5 | INK `#3b2531`, 알파 0.55 |
| 활성 | WOOD `#8e5136`(또는 역할 색: 반품 확인은 RED), 알파 1 | INK, 알파 1 | CREAM `#fff1c6`, 알파 1 |

- 활성 전환은 바탕 색과 글자 색이 함께 바뀌어 대비가 분명해야 합니다. 알파만 낮추는 방식(`setAlpha(0.45)`)은 금지합니다.
- 가이드 오버레이의 모의 버튼처럼 **상호작용이 없는 비활성 모사**도 같은 수치를 씁니다.

## 7. 영문 태그 + 한국어 본문 조합

영문 대문자 소제목 위에 한국어 본문을 두는 조합은 이 게임의 스타일이므로 유지합니다.

- 태그는 9px bold 영문 대문자(`DAY CLOSED`, `NEW ORDER`, `BIKE COLLECTION`, `MY PROFILE`, `NEXT RACE · D-4`), 본문은 한국어 11px 이상(`영업 4일차 마감!`, `통학용 어반 로드`).
- 태그 안에 안 표기(`· A안`)나 구현 설명을 붙이지 않습니다. 수집 3모드의 태그는 모드별로 `BIKE COLLECTION` / `MY GARAGE` / `DREAM BIKE`, 하단 탭은 `도감 / 전시 / 성장`입니다.
- 패널 제목과 본문은 플레이어 문구로 씁니다. 레이스 진입의 `코스 안내`(오르막·내리막·중계 속도 안내)처럼 **게임 안에서 보이는 설명**이어야 하고, 구현 설명(`바퀴가 도는 만큼만 땅이 흘러가고…`)은 코드 주석이나 `docs/development`로 옮깁니다.

## 8. 프로토타입 문구 금지 목록

출시 경로 화면에 다음 문구·요소가 남아 있으면 안 됩니다. 릴리스에서 쓰지 않는 모드·`preview` 분기에만 남겨 둘 수 있으며, 그 분기가 출시 경로에서 보이지 않는지 확인합니다.

| 금지 항목 | 예 | 대체 |
|---|---|---|
| 안 표기 | `A안`, `B안`, `C안`, `MY PROFILE · A안`, `설정 화면 · A안` | 안 표기 제거, `공방 설정` |
| 프로토타입 푸터 | `DREAM BIKE GARAGE · WARM PIXEL HOME/COLLECTION` | 제거(버전 표기 `Dream Bike Garage · vX.Y.Z`는 타이틀·설정에만 유지) |
| 데모 안내 | `(데모 표기)`, `데모에서는 초기화로 다시 볼 수 있습니다`, `검증용`, `축약 미리보기`, `HOME A안 축약 프리뷰` | 짧고 중립적인 안내(`공방 문을 엽니다…`) |
| 가짜 HUD 값 | `ENERGY 72 / 100`, 코인 `2,480`, `Lv.12`, `납품 34건` | 훅으로 받은 실제 값, 없으면 중립값 |
| 기획에 없는 진행 공식 | 레벨·경험치 바, `다음 직급까지 Lv.12/15 · 납품 34/40` | `다음 목표`(nextGoalLabel / nextGoalHint), 직급은 고정 호칭 `견습 정비사` |
| 구현 설명 패널 | `RIDER MOTION`, `BROADCAST NOTE` 본문 | `코스 안내`, 실시간 순위표(상위 3명 + 나) |
| 다른 뒤로가기 라벨 | `← HOME`, `← Garage` | `← 홈` |

파일 상단 주석의 `A안` 같은 설명은 `출시 적용` 문맥으로 고칩니다. 다만 의미 없는 대량 재작성은 하지 않습니다.

## 9. 훅 계약 (통합 컨트롤러 → 화면)

화면은 렌더·입력만 담당하고, 표시할 값은 `MvpReleaseIntegrationController`가 계산해 훅으로 넘깁니다. 화면 안에서 값을 다시 계산하거나 가짜 기본값을 두지 않습니다.

| 훅 타입 | 필드 | 의미 · 출처 |
|---|---|---|
| `HomeDesignHooks` | `dayNumber`, `dayStatusLabel`, `coins` | 홈 HUD. `dayStatusLabel`은 `homeDayStatusLabel()` |
| `BikeCollectionDesignHooks` | `dayNumber?: number`, `dayStatusLabel?: string` | 수집 3모드 HUD(홈과 같은 값). `coins`는 기존 필드 |
| `ProfileDesignHooks` | `profile?: ProfileSummary` | 프로필 카드 실제 수치. 없으면 `DEFAULT_SUMMARY`(시작 상태) |
| `RewardSettlementHooks` | `initialCoins` | `Math.max(0, coins - earnings)`로 음수 방어(화면에서도 한 번 더 `Math.max(0, …)`) |

```ts
export type ProfileSummary = {
  dayNumber: number;          // 현재 영업 일차
  dayStatusLabel: string;     // 홈과 같은 상태 문구
  coins: number;              // 보유 코인
  completedOrders: number;    // 누적 납품 수
  craftedBikes: number;       // 완성(보유) 자전거 수
  catalogSize: number;        // 도감 전체 수(24)
  totalEarnings: number;      // 누적 급여 (dayHistory earnings 합 + 오늘 earnings, 오늘이 이미 이력에 있으면 중복 합산 없음)
  settledDays: number;        // 마감한 영업일 수 (dayHistory.length)
  heroBikeName: string;       // 대표 자전거 이름
  nextGoalLabel: string;      // 홈과 같은 다음 목표
  nextGoalHint: string;
};
```

- 프로필 카드 6칸은 `ProfileSummary`에 있는 값만 씁니다: 납품 완료 / 완성차 / 수집 진행 / 영업 일차 / 누적 급여 / 마감한 영업일. 추적하지 않는 값(머지 횟수, 연속 출근)은 칸을 만들지 않습니다.
- 새 값이 필요하면 화면에서 임시 숫자를 두지 말고 훅 필드를 추가하고 통합 컨트롤러에서 채웁니다. 기획 판단이 필요한 공식(레벨·직급 등)은 Issue로 공유한 뒤에만 추가합니다.

## 10. 새 화면 추가 체크리스트

새 화면이나 큰 수정 PR을 올리기 전에 아래를 확인합니다.

- [ ] `ReleaseScreen`에 화면 키를 추가하고 1절 표에 파일을 적었다.
- [ ] 팔레트 토큰(2절)과 `FONT`만 사용했다. 새 색·새 폰트가 없다.
- [ ] 글자 크기가 본문·버튼·수치 11px 이상, 태그·캡션 9px 이상이다. 7–8px이 없다.
- [ ] 상단 HUD가 필요한 화면이면 4절 좌표·구성 그대로이고, 값은 훅(`dayNumber` / `dayStatusLabel` / `coins`)으로 받는다.
- [ ] 뒤로가기 라벨이 `← 홈`이고, 모든 버튼·탭의 터치 영역이 44×44 이상이다(5절 패턴).
- [ ] 비활성 버튼이 6절 수치(PAPER 0.6 / INK 0.55)로 읽힌다.
- [ ] 8절 금지 문구가 없다(`grep -n "A안\|데모\|WARM PIXEL\|← HOME\|← Garage" src/game/release/<파일>`로 확인).
- [ ] 텍스트 겹침·잘림이 없고, 배경 소품 라벨이 패널에 반쯤 가려지지 않는다.
- [ ] 훅이 없을 때 중립값으로 동작하고, 가짜 데모 수치가 없다.
- [ ] 상태 변경은 훅·도메인 함수로만 하고 Scene은 렌더·입력만 담당한다(ARCHITECTURE.md).
- [ ] `npx tsc -p tsconfig.app.json --noEmit` → `npm test` → `npm run build` 순으로 통과했다.
- [ ] 세이프 존·스케일은 [SCREEN_LAYOUT_STRATEGY.md](../development/SCREEN_LAYOUT_STRATEGY.md) 8절 체크리스트로 따로 확인했다.

## 11. 관련 문서

- [SCREEN_LAYOUT_STRATEGY.md](../development/SCREEN_LAYOUT_STRATEGY.md) — 기준 해상도, 스케일, 세이프 존, 입력 규칙
- [ARCHITECTURE.md](../development/ARCHITECTURE.md) — Scene은 렌더·입력, 상태는 도메인
- [ASSET_WORKFLOW.md](../development/ASSET_WORKFLOW.md) — 픽셀 스프라이트·사운드 운영
- [RACE_RIDER_MOTION.md](../development/RACE_RIDER_MOTION.md) — 레이스 라이더 모션(구현 설명은 여기로)
- [SCREEN_STRUCTURE.md](../game-design/SCREEN_STRUCTURE.md) — 메인 화면 구조 초안(기획)
