import Phaser from 'phaser';
import { startTitleLoadingPrototype } from './title-loading-design';
import { startHomeDesignPrototype } from './home-design-prototype';
import { startGuideOverlayPrototype } from './guide-overlay-design';
import { startMergeWorkbenchScreen, type RewardedAdWatchResult, type WorkbenchRewardedAd } from './merge-workbench-screen';
import { startRewardSettlementPrototype } from './reward-settlement-design';
import { startBikeCollectionDesignPrototype, type BikeCollectionDesignMode, type CollectionPerksView } from './bike-collection-design-prototype';
import { startProfileDesignPrototype, type ProfileSummary } from './profile-design-prototype';
import { startSettingsDrawerPrototype } from './settings-design';
import { ReleaseAudio, type ReleaseAudioRoom, type ReleaseSfxEvent } from './release-audio';
import {
  COLLECTION_STORAGE_KEY,
  GROWTH_STORAGE_KEY,
  ORDER_METAS,
  applyCraftPart,
  applyBikeUpgrade,
  applyDreamBikeUnlocks,
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
  type CollectionProgress,
  type CraftPartType,
  type DreamStatKey,
  type GrowthProgress,
  type OrderDeliveryResult,
} from './meta-progress';
import { CATALOG_SIZE, catalogBikeById } from './bike-catalog';
import { WORKBENCH_SCHEDULE } from './workbench-orders';
import { RELEASE_STORAGE_KEY, alignWorkbenchToDay, createReleaseState, restoreReleaseState, type ReleaseState } from './release-state';
import { orderIndexOf, recoverEnergy } from '../../domain/merge-workbench';
import { adOffer, applyBonusEnergy, applySettlementRefill, grantAdRefill, hasSettlementRefill } from '../../domain/energy-refill';
import {
  bikeEffects,
  categorySetViews,
  claimCollectionMilestones,
  deliveryTip,
  garageBonusLine,
  garagePerks,
  heroBikeId,
  heroEffectLine,
  nextCollectionMilestone,
  perkValueLabel,
  raceBonusLine,
  statEffectViews,
  type GaragePerks,
} from './garage-perks';
import { firstSequenceOfDay } from '../../domain/progression';
import { createPlatform, type GamePlatform, type HapticKind, type RewardedAdPort, type Unsubscribe } from '../../platform';
import { SaveStore } from '../../platform/save-store';
import { bindSafeAreaCss } from '../../platform/safe-area-css';
import { showExitConfirm } from '../../ui/exit-confirm';
import { startRaceCinematicBroadcast } from './race-cinematic-broadcast';
import { startPrologue } from './prologue-design';
import { RIVERSIDE_ENDURANCE_RACE, canEnterRace, daysUntilRace, isRaceDay, raceEntryStatus } from './race-progress';
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

type ReleaseScreen = 'title' | 'prologue' | 'home' | 'guide' | 'game' | 'reward' | 'catalog' | 'showcase' | 'dream' | 'profile' | 'settings' | 'race';
// 오늘 납품한 주문의 이해도 결과 (하루 정산 화면 표시용 · 저장하지 않음)
type DayDelivery = OrderDeliveryResult & { orderIndex: number };

// 마지막 주문 납품 후 장착·납품 도장 연출을 보여 준 뒤 하루 정산 화면으로 넘어가기까지의 시간
const DAY_SETTLE_DELAY_MS = 2200;
// 영업 시간(정산 표시용) 기록 간격
const ACTIVE_TIME_TICK_MS = 1000;

// 계정 슬롯 저장 항목. 계정 슬롯 도입 전 웹 버전의 저장 키는 첫 실행 때 한 번 옮겨 옵니다(원본은 남김).
const SAVE_ENTRIES = ['release', 'collection', 'growth'] as const;
type SaveEntry = (typeof SAVE_ENTRIES)[number];
// 진동 설정이 켜져 있을 때 효과음과 함께 울릴 진동 (짧은 조작 피드백만)
const HAPTIC_BY_SFX: Partial<Record<ReleaseSfxEvent, HapticKind>> = {
  merge: 'tap',
  install: 'tap',
  complete: 'success',
  reward: 'success',
  error: 'error',
};
const LEGACY_SAVE_KEYS: Record<SaveEntry, string> = {
  release: RELEASE_STORAGE_KEY,
  collection: COLLECTION_STORAGE_KEY,
  growth: GROWTH_STORAGE_KEY,
};

