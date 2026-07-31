# 디자인·사운드 에셋 운영 규칙

Dream Bike Garage의 디자인과 사운드는 **실험 단계인지, 실제 게임에 적용하기로 확정됐는지**를 기준으로 저장소를 구분합니다.

## 기본 원칙

- `dream-bike-garage-lab`: 디자인·사운드·연출 방안을 여러 프로토타입으로 비교하고 검증합니다.
- `dream-bike-garage`: 채택된 최종 에셋, 게임 적용 코드, 기획·설계 기준과 출시 정보를 관리합니다.
- Lab의 결과물을 그대로 복사하는 것을 원칙으로 삼지 않습니다. 채택된 결과를 메인 저장소의 구조와 성능·라이선스 기준에 맞게 정리해 적용합니다.
- 실패하거나 보류된 실험도 비교 결과와 배운 점을 Lab에 남깁니다.

## 저장소별 관리 범위

| 구분 | 메인 저장소 `dream-bike-garage` | 기술 실험 저장소 `dream-bike-garage-lab` |
|---|---|---|
| 역할 | 실제 게임과 출시 기준 | 여러 표현 방안 비교·검증 |
| 디자인 | 확정 UI, 캐릭터, 자전거·부품, 배경 | UI 스타일, 애니메이션, 이펙트 시안 |
| 사운드 | 최종 BGM, 효과음, UI 사운드 | 머지음, 조립음, 배경음 등의 A/B/C 비교 |
| 문서 | 아트 방향, 스타일 가이드, 에셋 목록, 라이선스 | 가설, 조작 방법, 평가 기준, 비교 결과 |
| 코드 | 실제 게임에 맞게 정리한 구현 | 프로토타입별 독립 구현 |

## 작업 흐름

1. 검증할 질문과 공통 평가 기준을 정합니다.
2. Lab의 해당 트랙에 Prototype A/B/C 등 여러 방안을 만듭니다.
3. 동일한 조건에서 조작감, 가독성, 성능, 게임 콘셉트 적합성을 비교합니다.
4. 결과를 `채택 / 조건부 채택 / 보류 / 폐기`로 기록합니다.
5. 채택된 방안은 메인 저장소에 반영할 Issue를 생성해 연결합니다.
6. 최종 export 에셋과 적용 코드만 메인 저장소에 반영합니다.
7. 출처와 사용 조건을 `ASSET_LICENSES.md`에 기록합니다.

## 권장 위치

메인 저장소:

```text
public/assets/
├── images/
│   ├── ui/
│   ├── bikes/
│   ├── parts/
│   ├── characters/
│   └── backgrounds/
├── audio/
│   ├── bgm/
│   ├── sfx/
│   └── ui/
└── fonts/

docs/design/
├── UI_STYLE_GUIDE.md
├── ART_DIRECTION.md
├── ASSET_LIST.md
└── ASSET_LICENSES.md
```

Lab 저장소:

```text
src/experiments/presentation/
├── merge-effects/
├── ui-interactions/
├── sound-feedback/
└── bike-assembly-animation/

public/assets/prototypes/
docs/experiments/
docs/decisions/
```

실제 구조는 실험이 시작될 때 필요한 범위부터 만들며, 빈 폴더를 미리 생성하지 않습니다.

## 원본 제작 파일과 게임용 파일

- Figma 원본은 Figma에서 관리하고, 메인 저장소에는 문서 링크와 확정된 export 파일을 둡니다.
- PSD, AI, Blender, DAW 프로젝트처럼 큰 원본은 Git LFS 또는 별도 에셋 저장소 도입을 검토합니다.
- PNG, WebP, SVG, MP3, OGG 등 실제 게임에서 읽는 최종 파일은 메인 저장소에서 관리합니다.
- 외부 에셋은 출처, 제작자, 라이선스, 수정 여부, 사용 범위를 반드시 기록합니다.

## 별도 에셋 저장소를 만드는 시점

초기에는 세 번째 저장소를 만들지 않습니다. 다음 상황이 발생하면 `dream-bike-garage-assets` 분리를 검토합니다.

- Git 저장소 용량과 clone 시간이 개발에 영향을 줄 때
- PSD, Blender, DAW 등 대용량 원본이 빠르게 늘어날 때
- 외부 디자이너나 사운드 작업자의 권한을 코드와 분리해야 할 때
- 에셋 버전과 게임 코드 버전을 독립적으로 배포해야 할 때
