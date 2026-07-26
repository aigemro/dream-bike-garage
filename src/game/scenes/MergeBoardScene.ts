import Phaser from 'phaser';
import { BOARD_COLUMNS, BOARD_ROWS, CELL_SIZE } from '../../domain/board';

export class MergeBoardScene extends Phaser.Scene {
  constructor() {
    super('merge-board');
  }

  create(): void {
    this.add.text(24, 22, 'Workshop · Prototype Board', {
      color: '#f7f3e8',
      fontFamily: 'system-ui, sans-serif',
      fontSize: '18px',
      fontStyle: 'bold',
    });

    const originX = 24;
    const originY = 74;

    for (let row = 0; row < BOARD_ROWS; row += 1) {
      for (let column = 0; column < BOARD_COLUMNS; column += 1) {
        const x = originX + column * CELL_SIZE;
        const y = originY + row * CELL_SIZE;
        this.add.rectangle(x, y, CELL_SIZE - 4, CELL_SIZE - 4, 0x20323d)
          .setOrigin(0)
          .setStrokeStyle(1, 0x4f6d7a);
      }
    }

    this.add.text(24, 598, 'MVP: 7×9 board · Merge first', {
      color: '#f2c14e',
      fontFamily: 'system-ui, sans-serif',
      fontSize: '14px',
    });
  }
}
