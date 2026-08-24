import Phaser from 'phaser';

// 캐릭터 A안 세밀화 모듈.
// 기존의 단순 도형 조합 대신 픽셀 매트릭스(문자 지도)로 스프라이트를 정의해
// 역할별 의상 디테일(앞치마·공구 벨트 / 조끼·열쇠 배지 / 캡·주문 카드)과
// 2톤 음영, 감정별 눈썹·눈·입 변화를 표현합니다.
// 홈 화면 A안의 크림·브라운·골드·그린 팔레트와 굵은 잉크 외곽선은 그대로 유지합니다.

export type PixelCharacterRole = '정비사' | '점장' | '고객';
export type PixelCharacterEmotion = '기본' | '기쁨' | '고민';

type Legend = Record<string, number>;

// 모든 역할이 공유하는 기본 색: 잉크 외곽선, 피부 2톤, 홍조, 눈, 하이라이트
const BASE_LEGEND: Legend = {
  K: 0x3b2531, // 잉크 외곽선
  S: 0xeeb07c, // 피부
  T: 0xd18a54, // 피부 음영
  B: 0xe58a66, // 홍조
  E: 0x2c1c26, // 눈동자
  W: 0xfff8df, // 하이라이트·이빨·밑창
};

// 정비사: 갈색 머리 + 크림 반다나, 초록 작업복, 크림 앞치마(렌치 포켓), 가죽 공구 벨트
const MECHANIC_LEGEND: Legend = {
  ...BASE_LEGEND,
  H: 0x77492f, h: 0x95613e, // 머리 + 하이라이트
  N: 0xfff1c6, n: 0xe8c98d, // 반다나 + 음영
  C: 0x5e9a67, c: 0x477a50, // 작업복 + 음영
  A: 0xf9e6b3, a: 0xe3bd74, // 앞치마 + 음영
  L: 0x8e5136, l: 0x66391f, // 공구 벨트 + 음영
  G: 0xf4b84a, // 벨트 버클
  M: 0xc2bcae, m: 0x8d8779, // 렌치 금속 + 음영
  P: 0x6b4534, p: 0x53341f, // 작업 바지 + 음영
  D: 0x352c3c, d: 0x4c4258, // 작업 부츠 + 하이라이트
};

// 점장: 회갈색 머리·콧수염, 짙은 조끼 + 크림 셔츠, 금색 열쇠 배지, 슬랙스
const MANAGER_LEGEND: Legend = {
  ...BASE_LEGEND,
  H: 0x8d7a68, h: 0xa8988a, // 회갈색 머리 + 하이라이트
  V: 0x573044, v: 0x41202f, // 조끼 + 음영
  A: 0xf9e6b3, a: 0xe3bd74, // 셔츠 + 음영
  G: 0xf4b84a, // 열쇠 배지·열쇠
  P: 0x4a3542, p: 0x38222f, // 슬랙스 + 음영
  L: 0x6b4226, l: 0x4d2c15, // 가죽 구두 + 음영
};

// 고객: 빨간 캡 + 짙은 앞머리, 파란 재킷(지퍼), 주문 카드, 청바지 + 운동화
const CUSTOMER_LEGEND: Legend = {
  ...BASE_LEGEND,
  R: 0xc95746, r: 0xa63f31, // 캡 + 캡 챙 음영
  H: 0x4f3527, // 앞머리
  C: 0x4e8092, c: 0x3a6274, // 재킷 + 음영
  A: 0xf9e6b3, a: 0xe3bd74, // 주문 카드 + 음영
  J: 0x3f4a63, j: 0x2e3850, // 청바지 + 음영
  D: 0x352c3c, // 운동화 어퍼
};

// ─── 필드 스프라이트 (약 28×38, 3등신) ───────────────────────────────

