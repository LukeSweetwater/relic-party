import { useEffect } from 'react';
import type { RoomState } from '../../../shared/types';
import { Avatar } from '../Avatar';
import { socket } from '../net';
import type { Me } from '../App';

export function Results({ state, me }: { state: RoomState; me: Me }) {
  const ranked = [...state.players].sort((a, b) => (a.place ?? 99) - (b.place ?? 99));
  const winner = state.players.find((p) => p.id === state.winnerId);
  const isHost = state.players.find((p) => p.id === me.playerId)?.isHost ?? false;
  const iWon = winner?.id === me.playerId;
  useEffect(() => { window.scrollTo(0, 0); }, []);

  return (
    <main className="panel results">
      <p className="label">{iWon ? 'You survived' : 'Last one standing'}</p>
      {winner && (
        <div className="survivor">
          <Avatar avatar={winner.avatar} size={120} />
          <img className="survivor-relic" src="/assets/sprites/relic-dormant.png" alt="" width={56} height={56} />
        </div>
      )}
      <h1 className="winner">{winner ? winner.name : 'Nobody survived'}</h1>

      <ol className="crew ranked" aria-label="Final placings">
        {ranked.map((p) => (
          <li key={p.id} className={p.place === 1 ? 'first' : ''}>
            <span className="place">{p.place ?? '–'}</span>
            <Avatar avatar={p.avatar} size={32} dim={p.place !== 1} />
            <span className="name">{p.name}{p.id === me.playerId && ' (you)'}</span>
            <span className="fate">{p.place === 1 ? 'survived' : 'burst'}</span>
          </li>
        ))}
      </ol>
      {isHost ? <button className="primary" onClick={() => socket.emit('game:again')}>Play again</button>
        : <p className="muted">Waiting for the host to start another game</p>}
    </main>
  );
}
