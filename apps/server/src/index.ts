import { createAppServer } from './server';

const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? '0.0.0.0';

const server = createAppServer();

server.listen(port, host, () => {
  console.log(`[server] listening on http://${host}:${port}`);
});
