# Relic Party

A real-time browser party game for 2–15 friends. Everyone sees the same category; whoever holds the relic must name something that fits, then it passes on. The fuse is a fixed 15 seconds and resets on every pass. If it runs out on you, you lose a life. Last player standing wins.

**Status:** Phase 1 (local prototype). Rooms, lobby, turns, fuse, lives, answer checking and results all work; art and sound come in Phase 3, hosting in Phase 2.

## Run it locally

Requires Node.js 20+.

```bash
npm install
npm run dev
```

Open http://localhost:5173 in a few browser tabs (or on phones on the same Wi‑Fi, using your computer's IP). Create a room in one tab, join with the 4‑letter code or the invite link in the others, and start.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Server (port 3001) + Vite client (port 5173) with hot reload |
| `npm test` | Unit tests for the game engine and answer matching |
| `npm run e2e` | Starts the real server and plays a full 3‑player game over sockets |
| `npm run build` | Builds the client to `dist/client` and the server to `dist/server` |
| `npm start` | Runs the production build; serves the game and WebSockets on `$PORT` (default 3001) |
| `npm run typecheck` | Type-checks client and server |

## How it's built

- `shared/` – types used by both sides, and `categories.json` (12 starter categories, aliases separated by `|`)
- `server/game/room.ts` – the game engine: one `Room` per game. The server owns all state and the fuse timer; clients only send answers.
- `server/game/answers.ts` – answer matching: ignores case, accents and punctuation, accepts simple plurals and one typo in longer words
- `server/app.ts` – Express + Socket.IO: rooms, reconnects (60 s grace), rate limiting, static hosting
- `client/` – React + Vite UI: home, lobby, game ring, results

## Adding categories

Edit `shared/categories.json`. Each answer can list aliases: `"tangerine|naartjie"` accepts both and shows "tangerine".
