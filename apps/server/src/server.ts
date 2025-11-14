import type { PlayerProfile } from '@game/domain';
import { eq } from 'drizzle-orm';
import http, { type IncomingMessage, type ServerResponse } from 'node:http';
import { URL } from 'node:url';
import { context as otelContext, SpanStatusCode, trace } from '@opentelemetry/api';
import { RoomRegistry, RoomRegistryError } from './rooms/RoomRegistry.js';
import type { Database } from './db/client.js';
import { dbSchema } from './db/client.js';
import type { BotManager } from './bots/BotManager.js';
import { getTracer, getMetricsHandler } from './observability/telemetry.js';
import { recordHttpRequest } from './observability/metrics.js';
import { logger } from './observability/logger.js';

interface RequestContext {
  registry: RoomRegistry;
  db?: Database;
  botManager?: BotManager;
}

class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export interface CreateServerOptions {
  context?: Partial<RequestContext>;
}

const DEFAULT_MIN_PLAYERS = 2;
const DEFAULT_MAX_PLAYERS = 4;
const MAX_PLAYERS_CAP = 10;
const DEFAULT_ROUND_COUNT = 10;
const MAX_ROUNDS = 10;

const tracer = getTracer();
const metricsHandler = getMetricsHandler();
const httpLogger = logger.child({ context: { component: 'http-server' } });

export function createAppServer(options: CreateServerOptions = {}) {
  const ctx: RequestContext = {
    registry: options.context?.registry ?? new RoomRegistry(),
    db: options.context?.db,
    botManager: options.context?.botManager,
  };

  return http.createServer(async (req, res) => {
    const startAt = process.hrtime.bigint();
    const method = req.method ?? 'GET';
    const parsedUrl = parseRequestUrl(req);
    const span = tracer.startSpan('http.request', {
      attributes: {
        'http.method': method,
        'http.target': parsedUrl.pathname,
      },
    });
    let thrown: unknown;

    await otelContext.with(trace.setSpan(otelContext.active(), span), async () => {
      try {
        if (method === 'GET' && parsedUrl.pathname === '/metrics') {
          await metricsHandler(req, res);
          return;
        }
        await handleIncomingRequest(req, res, ctx, parsedUrl);
      } catch (error) {
        thrown = error;
        if (error instanceof HttpError) {
          sendJson(res, error.status, { error: error.code, message: error.message });
          return;
        }
        if (error instanceof RoomRegistryError) {
          sendJson(res, error.status, { error: error.code, message: error.message });
          return;
        }

        httpLogger.error('unhandled http error', {
          error,
          context: { path: parsedUrl.pathname },
        });
        sendJson(res, 500, { error: 'INTERNAL_ERROR' });
      }
    });

    if (thrown instanceof Error) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: thrown.message });
      span.recordException(thrown);
    }
    span.setAttribute('http.response.status_code', res.statusCode);
    span.setAttribute('http.route', parsedUrl.pathname);
    span.end();

    const durationMs = Number(process.hrtime.bigint() - startAt) / 1_000_000;
    recordHttpRequest(method, parsedUrl.pathname, res.statusCode, durationMs);
    const logMeta = {
      context: {
        method,
        path: parsedUrl.pathname,
        statusCode: res.statusCode,
        durationMs,
      },
      error: thrown,
    };
    if (thrown) {
      httpLogger.error('http request failed', logMeta);
    } else {
      httpLogger.info('http request handled', logMeta);
    }
  });
}

