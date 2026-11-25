import {
  AVATAR_COUNT, DEFAULT_SETTINGS, MAX_PLAYERS, MIN_PLAYERS,
  type AcceptedAnswer, type AnswerResult, type GameEvent, type Phase, type PublicPlayer, type RoomState, type Settings,
} from '../../shared/types.js';
import { matchAnswer, type Category } from './answers.js';

export interface Clock {
  now(): number;
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

export const realClock: Clock = {
  now: () => Date.now(),
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (h) => clearTimeout(h as NodeJS.Timeout),
};

interface Player {
  id: string;
  token: string;
  name: string;
  avatar: number;
  lives: number;
  connected: boolean;
  place: number | null;
}

export interface RoomOptions {
  clock?: Clock;
  random?: () => number;
  categories: Category[];
  onChange?: () => void;
  onEvent?: (e: GameEvent) => void;
}

export const NAME_MAX = 16;

export function cleanName(raw: string): string {
  return raw.replace(/[\u0000-\u001f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, NAME_MAX);
}

export class Room {
  readonly code: string;
  phase: Phase = 'lobby';
  settings: Settings = { ...DEFAULT_SETTINGS };
  hostId: string | null = null;

  private players = new Map<string, Player>();
  private order: string[] = [];
  private category: Category | null = null;
  private deck: Category[] = [];
  private used = new Set<string>();
  private answers: AcceptedAnswer[] = [];
  private holderId: string | null = null;
  private fuseEndsAt: number | null = null;
  private fuseHandle: unknown = null;
  private typing = '';
  private winnerId: string | null = null;
  private round = 0;
  private nextPlace = 0;
  private idSeq = 0;

  private clock: Clock;
  private random: () => number;
  private categories: Category[];
  private onChange: () => void;
  private onEvent: (e: GameEvent) => void;

  constructor(code: string, opts: RoomOptions) {
    this.code = code;
    this.clock = opts.clock ?? realClock;
    this.random = opts.random ?? Math.random;
    this.categories = opts.categories;
    this.onChange = opts.onChange ?? (() => {});
    this.onEvent = opts.onEvent ?? (() => {});
  }

  get playerCount() { return this.players.size; }
  get connectedCount() { return [...this.players.values()].filter((p) => p.connected).length; }
  hasPlayer(id: string) { return this.players.has(id); }

  /** Adds a player. Returns null with a reason if they can't join. */
  join(rawName: string, avatar: number): { player: { id: string; token: string } } | { error: string } {
    const name = cleanName(rawName);
    if (!name) return { error: 'Pick a nickname first.' };
    if (this.phase !== 'lobby') return { error: 'That game has already started.' };
    if (this.players.size >= MAX_PLAYERS) return { error: `Room is full (${MAX_PLAYERS} players max).` };
    if ([...this.players.values()].some((p) => p.name.toLowerCase() === name.toLowerCase()))
      return { error: 'Someone in this room already has that nickname.' };
    const id = `p${++this.idSeq}`;
    const token = `${this.code}.${id}.${Math.floor(this.random() * 1e12).toString(36)}`;
    const player: Player = {
      id, token, name,
      avatar: Number.isInteger(avatar) && avatar >= 0 && avatar < AVATAR_COUNT ? avatar : 0,
      lives: this.settings.lives, connected: true, place: null,
    };
    this.players.set(id, player);
    this.order.push(id);
    if (!this.hostId) this.hostId = id;
    this.onEvent({ type: 'join', playerId: id });
    this.onChange();
    return { player: { id, token } };
  }

  /** Reclaims a seat with a token from an earlier connection. */
  rejoin(token: string): string | null {
    const p = [...this.players.values()].find((x) => x.token === token);
    if (!p) return null;
    p.connected = true;
    this.onChange();
    return p.id;
  }

  setConnected(id: string, connected: boolean) {
    const p = this.players.get(id);
    if (!p) return;
    p.connected = connected;
    if (!connected && this.hostId === id) this.passHost();
    this.onChange();
  }

  /** Removes a player entirely (lobby only, or after a long disconnect). */
  remove(id: string) {
    if (!this.players.has(id)) return;
    if (this.phase === 'playing') {
      const p = this.players.get(id)!;
      if (p.lives > 0) this.eliminate(p);
      if (this.phase === 'playing' && this.holderId === id) this.passTo(this.nextAlive(id));
    }
    this.players.delete(id);
    this.order = this.order.filter((x) => x !== id);
    if (this.hostId === id) this.passHost();
    this.onChange();
  }

  private passHost() {
    const next = this.order.find((id) => id !== this.hostId && this.players.get(id)?.connected);
    this.hostId = next ?? this.order.find((id) => id !== this.hostId) ?? null;
  }

  updateSettings(byId: string, s: Partial<Settings>) {
    if (byId !== this.hostId || this.phase !== 'lobby') return;
    if (typeof s.lives === 'number') this.settings.lives = Math.min(5, Math.max(1, Math.round(s.lives)));
    if (typeof s.fuseMs === 'number') this.settings.fuseMs = Math.min(60_000, Math.max(200, Math.round(s.fuseMs)));
    for (const p of this.players.values()) p.lives = this.settings.lives;
    this.onChange();
  }

  start(byId: string): { ok: boolean; error?: string } {
    if (byId !== this.hostId) return { ok: false, error: 'Only the host can start.' };
    if (this.phase === 'playing') return { ok: false, error: 'Already playing.' };
    if (this.players.size < MIN_PLAYERS) return { ok: false, error: `Need at least ${MIN_PLAYERS} players.` };
    this.phase = 'playing';
    this.winnerId = null;
    this.round = 0;
    this.nextPlace = this.players.size;
    this.deck = [];
    for (const p of this.players.values()) { p.lives = this.settings.lives; p.place = null; }
    this.onEvent({ type: 'start' });
    const first = this.order[Math.floor(this.random() * this.order.length)];
    this.newRound(first);
    return { ok: true };
  }

  /** Back to the lobby with the same players ("play again"). */
  reset(byId: string) {
    if (byId !== this.hostId || this.phase !== 'ended') return;
    this.phase = 'lobby';
    this.stopFuse();
    this.category = null; this.holderId = null; this.answers = []; this.typing = ''; this.winnerId = null;
    for (const p of this.players.values()) { p.lives = this.settings.lives; p.place = null; }
    this.onChange();
  }

  setTyping(byId: string, text: string) {
    if (this.phase !== 'playing' || byId !== this.holderId) return;
    this.typing = text.slice(0, 40);
    this.onChange();
  }

  submit(byId: string, text: string): AnswerResult {
    if (this.phase !== 'playing' || !this.category) return { ok: false, reason: 'not-playing' };
    if (byId !== this.holderId) return { ok: false, reason: 'not-your-turn' };
    if (!text.trim()) return { ok: false, reason: 'empty' };
    const canonical = matchAnswer(this.category, text);
    if (!canonical) { this.onEvent({ type: 'reject', playerId: byId, reason: 'wrong' }); return { ok: false, reason: 'wrong' }; }
    if (this.used.has(canonical)) { this.onEvent({ type: 'reject', playerId: byId, reason: 'repeat' }); return { ok: false, reason: 'repeat' }; }
    this.used.add(canonical);
    this.answers.push({ playerId: byId, text: canonical });
    const to = this.nextAlive(byId);
    this.onEvent({ type: 'pass', from: byId, to, text: canonical });
    this.passTo(to);
    return { ok: true, text: canonical };
  }

  private newRound(holder: string) {
    this.round++;
    if (this.deck.length === 0) this.deck = shuffle([...this.categories], this.random);
    this.category = this.deck.pop()!;
    this.used.clear();
    this.answers = [];
    this.passTo(holder);
  }

  private passTo(id: string) {
    this.holderId = id;
    this.typing = '';
    this.startFuse();
    this.onChange();
  }

  private startFuse() {
    this.stopFuse();
    this.fuseEndsAt = this.clock.now() + this.settings.fuseMs;
    this.fuseHandle = this.clock.setTimeout(() => this.pop(), this.settings.fuseMs);
  }

  private stopFuse() {
    if (this.fuseHandle !== null) this.clock.clearTimeout(this.fuseHandle);
    this.fuseHandle = null;
    this.fuseEndsAt = null;
  }

  /** The fuse ran out on the current holder. */
  pop() {
    this.fuseHandle = null;
    if (this.phase !== 'playing' || !this.holderId) return;
    const p = this.players.get(this.holderId)!;
    p.lives = Math.max(0, p.lives - 1);
    this.onEvent({ type: 'pop', playerId: p.id, livesLeft: p.lives });
    if (p.lives === 0) this.eliminate(p);
    if (this.phase !== 'playing') return;
    // A new category starts and the relic moves on to the next living player.
    this.newRound(this.nextAlive(p.id));
  }

  private eliminate(p: Player) {
    p.lives = 0;
    p.place = this.nextPlace--;
    this.onEvent({ type: 'eliminated', playerId: p.id });
    const alive = this.alive();
    if (alive.length <= 1) {
      this.stopFuse();
      this.phase = 'ended';
      this.holderId = null;
      this.typing = '';
      const winner = alive[0];
      if (winner) { winner.place = 1; this.winnerId = winner.id; this.onEvent({ type: 'win', playerId: winner.id }); }
      this.onChange();
    }
  }

  private alive() { return this.order.map((id) => this.players.get(id)!).filter((p) => p.lives > 0); }

  /** Next player clockwise after `id` who still has lives. */
  private nextAlive(id: string): string {
    const i = this.order.indexOf(id);
    for (let k = 1; k <= this.order.length; k++) {
      const cand = this.order[(i + k) % this.order.length];
      if (this.players.get(cand)!.lives > 0) return cand;
    }
    return id;
  }

  publicState(): RoomState {
    const players: PublicPlayer[] = this.order.map((id) => {
      const p = this.players.get(id)!;
      return { id, name: p.name, avatar: p.avatar, lives: p.lives, connected: p.connected, isHost: id === this.hostId, place: p.place };
    });
    return {
      code: this.code, phase: this.phase, settings: { ...this.settings }, players, order: [...this.order],
      category: this.category?.name ?? null, holderId: this.holderId, fuseEndsAt: this.fuseEndsAt,
      serverNow: this.clock.now(), answers: [...this.answers], typing: this.typing, winnerId: this.winnerId, round: this.round,
    };
  }

  dispose() { this.stopFuse(); }
}

function shuffle<T>(arr: T[], random: () => number): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
