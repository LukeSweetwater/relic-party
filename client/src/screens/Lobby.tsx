import { useState } from 'react';
import { MAX_PLAYERS, MIN_PLAYERS, type RoomState } from '../../../shared/types';
import { Avatar } from '../Avatar';
import { ConfirmKick } from '../ConfirmKick';
import { socket } from '../net';
import type { Me } from '../App';

export function Lobby({ state, me }: { state: RoomState; me: Me }) {
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [kicking, setKicking] = useState<string | null>(null);
  const isHost = state.players.find((p) => p.id === me.playerId)?.isHost ?? false;
  const link = `${location.origin}/r/${state.code}`;

  const copy = async () => {
    try { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* ignore */ }
  };
  const start = () => socket.emit('game:start', (res) => setError(res.ok ? '' : res.error ?? 'Could not start.'));

  return (
    <main className="panel lobby">
      <p className="label">Room code</p>
      <h1 className="code">{state.code}</h1>
      <button className="link" onClick={copy}>{copied ? 'Link copied' : 'Copy invite link'}</button>

      <h2>Crew {state.players.length}/{MAX_PLAYERS}</h2>
      <ul className="crew">
        {state.players.map((p) => (
          <li key={p.id} className={p.connected ? '' : 'away'}>
            <div className="crew-row">
              <Avatar avatar={p.avatar} size={32} dim={!p.connected} />
              <span className="name">{p.name}{p.id === me.playerId && ' (you)'}</span>
              {p.isHost && <span className="tag">host</span>}
              {isHost && p.id !== me.playerId && kicking !== p.id && (
                <button className="small" onClick={() => setKicking(p.id)} aria-label={`Remove ${p.name}`}>Remove</button>
              )}
            </div>
            {kicking === p.id && <ConfirmKick playerId={p.id} name={p.name} onDone={() => setKicking(null)} />}
          </li>
        ))}
      </ul>

      {isHost ? (
        <div className="host-controls">
          <label className="field inline">
            <span>Lives</span>
            <select value={state.settings.lives} onChange={(e) => socket.emit('room:settings', { lives: Number(e.target.value) })}>
              {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
          <label className="field inline">
            <span>Fuse (seconds)</span>
            <select value={state.settings.fuseMs / 1000} onChange={(e) => socket.emit('room:settings', { fuseMs: Number(e.target.value) * 1000 })}>
              {[10, 15, 20, 30].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
          <button className="primary" disabled={state.players.length < MIN_PLAYERS} onClick={start}>
            {state.players.length < MIN_PLAYERS ? 'Waiting for crew…' : 'Start game'}
          </button>
        </div>
      ) : (
        <p className="muted">{state.settings.lives} lives · {state.settings.fuseMs / 1000} s fuse · waiting for the host to start</p>
      )}
      {error && <p className="error" role="alert">{error}</p>}
    </main>
  );
}