export class MvpReleaseIntegrationController {
  private game?: Phaser.Game;
  private readonly audio = new ReleaseAudio();
  private state: ReleaseState;
  private screen: ReleaseScreen = 'title';
  // 컬렉션 진행 상태(이해도·등록·제작): 새로고침·재진입 후에도 동일하게 복구된다
  private collection: CollectionProgress;
  // 자전거별 성장 상태: 급여 투자 결과가 저장·복구되는 성장 루프
  private growth: GrowthProgress;
  private dayDeliveries: DayDelivery[] = [];
  // 오늘 납품으로 도감 등록된 드림 등급 자전거 (하루 정산 화면 표시용 · 저장하지 않음)
  private dayDreamUnlocks: string[] = [];
  // 이번 정산에서 Garage 효과(MTB 컬렉션)로 회복한 체력 (정산 화면 표시용 · 저장하지 않음)
  private daySettlementEnergy = 0;
  // 홈에 한 번 보여 줄 안내(밀린 수집 마일스톤 보상 등). 보여 주면 비웁니다.
  private homeNotice?: string;
  // 오늘 정산 봉투를 이미 열었는지(#107): 대회 화면에서 정산으로 되돌아올 때 개봉 연출을 건너뛴다
  private settlementOpened = false;
  private settleTimer?: number;
  private activeTimer?: number;
  private activeSince = 0;
  private readonly stageId = `mvp-release-stage-${Math.random().toString(36).slice(2)}`;
  private readonly unsubscribers: Unsubscribe[] = [];
  private closeExitConfirm?: () => void;
  // 보상형 광고 시청 중이면 true. 그동안 앱 전환으로 Day를 재개하거나 소리를 다시 켜지 않습니다.
  private adWatching = false;
  private adAbort?: AbortController;

  constructor(
    private readonly parent: HTMLElement,
    private readonly platform: GamePlatform,
    private readonly save: SaveStore<SaveEntry>,
  ) {
    this.state = this.loadState();
    this.collection = this.loadCollection();
    this.growth = this.loadGrowth();
    // 마일스톤 기록이 없던 저장: 이미 보유한 대수만큼의 보상을 밀린 것으로 보고 한 번에 지급합니다 (#109).
    this.claimMilestones(true);
    this.audio.setEnabled(this.state.bgm, this.state.sfx);
    // 앱 전환: 소리를 멈추고, 작업대에서는 Day를 일시정지·재개하며, 화면이 사라질 때 남은 저장을 내보냅니다.
    this.unsubscribers.push(this.platform.onAppVisibilityChange((visible) => {
      this.audio.setSuspended(!visible || this.adWatching);
      // 광고가 WebView를 가렸다가 돌아오는 동안에는 Day를 그대로 두고, 광고가 끝난 뒤 재개합니다.
      if (this.screen === 'game' && !this.adWatching) {
        if (visible) this.resumeToday();
        else this.pauseToday('background');
      }
      if (!visible) void this.save.flush();
    }));
    // 시스템 뒤로가기(앱인토스): 하위 화면은 홈으로, 홈·타이틀에서는 종료 확인
    this.unsubscribers.push(this.platform.onBack(() => this.handleBack()));
    this.unsubscribers.push(bindSafeAreaCss(this.platform));
    void this.platform.lockPortrait();
    this.renderShell();
    this.show('title');
  }

