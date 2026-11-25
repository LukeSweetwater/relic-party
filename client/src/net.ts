import { io, type Socket } from 'socket.io-client';
import type { ClientToServer, JoinRequest, JoinResponse, ServerToClient } from '../../shared/types';

export type GameSocket = Socket<ServerToClient, ClientToServer>;

export const socket: GameSocket = io({ autoConnect: true, transports: ['websocket', 'polling'] });

const tokenKey = (code: string) => `relic:token:${code}`;
export const session = {
  getToken: (code: string) => sessionStorage.getItem(tokenKey(code)) ?? undefined,
  setToken: (code: string, token: string) => sessionStorage.setItem(tokenKey(code), token),
  clearToken: (code: string) => sessionStorage.removeItem(tokenKey(code)),
  get profile(): { name: string; avatar: number } {
    try { return JSON.parse(localStorage.getItem('relic:profile') ?? '') ; } catch { return { name: '', avatar: Math.floor(Math.random() * 10) }; }
  },
  set profile(p: { name: string; avatar: number }) { localStorage.setItem('relic:profile', JSON.stringify(p)); },
};

export function joinRoom(kind: 'room:create' | 'room:join', req: JoinRequest): Promise<JoinResponse> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve({ ok: false, error: 'The server did not answer. Try again.' }), 8000);
    socket.emit(kind, req, (res) => { clearTimeout(timer); resolve(res); });
  });
}

/** Room code from a /r/ABCD link, if any. */
export function codeFromUrl(): string | null {
  const m = location.pathname.match(/^\/r\/([A-Za-z]{4})$/);
  return m ? m[1].toUpperCase() : null;
}
