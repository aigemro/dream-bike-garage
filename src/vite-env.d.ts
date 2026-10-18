/// <reference types="vite/client" />

interface ImportMetaEnv {
  // 앱인토스 운영 리워드 광고 그룹 ID(콘솔 발급). 없으면 공식 테스트 ID를 씁니다.
  readonly VITE_TOSS_REWARDED_AD_GROUP_ID?: string;
}
