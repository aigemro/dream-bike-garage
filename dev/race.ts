import { startRaceCinematicBroadcast } from '../src/game/release/race-cinematic-broadcast';

// Vite 개발 서버에서만 사용하는 독립 미리보기. 출시 홈·계정 저장과 연결하지 않습니다.
const params = new URLSearchParams(location.search);
function numberParam(name: string, fallback: number) {
  const value = Number(params.get(name) ?? fallback);
  return Number.isFinite(value) ? value : fallback;
}
const game = startRaceCinematicBroadcast('race', {
  seed: numberParam('seed', 20260903),
  initialCoins: numberParam('coins', 2480),
  dayNumber: 5,
  onSettled: ({ rank, reward, coins }) => {
    document.querySelector('#settlement')!.textContent = `${rank}위 · 보상 ${reward} 코인 · 잔액 ${coins} 코인`;
  },
});
// 자동 브라우저 검증에서 프레임을 진행하거나 상태를 읽는 개발용 핸들입니다.
(window as unknown as { __raceGame: typeof game }).__raceGame = game;
