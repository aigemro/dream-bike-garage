import { startMvpReleaseIntegration } from './game/release/mvp-release-integration';
import './ui/styles.css';

// 앱인토스 번들(--mode toss)에서는 토스 상단 바·홈 인디케이터 자리를 비우는 레이아웃을 켭니다.
if (import.meta.env.MODE === 'toss') document.documentElement.classList.add('apps-in-toss');

startMvpReleaseIntegration('game-container');
