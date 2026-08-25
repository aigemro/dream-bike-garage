import Phaser from 'phaser';
import { drawDreamBike, drawDreamBikeMini } from './home-design-bike';
import type { BikePalette } from './home-design-bike';

// B안: 블루아워 정비소 Garage
// 해질녘 도시의 자전거 정비소를 무대로, 어두운 청회색 실내 + 따뜻한 앰버 작업등 조명으로
// A안(따뜻한 생활형 픽셀 Garage)과 같은 정보 구조를 다른 시각 언어로 비교 검증합니다.
// depth 규칙: 배경 0~9 / 중앙 무대 10~19 / UI 패널 20~23 / 버튼·최상위 24+

const C = {
  night: 0x151a29, // 기본 배경(짙은 남색)
  wall: 0x2a3247, // 청회색 벽
  wallLine: 0x1c2338, // 벽돌 줄눈 힌트
  floor: 0x23272f, // 어두운 콘크리트 바닥
  floorLine: 0x10141d, // 바닥 원근 라인
  panel: 0x1c2437, // 반투명 다크 패널(어두운 남색)
  line: 0xe9c98a, // 가는 밝은 외곽선(골드)
  amber: 0xf0a940, // 앰버 포인트
  amberHi: 0xffd27d, // 앰버 하이라이트
  glow: 0xffd9a0, // 스포트라이트 광
  wood: 0x6b4a33, // 나무 작업대
  woodDark: 0x46301f, // 작업대 다리
  steel: 0x8fa0c5, // 금속 밝은 부위
  sil: 0x161c2e, // 공구 실루엣
  track: 0x101625, // 게이지 트랙
  green: 0x74c98a, // 에너지 게이지
};

// 어두운 배경과 강하게 대비되는 레드 오렌지 프레임 팔레트
const BIKE_PALETTE: BikePalette = {
  frame: 0xf25430,
  frameShadow: 0x9e2f10,
  tire: 0x14181f,
  rim: 0xd8deeb,
  spoke: 0x8b96b0,
  metal: 0xc9d1e2,
  saddle: 0x4a3327,
  accent: 0xffc766,
};

export class DuskWorkshopGarageScene extends Phaser.Scene {
  private playing = false;
  private toast = '오늘의 주문을 확인하고 작업을 시작해 보세요.';

  constructor() { super('home-design-dusk-workshop'); }
  create() { this.render(); }

  private label(x: number, y: number, value: string, size = 12, color = '#ffeccb', bold = false) {
    return this.add.text(x, y, value, {
      fontFamily: '"Arial Rounded MT Bold", "Noto Sans KR", sans-serif', fontSize: `${size}px`,
      color, fontStyle: bold ? 'bold' : 'normal', stroke: bold ? '#0c101c' : undefined, strokeThickness: bold ? 1 : 0,
    });
  }

  // 반투명 다크 패널 + 가는 밝은 외곽선(금속 명판 느낌)
  private panel(x: number, y: number, w: number, h: number, depth: number, alpha = 0.85) {
    return this.add.rectangle(x, y, w, h, C.panel, alpha).setStrokeStyle(1.5, C.line, 0.9).setDepth(depth);
  }

  private button(x: number, y: number, w: number, h: number, text: string, action: () => void, primary = false) {
    this.add.rectangle(x + 2, y + 4, w, h, 0x05070c, 0.55).setDepth(24); // 버튼 그림자
    const box = this.add.rectangle(x, y, w, h, primary ? C.amber : C.panel, primary ? 1 : 0.88)
      .setStrokeStyle(primary ? 2 : 1.5, primary ? C.amberHi : C.line, 0.95)
      .setDepth(25).setInteractive({ useHandCursor: true }).on('pointerdown', action);
    if (primary) {
      // 상단 하이라이트 밴드로 앰버 그라데이션 느낌 표현
      this.add.rectangle(x, y - h / 2 + 6, w - 10, 7, C.amberHi, 0.85).setDepth(26);
    }
    // 텍스트 라벨에도 같은 핸들러를 걸어 터치 명중률 확보
    this.label(x, y, text, primary ? 16 : 10, primary ? '#3a2408' : '#ffeccb', true)
      .setOrigin(0.5).setAlign('center').setDepth(27)
      .setInteractive({ useHandCursor: true }).on('pointerdown', action);
    return box;
  }

