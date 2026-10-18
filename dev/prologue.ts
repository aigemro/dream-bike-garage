import { startPrologue } from '../src/game/release/prologue-design';

// Vite 개발 서버에서만 사용하는 프롤로그 독립 미리보기. 저장(prologueDone)·홈과 연결하지 않습니다.
const game = startPrologue('prologue', {
  onFinish: ({ skipped }) => {
    document.querySelector('#status')!.textContent = skipped ? '건너뛰기로 끝남 — 본편에서는 홈(공방)으로 이동' : '끝까지 봄 — 본편에서는 홈(공방)으로 이동';
  },
});
// 자동 브라우저 검증에서 씬 상태를 읽는 개발용 핸들입니다.
(window as unknown as { __prologueGame: typeof game }).__prologueGame = game;
