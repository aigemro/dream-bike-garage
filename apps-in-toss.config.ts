// 앱인토스 미니앱 설정 (ait build·deploy가 읽습니다)
// appName은 콘솔에 등록한 값과 같아야 하며, 한 번 등록하면 바꿀 수 없습니다.
import { defineConfig } from '@apps-in-toss/web-framework/config';

export default defineConfig({
  appName: 'dream-bike-garage',
  brand: {
    // 공방 헤더의 따뜻한 빨강(WORK 태그 계열). 최종 브랜드 색은 디자인 확정 때 다시 맞춥니다.
    primaryColor: '#c4473a',
  },
  permissions: [],
  webView: {
    // 게임 화면이 당겨지거나 튕기지 않게 막습니다.
    bounces: false,
    pullToRefreshEnabled: false,
    overScrollMode: 'never',
    allowsBackForwardNavigationGestures: false,
  },
  // GitHub Pages 빌드(dist)와 섞이지 않도록 앱인토스 번들은 별도 폴더에 만듭니다.
  webBundleDir: 'dist-toss',
});
