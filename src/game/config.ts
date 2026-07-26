import Phaser from 'phaser';
import { MergeBoardScene } from './scenes/MergeBoardScene';

export const gameConfig: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'game-container',
  backgroundColor: '#101820',
  width: 390,
  height: 640,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: [MergeBoardScene],
};
