// 설정 화면(출시 적용): 따뜻한 픽셀 공방 관리 서랍형 (390×810)
// 공방 서랍장을 여는 메타포로 배경음악·효과음·진동 토글(나무 스위치),
// 튜토리얼 다시 보기, 2단계 확인이 있는 데이터 초기화, 버전 표기를 담는다.
// 계정·로그인·결제 설정은 MVP 밖(#6 담당)이라 다루지 않는다.
import Phaser from 'phaser';
import { drawFieldCharacter } from './art-character-pixel';
import { APP_VERSION } from '../../app-version';

const FONT = '"Arial Rounded MT Bold", "Noto Sans KR", sans-serif';
const INK = '#3b2531';
const MUTED = '#7b5140';
const CREAM = 0xfff1c6;
const GOLD = 0xf6d995;
const BORDER = 0x3b2531;
const BROWN = 0x8e5136;
const GREEN = 0x5e9a67;
const RED = 0xc95746;
// 서랍장 안쪽 제목 띠·서랍 라벨·손잡이에 쓰는 짙은 나무색
const DARK_BROWN = 0x6e3f28;

// 서랍장 세로 배치: 제목 띠 아래 서랍 3개를 같은 간격으로 쌓고, 캐릭터는 서랍장 밖 바닥에 세운다
const CHEST_TOP = 84;
const CHEST_BOTTOM = 602;
const SOUND_LABEL_Y = 134;
const SOUND_PANEL_HEIGHT = 200;
const HELP_LABEL_Y = 360;
const DATA_LABEL_Y = 470;
const SMALL_PANEL_HEIGHT = 84;
// 바닥 장면: 말풍선(안내 문구)은 왼쪽, 정비사는 오른쪽에 서서 서로 겹치지 않게 한다
const BUBBLE_X = 156;
const BUBBLE_Y = 712;
const BUBBLE_WIDTH = 272;
const BUBBLE_HEIGHT = 56;
const CHARACTER_X = 338;
const CHARACTER_FOOT_Y = 782;

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
    this.add.text(126, 20, '공방 관리 서랍', { fontFamily: FONT, fontSize: '13px', color: INK, fontStyle: 'bold' }).setDepth(10);
    this.add.text(126, 38, '공방 설정', { fontFamily: FONT, fontSize: '10px', color: MUTED }).setDepth(10);
    // ← 홈: 시각 크기는 76×36이지만 터치 영역은 84×46으로 넓힌다
    const homeButton = this.add.rectangle(344, 30, 76, 36, GOLD).setStrokeStyle(2, BORDER).setDepth(9)
      .setInteractive({ hitArea: new Phaser.Geom.Rectangle(-4, -5, 84, 46), hitAreaCallback: Phaser.Geom.Rectangle.Contains, useHandCursor: true });
    this.add.text(344, 30, '← 홈', { fontFamily: FONT, fontSize: '12px', color: INK, fontStyle: 'bold' }).setOrigin(0.5).setDepth(10);
    homeButton.on('pointerdown', () => { this.hooks.onSfx?.('tap'); this.hooks.onHome ? this.hooks.onHome() : this.showToast('홈으로 돌아갑니다.'); });

    // 서랍장 프레임: 바닥에 세운 관리 서랍장
    const chestHeight = CHEST_BOTTOM - CHEST_TOP;
    this.add.rectangle(195, CHEST_TOP + chestHeight / 2, 358, chestHeight, BROWN).setStrokeStyle(5, BORDER).setDepth(1);
    this.add.rectangle(195, CHEST_TOP + 21, 300, 26, DARK_BROWN).setStrokeStyle(3, BORDER).setDepth(2);
    this.add.text(195, CHEST_TOP + 21, '두리 공방 · 관리 서랍장', { fontFamily: FONT, fontSize: '11px', color: '#fff1c6', fontStyle: 'bold' }).setOrigin(0.5).setDepth(3);

    // 사운드 서랍
    this.drawDrawer(SOUND_LABEL_Y, SOUND_PANEL_HEIGHT, '소리 서랍 · SOUND');
    this.drawToggleRow('bgm', SOUND_LABEL_Y + 48, '배경음악', '포근한 Garage 칩튠 루프');
    this.drawToggleRow('sfx', SOUND_LABEL_Y + 106, '효과음', '공방 조작 피드백 소리');
    this.drawToggleRow('vibration', SOUND_LABEL_Y + 164, '진동', '머지·장착 순간의 짧은 진동');

    // 도움말 서랍
    this.drawDrawer(HELP_LABEL_Y, SMALL_PANEL_HEIGHT, '도움말 서랍 · HELP');
    const tutorialY = HELP_LABEL_Y + 48;
    const tutorialButton = this.add.rectangle(195, tutorialY, 318, 44, GOLD).setStrokeStyle(3, BORDER).setInteractive({ useHandCursor: true }).setDepth(3);
    this.add.text(48, tutorialY - 11, '튜토리얼 다시 보기', { fontFamily: FONT, fontSize: '12px', color: INK, fontStyle: 'bold' }).setDepth(4);
    this.add.text(330, tutorialY, '↺', { fontFamily: FONT, fontSize: '16px', color: MUTED, fontStyle: 'bold' }).setOrigin(0.5).setDepth(4);
    this.add.text(48, tutorialY + 7, '첫 주문 안내를 처음부터 다시 표시합니다', { fontFamily: FONT, fontSize: '10px', color: MUTED }).setDepth(4);
    tutorialButton.on('pointerdown', () => { this.hooks.onSfx?.('tap'); this.hooks.onTutorial?.(); this.showToast('다음 작업 화면부터 첫 플레이 안내를 다시 표시합니다.'); });

    // 데이터 서랍: 초기화는 위험 동작이라 색과 문구로 구분하고 2단계 확인을 거친다
    this.drawDrawer(DATA_LABEL_Y, SMALL_PANEL_HEIGHT, '기록 서랍 · DATA');
    const resetY = DATA_LABEL_Y + 48;
    const resetButton = this.add.rectangle(195, resetY, 318, 44, 0xf3d7c8).setStrokeStyle(3, RED).setInteractive({ useHandCursor: true }).setDepth(3);
    this.add.text(48, resetY - 11, '저장 데이터 초기화', { fontFamily: FONT, fontSize: '12px', color: '#a14a38', fontStyle: 'bold' }).setDepth(4);
    this.add.text(48, resetY + 7, '보드·주문·코인·성장 기록을 모두 지웁니다', { fontFamily: FONT, fontSize: '10px', color: MUTED }).setDepth(4);
    this.add.text(330, resetY, '⚠', { fontFamily: FONT, fontSize: '15px', color: '#a14a38' }).setOrigin(0.5).setDepth(4);
    resetButton.on('pointerdown', () => this.openResetConfirm());

    // 버전 표기 (서랍장 맨 아래 칸)
    this.add.text(195, CHEST_BOTTOM - 18, `Dream Bike Garage · v${APP_VERSION}`, { fontFamily: FONT, fontSize: '10px', color: '#ffe6a8' }).setOrigin(0.5).setDepth(3);

    // 바닥 장면: 정비사 말풍선에 안내 문구를 띄운다 (서랍장·캐릭터와 겹치지 않음)
    this.add.rectangle(BUBBLE_X + 3, BUBBLE_Y + 4, BUBBLE_WIDTH, BUBBLE_HEIGHT, BORDER).setDepth(8);
    this.add.rectangle(BUBBLE_X, BUBBLE_Y, BUBBLE_WIDTH, BUBBLE_HEIGHT, CREAM).setStrokeStyle(3, BORDER).setDepth(9);
    const bubbleRight = BUBBLE_X + BUBBLE_WIDTH / 2;
    this.add.triangle(0, 0, bubbleRight - 2, BUBBLE_Y - 8, bubbleRight - 2, BUBBLE_Y + 8, bubbleRight + 10, BUBBLE_Y, CREAM).setOrigin(0).setStrokeStyle(3, BORDER).setDepth(9);
    this.add.rectangle(bubbleRight - 1, BUBBLE_Y, 4, 12, CREAM).setDepth(10);
    this.toast = this.add.text(BUBBLE_X, BUBBLE_Y, '서랍을 열어 공방 설정을 조절해 보세요.', { fontFamily: FONT, fontSize: '11px', color: INK, fontStyle: 'bold', align: 'center', wordWrap: { width: BUBBLE_WIDTH - 24 } }).setOrigin(0.5).setDepth(11);
    drawFieldCharacter(this, CHARACTER_X, CHARACTER_FOOT_Y, '정비사', 3, 6);
  }

  private drawBackdrop() {
    this.add.rectangle(195, 300, 390, 600, 0xc78452).setDepth(0);
    this.add.rectangle(195, 705, 390, 210, 0xa9683f).setDepth(0);
    for (let y = 626; y < 810; y += 26) this.add.rectangle(195, y, 390, 2, 0x8a5231, 0.5).setDepth(0);
    for (let x = 24; x < 390; x += 52) this.add.rectangle(x, 300, 2, 600, 0xb37246, 0.35).setDepth(0);
  }

  // 서랍 한 칸: 라벨 탭 + 크림 패널 + 하단 중앙 손잡이 (토글·버튼과 겹치지 않는 위치)
  private drawDrawer(labelY: number, height: number, label: string) {
    const top = labelY + 12;
    this.add.rectangle(195, top + height / 2, 334, height, CREAM).setStrokeStyle(4, BORDER).setDepth(2);
    this.add.rectangle(112, labelY + 10, 168, 20, DARK_BROWN).setDepth(3);
    this.add.text(34, labelY + 3, label, { fontFamily: FONT, fontSize: '10px', color: '#fff1c6', fontStyle: 'bold' }).setDepth(4);
    this.add.rectangle(195, top + height - 10, 44, 8, DARK_BROWN).setStrokeStyle(2, BORDER).setDepth(3);
  }

  // 나무 스위치 토글: ON은 초록·오른쪽, OFF는 회갈색·왼쪽
  private drawToggleRow(key: ToggleKey, y: number, name: string, description: string) {
    this.add.text(48, y - 11, name, { fontFamily: FONT, fontSize: '12px', color: INK, fontStyle: 'bold' }).setDepth(4);
    this.add.text(48, y + 7, description, { fontFamily: FONT, fontSize: '10px', color: MUTED }).setDepth(4);
    // 토글 레일: 시각 72×28, 터치 영역은 세로로 넓혀 44px 이상
    const rail = this.add.rectangle(302, y, 72, 28, GOLD).setStrokeStyle(3, BORDER).setDepth(4)
      .setInteractive({ hitArea: new Phaser.Geom.Rectangle(-4, -9, 80, 46), hitAreaCallback: Phaser.Geom.Rectangle.Contains, useHandCursor: true });
    const knob = this.add.rectangle(302, y, 26, 22, BROWN).setStrokeStyle(2, BORDER).setDepth(5);
    const state = this.add.text(302, y, '', { fontFamily: FONT, fontSize: '10px', color: '#fff1c6', fontStyle: 'bold' }).setOrigin(0.5).setDepth(6);
    this.toggleParts.set(key, { rail, knob, state });
    rail.on('pointerdown', () => {
      this.toggles[key] = !this.toggles[key];
      this.hooks.onToggle?.(key, this.toggles[key]);
      this.hooks.onSfx?.('tap');
      this.refreshToggle(key);
      this.showToast(`${name}을 ${this.toggles[key] ? '켰습니다' : '껐습니다'}.`);
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
    const panel = this.add.rectangle(195, 396, 322, 196, CREAM).setStrokeStyle(4, RED).setDepth(21);
    const title = this.add.text(195, 328, '⚠ 정말 초기화할까요?', { fontFamily: FONT, fontSize: '14px', color: '#a14a38', fontStyle: 'bold' }).setOrigin(0.5).setDepth(22);
    const body = this.add.text(195, 382, '보드·주문·코인·성장 기록이 모두 지워지고\n첫 실행 상태로 돌아갑니다.\n이 동작은 되돌릴 수 없습니다.', { fontFamily: FONT, fontSize: '11px', color: INK, align: 'center', lineSpacing: 5 }).setOrigin(0.5).setDepth(22);
    const cancelButton = this.add.rectangle(122, 452, 128, 44, GOLD).setStrokeStyle(3, BORDER).setInteractive({ useHandCursor: true }).setDepth(22);
    const cancelText = this.add.text(122, 452, '취소', { fontFamily: FONT, fontSize: '12px', color: INK, fontStyle: 'bold' }).setOrigin(0.5).setDepth(23);
    const confirmButton = this.add.rectangle(268, 452, 128, 44, RED).setStrokeStyle(3, BORDER).setInteractive({ useHandCursor: true }).setDepth(22);
    const confirmText = this.add.text(268, 452, '초기화 실행', { fontFamily: FONT, fontSize: '12px', color: '#fff1c6', fontStyle: 'bold' }).setOrigin(0.5).setDepth(23);
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
