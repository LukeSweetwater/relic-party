// End-to-end check: starts the real server, connects 3 socket clients, and plays a full game to a winner.
import { io, type Socket } from 'socket.io-client';
import type { ClientToServer, JoinResponse, RoomState, ServerToClient } from '../shared/types.js';
import { createApp } from '../server/app.js';
import { STARTER_PACK } from '../server/game/answers.js';

type C = Socket<ServerToClient, ClientToServer>;
const assert = (cond: unknown, msg: string) => { if (!cond) throw new Error(`E2E FAILED: ${msg}`); console.log(`  ✓ ${msg}`); };

const { http } = createApp();
await new Promise<void>((r) => http.listen(0, r));
const port = (http.address() as { port: number }).port;
const url = `http://localhost:${port}`;

const clients: { s: C; id: string; state: RoomState | null }[] = [];
const connect = () => new Promise<C>((r) => { const s: C = io(url, { transports: ['websocket'] }); s.on('connect', () => r(s)); });
const call = <T>(fn: (cb: (v: T) => void) => void) => new Promise<T>((r) => fn(r));
const waitFor = (pred: () => boolean, ms = 5000) => new Promise<void>((res, rej) => {
  const t0 = Date.now();
  const iv = setInterval(() => { if (pred()) { clearInterval(iv); res(); } else if (Date.now() - t0 > ms) { clearInterval(iv); rej(new Error('timeout')); } }, 10);
});

console.log(`Server on ${url}`);
const host = await connect();
const created = await call<JoinResponse>((cb) => host.emit('room:create', { name: 'Nia', avatar: 0 }, cb));
assert(created.ok, 'host creates a room');
if (!created.ok) process.exit(1);
clients.push({ s: host, id: created.playerId, state: null });

for (const [name, avatar] of [['Sipho', 3], ['Mara', 6]] as const) {
  const s = await connect();
  const res = await call<JoinResponse>((cb) => s.emit('room:join', { name, avatar, code: created.code.toLowerCase() }, cb));
  assert(res.ok, `${name} joins with the room code`);
  if (res.ok) clients.push({ s, id: res.playerId, state: null });
}
for (const c of clients) c.s.on('room:state', (st) => { c.state = st; });

const outsider = await connect();
const bad = await call<JoinResponse>((cb) => outsider.emit('room:join', { name: 'X', avatar: 0, code: 'ZZZZ' }, cb));
assert(!bad.ok, 'joining a missing room is refused');

host.emit('room:settings', { lives: 2, fuseMs: 400 });
await waitFor(() => clients.every((c) => c.state?.settings.fuseMs === 400 && c.state.players.length === 3));
assert(true, 'all 3 clients see the lobby and the host settings');

const started = await call<{ ok: boolean }>((cb) => host.emit('game:start', cb));
assert(started.ok, 'host starts the game');
await waitFor(() => clients.every((c) => c.state?.phase === 'playing'));
assert(true, 'every client is in the game');

// Play: the first holder answers correctly once, then nobody answers and the fuse decides the rest.
const s0 = clients[0].state!;
const holder = clients.find((c) => c.id === s0.holderId)!;
const cat = STARTER_PACK.find((c) => c.name === s0.category)!;
const answer = [...cat.lookup.values()][0];
const notHolder = clients.find((c) => c !== holder)!;
const r1 = await call<{ ok: boolean }>((cb) => notHolder.s.emit('game:answer', answer, cb));
assert(!r1.ok, 'a player without the relic cannot answer');
const r2 = await call<{ ok: boolean }>((cb) => holder.s.emit('game:answer', 'definitely not an answer', cb));
assert(!r2.ok, 'a wrong answer is rejected');
const r3 = await call<{ ok: boolean }>((cb) => holder.s.emit('game:answer', answer, cb));
assert(r3.ok, `a correct answer ("${answer}") passes the relic`);
await waitFor(() => clients.every((c) => c.state?.holderId !== holder.id));
assert(true, 'every client sees the relic move');

await waitFor(() => clients.every((c) => c.state?.phase === 'ended'), 10000);
const end = clients[0].state!;
const winner = end.players.find((p) => p.id === end.winnerId);
assert(winner && end.players.filter((p) => p.lives > 0).length === 1, `game ends with one winner (${winner?.name})`);

host.emit('game:again');
await waitFor(() => clients.every((c) => c.state?.phase === 'lobby'));
assert(true, 'play again returns everyone to the lobby');

// Host removes the last player; they are told and dropped from the room.
const target = clients[2];
let kickedNotice = false;
target.s.on('room:kicked', () => { kickedNotice = true; });
const notHost = await call<{ ok: boolean }>((cb) => clients[1].s.emit('room:kick', target.id, cb));
assert(!notHost.ok, 'a non-host cannot remove players');
const kicked = await call<{ ok: boolean }>((cb) => host.emit('room:kick', target.id, cb));
assert(kicked.ok, 'the host removes a player');
await waitFor(() => kickedNotice && clients[0].state!.players.length === 2);
assert(true, 'the removed player is told, and everyone else sees 2 players');
const after = await call<{ ok: boolean }>((cb) => target.s.emit('game:answer', 'x', cb));
assert(!after.ok, 'the removed player can no longer act in the room');

for (const c of clients) c.s.close();
outsider.close();
http.close();
console.log('E2E passed');
process.exit(0);
