import { describe, expect, it } from 'vitest';
import type { IncomingHttpHeaders, IncomingMessage, ServerResponse } from 'node:http';
import { Readable } from 'node:stream';
import { RoomRegistry } from './rooms/RoomRegistry.js';
import { handleIncomingRequest } from './server.js';
import type { Database } from './db/client.js';
import type { PlayerLifetimeStatsRow, PlayerRow } from './db/schema.js';

describe('server bootstrap', () => {
  it('responds to /api/health with an ok payload', async () => {
    const req = createMockRequest('GET', '/api/health');
    const res = new MockResponse();

    await handleIncomingRequest(req, res as unknown as ServerResponse, { registry: new RoomRegistry() });

    expect(res.statusCode).toBe(200);
    expect(res.getBody()).toEqual({ ok: true });
    expect(res.headers['content-type']).toBe('application/json');
  });

  it('creates rooms via POST /api/create-room', async () => {
    const registry = new RoomRegistry();
    const req = createMockRequest('POST', '/api/create-room', {
      displayName: 'Tester',
      avatarSeed: 'seed',
      color: '#123456',
    });
    const res = new MockResponse();

    await handleIncomingRequest(req, res as unknown as ServerResponse, { registry });

    const body = res.getBody();
    expect(res.statusCode).toBe(201);
    expect(body.gameId).toBeTruthy();
    expect(body.joinCode).toHaveLength(6);
    expect(body.playerToken).toBeTruthy();
    expect(registry.getRoom(body.gameId)).toBeDefined();
  });

  it('validates stats requests require userId', async () => {
    const registry = new RoomRegistry();
    const res = new MockResponse();

    await expect(
      handleIncomingRequest(createMockRequest('GET', '/api/player-stats'), res as unknown as ServerResponse, {
        registry,
        db: createStubDb(),
      }),
    ).rejects.toThrowError(/userId/);
  });

  it('returns 404 when stats target user is missing', async () => {
    const registry = new RoomRegistry();
    const res = new MockResponse();
    const ctx = {
      registry,
      db: createStubDb(undefined, undefined),
    };

    await expect(
      handleIncomingRequest(
        createMockRequest('GET', '/api/player-stats?userId=missing'),
        res as unknown as ServerResponse,
        ctx,
      ),
    ).rejects.toThrowError(/Player not found/);
  });

  it('returns profile and lifetime stats when available', async () => {
    const registry = new RoomRegistry();
    const res = new MockResponse();
    const player: PlayerRow = {
      id: 'player-db',
      userId: 'user-123',
      displayName: 'Stats User',
      avatarSeed: 'seed',
      color: '#abcdef',
      isBot: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const lifetime: PlayerLifetimeStatsRow = {
      id: 'stats-row',
      playerId: 'player-db',
      gamesPlayed: 5,
      gamesWon: 3,
      highestScore: 42,
      lowestScore: -5,
      totalPoints: 100,
      totalTricksWon: 25,
      mostConsecutiveWins: 2,
      mostConsecutiveLosses: 1,
      lastGameAt: new Date('2024-01-01T00:00:00Z'),
      createdAt: new Date('2023-12-01T00:00:00Z'),
      updatedAt: new Date('2024-01-01T00:00:00Z'),
    };
    const ctx = { registry, db: createStubDb(player, lifetime) };
    const req = createMockRequest('GET', '/api/player-stats?userId=user-123');

    await handleIncomingRequest(req, res as unknown as ServerResponse, ctx);

    expect(res.statusCode).toBe(200);
    expect(res.getBody().profile.displayName).toBe('Stats User');
    expect(res.getBody().lifetime.gamesPlayed).toBe(5);
  });
});

function createMockRequest(method: string, path: string, body?: Record<string, unknown>) {
  const payload = body ? Buffer.from(JSON.stringify(body), 'utf8') : null;
  const readable = new Readable({
    read() {
      if (payload) {
        this.push(payload);
      }
      this.push(null);
    },
  }) as IncomingMessage;

  readable.method = method;
  readable.url = path;
  readable.headers = { host: 'test.local' } as IncomingHttpHeaders;
  if (payload) {
    readable.headers['content-length'] = String(payload.length);
    readable.headers['content-type'] = 'application/json';
  }

  return readable;
}

class MockResponse {
  statusCode = 0;
  headers: Record<string, string> = {};
  body = '';
  ended = false;

  setHeader(name: string, value: string) {
    this.headers[name.toLowerCase()] = value;
  }

  end(chunk?: unknown) {
    if (typeof chunk === 'string') {
      this.body = chunk;
    } else if (Buffer.isBuffer(chunk)) {
      this.body = chunk.toString('utf8');
    } else if (chunk === undefined || chunk === null) {
      this.body = '';
    } else {
      this.body = String(chunk);
    }
    this.ended = true;
  }

  getBody() {
    if (!this.body) return {};
    return JSON.parse(this.body);
  }
}

function createStubDb(player?: PlayerRow, stats?: PlayerLifetimeStatsRow) {
  const db: Partial<Database> = {
    query: {
      players: {
        findFirst: async () => player,
      },
      playerLifetimeStats: {
        findFirst: async () => stats,
      },
    },
  };
  return db as Database;
}