const MECHANIC_FIELD = [
  '...........KKKKKK...........',
  '.........KKHHHHHHKK.........',
  '........KHHhhHHHHHHK........',
  '.......KHHhhhHHHHHHHK.......',
  '.......KHHhhHHHHHHHHK.......',
  '.......KNNNNNNNNNNNNK.......',
  '.......KnNNNNNNNNNNnK.......',
  '.......KSSSSSSSSSSSSK.......',
  '.......KSEESSSSSSEESK.......',
  '.......KSEWSSSSSSEWSK.......',
  '.......KBBSSSTTSSSBBK.......',
  '.......KSSSSSKKSSSSSK.......',
  '........KSSSSSSSSSSK........',
  '.........KSSSSSSSSK.........',
  '..........KKTSSTKK..........',
  '......KKCCCCKSSKCCCCKK......',
  '.....KCCCCCKAAAAKCCCCCK.....',
  '.....KCCCCKAAAAAAKCCCCK.....',
  '....KCKCCCKAAAAAAKCCCKCK....',
  '....KCKCCKAAAAM.MAKCCKCK....',
  '....KCKCCKAaAAMMMAKCCKCK....',
  '....KCKCCKAAAAAMmAKCCKCK....',
  '....KSKCCKAAKKKKKAKCCKSK....',
  '....KSKCCKAAKaaaKAKCCKSK....',
  '......KLLLLLLGGLLLLLLK......',
  '......KLlLLLlGGlLLLlLK......',
  '......KCKAAAAAAAAAAKCK......',
  '......KCKAaAAAAAAaAKCK......',
  '......KKKAAAAAAAAAAKKK......',
  '.......KPPPPK..KPPPPK.......',
  '.......KPpPPK..KPPpPK.......',
  '.......KPPPPK..KPPPPK.......',
  '.......KPpPPK..KPPpPK.......',
  '.......KPPPPK..KPPPPK.......',
  '.......KpppPK..KPpppK.......',
  '.......KDDDDK..KDDDDK.......',
  '......KDdDDDK..KDDDdDK......',
  '......KKKKKKK..KKKKKKK......',
];

const MANAGER_FIELD = [
  '...........KKKKKK...........',
  '.........KKHHHHHHKK.........',
  '........KHHhhHHHHHHK........',
  '.......KHHhhHHHHHHHHK.......',
  '.......KHHHHHHHHHHHHK.......',
  '.......KHSSSSSSSSSSHK.......',
  '.......KHSSSSSSSSSSHK.......',
  '.......KSKKSSSSSSKKSK.......',
  '.......KSEESSSSSSEESK.......',
  '.......KSEWSSSSSSEWSK.......',
  '.......KSSSSTTTTSSSSK.......',
  '.......KSSHHHHHHHHSSK.......',
  '........KSHHSSSSHHSK........',
  '.........KSSSSSSSSK.........',
  '..........KKTSSTKK..........',
  '......KKVVVVKSSKVVVVKK......',
  '.....KAVVVVVKAAKVVVVVAK.....',
  '.....KAVGVVKAAAAKVVVVAK.....',
  '....KAKVGVVKAAAAKVVVVKAK....',
  '....KAKVVVVKAaAAKVVVVKAK....',
  '....KAKVVvVKAAAAKVvVVKAK....',
  '....KAKVVVVKAAAAKVVVVKAK....',
  '....KSKVVvVKAaAAKVvVVKSK....',
  '....KSKVVVVKAAAAKVVVVKSKG...',
  '......KVvVVVVVVVVVVvVK.G....',
  '......KPPPPPPPPPPPPPPK.GG...',
  '.......KPPPPK..KPPPPK.......',
  '.......KPpPPK..KPPpPK.......',
  '.......KPPPPK..KPPPPK.......',
  '.......KPpPPK..KPPpPK.......',
  '.......KPPPPK..KPPPPK.......',
  '.......KPPPPK..KPPPPK.......',
  '.......KpppPK..KPpppK.......',
  '.......KLLLLK..KLLLLK.......',
  '......KLlLLLK..KLLLlLK......',
  '......KKKKKKK..KKKKKKK......',
];

const CUSTOMER_FIELD = [
  '...........KKKKKK...........',
  '.........KKRRRRRRKK.........',
  '........KRRRRRRRRRRK........',
  '.......KRRRRRRRRRRrRK.......',
  '......KrrrrrrrrrrrrrrK......',
  '.......KHHSSSSSSSSHHK.......',
  '.......KSSSSSSSSSSSSK.......',
  '.......KSSSSSSSSSSSSK.......',
  '.......KSEESSSSSSEESK.......',
  '.......KSEWSSSSSSEWSK.......',
  '.......KBBSSSTTSSSBBK.......',
  '.......KSSSSSKKSSSSSK.......',
  '........KSSSSSSSSSSK........',
  '.........KSSSSSSSSK.........',
  '..........KKTSSTKK..........',
  '......KKCCCCKSSKCCCCKK......',
  '.....KCCCCCCKWWKCCCCCCK.....',
  '.....KCCCCCCKWWKCCCCCCK.....',
  '....KCKCCCCCKWWKCCCCCKCK....',
  '....KCKCCCCcKWWKcCCCCKCK....',
  '....KCKCCCCCKWWKCCCCCKCK....',
  '....KCKCCCCcKWWKcCCCCKCK....',
  '.....KCCCKAAAAAAAAKCCCK.....',
  '.....KCSSKAKKKKKKAKSSCK.....',
  '.....KCSSKAKKKKAAAKSSCK.....',
  '......KKKKAaAAAAaAKKKK......',
  '......KCCCCCcCCcCCCCCK......',
  '.......KJJJJK..KJJJJK.......',
  '.......KJjJJK..KJJjJK.......',
  '.......KJJJJK..KJJJJK.......',
  '.......KJjJJK..KJJjJK.......',
  '.......KJJJJK..KJJJJK.......',
  '.......KjjjJK..KJjjjK.......',
  '.......KDDDDK..KDDDDK.......',
  '......KDDWDDK..KDDWDDK......',
  '......KWWWWWK..KWWWWWK......',
  '......KKKKKKK..KKKKKKK......',
];

