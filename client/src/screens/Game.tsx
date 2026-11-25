import { useEffect, useRef, useState, type FormEvent, type MutableRefObject } from 'react';
import type { RoomState } from '../../../shared/types';
import { Avatar } from '../Avatar';
import { onGameEvent } from '../events';
import { socket } from '../net';
import { sound, type Loop } from '../sound';
import type { Me } from '../App';

const REASONS: Record<string, string> = {
  wrong: "That doesn't fit the category.",
  repeat: 'Already said this round.',
  empty: 'Type an answer first.',
  'not-your-turn': "It's not your turn.",
  'not-playing': 'The round is over.',
};

type Stage = 'dormant' | 'awake' | 'critical';
const LOOPS: Record<Stage, Loop> = { dormant: 'relic_dormant_loop', awake: 'relic_awake_loop', critical: 'relic_critical_loop' };
const BURST_MS = 1100;

/** Milliseconds left on the fuse, smoothed with requestAnimationFrame and corrected for clock skew. */
function useCountdown(endsAt: number | null, offset: MutableRefObject<number>) {
  const [left, setLeft] = useState(0);
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      setLeft(endsAt ? Math.max(0, endsAt - (Date.now() + offset.current)) : 0);
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [endsAt, offset]);
  return left;
}

export function Game({ state, me, offset }: { state: RoomState; me: Me; offset: MutableRefObject<number> }) {
  const [text, setText] = useState('');
  const [feedback, setFeedback] = useState('');
  const [bursting, setBursting] = useState<string | null>(null); // player the relic just burst on
  const [shake, setShake] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const left = useCountdown(state.fuseEndsAt, offset);
  const myTurn = state.holderId === me.playerId;
  const holder = state.players.find((p) => p.id === state.holderId);
  const fraction = state.settings.fuseMs ? left / state.settings.fuseMs : 0;
  const stage: Stage = fraction > 2 / 3 ? 'dormant' : fraction > 1 / 3 ? 'awake' : 'critical';
  const seconds = Math.ceil(left / 1000);

  useEffect(() => { setText(''); if (myTurn) input.current?.focus(); }, [myTurn, state.holderId, state.round]);

  // Heartbeat loop follows the relic's stage; stops when leaving the game.
  useEffect(() => { sound.setLoops('ambient_loop', bursting ? null : LOOPS[stage]); }, [stage, bursting]);
  useEffect(() => () => sound.setLoops('ambient_loop', null), []);

  // Tick for each of the last 5 seconds.
  const lastTick = useRef(0);
  useEffect(() => {
    if (seconds > 0 && seconds <= 5 && seconds !== lastTick.current && !bursting) sound.play('countdown_tick');
    lastTick.current = seconds;
  }, [seconds, bursting]);

  useEffect(() => onGameEvent((e) => {
    const name = (id: string) => state.players.find((p) => p.id === id)?.name ?? 'Someone';
    if (e.type === 'pop') {
      setBursting(e.playerId);
      setTimeout(() => setBursting(null), BURST_MS);
      setFeedback(e.playerId === me.playerId
        ? (e.livesLeft ? `It burst on you! ${e.livesLeft} ${e.livesLeft === 1 ? 'life' : 'lives'} left.` : 'It burst on you. You\'re out.')
        : `The relic burst on ${name(e.playerId)}!${e.livesLeft ? '' : ' They\'re out.'}`);
    } else if (e.type === 'pass') {
      setFeedback('');
    } else if (e.type === 'reject' && e.playerId === me.playerId) {
      setShake((n) => n + 1);
    }
  }), [state.players, me.playerId]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!myTurn) return;
    socket.emit('game:answer', text, (res) => {
      if (res.ok) { setText(''); setFeedback(''); }
      else setFeedback(REASONS[res.reason] ?? 'Try again.');
    });
  };
  const onType = (v: string) => { setText(v); socket.emit('game:typing', v); };

  const me_ = state.players.find((p) => p.id === me.playerId);
  const iAmOut = me_ ? me_.lives === 0 : false;
  const n = state.order.length;
  const relicScale = 1 + (1 - fraction) * 0.45;

  return (
    <main className={`game stage-${stage}`}>
      <header className="category">
        <p className="label">Round {state.round}</p>
        <h1>{state.category}</h1>
      </header>

      <section className="ring" aria-label="Players">
        {state.players.map((p, i) => {
          const angle = (i / n) * Math.PI * 2 - Math.PI / 2;
          const style = { left: `${50 + Math.cos(angle) * 42}%`, top: `${50 + Math.sin(angle) * 42}%` };
          const holding = p.id === state.holderId && !bursting;
          return (
            <div key={p.id} className={`seat ${holding ? 'holding' : ''} ${p.lives === 0 ? 'out' : ''} ${bursting === p.id ? 'hit' : ''}`} style={style}>
              <Avatar avatar={p.avatar} size={40} dim={p.lives === 0 || !p.connected} />
              <span className="seat-name">{p.name}</span>
              <span className="lives" aria-label={`${p.lives} lives`}>
                {Array.from({ length: state.settings.lives }, (_, k) => <i key={k} className={k < p.lives ? 'on' : ''} />)}
              </span>
            </div>
          );
        })}

        <div className="relic-wrap" key={`${state.holderId}-${state.round}`}>
          {bursting ? (
            <img className="relic burst" src="/assets/sprites/relic-burst.png" alt="" />
          ) : (
            <img className={`relic ${stage}`} src={`/assets/sprites/relic-${stage}.png`} alt=""
              style={{ transform: `scale(${relicScale})` }} />
          )}
        </div>
        <div className={`timer ${seconds <= 5 ? 'hot' : ''}`} aria-hidden="true">{bursting ? '' : seconds}</div>
      </section>

      <p className="holder">
        {myTurn ? <strong className="your-turn">You have the relic. Name something!</strong> : iAmOut ? 'You\'re out. Watch the others squirm.' : `${holder?.name ?? '…'} has the relic`}
        {!myTurn && state.typing && <span className="typing"> “{state.typing}”</span>}
      </p>

      <form className={`answer ${myTurn ? 'live' : ''} ${shake ? (shake % 2 ? 'shake-a' : 'shake-b') : ''}`} onSubmit={submit}>
        <input ref={input} value={text} disabled={!myTurn} onChange={(e) => onType(e.target.value)} maxLength={40}
          placeholder={myTurn ? 'Type an answer and press Enter' : 'Wait for the relic…'}
          autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false} enterKeyHint="send" aria-label="Your answer" />
        <button type="submit" disabled={!myTurn}>Pass</button>
      </form>
      <p className="feedback" role="status">{feedback}</p>

      <ul className="said" aria-label="Answers this round">
        {state.answers.map((a, i) => <li key={i}>{a.text}</li>)}
      </ul>
    </main>
  );
}
