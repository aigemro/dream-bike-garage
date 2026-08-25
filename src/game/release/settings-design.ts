// 설정 화면 A안: 따뜻한 픽셀 공방 관리 서랍형 (390×810)
// 공방 서랍장을 여는 메타포로 배경음악·효과음·진동 토글(나무 스위치),
// 튜토리얼 다시 보기, 2단계 확인이 있는 데이터 초기화, 버전 표기를 담는다.
// 계정·로그인·결제 설정은 MVP 밖(#6 담당)이라 다루지 않는다.
import Phaser from 'phaser';
import { drawFieldCharacter } from './art-character-pixel';

const FONT = '"Arial Rounded MT Bold", "Noto Sans KR", sans-serif';
const INK = '#3b2531';
const MUTED = '#7b5140';
const CREAM = 0xfff1c6;
const GOLD = 0xf6d995;
const BORDER = 0x3b2531;
const BROWN = 0x8e5136;
const GREEN = 0x5e9a67;
const RED = 0xc95746;

type ToggleKey = 'bgm' | 'sfx' | 'vibration';

export type SettingsDrawerHooks = {
  toggles?: Partial<Record<ToggleKey, boolean>>;
  onHome?: () => void;
  onTutorial?: () => void;
  onReset?: () => void;
  onToggle?: (key: ToggleKey, value: boolean) => void;
  onSfx?: (event: 'tap' | 'error') => void;
};

class SettingsDrawerScene extends Phaser.Scene {
  constructor(private readonly hooks: SettingsDrawerHooks = {}) { super('settings-drawer-a'); }

  private toggles: Record<ToggleKey, boolean> = { bgm: true, sfx: true, vibration: false };
  private toggleParts = new Map<ToggleKey, { rail: Phaser.GameObjects.Rectangle; knob: Phaser.GameObjects.Rectangle; state: Phaser.GameObjects.Text }>();
  private toast!: Phaser.GameObjects.Text;
  private confirmObjects: Phaser.GameObjects.GameObject[] = [];

