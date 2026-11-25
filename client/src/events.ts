import type { GameEvent } from '../../shared/types';
import { socket } from './net';

// Fan out server game events to anyone interested (sounds, animations).
// Using a subscription instead of React state means events that arrive together
// (pop + eliminated + win on the same tick) are never collapsed into one render.
type Listener = (e: GameEvent) => void;
const listeners = new Set<Listener>();
socket.on('game:event', (e) => listeners.forEach((fn) => fn(e)));

export function onGameEvent(fn: Listener) {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}
