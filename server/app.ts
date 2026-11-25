import express from 'express';
import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { Server, type Socket } from 'socket.io';
import type { ClientToServer, JoinRequest, JoinResponse, ServerToClient } from '../shared/types.js';
import { Lobby } from './game/lobby.js';
import type { Room } from './game/room.js';

type AppSocket = Socket<ClientToServer, ServerToClient, Record<string, never>, { code?: string; playerId?: string }>;

const RECONNECT_GRACE_MS = 60_000;
const ANSWERS_PER_SECOND = 5;

export function createApp(opts: { staticDir?: string } = {}) {
  const app = express();
  const http = createServer(app);
  const io = new Server<ClientToServer, ServerToClient>(http, { cors: { origin: true } });

  const lobby = new Lobby({
    onChange: (room) => io.to(room.code).emit('room:state', room.publicState()),
    onEvent: (room, e) => io.to(room.code).emit('game:event', e),
  });
  const dropTimers = new Map<string, NodeJS.Timeout>();

  app.get('/healthz', (_req, res) => { res.json({ ok: true, rooms: lobby.size }); });

  const staticDir = opts.staticDir ?? defaultStaticDir();
  if (staticDir && existsSync(staticDir)) {
    app.use(express.static(staticDir));
    // Room links like /r/ABCD load the app, which reads the code from the URL.
    app.get(/^\/r\/[A-Za-z]{4}$/, (_req, res) => res.sendFile(path.join(staticDir, 'index.html')));
  }

  io.on('connection', (raw) => {
    const socket = raw as AppSocket;
    let answerWindow = { start: 0, count: 0 };

    const attach = (room: Room, playerId: string, token: string): JoinResponse => {
      socket.data.code = room.code;
      socket.data.playerId = playerId;
      socket.join(room.code);
      const key = `${room.code}:${playerId}`;
      clearTimeout(dropTimers.get(key));
      dropTimers.delete(key);
      lobby.checkEmpty(room);
      socket.emit('room:state', room.publicState());
      return { ok: true, code: room.code, playerId, token };
    };

    const current = () => {
      const { code, playerId } = socket.data;
      const room = code ? lobby.get(code) : undefined;
      return room && playerId && room.hasPlayer(playerId) ? { room, playerId } : null;
    };

    socket.on('room:create', (req: JoinRequest, cb) => {
      if (typeof cb !== 'function') return;
      if (current()) return cb({ ok: false, error: 'You are already in a room.' });
      const room = lobby.create();
      const res = room.join(String(req?.name ?? ''), Number(req?.avatar));
      if ('error' in res) { lobby.checkEmpty(room); return cb({ ok: false, error: res.error }); }
      cb(attach(room, res.player.id, res.player.token));
    });

    socket.on('room:join', (req: JoinRequest, cb) => {
      if (typeof cb !== 'function') return;
      if (current()) return cb({ ok: false, error: 'You are already in a room.' });
      const room = lobby.get(String(req?.code ?? ''));
      if (!room) return cb({ ok: false, error: 'No room with that code.' });
      if (req.token) {
        const id = room.rejoin(String(req.token));
        if (id) return cb(attach(room, id, String(req.token)));
      }
      const res = room.join(String(req?.name ?? ''), Number(req?.avatar));
      if ('error' in res) return cb({ ok: false, error: res.error });
      cb(attach(room, res.player.id, res.player.token));
    });

    socket.on('room:settings', (s) => { const c = current(); if (c && s && typeof s === 'object') c.room.updateSettings(c.playerId, s); });

    socket.on('game:start', (cb) => {
      const c = current();
      const res = c ? c.room.start(c.playerId) : { ok: false, error: 'Not in a room.' };
      if (typeof cb === 'function') cb(res);
    });

    socket.on('game:answer', (text, cb) => {
      if (typeof cb !== 'function') return;
      const c = current();
      if (!c) return cb({ ok: false, reason: 'not-playing' });
      const now = Date.now();
      if (now - answerWindow.start > 1000) answerWindow = { start: now, count: 0 };
      if (++answerWindow.count > ANSWERS_PER_SECOND) return cb({ ok: false, reason: 'wrong' });
      cb(c.room.submit(c.playerId, String(text ?? '').slice(0, 60)));
    });

    socket.on('game:typing', (text) => { const c = current(); if (c) c.room.setTyping(c.playerId, String(text ?? '')); });
    socket.on('game:again', () => { const c = current(); if (c) c.room.reset(c.playerId); });

    socket.on('disconnect', () => {
      const c = current();
      if (!c) return;
      const { room, playerId } = c;
      room.setConnected(playerId, false);
      lobby.checkEmpty(room);
      // In the lobby, free the seat if they don't come back. Mid-game they keep their seat (and their turns still time out).
      const key = `${room.code}:${playerId}`;
      dropTimers.set(key, setTimeout(() => {
        dropTimers.delete(key);
        if (room.phase === 'lobby' && room.hasPlayer(playerId) && !room.publicState().players.find((p) => p.id === playerId)?.connected) {
          room.remove(playerId);
        }
      }, RECONNECT_GRACE_MS));
    });
  });

  return { app, http, io, lobby };
}

function defaultStaticDir() {
  // Works both from source (tsx server/app.ts) and from the compiled dist/server/server/app.js
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [path.resolve(here, '../dist/client'), path.resolve(here, '../../client')];
  return candidates.find((p) => existsSync(path.join(p, 'index.html')));
}
