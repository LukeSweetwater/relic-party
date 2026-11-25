// Types shared by the server and the browser client.

export const MAX_PLAYERS = 17;
export const MIN_PLAYERS = 2;
export const AVATAR_COUNT = 10;
/** Longest nickname allowed, in characters. */
export const NAME_MAX = 25;

/** The 10 crew avatars, matching the pixel-art sprite set. */
export const AVATARS = [
  { id: 0, name: 'Bone', color: '#d8d2bc' },
  { id: 1, name: 'Rust', color: '#c4532c' },
  { id: 2, name: 'Bile', color: '#8fbf5a' },
  { id: 3, name: 'Steel', color: '#5d86a8' },
  { id: 4, name: 'Blood', color: '#a83232' },
  { id: 5, name: 'Amber', color: '#d99a2b' },
  { id: 6, name: 'Violet', color: '#8a6fc0' },
  { id: 7, name: 'Cyan', color: '#3fa7a0' },
  { id: 8, name: 'Frost', color: '#e8ecef' },
  { id: 9, name: 'Mustard', color: '#c0b14a' },
] as const;

export interface Settings {
  /** Lives each player starts with (1–5). */
  lives: number;
  /** Fixed fuse length in milliseconds; resets on every pass. */
  fuseMs: number;
}

export const DEFAULT_SETTINGS: Settings = { lives: 3, fuseMs: 15_000 };

export type Phase = 'lobby' | 'playing' | 'ended';

export interface PublicPlayer {
  id: string;
  name: string;
  avatar: number;
  lives: number;
  connected: boolean;
  isHost: boolean;
  /** Finishing position once out (1 = winner); null while still in. */
  place: number | null;
}

export interface AcceptedAnswer {
  playerId: string;
  text: string;
}

export interface RoomState {
  code: string;
  phase: Phase;
  settings: Settings;
  players: PublicPlayer[];
  /** Seat order for the turn ring. */
  order: string[];
  category: string | null;
  holderId: string | null;
  /** Server timestamp (ms) when the fuse pops. */
  fuseEndsAt: number | null;
  /** Server clock when this state was sent, for countdown sync. */
  serverNow: number;
  answers: AcceptedAnswer[];
  /** Text the holder is currently typing (live typing). */
  typing: string;
  winnerId: string | null;
  round: number;
}

export type AnswerResult =
  | { ok: true; text: string }
  | { ok: false; reason: 'not-your-turn' | 'empty' | 'wrong' | 'repeat' | 'not-playing' };

/** One-off events the client can react to (sounds, toasts). */
export type GameEvent =
  | { type: 'join'; playerId: string }
  | { type: 'start' }
  | { type: 'pass'; from: string; to: string; text: string }
  | { type: 'reject'; playerId: string; reason: string }
  | { type: 'pop'; playerId: string; livesLeft: number }
  | { type: 'eliminated'; playerId: string }
  | { type: 'win'; playerId: string }
  | { type: 'kicked'; playerId: string; name: string };

export interface JoinRequest {
  name: string;
  avatar: number;
  code?: string;
  /** Rejoin token from an earlier session in this room. */
  token?: string;
}

export type JoinResponse =
  | { ok: true; code: string; playerId: string; token: string }
  | { ok: false; error: string };

export interface ServerToClient {
  'room:state': (state: RoomState) => void;
  'game:event': (event: GameEvent) => void;
  /** Sent to a player the host removed from the room. */
  'room:kicked': () => void;
}

export interface ClientToServer {
  'room:create': (req: JoinRequest, cb: (res: JoinResponse) => void) => void;
  'room:join': (req: JoinRequest, cb: (res: JoinResponse) => void) => void;
  'room:settings': (settings: Partial<Settings>) => void;
  'game:start': (cb: (res: { ok: boolean; error?: string }) => void) => void;
  'game:answer': (text: string, cb: (res: AnswerResult) => void) => void;
  'game:typing': (text: string) => void;
  'game:again': () => void;
  'room:kick': (playerId: string, cb: (res: { ok: boolean; error?: string }) => void) => void;
}