  private render() {
    this.children.removeAll();
    this.add.rectangle(195, 405, 390, 810, C.night);
    this.playing ? this.renderPlayPreview() : this.renderGarageHome();
  }

  private renderGarageHome() {
    this.renderWorkshopBackdrop();
    this.renderTopBar();

    // 상단 주문 카드 (A안과 동일 데이터)
    this.panel(195, 125, 238, 60, 20);
    this.label(88, 101, 'TODAY\'S ORDER', 9, '#ffc766', true).setDepth(21);
    this.label(88, 119, '통학용 어반 바이크', 14, '#ffeccb', true).setDepth(21);
    this.label(88, 140, '진행 2 / 4  ·  보상 1,000', 10, '#e9c98a', true).setDepth(21);
    drawDreamBikeMini(this, 282, 127, 0.5, 0xf25430, 0xaab4cc, 21);

    // 좌측 보조 버튼: 이벤트·랭킹
    this.button(38, 205, 54, 48, 'EVENT\n3', () => this.notify('이벤트 준비 중'));
    this.button(38, 263, 54, 48, 'RANK\n#18', () => this.notify('랭킹 준비 중'));
    // 우측 보조 버튼: 투어·조립·스테이터스
    this.button(352, 205, 54, 48, 'TOUR\nD2', () => this.notify('투어 준비 중'));
    this.button(352, 263, 54, 48, '조립\n2/4', () => this.notify('조립 현황'));
    this.button(352, 321, 54, 48, 'STATUS\nLv.12', () => this.notify('견습 정비사 Lv.12'));

    // 중앙 무대: 스포트라이트 + 정비 스탠드 위 대표 드림 바이크
    this.renderCenterStage();

    // 중앙 하단: 수집률과 다음 해금 목표
    this.panel(195, 478, 222, 72, 20);
    this.label(98, 454, 'COLLECTION', 8, '#ffc766', true).setDepth(21);
    this.label(98, 471, '8 / 24', 17, '#ffeccb', true).setDepth(21);
    this.label(192, 454, 'NEXT GOAL', 8, '#ffc766', true).setDepth(21);
    this.label(192, 471, 'TRAIL MTB', 12, '#ffeccb', true).setDepth(21);
    this.label(192, 490, '주문 2건 남음', 9, '#ff9d6f', true).setDepth(21);

    // Garage 성장 게이지 33%
    this.add.rectangle(195, 526, 212, 10, C.track).setStrokeStyle(1, C.line, 0.5).setDepth(20);
    this.add.rectangle(125, 526, 72, 10, C.amber).setDepth(21);
    this.label(195, 544, 'Garage 성장 33%', 9, '#e9c98a', true).setOrigin(0.5).setDepth(21);

    // 토스트 영역
    this.panel(195, 592, 310, 50, 21);
    this.label(195, 592, this.toast, 10, '#ffeccb', true).setOrigin(0.5).setDepth(22);

    // 하단 바: 프로필 / PLAY / 자전거 도감
    this.panel(195, 744, 366, 82, 23, 0.92);
    this.button(67, 741, 80, 48, '프로필\nLv.12', () => this.notify('견습 정비사 프로필'));
    this.button(195, 738, 150, 58, '▶  PLAY', () => { this.playing = true; this.render(); }, true);
    this.button(323, 741, 80, 48, '자전거\n8/24', () => this.notify('자전거 도감'));
    this.label(195, 793, 'DREAM BIKE GARAGE · DUSK WORKSHOP HOME', 8, '#ffc766', true).setOrigin(0.5).setDepth(27);
  }

