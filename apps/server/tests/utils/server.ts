import type { AddressInfo } from 'node:net';
import { createAppServer } from '../../src/server.js';
import { RoomRegistry } from '../../src/rooms/RoomRegistry.js';
import { WebSocketGateway } from '../../src/ws/Gateway.js';
import { BotManager } from '../../src/bots/BotManager.js';

export interface TestServer {
  baseUrl: string;
  wsUrl: string;
  registry: RoomRegistry;
  stop(): Promise<void>;
}

interface StartServerOptions {
  turnTimeoutMs?: number;
}

export async function startTestServer(options: StartServerOptions = {}): Promise<TestServer> {
  const registry = new RoomRegistry();
  const botManager = new BotManager({ registry, matchmakingTargetSize: 2 });
  const server = createAppServer({ context: { registry, botManager } });
  const gateway = new WebSocketGateway(server, {
    registry,
    botManager,
    turnTimeoutMs: options.turnTimeoutMs ?? 250,
  });
  botManager.bindExecutor(gateway);

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      resolve();
    });
  });

  const address = server.address() as AddressInfo;
  if (!address || typeof address.port !== 'number') {
    throw new Error('Unable to determine test server port');
  }
  const host = address.address && address.address !== '::' ? address.address : '127.0.0.1';
  const baseUrl = `http://${host}:${address.port}`;
  const wsUrl = `ws://${host}:${address.port}/ws`;

  return {
    baseUrl,
    wsUrl,
    registry,
    async stop() {
      gateway.shutdown();
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
    },
  } satisfies TestServer;
}
