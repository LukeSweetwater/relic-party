import { useEffect, useRef, useState, type FormEvent, type MutableRefObject } from 'react';
import type { GameEvent, RoomState } from '../../../shared/types';
import { Avatar } from '../Avatar';
import { socket } from '../net';
import type { Me } from '../App';

const REASONS: Record<string, string> = {
  wrong: "That doesn't fit the category.",
  repeat: 'Already said this round.',
  empty: 'Type an answer first.',
  'not-your-turn': "It's not your turn.",
  'not-playing': 'The round is over.',
};

/** Seconds left on the fuse, smoothed with requestAnimationFrame and corrected for clock skew. */
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

export function Game({ state, me, offset, lastEvent }: { state: RoomState; me: Me; offset: MutableRefObject<number>; lastEvent: GameEvent | null }) {
  const [text, setText] = useState('');
  const [feedback, setFeedback] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const left = useCountdown(state.fuseEndsAt, offset);
  const myTurn = state.holderId === me.playerId;
  const holder = state.players.find((p) => p.id === state.holderId);
  const fraction = state.settings.fuseMs ? left / state.settings.fuseMs : 0;
  const stage = fraction > 2 / 3 ? 'dormant' : fraction > 1 / 3 ? 'awake' : 'critical';

  useEffect(() => { setText(''); setFeedback(''); if (myTurn) input.current?.focus(); }, [myTurn, state.holderId, state.round]);

  useEffect(() => {
    if (lastEvent?.type === 'pop') {
      const p = state.players.find((x) => x.id === lastEvent.playerId);
      setFeedback(p ? `The relic burst on ${p.name}! ${lastEvent.livesLeft ? `${lastEvent.livesLeft} lives left.` : 'They are out.'}` : '');
    }
  }, [lastEvent]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!myTurn) return;
    socket.emit('game:answer', text, (res) => {
      if (res.ok) { setText(''); setFeedback(''); }
      else setFeedback(REASONS[res.reason] ?? 'Try again.');
    });
  };
  const onType = (v: string) => { setText(v); socket.emit('game:typing', v); };

  const n = state.order.length;
  return (
    <main className="game">
      <header className="category">
        <p className="label">Round {state.round}</p>
        <h1>{state.category}</h1>
      </header>

      <section className="ring" aria-label="Players">
        {state.players.map((p, i) => {
          const angle = (i / n) * Math.PI * 2 - Math.PI / 2;
          const style = { left: `${50 + Math.cos(angle) * 42}%`, top: `${50 + Math.sin(angle) * 42}%` };
          return (
            <div key={p.id} className={`seat ${p.id === state.holderId ? 'holding' : ''} ${p.lives === 0 ? 'out' : ''}`} style={style}>
              <Avatar avatar={p.avatar} size={36} dim={p.lives === 0 || !p.connected} />
              <span className="seat-name">{p.name}</span>
              <span className="lives" aria-label={`${p.lives} lives`}>{'●'.repeat(p.lives)}{'○'.repeat(Math.max(0, state.settings.lives - p.lives))}</span>
            </div>
          );
        })}
        <div className={`relic ${stage}`} style={{ transform: `translate(-50%, -50%) scale(${1 + (1 - fraction) * 0.6})` }} aria-hidden="true" />
        <div className="timer" aria-live="off">{Math.ceil(left / 1000)}</div>
      </section>

      <p className="holder">{myTurn ? 'You have the relic. Name something!' : `${holder?.name ?? '…'} has the relic`}
        {!myTurn && state.typing && <span className="typing"> “{state.typing}”</span>}
      </p>

      <form className="answer" onSubmit={submit}>
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