  create() {
    this.toggles = { ...this.toggles, ...this.hooks.toggles };
    this.cameras.main.setBackgroundColor('#c78452');
    this.drawBackdrop();

    // 헤더
    this.add.rectangle(195, 30, 390, 60, CREAM).setStrokeStyle(4, BORDER).setDepth(8);
    this.add.rectangle(66, 30, 96, 24, BROWN).setStrokeStyle(2, BORDER).setDepth(9);
    this.add.text(66, 30, 'SETTINGS', { fontFamily: FONT, fontSize: '11px', color: '#fff1c6', fontStyle: 'bold' }).setOrigin(0.5).setDepth(10);
    this.add.text(126, 22, '공방 관리 서랍', { fontFamily: FONT, fontSize: '13px', color: INK, fontStyle: 'bold' }).setDepth(10);
    this.add.text(126, 40, '설정 화면 · A안', { fontFamily: FONT, fontSize: '9px', color: MUTED }).setDepth(10);
    const homeButton = this.add.rectangle(344, 30, 76, 30, GOLD).setStrokeStyle(2, BORDER).setInteractive({ useHandCursor: true }).setDepth(9);
    this.add.text(344, 30, '← HOME', { fontFamily: FONT, fontSize: '10px', color: INK, fontStyle: 'bold' }).setOrigin(0.5).setDepth(10);
    homeButton.on('pointerdown', () => { this.hooks.onSfx?.('tap'); this.hooks.onHome ? this.hooks.onHome() : this.showToast('Garage 홈으로 돌아갑니다. (데모)'); });

    // 서랍장 프레임: 정비사가 서랍장을 관리하는 장면
    this.add.rectangle(195, 420, 358, 610, BROWN).setStrokeStyle(5, BORDER).setDepth(1);
    this.add.rectangle(195, 132, 300, 26, 0x6e3f28).setStrokeStyle(3, BORDER).setDepth(2);
    this.add.text(195, 132, '두리 공방 · 관리 서랍장', { fontFamily: FONT, fontSize: '10px', color: '#fff1c6', fontStyle: 'bold' }).setOrigin(0.5).setDepth(3);
    drawFieldCharacter(this, 348, 786, '정비사', 3, 6);

    // 사운드 서랍
    this.drawDrawer(206, '소리 서랍 · SOUND');
    this.drawToggleRow('bgm', 254, '배경음악', '포근한 Garage 칩튠 루프');
    this.drawToggleRow('sfx', 312, '효과음', '공방 조작 피드백 소리');
    this.drawToggleRow('vibration', 370, '진동', '머지·장착 순간의 짧은 진동');

    // 도움말 서랍
    this.drawDrawer(430, '도움말 서랍 · HELP');
    const tutorialButton = this.add.rectangle(195, 478, 318, 44, GOLD).setStrokeStyle(3, BORDER).setInteractive({ useHandCursor: true }).setDepth(3);
    this.add.text(48, 468, '튜토리얼 다시 보기', { fontFamily: FONT, fontSize: '12px', color: INK, fontStyle: 'bold' }).setDepth(4);
    this.add.text(330, 478, '↺', { fontFamily: FONT, fontSize: '16px', color: MUTED, fontStyle: 'bold' }).setOrigin(0.5).setDepth(4);
    this.add.text(48, 486, '첫 주문 안내를 처음부터 다시 표시합니다', { fontFamily: FONT, fontSize: '9px', color: MUTED }).setDepth(4);
    tutorialButton.on('pointerdown', () => { this.hooks.onSfx?.('tap'); this.hooks.onTutorial?.(); this.showToast('다음 작업 화면부터 첫 플레이 안내를 다시 표시합니다.'); });

    // 데이터 서랍: 초기화는 위험 동작이라 색과 문구로 구분하고 2단계 확인을 거친다
    this.drawDrawer(538, '기록 서랍 · DATA');
    const resetButton = this.add.rectangle(195, 586, 318, 44, 0xf3d7c8).setStrokeStyle(3, RED).setInteractive({ useHandCursor: true }).setDepth(3);
    this.add.text(48, 576, '저장 데이터 초기화', { fontFamily: FONT, fontSize: '12px', color: '#a14a38', fontStyle: 'bold' }).setDepth(4);
    this.add.text(48, 594, '보드·주문·코인·성장 기록을 모두 지웁니다', { fontFamily: FONT, fontSize: '9px', color: MUTED }).setDepth(4);
    this.add.text(330, 586, '⚠', { fontFamily: FONT, fontSize: '15px', color: '#a14a38' }).setOrigin(0.5).setDepth(4);
    resetButton.on('pointerdown', () => this.openResetConfirm());

    // 버전·문의
    this.add.text(195, 660, 'Dream Bike Garage Lab · v0.1.0-lab', { fontFamily: FONT, fontSize: '9px', color: '#ffe6a8' }).setOrigin(0.5).setDepth(3);
    this.add.text(195, 676, '문의: 공방 게시판 (데모 표기)', { fontFamily: FONT, fontSize: '9px', color: '#ffe6a8', fontStyle: 'bold' }).setOrigin(0.5).setDepth(3).setAlpha(0.85);

    this.toast = this.add.text(195, 716, '서랍을 열어 공방 설정을 조절해 보세요.', { fontFamily: FONT, fontSize: '10px', color: '#fff1c6', fontStyle: 'bold', align: 'center', wordWrap: { width: 340 } }).setOrigin(0.5, 0).setDepth(10);
  }

  private drawBackdrop() {
    this.add.rectangle(195, 300, 390, 600, 0xc78452).setDepth(0);
    this.add.rectangle(195, 705, 390, 210, 0xa9683f).setDepth(0);
    for (let y = 626; y < 810; y += 26) this.add.rectangle(195, y, 390, 2, 0x8a5231, 0.5).setDepth(0);
    for (let x = 24; x < 390; x += 52) this.add.rectangle(x, 300, 2, 600, 0xb37246, 0.35).setDepth(0);
  }

  // 서랍 한 칸: 크림 패널 + 손잡이 라벨
  private drawDrawer(labelY: number, label: string) {
    const height = labelY === 206 ? 214 : 100;
    const centerY = labelY + 12 + height / 2;
    this.add.rectangle(195, centerY, 334, height, CREAM).setStrokeStyle(4, BORDER).setDepth(2);
    this.add.rectangle(112, labelY + 10, 168, 20, 0x6e3f28).setDepth(3);
    this.add.text(34, labelY + 3, label, { fontFamily: FONT, fontSize: '9px', color: '#fff1c6', fontStyle: 'bold' }).setDepth(4);
    this.add.rectangle(330, centerY, 10, 26, 0x6e3f28).setStrokeStyle(2, BORDER).setDepth(3);
  }

