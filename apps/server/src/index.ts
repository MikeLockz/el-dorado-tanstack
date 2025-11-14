import 'dotenv/config';
import { createAppServer } from './server.js';
import { roomRegistry } from './rooms/index.js';
import { WebSocketGateway } from './ws/Gateway.js';

const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? '0.0.0.0';

const server = createAppServer({ context: { registry: roomRegistry } });
// Initialize WebSocket gateway for real-time transport.
new WebSocketGateway(server, { registry: roomRegistry });

server.listen(port, host, () => {
  console.log(`[server] listening on http://${host}:${port}`);
});
