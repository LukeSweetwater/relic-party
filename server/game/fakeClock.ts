import type { Clock } from './room.js';

/** Deterministic clock for tests: time only moves when you call advance(). */
export class FakeClock implements Clock {
  t = 1_000_000;
  private timers: { at: number; fn: () => void; id: number }[] = [];
  private seq = 0;
  now() { return this.t; }
  setTimeout(fn: () => void, ms: number) { const id = ++this.seq; this.timers.push({ at: this.t + ms, fn, id }); return id; }
  clearTimeout(h: unknown) { this.timers = this.timers.filter((x) => x.id !== h); }
  advance(ms: number) {
    const end = this.t + ms;
    for (;;) {
      this.timers.sort((a, b) => a.at - b.at);
      const next = this.timers[0];
      if (!next || next.at > end) break;
      this.timers.shift();
      this.t = next.at;
      next.fn();
    }
    this.t = end;
  }
}
