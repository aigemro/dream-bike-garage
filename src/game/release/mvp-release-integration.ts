import Phaser from 'phaser';
import { startTitleLoadingPrototype } from './title-loading-design';
import { startHomeDesignPrototype } from './home-design-prototype';
import { startGuideOverlayPrototype } from './guide-overlay-design';
import { startMergeWorkbenchScreen } from './merge-workbench-screen';
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
import { WORKBENCH_ORDERS } from './workbench-orders';
import { RELEASE_STORAGE_KEY, createReleaseState, restoreReleaseState } from './release-state';
import { startRaceCinematicBroadcast } from './race-cinematic-broadcast';
import { RIVERSIDE_ENDURANCE_RACE, daysUntilRace, isRaceDay } from './race-progress';
import { bikeCategoryFromKorean } from './bike-pixel-sprite';
import {
  canAcceptPlayInput,
  formatDayClock,
  pauseDay,
  prepareNextDay,
  recordOrderDelivery,
  resumeDay,
  settleDay,
  startDay,
  trackActiveTime,
  type DayPauseReason,
} from '../../domain/day-session';

type ReleaseScreen = 'title' | 'home' | 'guide' | 'game' | 'reward' | 'catalog' | 'showcase' | 'dream' | 'profile' | 'settings' | 'race';
// 오늘 납품한 주문의 이해도 결과 (하루 정산 화면 표시용 · 저장하지 않음)
type DayDelivery = OrderDeliveryResult & { orderIndex: number };

// 마지막 주문 납품 후 장착·납품 도장 연출을 보여 준 뒤 하루 정산 화면으로 넘어가기까지의 시간
const DAY_SETTLE_DELAY_MS = 2200;
// 영업 시간(정산 표시용) 기록 간격
const ACTIVE_TIME_TICK_MS = 1000;

export class MvpReleaseIntegrationController {
  private game?: Phaser.Game;
  private readonly audio = new ReleaseAudio();
  private state = this.loadState();
  private screen: ReleaseScreen = 'title';
  // 컬렉션 진행 상태(이해도·등록·제작): 새로고침·재진입 후에도 동일하게 복구된다
  private collection = this.loadCollection();
  // 자전거별 성장 상태: 급여 투자 결과가 저장·복구되는 성장 루프
  private growth = this.loadGrowth();
  private dayDeliveries: DayDelivery[] = [];
  private settleTimer?: number;
  private activeTimer?: number;
  private activeSince = 0;
  private readonly stageId = `mvp-release-stage-${Math.random().toString(36).slice(2)}`;
  private readonly onVisibility = () => {
    if (this.screen !== 'game') return;
    if (document.hidden) this.pauseToday('background');
    else this.resumeToday();
  };
  private readonly onPageHide = () => { if (this.screen === 'game') this.pauseToday('background'); };

  constructor(private readonly parent: HTMLElement) {
    this.audio.setEnabled(this.state.bgm, this.state.sfx);
    document.addEventListener('visibilitychange', this.onVisibility);
    window.addEventListener('pagehide', this.onPageHide);
    this.renderShell();
    this.show('title');
  }

