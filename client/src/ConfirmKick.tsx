import { useState } from 'react';
import { socket } from './net';

/** Inline "Remove X?" confirmation, so a stray tap never kicks anyone. */
export function ConfirmKick({ playerId, name, onDone }: { playerId: string; name: string; onDone: () => void }) {
  const [error, setError] = useState('');
  const kick = () => socket.emit('room:kick', playerId, (res) => (res.ok ? onDone() : setError(res.error ?? 'Could not remove them.')));
  return (
    <div className="confirm-kick" role="group" aria-label={`Remove ${name}`}>
      <span>Remove <strong>{name}</strong> from the room?</span>
      <div className="confirm-actions">
        <button className="danger" onClick={kick}>Remove</button>
        <button onClick={onDone}>Cancel</button>
      </div>
      {error && <p className="error">{error}</p>}
    </div>
  );
}
