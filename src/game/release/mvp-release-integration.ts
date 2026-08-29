import Phaser from 'phaser';
import { startTitleLoadingPrototype } from './title-loading-design';
import { startHomeDesignPrototype } from './home-design-prototype';
import { startGuideOverlayPrototype } from './guide-overlay-design';
import { startGameScreenMobilePrototype } from './game-screen-mobile';
import { startRewardSettlementPrototype } from './reward-settlement-design';
import { startBikeCollectionDesignPrototype, type BikeCollectionDesignMode } from './bike-collection-design-prototype';
import { startProfileDesignPrototype } from './profile-design-prototype';
import { startSettingsDrawerPrototype } from './settings-design';
import { ReleaseAudio, type ReleaseAudioRoom, type ReleaseSfxEvent } from './release-audio';
import {
  COLLECTION_STORAGE_KEY,
  GROWTH_STORAGE_KEY,
  ORDER_METAS,
  applyCraftPart,
  applyBikeUpgrade,
  applyOrderDelivery,
  computeNextGoal,
  craftedBikeCount,
  createCollectionProgress,
  bikeStats,
  createGrowthProgress,
  dreamGradeName,
  dreamStage,
  dreamTotalLevel,
  markBikeSeen,
  orderMetaAt,
  parseCollectionProgress,
  parseGrowthProgress,
  serializeCollectionProgress,
  serializeGrowthProgress,
  type CraftPartType,
  type DreamStatKey,
  type OrderDeliveryResult,
} from './meta-progress';
import { CATALOG_SIZE, catalogBikeById } from './bike-catalog';
import { ORDERS } from './merge-prototype';

type ReleaseScreen = 'title' | 'home' | 'guide' | 'game' | 'reward' | 'catalog' | 'showcase' | 'dream' | 'profile' | 'settings';
type ReleaseState = {
  version: 2;
  coins: number;
  completedOrders: number;
  orderIndex: number;
  tutorialDone: boolean;
  autoPlacement: boolean;
  bgm: boolean;
  sfx: boolean;
  vibration: boolean;
};

const STORAGE_KEY = 'dbg-lab-mvp-release-integration-v1';
// v2: 시작 코인을 0으로 바꿔 첫 주문 급여 → 드림 바이크 강화의 인과관계가 보이게 한다
const DEFAULT_STATE: ReleaseState = {
  version: 2,
  coins: 0,
  completedOrders: 0,
  orderIndex: 0,
  tutorialDone: false,
  autoPlacement: false,
  bgm: true,
  sfx: true,
  vibration: false,
};

export class MvpReleaseIntegrationController {
  private game?: Phaser.Game;
  private readonly audio = new ReleaseAudio();
  private state = this.loadState();
  private screen: ReleaseScreen = 'title';
  // 컬렉션 진행 상태(이해도·등록·제작): 새로고침·재진입 후에도 동일하게 복구된다
  private collection = this.loadCollection();
  // 자전거별 성장 상태: 급여 투자 결과가 저장·복구되는 성장 루프
  private growth = this.loadGrowth();
  private lastDelivery?: OrderDeliveryResult;
  private rewardApplied = false;
  private readonly stageId = `mvp-release-stage-${Math.random().toString(36).slice(2)}`;

  constructor(private readonly parent: HTMLElement) {
    this.audio.setEnabled(this.state.bgm, this.state.sfx);
    this.renderShell();
    this.show('title');
  }

  destroy() {
    this.game?.destroy(true);
    this.audio.destroy();
    this.parent.innerHTML = '';
  }

  private renderShell() {
    this.parent.innerHTML = `
      <section class="release-integration-shell">
        <div id="${this.stageId}" class="release-stage"></div>
      </section>`;
  }

