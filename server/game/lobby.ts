import type { GameEvent } from '../../shared/types.js';
import { Room, realClock, type Clock } from './room.js';
import { STARTER_PACK, type Category } from './answers.js';

const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // no I or O, they read like 1 and 0

export interface RoomHooks {
  onChange(room: Room): void;
  onEvent(room: Room, e: GameEvent): void;
}

/** Owns every live room and cleans up empty ones. */
export class Lobby {
  private rooms = new Map<string, Room>();
  private emptyTimers = new Map<string, unknown>();

  constructor(
    private hooks: RoomHooks,
    private opts: { clock?: Clock; categories?: Category[]; emptyRoomTtlMs?: number } = {},
  ) {}

  get size() { return this.rooms.size; }
  get(code: string) { return this.rooms.get(code.toUpperCase()); }

  create(): Room {
    let code = '';
    do code = Array.from({ length: 4 }, () => LETTERS[Math.floor(Math.random() * LETTERS.length)]).join('');
    while (this.rooms.has(code));
    const room: Room = new Room(code, {
      clock: this.opts.clock,
      categories: this.opts.categories ?? STARTER_PACK,
      onChange: () => this.hooks.onChange(room),
      onEvent: (e) => this.hooks.onEvent(room, e),
    });
    this.rooms.set(code, room);
    return room;
  }

  /** Call when connections change; deletes rooms nobody is connected to after a grace period. */
  checkEmpty(room: Room) {
    const clock = this.opts.clock ?? realClock;
    const pending = this.emptyTimers.get(room.code);
    if (room.connectedCount > 0) {
      if (pending !== undefined) { clock.clearTimeout(pending); this.emptyTimers.delete(room.code); }
      return;
    }
    if (pending !== undefined) return;
    const ttl = this.opts.emptyRoomTtlMs ?? 30 * 60_000;
    this.emptyTimers.set(room.code, clock.setTimeout(() => {
      this.emptyTimers.delete(room.code);
      if (room.connectedCount === 0) { room.dispose(); this.rooms.delete(room.code); }
    }, ttl));
  }
}
