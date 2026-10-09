# 안드로이드 테스트 APK

> 기준일: 2026-10-09 · 관련: [앱인토스 SDK 설정과 화면 맞춤](APPS_IN_TOSS_SDK_SETUP.md), [#79](https://github.com/aigemro/dream-bike-garage/issues/79)

앱인토스 출시 전에 실제 안드로이드 휴대폰에서 **앱 형태로** 플레이해 보기 위한 APK입니다. 스토어 배포용이 아니며, 같은 게임 코드(웹 빌드)를 Capacitor로 감싼 것입니다.

## 1. 받는 방법

1. 휴대폰 브라우저에서 아래 주소로 APK를 받습니다(로그인 불필요).
   - https://github.com/aigemro/dream-bike-garage/releases/download/android-test-latest/dream-bike-garage-test.apk
   - 목록 화면: https://github.com/aigemro/dream-bike-garage/releases/tag/android-test-latest
2. 처음 한 번 브라우저(또는 파일 앱)에 **출처를 알 수 없는 앱 설치**를 허용합니다.
3. 설치하면 홈 화면에 **자전거 부자 TEST** 아이콘이 생깁니다.

새 빌드는 같은 서명 키로 만들어 **기존 앱 위에 덮어쓰기 설치**되고 게임 진행이 유지됩니다.

## 2. 언제 만들어지나

| 계기 | 결과 |
|---|---|
| main에 머지 | APK를 만들어 Releases `android-test-latest`를 최신 빌드로 바꿈 |
| Actions의 **Android Test APK** → Run workflow | 위와 같음(수동) |
| 안드로이드 관련 파일을 바꾼 PR | APK가 만들어지는지만 확인, 실행 결과물로 14일 보관 |

- 버전 표기: `package.json` version(예: v0.1.0), 빌드 번호는 Actions 실행 번호입니다.
- 공개 저장소라 위 주소는 링크를 아는 누구나 받을 수 있습니다.

## 3. 앱에서 달라지는 점

| 항목 | 테스트 앱 |
|---|---|
| 화면 | 앱인토스 번들과 같은 레이아웃: 위쪽 54px(토스 상단 바 자리) + 상태 바·내비게이션 바 여백. 앱인토스 출시 화면 비율을 미리 봄 |
| 방향 | 세로 고정(AndroidManifest) |
| 뒤로가기 | 하위 화면은 홈으로, 홈·타이틀에서는 종료 확인 창 → 앱 종료 |
| 앱 전환 | 소리 정지, 작업대 Day 일시정지, 저장 내보내기 |
| 저장 | 앱 안의 웹 저장소(웹 버전과 같은 방식). 웹·앱인토스와는 진행이 따로 |
| 토스 기능 | 없음(토스 저장소·사용자 키·토스 상단 바 캡슐). 토스 앱 안 동작은 앱인토스 테스트 QR로 따로 확인 |

## 4. 구성

- `capacitor.config.ts`: 앱 ID `com.aigemro.dreambikegarage.test`, 이름 `자전거 부자 TEST`, 웹 결과물 `dist-android`
- `android/`: Capacitor 8이 만든 안드로이드 프로젝트(compile/target SDK 36, min 24). 웹 결과물 복사본(`app/src/main/assets/public`)은 git에서 제외
- `src/platform/android-app-platform.ts`: 뒤로가기·앱 종료·앱 전환을 Capacitor App 플러그인으로 받음. 저장·진동은 웹과 같음
- `npm run build:android`: `vite build --mode android` → `cap sync android`
- `.github/workflows/android-apk.yml`: Node 24·JDK 21로 `./gradlew assembleRelease` 후 Releases 업로드

### 아이콘·시작 화면

- 원본: `assets/app-icon-source.png` (600×600 픽셀아트, 크림 바탕 `#FDF3CA`). 앱인토스 콘솔 로고(600×600)와 같은 이미지
- `npm run icons:android`로 안드로이드 아이콘·시작 화면을 다시 만듭니다. 원본만 바꾸고 이 명령을 실행하면 됩니다.
  - 적응형 아이콘은 기기마다 원·둥근 사각형으로 잘리므로 그림을 85%로 줄여 가운데에 둡니다(생성 도구가 16.7% 여백을 따로 줌).
  - 픽셀이 번지지 않도록 nearest로 확대합니다.
  - 세로 고정 앱이라 가로·다크 모드·ldpi 시작 화면은 지웁니다.

### 서명 키

- GitHub 저장소 비밀값: `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`
- 백업: 키를 만든 PC의 사용자 폴더 `.dream-bike-garage/`(저장소 밖, 비밀번호 파일 포함)
- 키를 바꾸면 기존 앱 위에 설치할 수 없어 앱을 지우고 다시 설치해야 합니다(진행 삭제).

### 로컬 빌드

Android SDK(Android Studio)와 JDK 21이 필요합니다. 이 PC에는 Android SDK가 없어 APK 빌드는 CI에서 합니다.

```bash
npm run build:android
```

이후 `android/`를 Android Studio로 열어 실행하거나 `cd android && ./gradlew assembleRelease`로 만듭니다. 서명 환경변수가 없으면 디버그 키로 서명합니다.
