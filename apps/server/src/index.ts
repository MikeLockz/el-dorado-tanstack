import { createAppServer } from './server';
import { roomRegistry } from './rooms';

const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? '0.0.0.0';

const server = createAppServer({ context: { registry: roomRegistry } });

server.listen(port, host, () => {
  console.log(`[server] listening on http://${host}:${port}`);
});
