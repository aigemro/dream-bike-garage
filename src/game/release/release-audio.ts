export type ReleaseAudioRoom = 'title' | 'home' | 'work' | 'reward';
export type ReleaseSfxEvent = 'tap' | 'start' | 'parcel' | 'merge' | 'install' | 'complete' | 'reward' | 'error';

const ROOM_NOTES: Record<ReleaseAudioRoom, number[]> = {
  title: [261.63, 329.63, 392, 329.63, 293.66, 349.23, 392, 349.23],
  home: [261.63, 329.63, 392, 523.25, 392, 329.63, 293.66, 349.23],
  work: [261.63, 392, 329.63, 440, 293.66, 392, 349.23, 493.88],
  reward: [392, 493.88, 523.25, 659.25, 523.25, 493.88, 440, 523.25],
};

export class ReleaseAudio {
  private context?: AudioContext;
  private musicTimer?: number;
  private step = 0;
  private room: ReleaseAudioRoom = 'title';
  private bgm = true;
  private sfx = true;

  setEnabled(bgm: boolean, sfx: boolean) {
    this.bgm = bgm;
    this.sfx = sfx;
    if (!bgm) this.stopMusic();
    else if (this.context) this.startMusic();
  }

  setRoom(room: ReleaseAudioRoom) {
    this.room = room;
    this.step = 0;
  }

  unlock() {
    if (!this.context) this.context = new AudioContext();
    void this.context.resume();
    if (this.bgm) this.startMusic();
  }

  play(event: ReleaseSfxEvent) {
    if (!this.sfx) return;
    this.unlock();
    const patterns: Record<ReleaseSfxEvent, Array<[number, number, OscillatorType, number]>> = {
      tap: [[330, .05, 'triangle', .025]],
      start: [[392, .08, 'triangle', .035], [523.25, .12, 'triangle', .03]],
      parcel: [[180, .06, 'square', .025], [260, .08, 'triangle', .025]],
      merge: [[330, .06, 'square', .03], [440, .07, 'square', .03], [659.25, .1, 'triangle', .025]],
      install: [[220, .04, 'square', .028], [294, .06, 'triangle', .025]],
      complete: [[392, .08, 'triangle', .035], [523.25, .1, 'triangle', .035], [659.25, .16, 'triangle', .03]],
      reward: [[523.25, .06, 'sine', .035], [659.25, .08, 'sine', .035], [783.99, .14, 'triangle', .03]],
      error: [[180, .08, 'sawtooth', .018], [145, .12, 'sawtooth', .015]],
    };
    let delay = 0;
    patterns[event].forEach(([frequency, duration, wave, volume]) => {
      this.tone(frequency, duration, wave, volume, delay);
      delay += duration * .65;
    });
  }

  destroy() {
    this.stopMusic();
    void this.context?.close();
    this.context = undefined;
  }

  private startMusic() {
    if (!this.context || this.musicTimer || !this.bgm) return;
    const tick = () => {
      if (!this.bgm || !this.context) return;
      const notes = ROOM_NOTES[this.room];
      const frequency = notes[this.step % notes.length];
      const wave: OscillatorType = this.room === 'work' ? 'square' : 'triangle';
      this.tone(frequency, .16, wave, this.room === 'work' ? .012 : .016);
      if (this.step % 2 === 0) this.tone(frequency / 2, .22, 'sine', .01);
      this.step += 1;
    };
    tick();
    this.musicTimer = window.setInterval(tick, 360);
  }

  private stopMusic() {
    if (this.musicTimer) window.clearInterval(this.musicTimer);
    this.musicTimer = undefined;
  }

  private tone(frequency: number, duration: number, wave: OscillatorType, volume: number, delay = 0) {
    if (!this.context) return;
    const start = this.context.currentTime + delay;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = wave;
    oscillator.frequency.setValueAtTime(frequency, start);
    gain.gain.setValueAtTime(.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + .012);
    gain.gain.exponentialRampToValueAtTime(.0001, start + duration);
    oscillator.connect(gain).connect(this.context.destination);
    oscillator.start(start);
    oscillator.stop(start + duration + .02);
  }
}
