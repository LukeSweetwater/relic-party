import { useEffect, useRef, useState } from 'react';
import type { GameEvent, RoomState } from '../../shared/types';
import { codeFromUrl, joinRoom, session, socket } from './net';
import { Home } from './screens/Home';
import { Lobby } from './screens/Lobby';
import { Game } from './screens/Game';
import { Results } from './screens/Results';

export interface Me { code: string; playerId: string }

export function App() {
  const [state, setState] = useState<RoomState | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [connected, setConnected] = useState(socket.connected);
  const [lastEvent, setLastEvent] = useState<GameEvent | null>(null);
  const offset = useRef(0); // server clock minus local clock
  const meRef = useRef<Me | null>(null);
  meRef.current = me;

  useEffect(() => {
    const onState = (s: RoomState) => { offset.current = s.serverNow - Date.now(); setState(s); };
    const onEvent = (e: GameEvent) => setLastEvent(e);
    const onConnect = async () => {
      setConnected(true);
      // After a network blip the server sees a new socket: reclaim our seat with the saved token.
      const m = meRef.current ?? (codeFromUrl() ? { code: codeFromUrl()!, playerId: '' } : null);
      const token = m ? session.getToken(m.code) : undefined;
      if (m && token) {
        const res = await joinRoom('room:join', { ...session.profile, code: m.code, token });
        if (res.ok) setMe({ code: res.code, playerId: res.playerId });
      }
    };
    const onDisconnect = () => setConnected(false);
    socket.on('room:state', onState);
    socket.on('game:event', onEvent);
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    if (socket.connected) onConnect();
    return () => {
      socket.off('room:state', onState); socket.off('game:event', onEvent);
      socket.off('connect', onConnect); socket.off('disconnect', onDisconnect);
    };
  }, []);

  const onJoined = (code: string, playerId: string, token: string) => {
    session.setToken(code, token);
    history.replaceState(null, '', `/r/${code}`);
    setMe({ code, playerId });
  };

  let screen;
  if (!me || !state) screen = <Home onJoined={onJoined} initialCode={codeFromUrl() ?? ''} />;
  else if (state.phase === 'lobby') screen = <Lobby state={state} me={me} />;
  else if (state.phase === 'playing') screen = <Game state={state} me={me} offset={offset} lastEvent={lastEvent} />;
  else screen = <Results state={state} me={me} />;

  return (
    <div className="app">
      {!connected && <div className="banner">Reconnecting…</div>}
      {screen}
    </div>
  );
}
