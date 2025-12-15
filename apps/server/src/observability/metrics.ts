import type { Attributes } from '@opentelemetry/api';
import { getMeter } from './telemetry.js';

const meter = getMeter();

const httpRequestDuration = meter.createHistogram('http_request_duration_ms', {
  description: 'Latency for handled HTTP requests',
  unit: 'ms',
});

const gamesCreated = meter.createCounter('games_created_total', {
  description: 'Number of games created',
});

const gamesCompleted = meter.createCounter('games_completed_total', {
  description: 'Number of games that reached completion',
});

const gamesActive = meter.createUpDownCounter('games_active', {
  description: 'Active games currently tracked in the registry',
});

const wsConnections = meter.createUpDownCounter('ws_connections_active', {
  description: 'Open WebSocket connections',
});

const wsMessages = meter.createCounter('ws_messages_total', {
  description: 'WebSocket messages received from clients',
});

const cardPlays = meter.createCounter('card_plays_total', {
  description: 'Card play actions processed by the engine',
});

const remoteBotRequests = meter.createCounter('remote_bot_requests_total', {
  description: 'Requests to the remote bot service (MCTS-AI)',
});

export function recordHttpRequest(
  method: string,
  route: string,
  statusCode: number,
  durationMs: number,
  attributes: Attributes = {},
) {
  httpRequestDuration.record(durationMs, {
    method,
    route,
    statusCode,
    ...attributes,
  });
}

export function trackGameCreated(options: { isPublic: boolean }) {
  const visibility = options.isPublic ? 'public' : 'private';
  gamesCreated.add(1, { visibility });
  gamesActive.add(1, { visibility });
}

export function trackGameCompleted(options: { isPublic: boolean }) {
  const visibility = options.isPublic ? 'public' : 'private';
  gamesCompleted.add(1, { visibility });
  gamesActive.add(-1, { visibility });
}

export function trackWsConnection(options: { gameId: string }) {
  wsConnections.add(1, { gameId: options.gameId });
}

export function trackWsDisconnection(options: { gameId: string }) {
  wsConnections.add(-1, { gameId: options.gameId });
}

export function trackWsMessage(options: { gameId: string; type: string }) {
  wsMessages.add(1, { gameId: options.gameId, type: options.type });
}

export function trackCardPlayed(options: { gameId: string; playerId: string }) {
  cardPlays.add(1, { gameId: options.gameId, playerId: options.playerId });
}

export function trackRemoteBotRequest(options: { phase: 'bid' | 'play'; status: 'success' | 'fallback' }) {
  remoteBotRequests.add(1, { phase: options.phase, status: options.status });
}

const botWins = meter.createCounter('bot_wins_total', {
  description: 'Number of games won by bots, segmented by strategy',
});

export function trackBotWin(strategy: string) {
  botWins.add(1, { strategy });
}