  private show(screen: ReleaseScreen) {
    this.game?.destroy(true);
    this.game = undefined;
    this.screen = screen;
    const stage = this.parent.querySelector<HTMLElement>(`#${this.stageId}`);
    if (!stage) return;
    stage.innerHTML = '';
    this.audio.setRoom(this.roomFor(screen));
    this.refreshShell();

    if (screen === 'title') {
      this.game = startTitleLoadingPrototype(this.stageId, {
        onEnterHome: () => this.show('home'),
        onSfx: (event) => this.play(event),
      });
      return;
    }
    if (screen === 'home') {
      this.game = startHomeDesignPrototype(this.stageId, 'warm-pixel-garage', {
        coins: this.state.coins,
        completedOrders: this.state.completedOrders,
        progress: this.buildHomeProgress(),
        onPlay: () => this.show(this.state.tutorialDone ? 'game' : 'guide'),
        // 만들기 진입: 제작 중 자전거를 선택 상태로 두고 상세·성장(제작 모드) 화면으로 이동
        onCraft: (bikeId) => { this.collection.selectedBikeId = bikeId; this.saveCollection(); this.show('dream'); },
        // Garage 자전거 클릭 → 해당 완성 자전거의 성장 화면 진입
        onHeroBike: (bikeId) => { this.collection.selectedBikeId = bikeId; this.saveCollection(); this.show('dream'); },
        onCollection: () => this.show('catalog'),
        onShowcase: () => this.show('showcase'),
        onProfile: () => this.show('profile'),
        onSettings: () => this.show('settings'),
        onSfx: (event) => this.play(event),
      });
      return;
    }
    if (screen === 'guide') {
      this.game = startGuideOverlayPrototype(this.stageId, {
        onFinish: () => { this.state.tutorialDone = true; this.saveState(); this.show('game'); },
        onSfx: (event) => this.play(event),
      });
      return;
    }
    if (screen === 'game') {
      this.rewardApplied = false;
      this.game = startGameScreenMobilePrototype(this.stageId, {
        orderIndex: this.state.orderIndex,
        autoPlacement: this.state.autoPlacement,
        onAutoPlacementChange: (enabled) => {
          this.state.autoPlacement = enabled;
          this.saveState();
        },
        onOrderComplete: (orderIndex) => {
          this.state.completedOrders += 1;
          // 납품한 주문의 자전거 이해도를 올리고, 결과(등록 여부 포함)를 정산 화면에 전달한다
          this.lastDelivery = applyOrderDelivery(this.collection, orderIndex);
          this.saveCollection();
          this.saveState();
          this.show('reward');
        },
        onSfx: (event) => this.play(event),
      });
      return;
    }
    if (screen === 'reward') {
      const orderMeta = orderMetaAt(this.state.orderIndex);
      const reward = orderMeta?.reward ?? 1000 + this.state.orderIndex * 400;
      const nextIndex = (this.state.orderIndex + 1) % ORDER_METAS.length;
      const nextMeta = orderMetaAt(nextIndex);
      this.game = startRewardSettlementPrototype(this.stageId, {
        initialCoins: this.state.coins,
        reward,
        orderName: orderMeta?.name,
        bikeCategory: orderMeta?.bikeCategory,
        understanding: this.lastDelivery?.bike
          ? {
              bikeName: this.lastDelivery.bike.name,
              grade: this.lastDelivery.bike.grade,
              before: this.lastDelivery.before,
              after: this.lastDelivery.after,
              registeredNow: this.lastDelivery.registeredNow,
              alreadyRegistered: this.lastDelivery.alreadyRegistered,
            }
          : undefined,
        nextOrder: nextMeta
          ? { name: nextMeta.name, parts: ORDERS[nextIndex]?.length ?? 4, reward: nextMeta.reward }
          : undefined,
        onReward: (coins) => {
          if (this.rewardApplied) return;
          this.rewardApplied = true;
          this.state.coins = coins;
          this.saveState();
          this.refreshShell();
        },
        onNext: () => { this.advanceOrder(); this.show('game'); },
        onHome: () => { this.advanceOrder(); this.show('home'); },
        onSfx: (event) => this.play(event),
      });
      return;
    }
    if (screen === 'catalog' || screen === 'showcase' || screen === 'dream') {
      const mode: BikeCollectionDesignMode = screen === 'catalog' ? 'warm-catalog' : screen === 'showcase' ? 'warm-showcase' : 'warm-dream-growth';
      this.game = startBikeCollectionDesignPrototype(this.stageId, mode, {
        coins: this.state.coins,
        initialBikeId: this.collection.selectedBikeId,
        // 실제 컬렉션 진행 데이터 연결: 보유·신규 발견·전시 슬롯을 단일 상태로 공유
        // 보유(전시·성장)는 완성 자전거 기준, 등록·이해도는 도감 상태 표시용
        ownedBikeIds: [...this.collection.craftedBikeIds],
        registeredBikeIds: [...this.collection.registeredBikeIds],
        understandingByBikeId: { ...this.collection.understandingByBikeId },
        craftPartsByBikeId: Object.fromEntries(Object.entries(this.collection.craftPartsByBikeId).map(([id, parts]) => [id, [...parts]])),
        // 자전거 만들기: 코인 차감과 부품 장착을 한 번에 적용·저장하고 결과만 화면에 돌려준다
        onCraftPart: (bikeId: string, part: CraftPartType) => {
          const result = applyCraftPart(this.collection, this.state.coins, bikeId, part);
          if (result.ok) {
            this.state.coins = result.coins;
            this.saveCollection();
            this.saveState();
            this.refreshShell();
            return { ok: true, coins: result.coins, installedParts: [...result.installedParts], completed: result.completed };
          }
          return {
            ok: false,
            reason: result.reason,
            coins: result.coins,
            installedParts: [...(this.collection.craftPartsByBikeId[bikeId] ?? [])],
            completed: false,
          };
        },
        newBikeIds: [...this.collection.newBikeIds],
        showcaseSlots: [...this.collection.showcaseSlots],
        onShowcaseChange: (slots) => { this.collection.showcaseSlots = slots; this.saveCollection(); },
        onBikeSeen: (bikeId) => { markBikeSeen(this.collection, bikeId); this.saveCollection(); },
        // 자전거 강화(완성 자전거별): 코인 차감과 강화 반영을 한 번에 적용·저장하고 결과만 화면에 돌려준다
        dreamStats: bikeStats(this.growth, this.collection.selectedBikeId),
        onDreamUpgrade: (stat: DreamStatKey) => {
          const result = applyBikeUpgrade(this.collection, this.growth, this.state.coins, this.collection.selectedBikeId, stat);
          if (result.ok) {
            this.growth = result.growth;
            this.state.coins = result.coins;
            this.saveGrowth();
            this.saveState();
            this.refreshShell();
          }
          return {
            ok: result.ok,
            reason: result.ok ? undefined : result.reason,
            coins: result.coins,
            stats: { ...result.stats },
            stageUp: result.ok ? result.stageUp : false,
          };
        },
        onHome: () => this.show('home'),
        onCatalog: () => this.show('catalog'),
        onShowcase: () => this.show('showcase'),
        onDreamGrowth: () => this.show('dream'),
        onBikeDetail: (bikeId) => { this.collection.selectedBikeId = bikeId; this.saveCollection(); this.show('dream'); },
        onCoinsChange: (coins) => { this.state.coins = coins; this.saveState(); this.refreshShell(); },
        onSfx: (event) => this.play(event === 'reward' ? 'reward' : event),
      });
      return;
    }
    if (screen === 'profile') {
      this.game = startProfileDesignPrototype(this.stageId, 'warm-id-card', { onHome: () => this.show('home'), onSfx: (event) => this.play(event) });
      return;
    }
    this.game = startSettingsDrawerPrototype(this.stageId, {
      toggles: { bgm: this.state.bgm, sfx: this.state.sfx, vibration: this.state.vibration },
      onHome: () => this.show('home'),
      onTutorial: () => { this.state.tutorialDone = false; this.saveState(); },
      onReset: () => {
        this.state = { ...DEFAULT_STATE };
        this.collection = createCollectionProgress();
        this.growth = createGrowthProgress();
        this.lastDelivery = undefined;
        localStorage.removeItem(STORAGE_KEY);
        localStorage.removeItem(COLLECTION_STORAGE_KEY);
        localStorage.removeItem(GROWTH_STORAGE_KEY);
        window.setTimeout(() => this.show('title'), 0);
      },
      onToggle: (key, value) => {
        this.state[key] = value;
        this.audio.setEnabled(this.state.bgm, this.state.sfx);
        this.saveState();
        this.refreshShell();
      },
      onSfx: (event) => this.play(event),
    });
  }