// ─── 초상화 스프라이트 (24×26, 감정 부위는 비워 두고 오버레이로 그림) ──

const MECHANIC_PORTRAIT = [
  '........KKKKKKKK........',
  '......KKHHHHHHHHKK......',
  '.....KHHhhHHHHHHHHK.....',
  '....KHHhhhHHHHHHHHHK....',
  '....KHHhhHHHHHHHHHHK....',
  '....KNNNNNNNNNNNNNNK....',
  '....KnNNNNNNNNNNNNnK....',
  '....KnHSSSSSSSSSSHnK....',
  '...KSSSSSSSSSSSSSSSSK...',
  '...KSSSSSSSSSSSSSSSSK...',
  '...KSSSSSSSSSSSSSSSSK...',
  '...KSSSSSSSSSSSSSSSSK...',
  '..KSSSSSSSSSSSSSSSSSSK..',
  '..KTSSSSSSSSSSSSSSSSTK..',
  '...KSSSSSSSSSSSSSSSSK...',
  '...KSSSSSSSTTSSSSSSSK...',
  '...KSBBSSSSSSSSSSBBSK...',
  '...KSSSSSSSSSSSSSSSSK...',
  '...KSSSSSSSSSSSSSSSSK...',
  '....KSSSSSSSSSSSSSSK....',
  '.....KSSSSSSSSSSSSK.....',
  '......KKKTSSSSTKKK......',
  '....KKCCKKSSSSKKCCKK....',
  '..KKCCCCKAAAAAAKCCCCKK..',
  '.KCCCCCKAAAAAAAAKCCCCCK.',
  '.KCCCCCKAaAAAAaAKCCCCCK.',
];

const MANAGER_PORTRAIT = [
  '........KKKKKKKK........',
  '......KKHHHHHHHHKK......',
  '.....KHHhhHHHHHHHHK.....',
  '....KHHhhhHHHHHHHHHK....',
  '....KHHHHHHHHHHHHHHK....',
  '....KHHSSSSSSSSSSHHK....',
  '....KHSSSSSSSSSSSSHK....',
  '....KHSSSSSSSSSSSSHK....',
  '...KSSSSSSSSSSSSSSSSK...',
  '...KSSSSSSSSSSSSSSSSK...',
  '...KSSSSSSSSSSSSSSSSK...',
  '...KSSSSSSSSSSSSSSSSK...',
  '..KSSSSSSSSSSSSSSSSSSK..',
  '..KTSSSSSSSSSSSSSSSSTK..',
  '...KSSSSSSSSSSSSSSSSK...',
  '...KSSSSSSSTTSSSSSSSK...',
  '...KSSSSSSSSSSSSSSSSK...',
  '...KSSHHHHHHHHHHHHSSK...',
  '...KSHHSSSSSSSSSSHHSK...',
  '....KSSSSSSSSSSSSSSK....',
  '.....KSSSSSSSSSSSSK.....',
  '......KKKTSSSSTKKK......',
  '....KKVVKKSSSSKKVVKK....',
  '..KKVVVVKAAAAAAKVVVVKK..',
  '.KVVGVVKAAAAAAAAKVVVVVK.',
  '.KVVVVVKAAaAAaAAKVVVVVK.',
];