  // 블루아워 정비소 배경: 창밖 노을·도시 실루엣 + 실내 벽·바닥·소품
  private renderWorkshopBackdrop() {
    // 벽: 어두운 청회색 + 벽돌 줄눈 힌트
    this.add.rectangle(195, 274, 390, 548, C.wall);
    for (let row = 0; row < 5; row += 1) {
      const y = 336 + row * 42;
      this.add.line(0, 0, 0, y, 390, y, C.wallLine, 0.35).setOrigin(0).setDepth(1);
      for (let x = (row % 2) * 29 + 12; x < 390; x += 58) {
        this.add.line(0, 0, x, y, x, y + 42, C.wallLine, 0.18).setOrigin(0).setDepth(1);
      }
    }

    // 바닥: 어두운 콘크리트 + 원근 라인 + 작업등이 남기는 은은한 온기
    this.add.rectangle(195, 679, 390, 262, C.floor);
    for (let y = 588; y < 810; y += 44) this.add.line(0, 0, 0, y, 390, y, C.floorLine, 0.5).setOrigin(0).setDepth(1);
    for (let x = 16; x < 390; x += 58) this.add.line(0, 0, x, 556, x - 16, 806, C.floorLine, 0.3).setOrigin(0).setDepth(1);
    this.add.ellipse(195, 645, 300, 84, C.amber, 0.05).setDepth(1);

    // 창문: 깊은 청색 → 노을로 이어지는 하늘 그라데이션
    this.add.rectangle(195, 240, 216, 156, 0x39415c).setStrokeStyle(3, 0x11162a).setDepth(2);
    this.add.rectangle(195, 193, 196, 42, 0x18244e).setDepth(3);
    this.add.rectangle(195, 230, 196, 32, 0x3b3a70).setDepth(3);
    this.add.rectangle(195, 259, 196, 26, 0x84486d).setDepth(3);
    this.add.rectangle(195, 282, 196, 20, 0xc86a4f).setDepth(3);
    this.add.rectangle(195, 300, 196, 16, 0xe08a54).setDepth(3);
    this.add.circle(232, 268, 19, 0xffc06a, 0.25).setDepth(4); // 지는 해의 번짐
    this.add.circle(232, 268, 11, 0xffc06a).setDepth(4);

    // 도시 실루엣과 하나둘 켜진 창문 불빛
    const buildings: Array<[number, number, number]> = [
      [112, 26, 52], [140, 22, 34], [168, 30, 60], [199, 22, 40], [226, 26, 30], [254, 24, 48], [281, 22, 36],
    ];
    buildings.forEach(([bx, bw, bh]) => this.add.rectangle(bx, 308 - bh / 2, bw, bh, 0x11172b).setDepth(5));
    const lights: Array<[number, number]> = [
      [106, 276], [118, 290], [163, 266], [174, 284], [198, 286], [252, 278], [258, 294], [284, 292],
    ];
    lights.forEach(([lx, ly]) => this.add.rectangle(lx, ly, 4, 4, 0xffc766, 0.9).setDepth(6));

    // 창살
    this.add.rectangle(195, 240, 8, 136, 0x39415c).setDepth(7);
    this.add.rectangle(195, 240, 196, 6, 0x39415c).setDepth(7);

    // 공구 페그보드(실루엣 수준, 중앙 자전거보다 낮은 대비)
    this.add.rectangle(52, 398, 78, 170, 0x2b3350).setStrokeStyle(2, 0x1c2338).setDepth(4);
    this.label(52, 320, 'TOOLS', 8, '#8ea0c4', true).setOrigin(0.5, 0).setDepth(5);
    for (let row = 0; row < 5; row += 1) {
      for (let col = 0; col < 3; col += 1) {
        this.add.circle(30 + col * 22, 342 + row * 28, 2, 0x3d4770).setDepth(5);
      }
    }
    this.add.circle(30, 350, 7, C.sil).setDepth(6); // 스패너 머리
    this.add.rectangle(30, 372, 6, 34, C.sil).setDepth(6); // 스패너 자루
    this.add.rectangle(52, 366, 5, 26, C.sil).setDepth(6); // 드라이버 날
    this.add.rectangle(52, 386, 9, 14, 0x233050).setDepth(6); // 드라이버 손잡이
    this.add.circle(74, 352, 9, 0x2b3350).setStrokeStyle(3, C.sil).setDepth(6); // 링 스패너
    this.add.rectangle(74, 392, 7, 40, C.sil).setDepth(6); // 펌프
    this.add.rectangle(30, 428, 5, 30, C.sil).setDepth(6); // 타이어 레버 1
    this.add.rectangle(40, 428, 5, 30, C.sil).setDepth(6); // 타이어 레버 2

    // 나무 작업대(오른쪽)와 소품
    this.add.rectangle(338, 468, 92, 12, C.wood).setStrokeStyle(2, 0x21160e).setDepth(4);
    this.add.rectangle(306, 506, 8, 64, C.woodDark).setDepth(4);
    this.add.rectangle(370, 506, 8, 64, C.woodDark).setDepth(4);
    this.add.rectangle(330, 452, 34, 18, 0xb03a2a).setStrokeStyle(2, 0x2a1611).setDepth(5); // 공구함
    this.add.rectangle(330, 441, 12, 4, 0x2a1611).setDepth(5); // 공구함 손잡이
    this.add.circle(364, 455, 7, C.steel).setStrokeStyle(2, 0x1c2338).setDepth(5); // 오일 캔
  }