  // 주문 3종을 순서대로 순환하고, 마지막 주문 이후에는 처음부터 반복 플레이한다
  private advanceOrder() {
    this.state.orderIndex = (this.state.orderIndex + 1) % ORDER_METAS.length;
    this.saveState();
  }

  // 홈 화면에 표시할 메타 루프 진행 요약: 다음 목표 규칙은 meta-progress가 담당
  private buildHomeProgress() {
    const orderMeta = orderMetaAt(this.state.orderIndex) ?? ORDER_METAS[0];
    const goal = computeNextGoal(this.collection, this.growth);
    // 홈 대표 자전거는 완성(보유) 자전거만: 선택 자전거가 미완성이면 시작 자전거로 대체
    const selectedCrafted = this.collection.craftedBikeIds.includes(this.collection.selectedBikeId);
    const hero = (selectedCrafted ? catalogBikeById(this.collection.selectedBikeId) : undefined) ?? catalogBikeById('dream-road')!;
    const heroStats = bikeStats(this.growth, hero.id);
    return {
      ownedCount: craftedBikeCount(this.collection),
      catalogSize: CATALOG_SIZE,
      orderName: orderMeta.name,
      orderCategory: orderMeta.bikeCategory,
      orderReward: orderMeta.reward,
      nextGoalLabel: goal.kind === 'understand' ? goal.bikeName
        : goal.kind === 'craft' ? `${goal.bikeName} 제작`
        : goal.kind === 'upgrade' ? `${goal.bikeName} ${goal.stat} 강화`
        : '주문 반복 플레이',
      nextGoalHint: goal.kind === 'understand'
        ? `이해도 ${goal.understanding}% · 납품 ${goal.deliveriesLeft}회 남음`
        : goal.kind === 'craft'
          ? `다음 부품 ${goal.partName} · ${goal.cost.toLocaleString()}코인`
          : goal.kind === 'upgrade'
            ? `강화 비용 ${goal.cost.toLocaleString()}코인`
            : '모든 목표 달성 · 급여를 모아보세요',
      // 제작 중 자전거 요약: 홈 만들기 버튼 표시용
      craft: goal.kind === 'craft'
        ? { bikeId: goal.bikeId, bikeName: goal.bikeName, installedCount: goal.installedCount, totalParts: goal.totalParts }
        : undefined,
      growthPercent: Math.round((dreamTotalLevel(heroStats) - 3) / 9 * 100),
      heroBike: {
        id: hero.id,
        name: hero.name,
        category: hero.category,
        color: hero.color,
        grade: dreamGradeName(heroStats),
        stage: dreamStage(heroStats),
      },
    };
  }