  destroy() {
    if (this.screen === 'game') this.pauseToday('screen-navigation');
    this.clearDayTimers();
    document.removeEventListener('visibilitychange', this.onVisibility);
    window.removeEventListener('pagehide', this.onPageHide);
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
    // 작업대를 떠나면 Day를 일시정지합니다. 영업 시간은 작업대에 있는 동안만 기록됩니다.
    if (this.screen === 'game' && screen !== 'game') this.pauseToday('screen-navigation');
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
      const dayNumber = this.state.day.dayNumber;
      const raceDay = isRaceDay(dayNumber, RIVERSIDE_ENDURANCE_RACE);
      const raceCompleted = this.state.lastRaceDay === dayNumber;
      this.game = startHomeDesignPrototype(this.stageId, 'warm-pixel-garage', {
        coins: this.state.coins,
        completedOrders: this.state.completedOrders,
        progress: this.buildHomeProgress(),
        dayNumber,
        dayStatusLabel: `${raceDay ? '대회일' : this.dayStatusLabel()} · 주문 ${this.state.day.ordersCompleted}/${this.state.day.orderTarget}`,
        race: {
          dayNumber,
          heldEveryDays: RIVERSIDE_ENDURANCE_RACE.heldEveryDays,
          daysUntil: daysUntilRace(dayNumber, RIVERSIDE_ENDURANCE_RACE),
          entryFee: RIVERSIDE_ENDURANCE_RACE.entryFee,
          available: raceDay && !raceCompleted,
          completed: raceCompleted,
        },
        onPlay: () => this.show(this.state.tutorialDone ? 'game' : 'guide'),
        // 만들기 진입: 제작 중 자전거를 선택 상태로 두고 상세·성장(제작 모드) 화면으로 이동
        onCraft: (bikeId) => { this.collection.selectedBikeId = bikeId; this.saveCollection(); this.show('dream'); },
        // Garage 자전거 클릭 → 해당 완성 자전거의 성장 화면 진입
        onHeroBike: (bikeId) => { this.collection.selectedBikeId = bikeId; this.saveCollection(); this.show('dream'); },
        onCollection: () => this.show('catalog'),
        onShowcase: () => this.show('showcase'),
        onProfile: () => this.show('profile'),
        onSettings: () => this.show('settings'),
        onRace: () => this.show('race'),
        onSfx: (event) => this.play(event),
      });
      return;
    }
    if (screen === 'race') {
      const dayNumber = this.state.day.dayNumber;
      if (!isRaceDay(dayNumber, RIVERSIDE_ENDURANCE_RACE) || this.state.lastRaceDay === dayNumber) {
        this.show('home');
        return;
      }
      const progress = this.buildHomeProgress();
      this.game = startRaceCinematicBroadcast(this.stageId, {
        initialCoins: this.state.coins,
        dayNumber,
        seed: dayNumber * 1009 + this.state.completedOrders,
        stats: bikeStats(this.growth, progress.heroBike.id),
        playerBike: {
          name: progress.heroBike.name,
          category: bikeCategoryFromKorean(progress.heroBike.category),
          frameColor: progress.heroBike.color,
        },
        entryFeePaid: this.state.raceEntryDay === dayNumber,
        onEntered: ({ coins }) => {
          this.state.coins = coins;
          this.state.raceEntryDay = dayNumber;
          this.saveState();
        },
        onExit: () => this.show('home'),
        onSettled: ({ coins }) => {
          this.state.coins = coins;
          this.state.lastRaceDay = dayNumber;
          this.state.raceEntryDay = null;
          this.saveState();
          this.show('home');
        },
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
      // 오늘 주문을 이미 다 채운 Day(마감 후 화면을 떠났거나 앱을 닫은 경우)는 작업대 대신 정산으로 보냅니다.
      if (this.state.day.status === 'closing') {
        this.finishToday();
        return;
      }
      this.openToday();
      this.game = startMergeWorkbenchScreen(this.stageId, {
        workbench: this.state.workbench,
        orders: WORKBENCH_ORDERS,
        getDay: () => ({
          dayNumber: this.state.day.dayNumber,
          done: this.state.day.ordersCompleted,
          target: this.state.day.orderTarget,
          earnings: this.state.day.earnings,
          closing: this.state.day.status === 'closing',
        }),
        canPlay: () => canAcceptPlayInput(this.state.day),
        onChange: () => this.saveState(),
        onDelivered: (delivery) => this.deliverOrder(delivery.orderIndex, delivery.reward),
        onHome: () => this.show('home'),
        onSfx: (event) => this.play(event),
      });
      return;
    }
    if (screen === 'reward') {
      this.showDaySettlement();
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
        this.clearDayTimers();
        this.state = createReleaseState();
        this.collection = createCollectionProgress();
        this.growth = createGrowthProgress();
        this.dayDeliveries = [];
        localStorage.removeItem(RELEASE_STORAGE_KEY);
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

  // ── Day 세션: 주문 N건 = 하루 일정 (#77 C안) ──
  private dayStatusLabel() {
    const status = this.state.day.status;
    if (status === 'ready') return '영업 준비';
    if (status === 'closing') return '정산 대기';
    return '영업 중';
  }

  // 작업대에 들어오면 오늘 영업을 시작하거나 이어서 엽니다.
  private openToday() {
    const now = new Date().toISOString();
    this.state.day = this.state.day.status === 'ready' ? startDay(this.state.day, now) : resumeDay(this.state.day);
    this.saveState();
    this.startActiveTimer();
  }

  private resumeToday() {
    if (this.state.day.status !== 'paused') return;
    this.state.day = resumeDay(this.state.day);
    this.saveState();
    this.startActiveTimer();
  }

  private pauseToday(reason: DayPauseReason) {
    this.recordActiveTime();
    window.clearInterval(this.activeTimer);
    this.activeTimer = undefined;
    this.state.day = pauseDay(this.state.day, reason);
    this.saveState();
  }

  private startActiveTimer() {
    window.clearInterval(this.activeTimer);
    this.activeSince = performance.now();
    this.activeTimer = window.setInterval(() => this.recordActiveTime(), ACTIVE_TIME_TICK_MS);
  }

  private recordActiveTime() {
    if (this.activeTimer === undefined) return;
    const now = performance.now();
    this.state.day = trackActiveTime(this.state.day, now - this.activeSince);
    this.activeSince = now;
  }

  private clearDayTimers() {
    window.clearInterval(this.activeTimer);
    window.clearTimeout(this.settleTimer);
    this.activeTimer = undefined;
    this.settleTimer = undefined;
  }

  // 작업대가 확정한 납품 1건: 급여·납품 수·이해도·오늘 통계를 한 번에 반영하고 저장합니다.
  private deliverOrder(orderIndex: number, reward: number) {
    this.recordActiveTime();
    const recorded = recordOrderDelivery(this.state.day, reward);
    this.state.day = recorded.day;
    this.state.coins += reward;
    this.state.completedOrders += 1;
    this.state.orderIndex = (orderIndex + 1) % ORDER_METAS.length;
    this.dayDeliveries.push({ ...applyOrderDelivery(this.collection, orderIndex), orderIndex });
    this.saveCollection();
    this.saveState();
    if (!recorded.targetReached) return;
    window.clearTimeout(this.settleTimer);
    this.settleTimer = window.setTimeout(() => {
      this.settleTimer = undefined;
      if (this.screen === 'game') this.finishToday();
    }, DAY_SETTLE_DELAY_MS);
  }

  // 마감된 Day를 정산(이력 1회 기록)하고 하루 정산 화면을 엽니다.
  private finishToday() {
    this.recordActiveTime();
    window.clearInterval(this.activeTimer);
    this.activeTimer = undefined;
    const settled = settleDay(this.state.day, this.state.dayHistory, new Date().toISOString());
    this.state.day = settled.day;
    this.state.dayHistory = settled.history;
    this.saveState();
    this.show('reward');
  }

  private showDaySettlement() {
    const day = this.state.day;
    if (day.status !== 'settlement') {
      this.show('home');
      return;
    }
    // 오늘 납품 중 도감 등록이 있으면 그것을, 없으면 마지막 납품의 이해도 변화를 보여 줍니다.
    const highlight = this.dayDeliveries.find((delivery) => delivery.registeredNow) ?? this.dayDeliveries.at(-1);
    const nextDay = day.dayNumber + 1;
    const daysToRace = daysUntilRace(nextDay, RIVERSIDE_ENDURANCE_RACE);
    const nextOrder = orderMetaAt(this.state.orderIndex);
    this.game = startRewardSettlementPrototype(this.stageId, {
      // 급여는 납품마다 이미 받았으므로, 봉투는 오늘 수입만큼 올라가는 연출만 합니다.
      initialCoins: this.state.coins - day.earnings,
      reward: day.earnings,
      bikeCategory: orderMetaAt(this.dayDeliveries.at(-1)?.orderIndex ?? 0)?.bikeCategory,
      understanding: highlight?.bike
        ? {
            bikeName: highlight.bike.name,
            grade: highlight.bike.grade,
            before: highlight.before,
            after: highlight.after,
            registeredNow: highlight.registeredNow,
            alreadyRegistered: highlight.alreadyRegistered,
          }
        : undefined,
      copy: {
        tag: 'DAY CLOSED',
        headline: `영업 ${day.dayNumber}일차 마감!`,
        subline: `오늘 주문 ${day.ordersCompleted}건을 모두 납품했습니다 · 영업 시간 ${formatDayClock(day.elapsedActiveMs)}`,
        speech: '오늘도 수고했어!\n내일도 잘 부탁해',
        panelTitle: '오늘 영업 정산',
        nextTag: 'NEXT DAY',
        nextTitle: `영업 ${nextDay}일차 · ${daysToRace === 0 ? '대회일!' : `대회까지 ${daysToRace}일`}`,
        nextDetail: `첫 주문 ${nextOrder?.name ?? '주문'} · 오늘 목표 주문 ${day.orderTarget}건`,
        nextButton: '▶ 다음 영업 시작',
        doneMessage: '오늘 정산이 끝났습니다. 다음 영업을 시작하거나 홈으로 돌아가세요.',
      },
      onReward: () => this.refreshShell(),
      onNext: () => { this.beginNextDay(); this.show('game'); },
      onHome: () => { this.beginNextDay(); this.show('home'); },
      onSfx: (event) => this.play(event),
    });
  }

  private beginNextDay() {
    this.state.day = prepareNextDay(this.state.day);
    this.dayDeliveries = [];
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
    if (screen === 'reward' || screen === 'race') return 'reward';
    return 'home';
  }

  private refreshShell() {
    this.parent.dataset.screen = this.screen;
  }

  private loadState() {
    try {
      return restoreReleaseState(localStorage.getItem(RELEASE_STORAGE_KEY));
    } catch {
      return createReleaseState();
    }
  }

  private saveState() {
    try {
      localStorage.setItem(RELEASE_STORAGE_KEY, JSON.stringify(this.state));
    } catch {
      // 저장소를 쓸 수 없는 환경(프라이빗 모드 등)에서도 메모리 진행으로 플레이를 이어갑니다.
    }
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
