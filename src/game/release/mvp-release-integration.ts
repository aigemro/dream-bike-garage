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

type ReleaseScreen = 'title' | 'home' | 'guide' | 'game' | 'reward' | 'catalog' | 'showcase' | 'dream' | 'profile' | 'settings';
type ReleaseState = {
  version: 1;
  coins: number;
  completedOrders: number;
  orderIndex: number;
  tutorialDone: boolean;
  bgm: boolean;
  sfx: boolean;
  vibration: boolean;
};

const STORAGE_KEY = 'dbg-lab-mvp-release-integration-v1';
const DEFAULT_STATE: ReleaseState = {
  version: 1,
  coins: 2480,
  completedOrders: 0,
  orderIndex: 0,
  tutorialDone: false,
  bgm: true,
  sfx: true,
  vibration: false,
};

export class MvpReleaseIntegrationController {
  private game?: Phaser.Game;
  private readonly audio = new ReleaseAudio();
  private state = this.loadState();
  private screen: ReleaseScreen = 'title';
  private selectedBikeId = 'dream-road';
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
        onPlay: () => this.show(this.state.tutorialDone ? 'game' : 'guide'),
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
        onOrderComplete: () => {
          this.state.completedOrders += 1;
          this.saveState();
          this.show('reward');
        },
        onSfx: (event) => this.play(event),
      });
      return;
    }
    if (screen === 'reward') {
      const reward = 1000 + this.state.orderIndex * 400;
      this.game = startRewardSettlementPrototype(this.stageId, {
        initialCoins: this.state.coins,
        reward,
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
        initialBikeId: this.selectedBikeId,
        onHome: () => this.show('home'),
        onCatalog: () => this.show('catalog'),
        onShowcase: () => this.show('showcase'),
        onDreamGrowth: () => this.show('dream'),
        onBikeDetail: (bikeId) => { this.selectedBikeId = bikeId; this.show('dream'); },
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
      onReset: () => { this.state = { ...DEFAULT_STATE }; localStorage.removeItem(STORAGE_KEY); window.setTimeout(() => this.show('title'), 0); },
      onToggle: (key, value) => {
        this.state[key] = value;
        this.audio.setEnabled(this.state.bgm, this.state.sfx);
        this.saveState();
        this.refreshShell();
      },
      onSfx: (event) => this.play(event),
    });
  }

  private advanceOrder() {
    this.state.orderIndex = (this.state.orderIndex + 1) % 2;
    this.saveState();
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
      if (!saved || saved.version !== 1) return { ...DEFAULT_STATE };
      return { ...DEFAULT_STATE, ...saved };
    } catch {
      return { ...DEFAULT_STATE };
    }
  }

  private saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
  }
}

export function startMvpReleaseIntegration(parent: string) {
  const element = document.getElementById(parent);
  if (!element) throw new Error(`MVP release integration parent not found: ${parent}`);
  return new MvpReleaseIntegrationController(element);
}
