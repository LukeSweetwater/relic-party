# Relic Party

A real-time browser party game for 2–15 friends. Everyone sees the same category; whoever holds the relic must name something that fits, then it passes on. The fuse is a fixed 15 seconds and resets on every pass. If it runs out on you, you lose a life. Last player standing wins.

**Status:** Phase 4. 32 categories, host can remove players, nicknames up to 25 characters. Phase 3: Pixel-art relic, crew and storm-valley background; heartbeat loops, burst and event sound effects with a mute button. Hosted on Railway.

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

- `shared/` – types used by both sides, and `categories.json` (32 categories, aliases separated by `|`)
- `server/game/room.ts` – the game engine: one `Room` per game. The server owns all state and the fuse timer; clients only send answers.
- `server/game/answers.ts` – answer matching: ignores case, accents and punctuation, accepts simple plurals and one typo in longer words
- `server/app.ts` – Express + Socket.IO: rooms, reconnects (60 s grace), rate limiting, static hosting
- `client/` – React + Vite UI: home, lobby, game ring, results

## Adding categories

Edit `shared/categories.json`. Each answer can list aliases: `"tangerine|naartjie"` accepts both and shows "tangerine".

## Hosting (Railway)

The repo deploys as one Docker service: the `Dockerfile` builds the client and server, and `railway.json` sets the health check (`/healthz`) and restart policy. Any host that runs a Dockerfile (Render, Fly.io) works the same way.

1. Sign in at https://railway.com with GitHub.
2. **New Project → Deploy from GitHub repo →** pick `relic-party`. Railway finds the Dockerfile and builds it.
3. In the service, open **Settings → Networking → Generate Domain**. That URL is the game; share it (or a `/r/CODE` room link) with friends.
4. Every push to `main` redeploys automatically. GitHub Actions (`.github/workflows/ci.yml`) runs the tests on every push and pull request.

Rooms live in memory, so a redeploy ends games in progress. Deploy when nobody is playing.

## Art and sound

- `client/public/assets/sprites/` – pixel-art PNGs: four relic stages (`relic-dormant/awake/critical/burst`), ten crew suits (`crew-0` to `crew-9`, matching `AVATARS` in `shared/types.ts`) and the background. They're tiny on purpose and are scaled up with `image-rendering: pixelated`.
- `client/public/assets/sfx/` – original synthesized sound effects (MP3). `client/src/sound.ts` plays them through the Web Audio API: an ambient drone, a heartbeat loop that speeds up with each relic stage, and one-shots for passes, wrong answers, bursts, eliminations and the win. Phones only allow sound after a tap, so audio starts on the first touch. The speaker button mutes everything and remembers the choice.
