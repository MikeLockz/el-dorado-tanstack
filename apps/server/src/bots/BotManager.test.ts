import { describe, expect, it } from 'vitest';
import http, { type Server } from 'node:http';
import type { PlayerProfile } from '@game/domain';
import { RoomRegistry } from '../rooms/RoomRegistry.js';
import { BotManager } from './BotManager.js';
import { WebSocketGateway } from '../ws/Gateway.js';

const baseProfile: PlayerProfile = {
  displayName: 'Tester',
  avatarSeed: 'tester',
  color: '#ffffff',
};

function createContext() {
  const registry = new RoomRegistry();
  const manager = new BotManager({ registry });
  const server = http.createServer();
  const gateway = new WebSocketGateway(server, { registry, botManager: manager });
  manager.bindExecutor(gateway);
  return { registry, manager, server, gateway };
}

function closeServer(server: Server) {
  return new Promise<void>((resolve) => {
    server.close(() => resolve());
  });
}

describe('BotManager', () => {
  it('fills matchmaking rooms up to four players', async () => {
    const { registry, manager, server } = createContext();
    const { room } = await registry.createRoom({ hostProfile: baseProfile });

    expect(room.gameState.players).toHaveLength(1);
    await manager.fillForMatchmaking(room);
    expect(room.gameState.players.filter((player) => !player.spectator)).toHaveLength(4);

    await closeServer(server);
  });

  it('plays an entire bot-only game to completion', async () => {
    const { registry, manager, server } = createContext();
    const { room } = await registry.createRoom({ hostProfile: baseProfile, hostIsBot: true });

    await manager.fillForMatchmaking(room);
    manager.handleStateChange(room);

    expect(room.gameState.phase).toBe('COMPLETED');
    expect(room.gameState.roundSummaries).toHaveLength(room.gameState.config.roundCount);
    expect(Object.values(room.gameState.cumulativeScores)).not.toHaveLength(0);

    await closeServer(server);
  });
});
