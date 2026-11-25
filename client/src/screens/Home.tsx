import { useState, type FormEvent } from 'react';
import { AVATARS } from '../../../shared/types';
import { Avatar } from '../Avatar';
import { joinRoom, session } from '../net';

export function Home({ onJoined, initialCode }: { onJoined: (code: string, id: string, token: string) => void; initialCode: string }) {
  const saved = session.profile;
  const [name, setName] = useState(saved.name ?? '');
  const [avatar, setAvatar] = useState(saved.avatar ?? 0);
  const [code, setCode] = useState(initialCode);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const go = async (kind: 'room:create' | 'room:join', e?: FormEvent) => {
    e?.preventDefault();
    setError('');
    if (!name.trim()) return setError('Pick a nickname first.');
    if (kind === 'room:join' && code.trim().length !== 4) return setError('Room codes are 4 letters.');
    setBusy(true);
    session.profile = { name: name.trim(), avatar };
    const res = await joinRoom(kind, { name, avatar, code: code.trim().toUpperCase() });
    setBusy(false);
    if (res.ok) onJoined(res.code, res.playerId, res.token);
    else setError(res.error);
  };

  return (
    <main className="panel home">
      <div className="hero">
        <img className="hero-relic" src="/assets/sprites/relic-awake.png" alt="" width={112} height={112} />
        <h1 className="logo">RELIC<br />PARTY</h1>
      </div>
      <p className="tagline">Name it. Pass the relic. Don't be holding it when it wakes.</p>

      <label className="field">
        <span>Nickname</span>
        <input value={name} maxLength={16} onChange={(e) => setName(e.target.value)} autoComplete="off" placeholder="e.g. Nia" />
      </label>

      <fieldset className="field">
        <legend>Crew suit</legend>
        <div className="avatars">
          {AVATARS.map((a) => (
            <button key={a.id} type="button" className={`avatar-pick ${a.id === avatar ? 'on' : ''}`}
              aria-pressed={a.id === avatar} aria-label={a.name} onClick={() => setAvatar(a.id)}>
              <Avatar avatar={a.id} size={36} />
            </button>
          ))}
        </div>
      </fieldset>

      <form className="join-row" onSubmit={(e) => go('room:join', e)}>
        <label className="field grow">
          <span>Room code</span>
          <input value={code} maxLength={4} onChange={(e) => setCode(e.target.value.toUpperCase())}
            autoComplete="off" autoCapitalize="characters" placeholder="ABCD" />
        </label>
        <button type="submit" disabled={busy}>Join room</button>
      </form>

      <div className="or">or</div>
      <button className="primary" disabled={busy} onClick={() => go('room:create')}>Create a new room</button>
      {error && <p className="error" role="alert">{error}</p>}
    </main>
  );
}
