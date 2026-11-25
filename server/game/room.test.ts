import { describe, expect, it } from 'vitest';
import type { GameEvent } from '../../shared/types.js';
import { buildCategory } from './answers.js';
import { FakeClock } from './fakeClock.js';
import { Room } from './room.js';

const cats = [buildCategory('Fruits', ['apple', 'banana', 'cherry', 'grape', 'mango', 'pear'])];

function setup(n: number, opts: { lives?: number } = {}) {
  const clock = new FakeClock();
  const events: GameEvent[] = [];
  const room = new Room('ABCD', { clock, random: () => 0, categories: cats, onEvent: (e) => events.push(e) });
  const ids: string[] = [];
  for (let i = 0; i < n; i++) {
    const r = room.join(`P${i}`, i);
    if ('error' in r) throw new Error(r.error);
    ids.push(r.player.id);
  }
  if (opts.lives) room.updateSettings(ids[0], { lives: opts.lives });
  return { clock, room, ids, events };
}

describe('Room lobby', () => {
  it('makes the first player host and only lets the host start', () => {
    const { room, ids } = setup(2);
    expect(room.publicState().players[0].isHost).toBe(true);
    expect(room.start(ids[1]).ok).toBe(false);
    expect(room.start(ids[0]).ok).toBe(true);
  });
  it('needs at least 2 players', () => {
    const { room, ids } = setup(1);
    expect(room.start(ids[0])).toEqual({ ok: false, error: 'Need at least 2 players.' });
  });
  it('caps the room at 15 players', () => {
    const { room } = setup(15);
    expect(room.join('Late', 0)).toEqual({ error: 'Room is full (15 players max).' });
  });
  it('rejects duplicate or empty nicknames', () => {
    const { room } = setup(1);
    expect(room.join('p0', 1)).toHaveProperty('error');
    expect(room.join('   ', 1)).toHaveProperty('error');
  });
  it('lets a player reclaim their seat with their token', () => {
    const { room } = setup(1);
    const r = room.join('Back', 2);
    if ('error' in r) throw new Error();
    room.setConnected(r.player.id, false);
    expect(room.rejoin(r.player.token)).toBe(r.player.id);
    expect(room.rejoin('nope')).toBeNull();
  });
});

describe('Room gameplay', () => {
  it('uses a fixed 15 s fuse that resets on every pass', () => {
    const { room, ids, clock } = setup(3);
    room.start(ids[0]);
    const s = room.publicState();
    expect(s.holderId).toBe(ids[0]); // random() = 0 picks the first seat
    expect(s.fuseEndsAt! - s.serverNow).toBe(15_000);
    clock.advance(10_000);
    expect(room.submit(ids[0], 'apple')).toEqual({ ok: true, text: 'apple' });
    const after = room.publicState();
    expect(after.holderId).toBe(ids[1]);
    expect(after.fuseEndsAt! - after.serverNow).toBe(15_000);
  });

  it('only the holder can answer; wrong and repeated answers keep the relic', () => {
    const { room, ids } = setup(2);
    room.start(ids[0]);
    expect(room.submit(ids[1], 'apple')).toEqual({ ok: false, reason: 'not-your-turn' });
    expect(room.submit(ids[0], 'carrot')).toEqual({ ok: false, reason: 'wrong' });
    room.submit(ids[0], 'apple');
    expect(room.submit(ids[1], 'Apples')).toEqual({ ok: false, reason: 'repeat' });
    expect(room.publicState().holderId).toBe(ids[1]);
  });

  it('costs the holder a life when the fuse pops and starts a fresh round with the next player', () => {
    const { room, ids, clock, events } = setup(3);
    room.start(ids[0]);
    room.submit(ids[0], 'apple');
    clock.advance(15_000);
    const s = room.publicState();
    expect(s.players[1].lives).toBe(2);
    expect(events).toContainEqual({ type: 'pop', playerId: ids[1], livesLeft: 2 });
    expect(s.holderId).toBe(ids[2]);
    expect(s.answers).toEqual([]);
    expect(s.round).toBe(2);
  });

  it('eliminates players at 0 lives, skips them, and declares the last one standing the winner', () => {
    const { room, ids, clock, events } = setup(3, { lives: 1 });
    room.start(ids[0]);
    clock.advance(15_000); // P0 out
    expect(room.publicState().holderId).toBe(ids[1]);
    room.submit(ids[1], 'banana'); // -> P2 (P0 skipped)
    expect(room.publicState().holderId).toBe(ids[2]);
    clock.advance(15_000); // P2 out, P1 wins
    const s = room.publicState();
    expect(s.phase).toBe('ended');
    expect(s.winnerId).toBe(ids[1]);
    expect(s.players.map((p) => p.place)).toEqual([3, 1, 2]);
    expect(events.at(-1)).toEqual({ type: 'win', playerId: ids[1] });
  });

  it('plays again with the same players', () => {
    const { room, ids, clock } = setup(2, { lives: 1 });
    room.start(ids[0]);
    clock.advance(15_000);
    expect(room.phase).toBe('ended');
    room.reset(ids[0]);
    const s = room.publicState();
    expect(s.phase).toBe('lobby');
    expect(s.players.every((p) => p.lives === 1 && p.place === null)).toBe(true);
    expect(room.start(ids[0]).ok).toBe(true);
  });

  it('hands host to another player when the host disconnects', () => {
    const { room, ids } = setup(3);
    room.setConnected(ids[0], false);
    expect(room.hostId).toBe(ids[1]);
  });

  it('keeps the game going if the holder leaves mid-game', () => {
    const { room, ids } = setup(3);
    room.start(ids[0]);
    room.remove(ids[0]);
    const s = room.publicState();
    expect(s.phase).toBe('playing');
    expect(s.holderId).toBe(ids[1]);
  });
});
