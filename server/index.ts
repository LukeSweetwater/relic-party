import { createApp } from './app.js';

const port = Number(process.env.PORT ?? 3001);
const { http } = createApp();
http.listen(port, () => console.log(`Relic Party server listening on http://localhost:${port}`));
