/**
 * Web Audio API cardiac auscultation synthesizer.
 * Generates realistic S1 (lub) and S2 (dub) heart sounds matching the patient's pulse rate.
 * Synthesized mathematically with zero external audio assets.
 */

class CardiacAudioEngine {
  private ctx: AudioContext | null = null;
  private timerId: number | null = null;
  private _enabled = false;
  private _bpm = 72;
  private _volume = 0.35;

  private initContext() {
    if (!this.ctx && typeof window !== "undefined") {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === "suspended") {
      this.ctx.resume().catch(() => {});
    }
  }

  public get isEnabled(): boolean {
    return this._enabled;
  }

  public setEnabled(enable: boolean) {
    this._enabled = enable;
    if (enable) {
      this.initContext();
      this.startLoop();
    } else {
      this.stopLoop();
    }
  }

  public toggle(): boolean {
    this.setEnabled(!this._enabled);
    return this._enabled;
  }

  public setBpm(bpm: number) {
    if (bpm >= 30 && bpm <= 220) {
      this._bpm = bpm;
      if (this._enabled) {
        // Restart loop with new interval
        this.stopLoop();
        this.startLoop();
      }
    }
  }

  public setVolume(vol: number) {
    this._volume = Math.max(0, Math.min(1, vol));
  }

  private startLoop() {
    if (this.timerId !== null) return;
    this.playBeat();
    const intervalMs = (60 / this._bpm) * 1000;
    this.timerId = window.setInterval(() => {
      this.playBeat();
    }, intervalMs);
  }

  private stopLoop() {
    if (this.timerId !== null) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
  }

  /**
   * Synthesizes one cardiac cycle:
   * S1 (lub): Mitral & tricuspid valve closure. Resonant 45-65 Hz decaying tone.
   * S2 (dub): Aortic & pulmonary valve closure. Higher-pitch 85-115 Hz sharper tone.
   */
  public playBeat() {
    if (!this.ctx || this.ctx.state !== "running" || !this._enabled) return;

    const now = this.ctx.currentTime;
    const vol = this._volume;

    // --- S1 ("lub") at t = 0 ---
    const osc1 = this.ctx.createOscillator();
    const gain1 = this.ctx.createGain();
    const filter1 = this.ctx.createBiquadFilter();

    filter1.type = "lowpass";
    filter1.frequency.setValueAtTime(140, now);

    osc1.type = "sine";
    osc1.frequency.setValueAtTime(68, now);
    osc1.frequency.exponentialRampToValueAtTime(42, now + 0.11);

    gain1.gain.setValueAtTime(0.001, now);
    gain1.gain.linearRampToValueAtTime(0.42 * vol, now + 0.02);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.13);

    osc1.connect(filter1);
    filter1.connect(gain1);
    gain1.connect(this.ctx.destination);

    osc1.start(now);
    osc1.stop(now + 0.14);

    // --- S2 ("dub") occurs after systolic ejection interval (~0.28-0.34s) ---
    const s2Delay = Math.min(0.35, Math.max(0.22, (60 / this._bpm) * 0.36));
    const s2Time = now + s2Delay;

    const osc2 = this.ctx.createOscillator();
    const gain2 = this.ctx.createGain();
    const filter2 = this.ctx.createBiquadFilter();

    filter2.type = "lowpass";
    filter2.frequency.setValueAtTime(220, s2Time);

    osc2.type = "sine";
    osc2.frequency.setValueAtTime(110, s2Time);
    osc2.frequency.exponentialRampToValueAtTime(74, s2Time + 0.09);

    gain2.gain.setValueAtTime(0.001, s2Time);
    gain2.gain.linearRampToValueAtTime(0.5 * vol, s2Time + 0.018);
    gain2.gain.exponentialRampToValueAtTime(0.001, s2Time + 0.11);

    osc2.connect(filter2);
    filter2.connect(gain2);
    gain2.connect(this.ctx.destination);

    osc2.start(s2Time);
    osc2.stop(s2Time + 0.12);
  }
}

export const cardiacAudio = new CardiacAudioEngine();