  destroy() {
    if (this.screen === 'game') this.pauseToday('screen-navigation');
    this.clearDayTimers();
    this.unsubscribers.forEach((unsubscribe) => unsubscribe());
    this.closeExitConfirm?.();
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
        // 처음 시작하면 홈 대신 프롤로그(삼촌의 프로 대회)부터 보여 줍니다.
        onEnterHome: () => this.show(this.state.prologueDone ? 'home' : 'prologue'),
        onSfx: (event) => this.play(event),
      });
      return;
    }
    if (screen === 'prologue') {
      this.game = startPrologue(this.stageId, {
        onFinish: () => this.finishPrologue(),
        onSfx: (event) => this.play(event),
      });
      return;
    }
    if (screen === 'home') {
      const dayNumber = this.state.day.dayNumber;
      const raceDay = isRaceDay(dayNumber, RIVERSIDE_ENDURANCE_RACE);
      const raceCompleted = this.state.lastRaceDay === dayNumber;
      // 참가비 충족 여부(#107): 이미 낸 날은 코인과 무관하게 참가 가능
      const raceAffordable = canEnterRace(this.raceEntryStatusToday());
      this.game = startHomeDesignPrototype(this.stageId, 'warm-pixel-garage', {
        coins: this.state.coins,
        completedOrders: this.state.completedOrders,
        progress: this.buildHomeProgress(),
        notice: this.takeHomeNotice(),
        dayNumber,
        // 상태 문구는 수집·프로필 HUD와 같은 계산을 공유합니다.
        dayStatusLabel: this.homeDayStatusLabel(),
        race: {
          dayNumber,
          heldEveryDays: RIVERSIDE_ENDURANCE_RACE.heldEveryDays,
          daysUntil: daysUntilRace(dayNumber, RIVERSIDE_ENDURANCE_RACE),
          entryFee: RIVERSIDE_ENDURANCE_RACE.entryFee,
          coins: this.state.coins,
          affordable: raceAffordable,
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
      // 대회일이 아니거나 이미 완주했거나 참가비가 부족하면(#107) 대회 화면을 열지 않는다
      if (!canEnterRace(this.raceEntryStatusToday())) {
        this.show(this.state.day.status === 'settlement' ? 'reward' : 'home');
        return;
      }
      const progress = this.buildHomeProgress();
      const perks = this.perks();
      this.game = startRaceCinematicBroadcast(this.stageId, {
        initialCoins: this.state.coins,
        dayNumber,
        seed: dayNumber * 1009 + this.state.completedOrders,
        stats: bikeStats(this.growth, progress.heroBike.id),
        // Garage 효과: 로드 컬렉션·드림 머신 시그니처의 출전 속도 가산 (#109)
        speedBonus: perks.raceSpeedBonus,
        speedBonusLabel: raceBonusLine(perks),
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
        // 정산 화면의 질문에서 들어왔으면(#107) 정산 화면으로 돌아가 다시 고를 수 있게 한다(낸 참가비는 유지)
        onExit: () => this.show(this.state.day.status === 'settlement' ? 'reward' : 'home'),
        onSettled: ({ coins }) => {
          this.state.coins = coins;
          this.state.lastRaceDay = dayNumber;
          this.state.raceEntryDay = null;
          this.saveState();
          // 정산 화면의 질문에서 참가한 대회면(#107) 다음 영업일을 준비한 뒤 홈으로 돌아간다
          if (this.state.day.status === 'settlement') this.beginNextDay();
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
        orders: WORKBENCH_SCHEDULE,
        getDay: () => ({
          dayNumber: this.state.day.dayNumber,
          done: this.state.day.ordersCompleted,
          target: this.state.day.orderTarget,
          earnings: this.state.day.earnings,
          closing: this.state.day.status === 'closing',
        }),
        canPlay: () => canAcceptPlayInput(this.state.day),
        onChange: () => this.saveState(),
        // Garage 효과: 대표 자전거 희귀도·그래블 컬렉션의 Lv.2 입고 확률 (#109)
        supply: () => ({ level2Rate: this.perks().level2BoxRate }),
        onDelivered: (delivery) => ({ tip: this.deliverOrder(delivery.orderIndex, delivery.reward) }),
        onHome: () => this.show('home'),
        onSfx: (event) => this.play(event),
        rewardedAd: this.workbenchRewardedAd(),
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
        // 상단 HUD: 홈과 같은 DAY 번호·상태 문구 (가짜 ENERGY 대신 실제 값)
        dayNumber: this.state.day.dayNumber,
        dayStatusLabel: this.homeDayStatusLabel(),
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
            // 완성으로 보유 대수가 늘면 마일스톤 보상(무료 상자)을 바로 지급합니다 (#109)
            const milestoneFreeBoxes = result.completed ? this.claimMilestones(false) : 0;
            this.saveCollection();
            this.saveState();
            this.refreshShell();
            return { ok: true, coins: result.coins, installedParts: [...result.installedParts], completed: result.completed, milestoneFreeBoxes };
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
        // Garage 효과(#109): 대표·전시·컬렉션 세트·마일스톤 현황과 스탯별 효과 문구. 화면은 다시 그릴 때마다 새로 읽습니다.
        getPerks: () => this.collectionPerksView(),
        statEffectsFor: (bikeId: string) => statEffectViews(bikeStats(this.growth, bikeId), {
          isHero: heroBikeId(this.collection) === bikeId,
          isShowcased: this.collection.showcaseSlots.includes(bikeId),
          perks: this.perks(),
        }),
        getBikeStats: (bikeId: string) => bikeStats(this.growth, bikeId),
        // 자전거 강화(완성 자전거별): 코인 차감과 강화 반영을 한 번에 적용·저장하고 결과만 화면에 돌려준다
        dreamStats: bikeStats(this.growth, this.collection.selectedBikeId),
        onDreamUpgrade: (stat: DreamStatKey) => {
          const result = applyBikeUpgrade(this.collection, this.growth, this.state.coins, this.collection.selectedBikeId, stat);
          let dreamUnlockedBikeIds: string[] = [];
          if (result.ok) {
            this.growth = result.growth;
            this.state.coins = result.coins;
            this.saveGrowth();
            this.saveState();
            // 승급 보상: 같은 카테고리 드림 등급 자전거가 조건을 채우면 도감 등록 (레벨 디자인 규칙)
            dreamUnlockedBikeIds = applyDreamBikeUnlocks(this.collection, this.growth);
            if (dreamUnlockedBikeIds.length > 0) this.saveCollection();
            this.refreshShell();
          }
          return {
            ok: result.ok,
            reason: result.ok ? undefined : result.reason,
            coins: result.coins,
            stats: { ...result.stats },
            stageUp: result.ok ? result.stageUp : false,
            dreamUnlockedBikeNames: dreamUnlockedBikeIds.map((id) => catalogBikeById(id)?.name ?? id),
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
      this.game = startProfileDesignPrototype(this.stageId, 'warm-id-card', {
        // 카드 수치는 고정 데모 데이터 대신 실제 진행 요약을 넘깁니다.
        profile: this.buildProfileSummary(),
        onHome: () => this.show('home'),
        onSfx: (event) => this.play(event),
      });
      return;
    }
    this.game = startSettingsDrawerPrototype(this.stageId, {
      toggles: { bgm: this.state.bgm, sfx: this.state.sfx, vibration: this.state.vibration },
      onHome: () => this.show('home'),
      onTutorial: () => { this.state.tutorialDone = false; this.saveState(); },
      onPrologue: () => this.show('prologue'),
      onReset: () => {
        this.clearDayTimers();
        this.state = createReleaseState();
        this.collection = createCollectionProgress();
        this.growth = createGrowthProgress();
        this.dayDeliveries = [];
        this.daySettlementEnergy = 0;
        this.homeNotice = undefined;
        SAVE_ENTRIES.forEach((entry) => this.save.remove(entry));
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

  // 프롤로그를 마치거나 건너뛰면(시스템 뒤로가기 포함) 본 것으로 기록하고 공방(홈)으로 출근합니다. 설정에서 다시 볼 수 있습니다.
  private finishPrologue() {
    if (!this.state.prologueDone) {
      this.state.prologueDone = true;
      this.saveState();
    }
    this.show('home');
  }

  // ── Day 세션: 주문 N건 = 하루 일정 (#77 C안) ──
  // 오늘 대회 참가 가능 상태(#107): 홈 버튼·대회 화면 진입·정산 질문이 같은 판정을 공유합니다.
  private raceEntryStatusToday() {
    return raceEntryStatus({
      day: this.state.day.dayNumber,
      coins: this.state.coins,
      lastRaceDay: this.state.lastRaceDay,
      raceEntryDay: this.state.raceEntryDay,
    }, RIVERSIDE_ENDURANCE_RACE);
  }

  private dayStatusLabel() {
    const status = this.state.day.status;
    if (status === 'ready') return '영업 준비';
    if (status === 'closing') return '정산 대기';
    return '영업 중';
  }

  // 홈·수집 3모드·프로필 HUD가 공유하는 상태 문구 (대회일 표기 포함). 화면마다 문구가 달라지지 않도록 한 곳에서 계산합니다.
  // 예: `영업 준비 · 주문 0/3`, `대회일 · 주문 1/3`
  private homeDayStatusLabel() {
    const raceDay = isRaceDay(this.state.day.dayNumber, RIVERSIDE_ENDURANCE_RACE);
    return `${raceDay ? '대회일' : this.dayStatusLabel()} · 주문 ${this.state.day.ordersCompleted}/${this.state.day.orderTarget}`;
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

  // ── 보상형 광고 체력 충전 (#92) ──
  // 광고를 쓸 수 없는 환경이면 작업대에 광고 버튼을 두지 않습니다.
  private workbenchRewardedAd(): WorkbenchRewardedAd | undefined {
    const port = this.platform.rewardedAd;
    if (!port) return undefined;
    return {
      offer: () => adOffer(this.state.workbench),
      preload: () => port.preload(),
      watch: () => this.watchRewardedAd(port),
      cancel: () => this.adAbort?.abort(),
    };
  }

  /**
   * 광고 1회 시청 흐름.
   * 1) 제안 조건 확인 → Day 일시정지(광고 시간은 영업 시간에 넣지 않음)·소리 정지 → 광고 직전 저장
   * 2) SDK 보상 이벤트를 받은 순간 체력 +10·기록을 반영하고 바로 저장(닫히기 전에 앱이 종료돼도 보상 유지)
   * 3) 광고가 끝나면 소리·Day를 되돌립니다. 같은 요청의 중복 보상은 요청 식별자로 막습니다.
   */
  private async watchRewardedAd(port: RewardedAdPort): Promise<RewardedAdWatchResult> {
    if (this.adWatching) return 'busy';
    const now = Date.now();
    recoverEnergy(this.state.workbench, now);
    if (!adOffer(this.state.workbench).available) return 'unavailable';
    this.adWatching = true;
    const requestId = `ad-${now.toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const resumeAfter = this.screen === 'game' && this.state.day.status === 'active';
    if (resumeAfter) this.pauseToday('ad');
    this.audio.setSuspended(true);
    this.saveState();
    await this.save.flush();
    const abort = new AbortController();
    this.adAbort = abort;
    let granted = false;
    const outcome = await port.show(() => {
      const rewardAt = Date.now();
      recoverEnergy(this.state.workbench, rewardAt);
      const record = grantAdRefill(this.state.workbench, this.state.adRefill, requestId, rewardAt);
      if (!record) return;
      this.state.adRefill = record;
      granted = true;
      this.saveState();
      void this.save.flush();
    }, abort.signal).catch(() => 'failed' as const);
    if (this.adAbort === abort) this.adAbort = undefined;
    this.adWatching = false;
    const visible = typeof document === 'undefined' || !document.hidden;
    this.audio.setSuspended(!visible);
    if (resumeAfter && this.screen === 'game' && visible) this.resumeToday();
    if (granted) return 'rewarded';
    return outcome === 'rewarded' ? 'failed' : outcome;
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

  // 작업대가 확정한 납품 1건: 급여(+Garage 효과 팁)·납품 수·이해도·오늘 통계를 한 번에 반영하고 저장합니다. 붙은 팁을 돌려줍니다.
  private deliverOrder(orderIndex: number, reward: number): number {
    this.recordActiveTime();
    const tip = deliveryTip(reward, this.perks());
    const recorded = recordOrderDelivery(this.state.day, reward, tip);
    this.state.day = recorded.day;
    this.state.coins += reward + tip;
    this.state.completedOrders += 1;
    // 작업대는 납품 확정과 함께 순번을 이미 다음 주문으로 옮겼으므로, 그 위치를 홈·정산 표시용 주문 위치로 씁니다.
    this.state.orderIndex = orderIndexOf(this.state.workbench.order, WORKBENCH_SCHEDULE);
    this.dayDeliveries.push({ ...applyOrderDelivery(this.collection, orderIndex), orderIndex });
    // 카테고리 전부 등록을 조건으로 하는 드림 해금은 납품 직후에도 열릴 수 있습니다. 하루 정산 화면에서 알립니다.
    this.dayDreamUnlocks.push(...applyDreamBikeUnlocks(this.collection, this.growth));
    this.saveCollection();
    this.saveState();
    if (!recorded.targetReached) return tip;
    window.clearTimeout(this.settleTimer);
    this.settleTimer = window.setTimeout(() => {
      this.settleTimer = undefined;
      if (this.screen === 'game') this.finishToday();
    }, DAY_SETTLE_DELAY_MS);
    return tip;
  }

  // 마감된 Day를 정산(이력 1회 기록)하고 하루 정산 화면을 엽니다.
  private finishToday() {
    this.recordActiveTime();
    window.clearInterval(this.activeTimer);
    this.activeTimer = undefined;
    const settled = settleDay(this.state.day, this.state.dayHistory, new Date().toISOString());
    this.state.day = settled.day;
    this.state.dayHistory = settled.history;
    // 첫 대회 전 정산 지원과 Garage 효과(MTB 컬렉션) 체력 회복: 정산과 같은 저장에 체력을 함께 기록합니다
    // (이미 정산된 Day를 다시 열면 채우지 않음).
    if (settled.settled) {
      const now = Date.now();
      recoverEnergy(this.state.workbench, now);
      applySettlementRefill(this.state.workbench, settled.day.dayNumber, now);
      this.daySettlementEnergy = applyBonusEnergy(this.state.workbench, this.perks().settlementEnergy, now);
    }
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
    // 다음 영업일의 첫 주문은 주문표 기준(영업일 → 순번)으로 구합니다.
    const nextOrder = orderMetaAt(orderIndexOf(firstSequenceOfDay(nextDay), WORKBENCH_SCHEDULE));
    const dreamUnlockNames = this.dayDreamUnlocks.map((id) => catalogBikeById(id)?.name ?? id);
    // 대회일(#107): 아직 완주하지 않았으면 다음 영업으로 넘어가기 전에 참가 여부를 묻는다. 참가비가 부족하면 참가 버튼을 잠근다.
    const entryStatus = this.raceEntryStatusToday();
    const racePrompt = entryStatus === 'not-race-day' || entryStatus === 'completed'
      ? undefined
      : {
          raceName: RIVERSIDE_ENDURANCE_RACE.name,
          entryFee: RIVERSIDE_ENDURANCE_RACE.entryFee,
          coins: this.state.coins,
          affordable: canEnterRace(entryStatus),
          onEnter: () => this.show('race'),
        };
    this.game = startRewardSettlementPrototype(this.stageId, {
      // 급여는 납품마다 이미 받았으므로, 봉투는 오늘 수입만큼 올라가는 연출만 합니다.
      // 정산 전에 코인을 썼을 수 있으므로(강화·대회 참가비) 시작값이 음수가 되지 않게 방어합니다.
      initialCoins: Math.max(0, this.state.coins - day.earnings),
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
        subline: day.tips > 0
          ? `주문 ${day.ordersCompleted}건 납품 · 손님 팁 +${day.tips.toLocaleString()} · 영업 시간 ${formatDayClock(day.elapsedActiveMs)}`
          : `오늘 주문 ${day.ordersCompleted}건을 모두 납품했습니다 · 영업 시간 ${formatDayClock(day.elapsedActiveMs)}`,
        speech: '오늘도 수고했어!\n내일도 잘 부탁해',
        panelTitle: '오늘 영업 정산',
        nextTag: 'NEXT DAY',
        nextTitle: `영업 ${nextDay}일차 · ${daysToRace === 0 ? '대회일!' : `대회까지 ${daysToRace}일`}`,
        nextDetail: `첫 주문 ${nextOrder?.name ?? '주문'} · 오늘 목표 주문 ${day.orderTarget}건`,
        nextButton: '▶ 다음 영업 시작',
        doneMessage: [
          dreamUnlockNames.length > 0 ? `드림 등급 ${dreamUnlockNames.join(' · ')} 도감 등록! Garage에서 제작할 수 있어요.` : '오늘 정산이 끝났습니다.',
          hasSettlementRefill(day.dayNumber) ? '첫 대회 전까지는 정산하면 알바 체력이 가득 차요!' : '',
          this.daySettlementEnergy > 0 ? `MTB 컬렉션 보너스로 알바 체력 +${this.daySettlementEnergy} 회복!` : '',
          '다음 영업을 시작하거나 홈으로 돌아가세요.',
        ].filter(Boolean).join(' '),
      },
      onReward: () => { this.settlementOpened = true; this.refreshShell(); },
      alreadyOpened: this.settlementOpened,
      racePrompt,
      onNext: () => { this.beginNextDay(); this.show('game'); },
      onHome: () => { this.beginNextDay(); this.show('home'); },
      onSfx: (event) => this.play(event),
    });
  }

  private beginNextDay() {
    this.state.day = prepareNextDay(this.state.day);
    this.dayDeliveries = [];
    this.dayDreamUnlocks = [];
    this.daySettlementEnergy = 0;
    this.settlementOpened = false;
    // 주문표는 영업일 기준이므로, 새 영업일의 첫 주문이 작업대 순번과 어긋나 있으면 맞춥니다(한 행동 2건 납품 등).
    if (alignWorkbenchToDay(this.state.workbench, this.state.day)) {
      this.state.orderIndex = orderIndexOf(this.state.workbench.order, WORKBENCH_SCHEDULE);
    }
    this.saveState();
  }

  // 홈 화면에 표시할 메타 루프 진행 요약: 다음 목표 규칙은 meta-progress가 담당
  private buildHomeProgress() {
    const orderMeta = orderMetaAt(this.state.orderIndex) ?? ORDER_METAS[0];
    const goal = computeNextGoal(this.collection, this.growth, this.state.coins);
    // 홈 대표 자전거는 완성(보유) 자전거만: 선택 자전거가 미완성이면 시작 자전거로 대체
    const selectedCrafted = this.collection.craftedBikeIds.includes(this.collection.selectedBikeId);
    const hero = (selectedCrafted ? catalogBikeById(this.collection.selectedBikeId) : undefined) ?? catalogBikeById('dream-road')!;
    const heroStats = bikeStats(this.growth, hero.id);
    const perks = this.perks();
    const milestone = nextCollectionMilestone(this.collection);
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
        effects: bikeEffects(heroStats),
      },
      // Garage 효과 문구 (#109): 대표 자전거 효과와 공방 보너스, 다음 수집 보상
      heroEffectLine: heroEffectLine(heroStats, perks),
      garageBonusLine: garageBonusLine(perks),
      nextMilestoneLabel: milestone ? `${milestone.owned}대 보유 시 무료 상자 ${milestone.freeBoxes}개` : '',
    };
  }

  // ── Garage 효과 (#109): 수집·강화 결과를 작업대·납품·정산·대회·화면에 잇습니다 ──
  private perks(): GaragePerks {
    return garagePerks(this.collection, this.growth);
  }

  /**
   * 보유 대수가 닿은 마일스톤을 받아 작업대 무료 상자로 지급하고 저장합니다. 지급한 무료 상자 수를 돌려줍니다.
   * onLoad가 참이면(저장 복구 직후) 밀린 보상을 홈 안내로 한 번 알립니다.
   */
  private claimMilestones(onLoad: boolean): number {
    const reached = claimCollectionMilestones(this.collection);
    if (reached.length === 0) return 0;
    const freeBoxes = reached.reduce((sum, milestone) => sum + milestone.freeBoxes, 0);
    this.state.workbench.freeBoxes += freeBoxes;
    this.saveCollection();
    this.saveState();
    const top = reached[reached.length - 1];
    if (onLoad) this.homeNotice = `수집 ${top.owned}대 달성 보상 · 무료 상자 +${freeBoxes}를 작업대에 넣어 뒀어요.`;
    return freeBoxes;
  }

  private takeHomeNotice(): string | undefined {
    const notice = this.homeNotice;
    this.homeNotice = undefined;
    return notice;
  }

  // 수집 화면이 보여 줄 Garage 효과 현황: 대표 자전거, 효과 합계, 카테고리 세트 진행, 다음 마일스톤
  private collectionPerksView(): CollectionPerksView {
    const perks = this.perks();
    const milestone = nextCollectionMilestone(this.collection);
    return {
      heroBikeId: heroBikeId(this.collection),
      tipRate: perks.tipRate,
      level2BoxRate: perks.level2BoxRate,
      raceSpeedBonus: perks.raceSpeedBonus,
      settlementEnergy: perks.settlementEnergy,
      categorySets: categorySetViews(this.collection).map(({ rule, state, total }) => ({
        category: rule.category,
        owned: state.owned,
        total,
        tier: state.tier,
        label: rule.label,
        valueLabel: state.value > 0 ? perkValueLabel(rule.kind, state.value) : '',
        nextLabel: state.next ? `${state.next.owned}대 ${perkValueLabel(rule.kind, state.next.value)}` : '',
      })),
      nextMilestoneLabel: milestone ? `${milestone.owned}대 보유 시 무료 상자 ${milestone.freeBoxes}개` : '모든 수집 보상 달성',
    };
  }

  // 프로필 카드 실제 수치: 대표 자전거·다음 목표는 홈 진행 요약을 재사용하고,
  // 누적 급여는 마감 이력(dayHistory) 합 + 오늘 수입으로 계산합니다(정산 직후처럼 오늘이 이미 이력에 있으면 중복 합산하지 않음).
  private buildProfileSummary(): ProfileSummary {
    const progress = this.buildHomeProgress();
    const day = this.state.day;
    const settledEarnings = this.state.dayHistory.reduce((sum, entry) => sum + entry.earnings, 0);
    const todaySettled = this.state.dayHistory.some((entry) => entry.dayNumber === day.dayNumber);
    return {
      dayNumber: day.dayNumber,
      dayStatusLabel: this.homeDayStatusLabel(),
      coins: this.state.coins,
      completedOrders: this.state.completedOrders,
      craftedBikes: craftedBikeCount(this.collection),
      catalogSize: CATALOG_SIZE,
      totalEarnings: settledEarnings + (todaySettled ? 0 : day.earnings),
      settledDays: this.state.dayHistory.length,
      heroBikeName: progress.heroBike.name,
      nextGoalLabel: progress.nextGoalLabel,
      nextGoalHint: progress.nextGoalHint,
    };
  }

  private play(event: ReleaseSfxEvent) {
    this.audio.unlock();
    this.audio.play(event);
    const haptic = HAPTIC_BY_SFX[event];
    if (haptic && this.state.vibration) this.platform.haptic(haptic);
  }

  // 시스템 뒤로가기 처리. 화면 안의 ← 홈 버튼과 같은 경로로 이동해 Day 일시정지·정산 규칙을 그대로 따릅니다.
  private handleBack() {
    if (this.closeExitConfirm) {
      this.closeExitConfirm();
      this.closeExitConfirm = undefined;
      return;
    }
    if (this.screen === 'title' || this.screen === 'home') {
      this.closeExitConfirm = showExitConfirm({
        onCancel: () => { this.closeExitConfirm = undefined; },
        onExit: () => {
          this.closeExitConfirm = undefined;
          void this.save.flush().finally(() => this.platform.close());
        },
      });
      return;
    }
    if (this.screen === 'prologue') {
      this.finishPrologue();
      return;
    }
    // 하루 정산 화면은 [홈] 버튼과 같이 다음 Day를 준비한 뒤 홈으로 갑니다(정산은 이미 끝난 상태).
    if (this.screen === 'reward' && this.state.day.status === 'settlement') this.beginNextDay();
    this.show('home');
  }

  private roomFor(screen: ReleaseScreen): ReleaseAudioRoom {
    if (screen === 'title') return 'title';
    if (screen === 'game' || screen === 'guide') return 'work';
    if (screen === 'reward' || screen === 'race' || screen === 'prologue') return 'reward';
    return 'home';
  }

  private refreshShell() {
    this.parent.dataset.screen = this.screen;
  }

  private loadState() {
    try {
      return restoreReleaseState(this.save.get('release'));
    } catch {
      return createReleaseState();
    }
  }

  // 저장소를 쓸 수 없는 환경(프라이빗 모드 등)에서도 메모리 진행으로 플레이를 이어갑니다. 실패는 SaveStore가 알립니다.
  private saveState() {
    this.save.set('release', JSON.stringify(this.state));
  }

  // 컬렉션 저장·복구: 직렬화·손상 복구·비정상 값 방어 규칙은 meta-progress가 담당
  private loadCollection() {
    try {
      return parseCollectionProgress(this.save.get('collection'));
    } catch {
      return createCollectionProgress();
    }
  }

  private saveCollection() {
    this.save.set('collection', serializeCollectionProgress(this.collection));
  }

  // 성장 저장·복구: 검증·보정 규칙은 meta-progress가 담당
  private loadGrowth() {
    try {
      return parseGrowthProgress(this.save.get('growth'));
    } catch {
      return createGrowthProgress();
    }
  }

  private saveGrowth() {
    this.save.set('growth', serializeGrowthProgress(this.growth));
  }
}

// 플랫폼(웹·앱인토스)을 고르고 사용자 슬롯의 저장을 한 번에 읽어 온 뒤 게임을 시작합니다.
export async function startMvpReleaseIntegration(parent: string) {
  const element = document.getElementById(parent);
  if (!element) throw new Error(`MVP release integration parent not found: ${parent}`);
  const platform = await createPlatform();
  const save = await SaveStore.open(platform.storage, {
    entries: SAVE_ENTRIES,
    playerKey: await platform.getPlayerKey(),
    legacyKeys: LEGACY_SAVE_KEYS,
    onError: (error) => console.warn('[save] 진행 저장에 실패했습니다. 이번 실행 동안은 메모리 진행으로 이어갑니다.', error),
  });
  return new MvpReleaseIntegrationController(element, platform, save);
}
