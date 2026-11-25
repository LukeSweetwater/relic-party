import { createApp } from './app.js';

const port = Number(process.env.PORT ?? 3001);
const { http, io } = createApp();
http.listen(port, () => console.log(`Relic Party server listening on port ${port}`));

// Hosts send SIGTERM before replacing the server during a deploy: close sockets cleanly.
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, () => {
    console.log(`${signal} received, shutting down`);
    io.close();
    http.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 5000).unref();
  });
}
