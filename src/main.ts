import { startMvpReleaseIntegration } from './game/release/mvp-release-integration';
import './ui/styles.css';

// 앱인토스 번들(--mode toss)에서는 토스 상단 바·홈 인디케이터 자리를 비우는 레이아웃을 켭니다.
// 안드로이드 테스트 앱(--mode android)도 같은 레이아웃으로 띄워, 앱인토스 출시 화면 비율을 미리 확인합니다.
if (import.meta.env.MODE === 'toss' || import.meta.env.MODE === 'android') document.documentElement.classList.add('apps-in-toss');

void startMvpReleaseIntegration('game-container');
