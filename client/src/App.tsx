import { useEffect, useRef, useState } from 'react';
import type { RoomState } from '../../shared/types';
import { codeFromUrl, joinRoom, session, socket } from './net';
import { Home } from './screens/Home';
import { Lobby } from './screens/Lobby';
import { Game } from './screens/Game';
import { Results } from './screens/Results';
import { MuteButton } from './MuteButton';
import { onGameEvent } from './events';
import { sound } from './sound';

export interface Me { code: string; playerId: string }

export function App() {
  const [state, setState] = useState<RoomState | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [connected, setConnected] = useState(socket.connected);
  const [notice, setNotice] = useState('');
  const offset = useRef(0); // server clock minus local clock
  const meRef = useRef<Me | null>(null);
  meRef.current = me;

  useEffect(() => {
    const onState = (s: RoomState) => { offset.current = s.serverNow - Date.now(); setState(s); };
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
    const onKicked = () => {
      const code = meRef.current?.code;
      if (code) session.clearToken(code);
      setMe(null);
      setState(null);
      history.replaceState(null, '', '/');
      setNotice('The host removed you from the room.');
    };
    socket.on('room:kicked', onKicked);
    socket.on('room:state', onState);
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    if (socket.connected) onConnect();
    return () => {
      socket.off('room:state', onState);
      socket.off('connect', onConnect); socket.off('disconnect', onDisconnect); socket.off('room:kicked', onKicked);
    };
  }, []);

  // Sound effects for game events. Delays stagger sounds that arrive together.
  useEffect(() => onGameEvent((e) => {
    const myId = meRef.current?.playerId;
    const later = (fn: () => void, ms: number) => setTimeout(fn, ms);
    switch (e.type) {
      case 'join': if (e.playerId !== myId) sound.play('player_join'); break;
      case 'pass': sound.play('pass_whoosh'); if (e.from === myId) sound.play('answer_correct'); break;
      case 'reject': if (e.playerId === myId) sound.play('answer_wrong'); break;
      case 'pop': sound.play('relic_burst'); if (e.livesLeft > 0) later(() => sound.play('life_lost'), 450); break;
      case 'eliminated': later(() => sound.play('player_eliminated'), 700); break;
      case 'win': later(() => sound.play('win_sting'), 1200); break;
    }
  }), []);

  // The ambient drone plays once you're in a room.
  useEffect(() => { sound.setLoops(me ? 'ambient_loop' : null, null); }, [me]);

  const onJoined = (code: string, playerId: string, token: string) => {
    session.setToken(code, token);
    setNotice('');
    history.replaceState(null, '', `/r/${code}`);
    setMe({ code, playerId });
  };

  let screen;
  if (!me || !state) screen = <Home onJoined={onJoined} initialCode={codeFromUrl() ?? ''} notice={notice} />;
  else if (state.phase === 'lobby') screen = <Lobby state={state} me={me} />;
  else if (state.phase === 'playing') screen = <Game state={state} me={me} offset={offset} />;
  else screen = <Results state={state} me={me} />;

  return (
    <div className="app">
      {!connected && <div className="banner">Reconnecting…</div>}
      <MuteButton />
      {screen}
    </div>
  );
}
