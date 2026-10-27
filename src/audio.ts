/** Tiny WebAudio synth — every sound is generated, there are no audio files. */
export class Sfx {
  muted = false;
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;

  /** Must be called from a user gesture (browsers block autoplay). */
  unlock(): void {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.22;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  private tone(freq: number, dur: number, type: OscillatorType = 'sine', delay = 0, vol = 1, slideTo?: number): void {
    if (this.muted || !this.ctx || !this.master) return;
    const t0 = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const env = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    env.gain.setValueAtTime(0.0001, t0);
    env.gain.exponentialRampToValueAtTime(vol, t0 + 0.012);
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(env).connect(this.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  order() { this.tone(880, 0.12, 'triangle', 0, 0.7); this.tone(1320, 0.16, 'triangle', 0.07, 0.6); }
  block() { this.tone(220, 0.18, 'square', 0, 0.25, 110); }
  unblock() { this.tone(330, 0.12, 'triangle', 0, 0.5, 660); }
  depart() { [523, 659, 784].forEach((f, i) => this.tone(f, 0.14, 'triangle', i * 0.08, 0.5)); }
  replan() { this.tone(1200, 0.08, 'sine', 0, 0.35); this.tone(1600, 0.1, 'sine', 0.06, 0.3); }
  stuck() { this.tone(300, 0.22, 'sawtooth', 0, 0.25, 180); this.tone(300, 0.22, 'sawtooth', 0.25, 0.25, 180); }
  deliver() { [784, 988, 1175, 1568].forEach((f, i) => this.tone(f, 0.22, 'sine', i * 0.07, 0.55)); }
  home() { [392, 523].forEach((f, i) => this.tone(f, 0.25, 'triangle', i * 0.12, 0.45)); }
}
