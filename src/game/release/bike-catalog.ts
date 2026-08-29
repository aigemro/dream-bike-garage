// 자전거 도감 카탈로그 단일 출처 (순수 데이터 · Phaser 비의존)
// 수집 화면 프로토타입(bike-collection-design-prototype)과 메타 루프 로직(meta-progress)이 공유합니다.
// sampleOwned는 디자인 비교용 독립 데모의 샘플 보유 상태(8/24)이며,
// 릴리스 통합 화면은 meta-progress의 실제 진행 데이터로 보유 상태를 덮어씁니다.

export type BikeGrade = '입문' | '중급' | '고급' | '드림';
export type BikeCategoryKorean = '로드' | 'MTB' | '그래블' | '미니벨로';

export type CatalogBike = {
  id: string;
  name: string;
  category: BikeCategoryKorean;
  grade: BikeGrade;
  color: number;
  hint: string;
  sampleOwned: boolean;
};

// 홈 화면 디자인 A안(따뜻한 생활형 픽셀 Garage)과 동일한 팔레트 색 값
const COLOR = {
  wood: 0x8e5136,
  green: 0x5e9a67,
  leaf: 0x86ba6f,
  blue: 0x4e8092,
  gold: 0xf4b84a,
  red: 0xc95746,
};

export const CATALOG_BIKES: CatalogBike[] = [
  { id: 'dream-road', name: '나의 드림 로드바이크', category: '로드', grade: '중급', color: COLOR.red, sampleOwned: true, hint: 'Garage 대표 자전거' },
  { id: 'urban-road', name: '어반 로드', category: '로드', grade: '입문', color: COLOR.blue, sampleOwned: true, hint: '첫 주문 납품 보상' },
  { id: 'classic-randonneur', name: '클래식 랜도너', category: '로드', grade: '중급', color: COLOR.green, sampleOwned: true, hint: '주문 납품 보상' },
  { id: 'touring-road', name: '투어링 로드', category: '로드', grade: '입문', color: COLOR.leaf, sampleOwned: false, hint: '주문 납품 보상으로 발견' },
  { id: 'aero-sprinter', name: '에어로 스프린터', category: '로드', grade: '고급', color: COLOR.gold, sampleOwned: false, hint: '고급 주문 보상으로 발견' },
  { id: 'dream-machine', name: '드림 머신', category: '로드', grade: '드림', color: COLOR.gold, sampleOwned: false, hint: '드림 등급 승급 보상' },
  { id: 'trail-mtb', name: '트레일 MTB', category: 'MTB', grade: '중급', color: COLOR.green, sampleOwned: false, hint: 'NEXT GOAL · 주문 2건 남음' },
  { id: 'hardtail-mtb', name: '하드테일 MTB', category: 'MTB', grade: '입문', color: COLOR.blue, sampleOwned: true, hint: '주문 납품 보상' },
  { id: 'xc-mtb', name: '크로스컨트리 MTB', category: 'MTB', grade: '중급', color: COLOR.red, sampleOwned: true, hint: '주문 납품 보상' },
  { id: 'fat-bike', name: '팻바이크', category: 'MTB', grade: '중급', color: COLOR.wood, sampleOwned: false, hint: '겨울 주문 보상으로 발견' },
  { id: 'enduro-mtb', name: '엔듀로 MTB', category: 'MTB', grade: '고급', color: COLOR.blue, sampleOwned: false, hint: '고급 주문 보상으로 발견' },
  { id: 'downhill-mtb', name: '다운힐 MTB', category: 'MTB', grade: '고급', color: COLOR.red, sampleOwned: false, hint: '고급 주문 보상으로 발견' },
  { id: 'gravel-explorer', name: '그래블 익스플로러', category: '그래블', grade: '중급', color: COLOR.gold, sampleOwned: true, hint: '주문 납품 보상' },
  { id: 'allroad-gravel', name: '올로드 그래블', category: '그래블', grade: '입문', color: COLOR.green, sampleOwned: true, hint: '주문 납품 보상' },
  { id: 'singlespeed-gravel', name: '싱글스피드 그래블', category: '그래블', grade: '입문', color: COLOR.blue, sampleOwned: false, hint: '주문 납품 보상으로 발견' },
  { id: 'bikepacking-gravel', name: '백패킹 그래블', category: '그래블', grade: '중급', color: COLOR.leaf, sampleOwned: false, hint: '연속 주문 보상으로 발견' },
  { id: 'adventure-gravel', name: '어드벤처 그래블', category: '그래블', grade: '고급', color: COLOR.wood, sampleOwned: false, hint: '고급 주문 보상으로 발견' },
  { id: 'expedition-gravel', name: '익스페디션 그래블', category: '그래블', grade: '드림', color: COLOR.red, sampleOwned: false, hint: '드림 등급 승급 보상' },
  { id: 'city-mini', name: '시티 미니벨로', category: '미니벨로', grade: '입문', color: COLOR.red, sampleOwned: true, hint: '주문 납품 보상' },
  { id: 'folding-mini', name: '폴딩 미니벨로', category: '미니벨로', grade: '입문', color: COLOR.gold, sampleOwned: false, hint: '주문 납품 보상으로 발견' },
  { id: 'cargo-mini', name: '카고 미니벨로', category: '미니벨로', grade: '중급', color: COLOR.green, sampleOwned: false, hint: '배달 주문 보상으로 발견' },
  { id: 'classic-mini', name: '클래식 미니벨로', category: '미니벨로', grade: '중급', color: COLOR.blue, sampleOwned: false, hint: '주문 납품 보상으로 발견' },
  { id: 'tour-mini', name: '투어 미니벨로', category: '미니벨로', grade: '고급', color: COLOR.leaf, sampleOwned: false, hint: '고급 주문 보상으로 발견' },
  { id: 'dream-mini', name: '드림 미니벨로', category: '미니벨로', grade: '드림', color: COLOR.gold, sampleOwned: false, hint: '드림 등급 승급 보상' },
];

export const CATALOG_SIZE = CATALOG_BIKES.length;

export function catalogBikeById(id: string): CatalogBike | undefined {
  return CATALOG_BIKES.find((bike) => bike.id === id);
}
