import 'dotenv/config';
import { createAppServer } from './server.js';
import { db, roomRegistry } from './rooms/index.js';
import { WebSocketGateway } from './ws/Gateway.js';
import { botManager } from './bots/index.js';

const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? '0.0.0.0';

const server = createAppServer({ context: { registry: roomRegistry, db, botManager } });
// Initialize WebSocket gateway for real-time transport.
const gateway = new WebSocketGateway(server, { registry: roomRegistry, botManager });
botManager.bindExecutor(gateway);

server.listen(port, host, () => {
  console.log(`[server] listening on http://${host}:${port}`);
});