  // 나무 스위치 토글: ON은 초록·오른쪽, OFF는 회갈색·왼쪽
  private drawToggleRow(key: ToggleKey, y: number, name: string, description: string) {
    this.add.text(48, y - 10, name, { fontFamily: FONT, fontSize: '12px', color: INK, fontStyle: 'bold' }).setDepth(4);
    this.add.text(48, y + 8, description, { fontFamily: FONT, fontSize: '9px', color: MUTED }).setDepth(4);
    const rail = this.add.rectangle(302, y, 72, 28, GOLD).setStrokeStyle(3, BORDER).setInteractive({ useHandCursor: true }).setDepth(4);
    const knob = this.add.rectangle(302, y, 26, 22, BROWN).setStrokeStyle(2, BORDER).setDepth(5);
    const state = this.add.text(302, y, '', { fontFamily: FONT, fontSize: '9px', color: '#fff1c6', fontStyle: 'bold' }).setOrigin(0.5).setDepth(6);
    this.toggleParts.set(key, { rail, knob, state });
    rail.on('pointerdown', () => {
      this.toggles[key] = !this.toggles[key];
      this.hooks.onToggle?.(key, this.toggles[key]);
      this.hooks.onSfx?.('tap');
      this.refreshToggle(key);
      this.showToast(`${name}을 ${this.toggles[key] ? '켰습니다' : '껐습니다'}. (데모 표기)`);
    });
    this.refreshToggle(key);
  }

  private refreshToggle(key: ToggleKey) {
    const parts = this.toggleParts.get(key)!;
    const on = this.toggles[key];
    parts.rail.setFillStyle(on ? 0xdff0d0 : GOLD);
    parts.rail.setStrokeStyle(3, on ? GREEN : BORDER);
    parts.knob.setFillStyle(on ? GREEN : BROWN);
    parts.knob.setPosition(on ? 322 : 282, parts.knob.y);
    parts.state.setText(on ? 'ON' : 'OFF');
    parts.state.setPosition(on ? 294 : 312, parts.state.y);
    parts.state.setColor(on ? '#3f7851' : '#7b5140');
  }

  // 데이터 초기화 2단계 확인 모달: 위험을 색·문구로 구분한다
  private openResetConfirm() {
    if (this.confirmObjects.length) return;
    const dim = this.add.rectangle(195, 405, 390, 810, 0x1d1016, 0.62).setDepth(20).setInteractive();
    const panel = this.add.rectangle(195, 396, 322, 190, CREAM).setStrokeStyle(4, RED).setDepth(21);
    const title = this.add.text(195, 330, '⚠ 정말 초기화할까요?', { fontFamily: FONT, fontSize: '14px', color: '#a14a38', fontStyle: 'bold' }).setOrigin(0.5).setDepth(22);
    const body = this.add.text(195, 380, '보드·주문·코인·성장 기록이 모두 지워지고\n첫 실행 상태로 돌아갑니다.\n이 동작은 되돌릴 수 없습니다.', { fontFamily: FONT, fontSize: '10px', color: INK, align: 'center', lineSpacing: 5 }).setOrigin(0.5).setDepth(22);
    const cancelButton = this.add.rectangle(122, 448, 128, 38, GOLD).setStrokeStyle(3, BORDER).setInteractive({ useHandCursor: true }).setDepth(22);
    const cancelText = this.add.text(122, 448, '취소', { fontFamily: FONT, fontSize: '12px', color: INK, fontStyle: 'bold' }).setOrigin(0.5).setDepth(23);
    const confirmButton = this.add.rectangle(268, 448, 128, 38, RED).setStrokeStyle(3, BORDER).setInteractive({ useHandCursor: true }).setDepth(22);
    const confirmText = this.add.text(268, 448, '초기화 실행', { fontFamily: FONT, fontSize: '12px', color: '#fff1c6', fontStyle: 'bold' }).setOrigin(0.5).setDepth(23);
    this.confirmObjects = [dim, panel, title, body, cancelButton, cancelText, confirmButton, confirmText];
    cancelButton.on('pointerdown', () => this.closeResetConfirm('초기화를 취소했습니다.'));
    confirmButton.on('pointerdown', () => { this.hooks.onSfx?.('error'); this.hooks.onReset?.(); this.closeResetConfirm('저장 데이터를 초기화했습니다. 첫 실행 상태로 시작합니다.'); });
  }

  private closeResetConfirm(message: string) {
    this.confirmObjects.forEach((object) => object.destroy());
    this.confirmObjects = [];
    this.showToast(message);
  }

  private showToast(message: string) {
    this.toast.setText(message);
  }
}

export function startSettingsDrawerPrototype(parent: string, hooks: SettingsDrawerHooks = {}) {
  return new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width: 390,
    height: 810,
    backgroundColor: '#c78452',
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    scene: new SettingsDrawerScene(hooks),
  });
}
