import type { RoomState } from '../../../shared/types';
import { Avatar } from '../Avatar';
import { socket } from '../net';
import type { Me } from '../App';

export function Results({ state, me }: { state: RoomState; me: Me }) {
  const ranked = [...state.players].sort((a, b) => (a.place ?? 99) - (b.place ?? 99));
  const winner = state.players.find((p) => p.id === state.winnerId);
  const isHost = state.players.find((p) => p.id === me.playerId)?.isHost ?? false;
  return (
    <main className="panel results">
      <p className="label">Last one standing</p>
      <h1 className="winner">{winner ? winner.name : 'Nobody survived'}</h1>
      <ol className="crew ranked">
        {ranked.map((p) => (
          <li key={p.id}>
            <span className="place">{p.place ?? '–'}</span>
            <Avatar avatar={p.avatar} size={32} />
            <span className="name">{p.name}{p.id === me.playerId && ' (you)'}</span>
          </li>
        ))}
      </ol>
      {isHost ? <button className="primary" onClick={() => socket.emit('game:again')}>Play again</button>
        : <p className="muted">Waiting for the host to start another game</p>}
    </main>
  );
}
