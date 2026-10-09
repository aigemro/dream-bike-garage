# 앱인토스 SDK 설정과 화면 맞춤

> 기준일: 2026-10-09 · 관련 이슈: [#79](https://github.com/aigemro/dream-bike-garage/issues/79) · 상위 안내: [앱인토스 WebView 안내](APPS_IN_TOSS_WEBVIEW_GUIDE.md)

현재 Vite + Phaser 웹 프로젝트를 그대로 두고 앱인토스 WebView SDK를 붙입니다. 네이티브 앱 전환은 없고, 같은 코드로 GitHub Pages 웹 빌드와 앱인토스 번들을 따로 만듭니다.

## 1. 구성

| 항목 | 값 |
|---|---|
| SDK | `@apps-in-toss/web-framework` 3.8.0 (버전 고정, 4.0은 베타) |
| 개발 도구 | `@apps-in-toss/devtools` 3.8.0 — 브라우저에서 SDK mock, 기기·토스 상단 바 시뮬레이션. 개발 서버에서만 쓰고 번들에는 들어가지 않음 |
| 설정 파일 | `apps-in-toss.config.ts` (3.x 형식. 공식 튜토리얼의 `granite.config.ts`는 2.x 형식) |
| appName | `dream-bike-garage` — 콘솔 등록값과 같아야 하며 바꿀 수 없음 |
| Node | 24 이상 (devtools 요구). CI·Pages 배포도 24로 맞춤 |

## 2. 명령

| 명령 | 용도 | 결과물 |
|---|---|---|
| `npm run dev` | 웹 개발 서버 (기존과 같음) | — |
| `npm run build` | GitHub Pages 빌드, base `/dream-bike-garage/` | `dist/` |
| `npm run dev:toss` | 앱인토스 개발 서버. 화면 오른쪽 아래 **AIT** 버튼으로 devtools 패널을 열어 기기·상단 바를 바꿔 봄 | — |
| `npm run build:toss` | 앱인토스 번들, base `./` | `dist-toss/`, `dream-bike-garage.ait` |
| `npm run deploy:toss` | `.ait`를 콘솔에 업로드 (`ait token add`로 API 키 등록 필요) | — |

`dist-toss/`와 `*.ait`는 git에서 제외합니다. CI는 `npm test`, `npm run build`, `npm run build:toss`를 모두 확인합니다.

토스 앱 실기기 확인은 콘솔에 번들을 올린 뒤 테스트 QR로 합니다. 3.x에는 샌드박스 앱이 없습니다.

## 3. 플랫폼 어댑터와 저장

게임 코드는 `src/platform`의 `GamePlatform` 인터페이스만 쓰고, SDK는 `apps-in-toss-platform.ts`에서만 호출합니다. 앱인토스 빌드(`--mode toss`)일 때만 이 파일을 불러오므로 웹 빌드에는 SDK가 들어가지 않습니다(앱인토스 번들에서 별도 조각, gzip 약 20KB).

| 기능 | 웹 브라우저 | 앱인토스 |
|---|---|---|
| 저장 | localStorage(비동기로 감쌈) | `Storage.getItem/setItem/removeItem` |
| 사용자 키 | 없음 → 기기 공용 슬롯 `local` | `User.getAnonymousKey()` 해시. 토스앱 5.232.0 미만·오류면 `local` |
| 앱 전환 | `visibilitychange`·`pagehide` | 같음 (SDK에 전용 이벤트 없음, 실기기 확인 대상) |
| 뒤로가기 | 없음 | `graniteEvent` `backEvent` |
| 닫기 | 없음 | `Screen.close()` |
| 진동 | `navigator.vibrate` | `Device.triggerHaptic` |
| Safe Area | 없음(CSS `env()`) | `SafeArea.get/subscribe` |

뒤로가기·닫기·진동·Safe Area는 어댑터만 준비했고 게임 연결은 #79 4단계에서 합니다.

### 계정 슬롯 저장 (`SaveStore`)

- 키 형식: `dbg:v1:{슬롯}:{항목}`. 항목은 `release`(진행·작업대·Day)·`collection`·`growth`, 슬롯은 사용자 키 또는 `local`
- 시작할 때 슬롯 항목을 한 번에 읽어 메모리에 올리고, 게임 중에는 메모리에서 바로 읽습니다. 앱인토스 `Storage`가 비동기라 이렇게 합니다.
- 쓰기는 메모리에 즉시 반영하고 저장소에는 순서대로 내보냅니다. 같은 항목이 연달아 바뀌면 마지막 값만 씁니다. 앱이 화면에서 사라질 때 남은 쓰기를 내보냅니다.
- 저장에 실패해도 메모리 진행은 유지하고 콘솔에 경고를 남깁니다.
- 슬롯이 비어 있으면 한 번 옮겨 옵니다: ① 사용자 키 슬롯이면 `local` 슬롯(키를 받기 전 진행) ② 계정 슬롯 도입 전 웹 저장 키(`dbg-lab-mvp-release-integration-v1`·`dbg-lab-meta-collection`·`dbg-lab-meta-growth`). 원본은 지우지 않고, 옮긴 기록을 `_migrated`에 남깁니다.

## 4. 화면 잘림 검토 (2026-10-09)

### 토스 상단 바

게임 카테고리 미니앱은 토스 상단 바(높이 54px)가 **투명하게 떠서 콘텐츠를 밀어내지 않습니다.** 오른쪽 위에 `⋯ | ×` 캡슐(약 93×30px)만 보입니다. 우리 화면은 390×810 캔버스를 화면 폭이나 높이에 맞춰(FIT) 맨 위부터 그리므로, 이 캡슐이 각 화면 오른쪽 위를 덮습니다.

devtools 기기 프리셋으로 계산한 결과, 캡슐은 모든 기기에서 게임 좌표 **x 약 290~408, y 약 0~51** 영역을 가렸습니다. 이 자리에 있던 요소는 다음과 같습니다.

| 화면 | 가려지는 요소 (게임 좌표) |
|---|---|
| 작업대 | `← 홈` 버튼 (350, 16) |
| 홈 | `⚙` 설정 버튼 (352, 39) |
| 설정 | `← HOME` 버튼 (344, 30) |
| 첫 플레이 안내 | `건너뛰기 ✕` 버튼 (340, 30) |
| 레이스 | 현재 순위 표시 (366, 8) |

### 대응 (앱인토스 번들에만 적용)

- `--mode toss` 빌드에서 `<html>`에 `apps-in-toss` 클래스를 붙이고, 게임 영역 위쪽을 상단 바 높이(54px)만큼 비웁니다. 빈 띠는 게임 바탕색으로 채웁니다.
- `viewport-fit=cover`와 `env(safe-area-inset-*)` 여백으로 홈 인디케이터·노치 영역을 비웁니다(웹 빌드에도 적용되며 값이 없으면 0).
- 게임 영역 높이를 창 높이(`100dvh`) 대신 `body`에 맞춰, 호스트가 `body` 크기를 바꿔도 넘치지 않게 했습니다.

devtools(iPhone SE·16e·17 Pro Max, Galaxy S26, 게임 상단 바)에서 캡슐이 게임 영역 위 빈 띠 안에만 있고 타이틀·홈·작업대·안내 화면이 잘리지 않는 것을 확인했습니다.

### 비용과 남은 확인

위쪽을 비운 만큼 화면이 작아집니다.

| 기기 (devtools 프리셋) | 게임 배율 | 비고 |
|---|---|---|
| iPhone SE | 0.82 → 0.76 (-8%) | 좌우 여백 40px. 8~10px 글씨가 실제 6~8px로 보임 |
| iPhone 15 Pro | 0.93 → 0.82 (-12%) | 감소 폭이 가장 큼 |
| iPhone 16e | 1.00 → 0.93 (-7%) | |
| iPhone 17 Pro Max | 1.13 → 1.07 (-5%) | |
| Galaxy S26 | 0.92 → 0.89 (-4%) | |

- **최종 디자인 때 다시 볼 것**: 오른쪽 위(약 100×55px)를 비우는 배치로 바꾸면 위쪽 54px를 다시 쓸 수 있습니다. 작은 기기의 글씨 크기도 함께 검토가 필요합니다.
- devtools 기기 수치 일부는 추정값(EXTRAPOLATED·PLACEHOLDER)입니다. 상단 바 높이, 하단 홈 인디케이터 여백(`env()` 값이 토스 WebView에서 들어오는지)은 실기기에서 확인합니다.
- SDK의 `getSafeAreaInsets`·`SafeArea.subscribe` 값은 플랫폼 어댑터 단계(#79 2단계)에서 CSS 변수로 연결합니다.