const CUSTOMER_PORTRAIT = [
  '........KKKKKKKK........',
  '......KKRRRRRRRRKK......',
  '.....KRRRRRRRRRRrRK.....',
  '....KRRRRRRRRRRRRrRK....',
  '...KrrrrrrrrrrrrrrrrK...',
  '....KHHHHHHHHHHHHHHK....',
  '....KHSSHSSSSSSHSSHK....',
  '....KSSSSSSSSSSSSSSK....',
  '...KSSSSSSSSSSSSSSSSK...',
  '...KSSSSSSSSSSSSSSSSK...',
  '...KSSSSSSSSSSSSSSSSK...',
  '...KSSSSSSSSSSSSSSSSK...',
  '..KSSSSSSSSSSSSSSSSSSK..',
  '..KTSSSSSSSSSSSSSSSSTK..',
  '...KSSSSSSSSSSSSSSSSK...',
  '...KSSSSSSSTTSSSSSSSK...',
  '...KBBBSSSSSSSSSSBBBK...',
  '...KSSSSSSSSSSSSSSSSK...',
  '...KSSSSSSSSSSSSSSSSK...',
  '....KSSSSSSSSSSSSSSK....',
  '.....KSSSSSSSSSSSSK.....',
  '......KKKTSSSSTKKK......',
  '....KKCCKKSSSSKKCCKK....',
  '..KKCCCCCCKWWKCCCCCCKK..',
  '.KCCCCCCCCKWWKCCCCCCCCK.',
  '.KCCCCCCCcKWWKcCCCCCCCK.',
];

const FIELD_MAPS: Record<PixelCharacterRole, string[]> = {
  정비사: MECHANIC_FIELD,
  점장: MANAGER_FIELD,
  고객: CUSTOMER_FIELD,
};

const PORTRAIT_MAPS: Record<PixelCharacterRole, string[]> = {
  정비사: MECHANIC_PORTRAIT,
  점장: MANAGER_PORTRAIT,
  고객: CUSTOMER_PORTRAIT,
};

const LEGENDS: Record<PixelCharacterRole, Legend> = {
  정비사: MECHANIC_LEGEND,
  점장: MANAGER_LEGEND,
  고객: CUSTOMER_LEGEND,
};

type PixelAnchor = 'center' | 'bottom';

// 지도 내부 좌표(0,0 기준)의 원점 오프셋. Graphics 위치·스케일이
// 항상 지정한 앵커를 기준으로 동작하도록 로컬 좌표로 그립니다.
function mapOrigin(rows: string[], pixelSize: number, anchor: PixelAnchor) {
  const width = Math.max(...rows.map((row) => row.length));
  return {
    x: -(width * pixelSize) / 2,
    y: anchor === 'bottom' ? -(rows.length * pixelSize) : -(rows.length * pixelSize) / 2,
  };
}

// 문자 지도를 Graphics로 렌더링합니다. 가로로 같은 색이 이어지면 한 번에 채워
// fillRect 호출 수를 줄입니다. 좌표는 로컬 기준이라 setScale이 앵커를 유지합니다.
export function drawPixelMap(
  scene: Phaser.Scene,
  x: number,
  y: number,
  rows: string[],
  legend: Legend,
  pixelSize: number,
  depth: number,
  anchor: PixelAnchor = 'center',
): Phaser.GameObjects.Graphics {
  const g = scene.add.graphics({ x, y }).setDepth(depth);
  const origin = mapOrigin(rows, pixelSize, anchor);
  rows.forEach((row, rowIndex) => {
    let column = 0;
    while (column < row.length) {
      const ch = row[column];
      const color = legend[ch];
      if (color === undefined) {
        column += 1;
        continue;
      }
      let run = 1;
      while (column + run < row.length && row[column + run] === ch) run += 1;
      g.fillStyle(color, 1);
      g.fillRect(origin.x + column * pixelSize, origin.y + rowIndex * pixelSize, run * pixelSize, pixelSize);
      column += run;
    }
  });
  return g;
}

/** 필드 캐릭터를 그립니다. (x, y)가 발끝 중앙이 되도록 하단 앵커로 그립니다. */
export function drawFieldCharacter(
  scene: Phaser.Scene,
  x: number,
  y: number,
  role: PixelCharacterRole,
  pixelSize: number,
  depth: number,
): Phaser.GameObjects.Graphics {
  return drawPixelMap(scene, x, y, FIELD_MAPS[role], LEGENDS[role], pixelSize, depth, 'bottom');
}

// 초상화 감정 오버레이 좌표계 (portrait 지도 기준 열·행)
const EYE_LEFT = 7; // 왼눈 시작 열
const EYE_RIGHT = 14; // 오른눈 시작 열
const BROW_ROW = 10;
const EYE_ROW = 12;

/**
 * 대화 초상화를 그립니다. pixelSize 5 기준 약 120×130px.
 * 감정(기본·기쁨·고민)은 눈썹·눈·입·땀방울 오버레이로 표현합니다.
 */