export async function handleIncomingRequest(
  req: IncomingMessage,
  res: ServerResponse,
  ctx: RequestContext,
  parsedUrl = parseRequestUrl(req),
) {
  const method = req.method ?? 'GET';
  setCorsHeaders(res);

  if (method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  if (method === 'GET' && parsedUrl.pathname === '/api/health') {
    sendJson(res, 200, { ok: true });
    return;
  }

  if (method === 'POST' && parsedUrl.pathname === '/api/create-room') {
    await handleCreateRoom(req, res, ctx, parsedUrl);
    return;
  }

  if (method === 'POST' && parsedUrl.pathname === '/api/join-by-code') {
    await handleJoinByCode(req, res, ctx);
    return;
  }

  if (method === 'POST' && parsedUrl.pathname === '/api/matchmake') {
    await handleMatchmake(req, res, ctx);
    return;
  }

  if (method === 'GET' && parsedUrl.pathname === '/api/player-stats') {
    await handlePlayerStats(res, ctx, parsedUrl);
    return;
  }

  sendJson(res, 404, { error: 'NOT_FOUND' });
}

async function handleCreateRoom(req: IncomingMessage, res: ServerResponse, ctx: RequestContext, url: URL) {
  const body = await readJsonBody(req);
  const profile = parseProfile(body);
  const minPlayers = parseCount(body.minPlayers, DEFAULT_MIN_PLAYERS, DEFAULT_MIN_PLAYERS, MAX_PLAYERS_CAP);
  const maxPlayers = Math.max(
    parseCount(body.maxPlayers, DEFAULT_MAX_PLAYERS, DEFAULT_MIN_PLAYERS, MAX_PLAYERS_CAP),
    minPlayers,
  );
  const roundCount = parseCount(body.roundCount, DEFAULT_ROUND_COUNT, 1, MAX_ROUNDS);
  const isPublic = parseBoolean(body.isPublic, true);
  const botMode = parseBoolean(url.searchParams.get('botMode') ?? 'false', false);

  const { room, playerToken } = await ctx.registry.createRoom({
    hostProfile: profile,
    minPlayers,
    maxPlayers,
    roundCount,
    isPublic,
    hostIsBot: botMode,
  });

  if (botMode) {
    await ctx.botManager?.fillForMatchmaking(room);
  }

  sendJson(res, 201, {
    gameId: room.gameId,
    joinCode: room.joinCode,
    playerToken,
  });
}

async function handleJoinByCode(req: IncomingMessage, res: ServerResponse, ctx: RequestContext) {
  const body = await readJsonBody(req);
  const joinCode = requireString(body, 'joinCode');
  const profile = parseProfile(body);

  const { room, playerToken } = await ctx.registry.joinRoomByCode(joinCode, profile);
  sendJson(res, 200, { gameId: room.gameId, playerToken });
}

async function handleMatchmake(req: IncomingMessage, res: ServerResponse, ctx: RequestContext) {
  const body = await readJsonBody(req);
  const profile = parseProfile(body);

  const { room, playerToken } = await ctx.registry.createRoom({
    hostProfile: profile,
    isPublic: true,
  });

  await ctx.botManager?.fillForMatchmaking(room);

  sendJson(res, 201, { gameId: room.gameId, playerToken });
}

async function handlePlayerStats(res: ServerResponse, ctx: RequestContext, url: URL) {
  if (!ctx.db) {
    throw new HttpError(500, 'DB_NOT_READY', 'Stats database is unavailable');
  }

  const userId = url.searchParams.get('userId');
  if (!userId) {
    throw new HttpError(400, 'INVALID_INPUT', 'userId query parameter is required');
  }

  const player = await ctx.db.query.players.findFirst({
    where: eq(dbSchema.players.userId, userId),
  });

  if (!player) {
    throw new HttpError(404, 'PLAYER_NOT_FOUND', 'Player not found');
  }

  const stats = await ctx.db.query.playerLifetimeStats.findFirst({
    where: eq(dbSchema.playerLifetimeStats.playerId, player.id),
  });

  sendJson(res, 200, {
    profile: {
      userId: player.userId ?? undefined,
      displayName: player.displayName,
      avatarSeed: player.avatarSeed,
      color: player.color,
      isBot: player.isBot,
    },
    lifetime: stats
      ? {
          gamesPlayed: stats.gamesPlayed,
          gamesWon: stats.gamesWon,
          highestScore: stats.highestScore,
          lowestScore: stats.lowestScore,
          totalPoints: stats.totalPoints,
          totalTricksWon: stats.totalTricksWon,
          mostConsecutiveWins: stats.mostConsecutiveWins,
          mostConsecutiveLosses: stats.mostConsecutiveLosses,
          lastGameAt: stats.lastGameAt?.toISOString() ?? null,
        }
      : {
          gamesPlayed: 0,
          gamesWon: 0,
          highestScore: null,
          lowestScore: null,
          totalPoints: 0,
          totalTricksWon: 0,
          mostConsecutiveWins: 0,
          mostConsecutiveLosses: 0,
          lastGameAt: null,
        },
  });
}

async function readJsonBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }

  if (chunks.length === 0) {
    return {};
  }

  const raw = Buffer.concat(chunks).toString('utf8').trim();
  if (!raw) {
    return {};
  }

  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new HttpError(400, 'INVALID_JSON', 'Request body must be valid JSON');
  }
}

function parseProfile(body: Record<string, unknown>): PlayerProfile {
  return {
    userId: parseOptionalString(body.userId),
    displayName: requireString(body, 'displayName'),
    avatarSeed: requireString(body, 'avatarSeed'),
    color: requireString(body, 'color'),
  };
}

function requireString(body: Record<string, unknown>, field: string) {
  const value = body[field];
  if (typeof value !== 'string' || !value.trim()) {
    throw new HttpError(400, 'INVALID_INPUT', `${field} must be a non-empty string`);
  }
  return value.trim();
}

function parseCount(value: unknown, fallback: number, min: number, max: number) {
  if (typeof value === 'number' && Number.isInteger(value)) {
    return clamp(value, min, max);
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number.parseInt(value, 10);
    if (Number.isInteger(parsed)) {
      return clamp(parsed, min, max);
    }
  }
  return fallback;
}

function parseBoolean(value: unknown, fallback: boolean) {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'string') {
    if (value.toLowerCase() === 'true') return true;
    if (value.toLowerCase() === 'false') return false;
  }
  return fallback;
}

function parseOptionalString(value: unknown) {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed) {
      return trimmed;
    }
  }
  return undefined;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function parseRequestUrl(req: IncomingMessage) {
  const origin = `http://${req.headers.host ?? 'localhost'}`;
  return new URL(req.url ?? '/', origin);
}

function setCorsHeaders(res: ServerResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
}

function sendJson(res: ServerResponse, statusCode: number, payload: unknown) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(payload));
}
