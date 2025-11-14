import 'dotenv/config';
import { createAppServer } from './server.js';
import { db, roomRegistry } from './rooms/index.js';
import { WebSocketGateway } from './ws/Gateway.js';
import { botManager } from './bots/index.js';
import { initTelemetry } from './observability/telemetry.js';
import { logger } from './observability/logger.js';

const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? '0.0.0.0';

initTelemetry();

const server = createAppServer({ context: { registry: roomRegistry, db, botManager } });
// Initialize WebSocket gateway for real-time transport.
const gateway = new WebSocketGateway(server, { registry: roomRegistry, botManager });
botManager.bindExecutor(gateway);

server.listen(port, host, () => {
  logger.info('server listening', {
    context: { host, port },
  });
});