  private play(event: ReleaseSfxEvent) {
    this.audio.unlock();
    this.audio.play(event);
  }

  private roomFor(screen: ReleaseScreen): ReleaseAudioRoom {
    if (screen === 'title') return 'title';
    if (screen === 'game' || screen === 'guide') return 'work';
    if (screen === 'reward') return 'reward';
    return 'home';
  }

  private refreshShell() {
    this.parent.dataset.screen = this.screen;
  }

  private loadState(): ReleaseState {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as Partial<ReleaseState> | null;
      if (!saved || saved.version !== 2) return { ...DEFAULT_STATE };
      return { ...DEFAULT_STATE, ...saved };
    } catch {
      return { ...DEFAULT_STATE };
    }
  }

  private saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
  }

  // 컬렉션 저장·복구: 직렬화·손상 복구·비정상 값 방어 규칙은 meta-progress가 담당
  private loadCollection() {
    try {
      return parseCollectionProgress(localStorage.getItem(COLLECTION_STORAGE_KEY));
    } catch {
      return createCollectionProgress();
    }
  }

  private saveCollection() {
    localStorage.setItem(COLLECTION_STORAGE_KEY, serializeCollectionProgress(this.collection));
  }

  // 성장 저장·복구: 검증·보정 규칙은 meta-progress가 담당
  private loadGrowth() {
    try {
      return parseGrowthProgress(localStorage.getItem(GROWTH_STORAGE_KEY));
    } catch {
      return createGrowthProgress();
    }
  }

  private saveGrowth() {
    localStorage.setItem(GROWTH_STORAGE_KEY, serializeGrowthProgress(this.growth));
  }
}

export function startMvpReleaseIntegration(parent: string) {
  const element = document.getElementById(parent);
  if (!element) throw new Error(`MVP release integration parent not found: ${parent}`);
  return new MvpReleaseIntegrationController(element);
}