  // 중앙 무대: 명판 + 원뿔형 스포트라이트 + 정비 스탠드 위 드림 바이크
  private renderCenterStage() {
    // 스포트라이트: 위에서 내려오는 원뿔형 광 (겹친 삼각형으로 농도 표현)
    const cone = this.add.graphics().setDepth(10);
    cone.fillStyle(C.glow, 0.09).fillTriangle(195, 140, 75, 414, 315, 414);
    cone.fillStyle(C.glow, 0.07).fillTriangle(195, 140, 130, 414, 260, 414);
    this.add.ellipse(195, 412, 250, 22, C.glow, 0.1).setDepth(10);

    // 전시 플랫폼과 바닥 그림자
    this.add.rectangle(195, 415, 252, 16, 0x343d56).setStrokeStyle(2, C.steel, 0.5).setDepth(10);
    this.add.ellipse(195, 408, 220, 18, 0x05070c, 0.5).setDepth(11);

    // 벽걸이 금속 명판: 걸이 줄 + 다크 패널 + 타이틀
    this.add.line(0, 0, 100, 157, 100, 173, C.steel, 0.6).setOrigin(0).setDepth(12);
    this.add.line(0, 0, 236, 157, 236, 173, C.steel, 0.6).setOrigin(0).setDepth(12);
    this.add.rectangle(168, 204, 188, 62, C.panel, 0.85).setStrokeStyle(1.5, C.line, 0.9).setDepth(12);
    this.label(82, 183, 'MY LITTLE GARAGE', 9, '#ffc766', true).setDepth(13);
    this.label(82, 200, '나의 드림 로드바이크', 17, '#ffeccb', true).setDepth(13);
    this.label(82, 224, '블루아워, 작업등 아래 조립 중', 9, '#cdd8ef', true).setDepth(13); // 어두운 명판 위 대비 확보

    // 정비 스탠드(워크스탠드): 두 다리 + 가로대 + 클램프
    const stand = this.add.graphics().setDepth(14);
    stand.lineStyle(5, 0x6b7488).lineBetween(160, 410, 185, 362).lineBetween(228, 410, 185, 362);
    stand.lineStyle(3, 0x6b7488).lineBetween(160, 410, 228, 410);
    stand.fillStyle(C.amber).fillCircle(185, 362, 6);

    // 대표 드림 바이크: 화면에서 가장 큰 오브젝트 (공용 모듈 사용, 로드바이크)
    drawDreamBike(this, 195, 352, 1, BIKE_PALETTE, 15, { style: 'road' });
  }