export function drawCharacterPortrait(
  scene: Phaser.Scene,
  x: number,
  y: number,
  role: PixelCharacterRole,
  emotion: PixelCharacterEmotion,
  pixelSize: number,
  depth: number,
): Phaser.GameObjects.Graphics {
  const rows = PORTRAIT_MAPS[role];
  const legend = LEGENDS[role];
  const g = drawPixelMap(scene, x, y, rows, legend, pixelSize, depth);
  const origin = mapOrigin(rows, pixelSize, 'center');
  const ink = BASE_LEGEND.K;
  const px = (column: number, row: number, color: number, w = 1, h = 1) => {
    g.fillStyle(color, 1);
    g.fillRect(origin.x + column * pixelSize, origin.y + row * pixelSize, w * pixelSize, h * pixelSize);
  };

  // 점장은 콧수염 아래로 입 위치가 한 칸 내려갑니다.
  const mouthRow = role === '점장' ? 19 : 18;

  if (emotion === '기본') {
    // 눈썹: 수평 (점장은 두껍게)
    px(EYE_LEFT, BROW_ROW, ink, 3, role === '점장' ? 2 : 1);
    px(EYE_RIGHT, BROW_ROW, ink, 3, role === '점장' ? 2 : 1);
    // 눈: 3×3 + 안쪽 상단 하이라이트
    px(EYE_LEFT, EYE_ROW, BASE_LEGEND.E, 3, 3);
    px(EYE_RIGHT, EYE_ROW, BASE_LEGEND.E, 3, 3);
    px(EYE_LEFT + 2, EYE_ROW, BASE_LEGEND.W);
    px(EYE_RIGHT, EYE_ROW, BASE_LEGEND.W);
    // 입: 짧은 수평선 + 아랫입술 음영
    px(10, mouthRow, ink, 4, 1);
    px(11, mouthRow + 1, BASE_LEGEND.T, 2, 1);
  }

  if (emotion === '기쁨') {
    // 눈썹: 위로 올라간 아치
    px(EYE_LEFT, BROW_ROW, ink);
    px(EYE_LEFT + 1, BROW_ROW - 1, ink);
    px(EYE_LEFT + 2, BROW_ROW, ink);
    px(EYE_RIGHT, BROW_ROW, ink);
    px(EYE_RIGHT + 1, BROW_ROW - 1, ink);
    px(EYE_RIGHT + 2, BROW_ROW, ink);
    // 눈: 감은 웃음 (∩)
    px(EYE_LEFT, EYE_ROW + 1, ink);
    px(EYE_LEFT + 1, EYE_ROW, ink);
    px(EYE_LEFT + 2, EYE_ROW + 1, ink);
    px(EYE_RIGHT, EYE_ROW + 1, ink);
    px(EYE_RIGHT + 1, EYE_ROW, ink);
    px(EYE_RIGHT + 2, EYE_ROW + 1, ink);
    // 입: 벌린 웃음 (윗니 + 붉은 입안)
    px(9, mouthRow - 1, ink, 6, 1);
    px(9, mouthRow, ink);
    px(14, mouthRow, ink);
    px(10, mouthRow, BASE_LEGEND.W, 4, 1);
    px(10, mouthRow + 1, 0xc95746, 4, 1);
    px(10, mouthRow + 2, ink, 4, 1);
    // 홍조 강조
    px(4, 16, BASE_LEGEND.B, 2, 1);
    px(18, 16, BASE_LEGEND.B, 2, 1);
  }

  if (emotion === '고민') {
    // 눈썹: 안쪽이 올라간 걱정 눈썹
    px(EYE_LEFT, BROW_ROW + 1, ink);
    px(EYE_LEFT + 1, BROW_ROW, ink, 2, 1);
    px(EYE_RIGHT, BROW_ROW, ink, 2, 1);
    px(EYE_RIGHT + 2, BROW_ROW + 1, ink);
    // 눈: 반쯤 감긴 눈 (눈꺼풀 선 + 3×2)
    px(EYE_LEFT, EYE_ROW, ink, 3, 1);
    px(EYE_RIGHT, EYE_ROW, ink, 3, 1);
    px(EYE_LEFT, EYE_ROW + 1, BASE_LEGEND.E, 3, 2);
    px(EYE_RIGHT, EYE_ROW + 1, BASE_LEGEND.E, 3, 2);
    // 입: 아래로 굽은 걱정 입
    px(10, mouthRow + 1, ink);
    px(11, mouthRow, ink, 2, 1);
    px(13, mouthRow + 1, ink);
    // 땀방울
    px(19, 9, 0x86c9c8);
    px(18, 10, 0x86c9c8, 2, 1);
    px(18, 11, 0xbfe4e3, 2, 1);
  }

  return g;
}
