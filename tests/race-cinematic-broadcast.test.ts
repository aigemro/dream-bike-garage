import { describe, expect, it, vi } from 'vitest';
vi.mock('phaser', () => ({ default: { Scene: class {} } }));
import { RaceCinematicScene } from '../src/game/release/race-cinematic-broadcast';

describe('레이스 화면 전환 정리', () => {
  it('이전 입력 오브젝트를 파괴하고 예약 콜백·트윈·카메라 효과를 취소한다', () => {
    const children = [{ destroy: vi.fn() }, { destroy: vi.fn() }];
    const scene = new RaceCinematicScene() as unknown as {
      children: { getAll: () => typeof children };
      time: { removeAllEvents: ReturnType<typeof vi.fn> };
      tweens: { killAll: ReturnType<typeof vi.fn> };
      cameras: { main: { resetFX: ReturnType<typeof vi.fn> } };
      clearStage: () => void;
    };
    scene.children = { getAll: () => children };
    scene.time = { removeAllEvents: vi.fn() };
    scene.tweens = { killAll: vi.fn() };
    scene.cameras = { main: { resetFX: vi.fn() } };
    scene.clearStage();
    children.forEach(child => expect(child.destroy).toHaveBeenCalledOnce());
    expect(scene.time.removeAllEvents).toHaveBeenCalledOnce();
    expect(scene.tweens.killAll).toHaveBeenCalledOnce();
    expect(scene.cameras.main.resetFX).toHaveBeenCalledOnce();
  });
});
