// Web Audio sound engine: decodes every sound once, plays one-shots, and keeps two looping layers
// (the ambient drone and the relic's heartbeat for its current stage).
// Phones only allow audio after a tap, so the context is unlocked on the first pointer or key press.

export type Sfx =
  | 'answer_correct' | 'answer_wrong' | 'countdown_tick' | 'life_lost' | 'pass_whoosh'
  | 'player_eliminated' | 'player_join' | 'relic_burst' | 'win_sting';
export type Loop = 'ambient_loop' | 'relic_dormant_loop' | 'relic_awake_loop' | 'relic_critical_loop';

const ALL = [
  'answer_correct', 'answer_wrong', 'countdown_tick', 'life_lost', 'pass_whoosh', 'player_eliminated',
  'player_join', 'relic_burst', 'win_sting', 'ambient_loop', 'relic_dormant_loop', 'relic_awake_loop', 'relic_critical_loop',
] as const;

const VOLUME: Partial<Record<Sfx | Loop, number>> = {
  ambient_loop: 0.35, countdown_tick: 0.5, player_join: 0.6, relic_dormant_loop: 0.7,
};

class SoundEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private buffers = new Map<string, AudioBuffer>();
  private loading: Promise<void> | null = null;
  private layers = new Map<'ambient' | 'relic', { name: Loop; src: AudioBufferSourceNode; gain: GainNode }>();
  private wanted: { ambient: Loop | null; relic: Loop | null } = { ambient: null, relic: null };
  private listeners = new Set<() => void>();
  muted = localStorage.getItem('relic:muted') === '1';

  constructor() {
    const unlock = () => {
      this.init();
      void this.ctx?.resume();
    };
    window.addEventListener('pointerdown', unlock, { passive: true });
    window.addEventListener('keydown', unlock);
  }

  private init() {
    if (this.ctx) return;
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    this.ctx = new Ctor();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 1;
    this.master.connect(this.ctx.destination);
    this.loading = Promise.all(ALL.map(async (name) => {
      try {
        const res = await fetch(`/assets/sfx/${name}.mp3`);
        this.buffers.set(name, await this.ctx!.decodeAudioData(await res.arrayBuffer()));
      } catch { /* a missing sound should never break the game */ }
    })).then(() => this.applyLoops());
  }

  play(name: Sfx) {
    if (!this.ctx || !this.master || this.muted) return;
    const buf = this.buffers.get(name);
    if (!buf) return;
    const src = this.ctx.createBufferSource();
    const gain = this.ctx.createGain();
    gain.gain.value = VOLUME[name] ?? 1;
    src.buffer = buf;
    src.connect(gain).connect(this.master);
    src.start();
  }

  /** Set which loop each layer should play; null stops it. Crossfades between loops. */
  setLoops(ambient: Loop | null, relic: Loop | null) {
    this.wanted = { ambient, relic };
    this.applyLoops();
  }

  private applyLoops() {
    if (!this.ctx || !this.master) return;
    for (const layer of ['ambient', 'relic'] as const) {
      const want = this.wanted[layer];
      const cur = this.layers.get(layer);
      if (cur?.name === want) continue;
      const now = this.ctx.currentTime;
      if (cur) {
        cur.gain.gain.setTargetAtTime(0, now, 0.08);
        cur.src.stop(now + 0.5);
        this.layers.delete(layer);
      }
      const buf = want && this.buffers.get(want);
      if (!want || !buf) continue;
      const src = this.ctx.createBufferSource();
      const gain = this.ctx.createGain();
      src.buffer = buf;
      src.loop = true;
      gain.gain.value = 0;
      gain.gain.setTargetAtTime(VOLUME[want] ?? 1, now, 0.08);
      src.connect(gain).connect(this.master);
      src.start();
      this.layers.set(layer, { name: want, src, gain });
    }
  }

  toggleMute() {
    this.muted = !this.muted;
    localStorage.setItem('relic:muted', this.muted ? '1' : '0');
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(this.muted ? 0 : 1, this.ctx.currentTime, 0.05);
    this.listeners.forEach((fn) => fn());
  }

  subscribe(fn: () => void) { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; }
}

export const sound = new SoundEngine();
