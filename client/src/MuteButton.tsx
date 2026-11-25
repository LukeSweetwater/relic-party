import { useEffect, useState } from 'react';
import { sound } from './sound';

export function MuteButton() {
  const [muted, setMuted] = useState(sound.muted);
  useEffect(() => sound.subscribe(() => setMuted(sound.muted)), []);
  return (
    <button className="mute" onClick={() => sound.toggleMute()} aria-label={muted ? 'Turn sound on' : 'Turn sound off'} aria-pressed={!muted}>
      {muted ? (
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M11 5 6 9H2v6h4l5 4V5z"/><path d="m23 9-6 6M17 9l6 6"/></svg>
      ) : (
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M11 5 6 9H2v6h4l5 4V5z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14"/></svg>
      )}
    </button>
  );
}