  private renderTopBar() {
    this.panel(195, 39, 366, 54, 22, 0.9);
    this.label(28, 20, 'ENERGY', 8, '#ffc766', true).setDepth(23);
    this.label(28, 37, '72 / 100', 14, '#9fd8a8', true).setDepth(23);
    this.add.rectangle(112, 43, 72, 8, C.track).setDepth(23).setOrigin(0, 0.5);
    this.add.rectangle(112, 43, 52, 8, C.green).setDepth(24).setOrigin(0, 0.5);
    this.label(274, 20, 'COIN', 8, '#ffc766', true).setDepth(23);
    this.label(274, 37, '2,480', 14, '#ffd27d', true).setDepth(23);
  }

  // 축약 플레이 미리보기: 주문 헤더 + 5x4 머지 보드 요약 (A안과 동일 데이터)
  private renderPlayPreview() {
    this.add.rectangle(195, 405, 390, 810, C.wall);
    this.add.ellipse(195, 360, 360, 430, C.glow, 0.05).setDepth(1); // 작업등의 은은한 광
    this.renderTopBar();
    this.button(55, 102, 82, 42, '← HOME', () => { this.playing = false; this.toast = 'Garage로 돌아왔습니다. 결과가 이곳에 쌓입니다.'; this.render(); });
    this.panel(234, 102, 272, 48, 20);
    this.label(112, 87, 'ORDER #01 · 통학용 어반 바이크', 10, '#ffeccb', true).setDepth(21);
    this.label(112, 105, '조립 진행 2 / 4 · 보상 1,000', 9, '#e9c98a', true).setDepth(21);

    // 머지 보드: 다크 강판 위 부품 슬롯
    this.add.rectangle(195, 380, 340, 492, 0x1b2236).setStrokeStyle(2, 0x51608a).setDepth(10);
    this.label(42, 154, 'MERGE WORKBENCH', 11, '#ffc766', true).setDepth(11);
    const parts = [1, 1, 2, 0, 3, 0, 2, 0, 1, 0, 0, 3, 0, 2, 0, 1, 0, 0, 2, 0];
    const levelColors = [0, 0x6fc27a, 0x5f9fe8, 0xef6a4d]; // 레벨 1·2·3 색 구분
    parts.forEach((level, i) => {
      const x = 64 + (i % 5) * 66;
      const y = 207 + Math.floor(i / 5) * 83;
      this.add.rectangle(x, y, 56, 68, level ? 0x33405f : 0x141b2d)
        .setStrokeStyle(2, level ? 0x8195c4 : 0x2b3452).setDepth(11);
      if (level) {
        this.add.circle(x, y - 7, 11, levelColors[level]).setStrokeStyle(2, 0x0d1120).setDepth(12);
        this.label(x, y + 16, `Lv.${level}`, 9, '#ffeccb', true).setOrigin(0.5).setDepth(12);
      }
    });

    this.panel(195, 642, 340, 64, 20);
    this.label(195, 642, 'PLAY 화면은 기능 검증용 축약 미리보기입니다.', 10, '#ffeccb', true).setOrigin(0.5).setDepth(21);
    this.button(195, 731, 170, 58, '부품 주문하기', () => { this.toast = '부품이 배송되었습니다.'; }, true);
    this.label(195, 789, '완료 후 HOME으로 돌아가 Garage 성장을 확인', 9, '#aeb9d4', true).setOrigin(0.5).setDepth(21);
  }

  // 토스트 문구 갱신 후 재렌더
  private notify(message: string) { this.toast = message; this.render(); }
}
