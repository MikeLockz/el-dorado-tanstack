import type { AddressInfo } from "node:net";
import { createAppServer } from "../../src/server.js";
import { RoomRegistry } from "../../src/rooms/RoomRegistry.js";
import { WebSocketGateway } from "../../src/ws/Gateway.js";
import { BotManager } from "../../src/bots/BotManager.js";
import { createDatabase, type Database } from "../../src/db/client.js";
import { GamePersistence } from "../../src/persistence/GamePersistence.js";

export interface TestServer {
  baseUrl: string;
  wsUrl: string;
  registry: RoomRegistry;
  db?: Database;
  stop(): Promise<void>;
}

interface StartServerOptions {
  turnTimeoutMs?: number;
  enableDb?: boolean;
}

export async function startTestServer(
  options: StartServerOptions = {}
): Promise<TestServer> {
  let dbConnection;
  let persistence;
  if (options.enableDb) {
    dbConnection = createDatabase();
    persistence = new GamePersistence(dbConnection.db);
  }

  const registry = new RoomRegistry({ persistence });
  const botManager = new BotManager({ registry, matchmakingTargetSize: 2 });

  const server = createAppServer({
    context: { registry, botManager, db: dbConnection?.db },
  });
  const gateway = new WebSocketGateway(server, {
    registry,
    botManager,
    turnTimeoutMs: options.turnTimeoutMs ?? 250,
    db: dbConnection?.db,
  });
  botManager.bindExecutor(gateway);

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });

  const address = server.address() as AddressInfo;
  if (!address || typeof address.port !== "number") {
    throw new Error("Unable to determine test server port");
  }
  const host =
    address.address && address.address !== "::" ? address.address : "127.0.0.1";
  const baseUrl = `http://${host}:${address.port}`;
  const wsUrl = `ws://${host}:${address.port}/ws`;

  return {
    baseUrl,
    wsUrl,
    registry,
    db: dbConnection?.db,
    async stop() {
      gateway.shutdown();
      if (dbConnection) {
        await dbConnection.pool.end();
      }
      await new Promise<void>((resolve, reject) => {
        server.close((err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    },
  };
}
