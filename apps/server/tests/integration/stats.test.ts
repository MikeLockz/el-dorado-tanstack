import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import WebSocket from 'ws';
import { setTimeout as delay } from 'node:timers/promises';
import type { ClientGameView, Card, GameState } from '@game/domain';
import { getTurnOrder, isPlayersTurn } from '@game/domain';
import type { ClientMessage, ServerMessage } from '../../src/ws/messages.js';
import { startTestServer, type TestServer } from '../utils/server.js';
import { requestJson } from '../utils/http.js';
import { buildProfile } from '../utils/factories.js';

interface CreateRoomResponse {
  gameId: string;
  joinCode: string;
  playerToken: string;
}

interface JoinRoomResponse {
  gameId: string;
  playerToken: string;
}

interface PlayerStatsResponse {
  profile: {
    userId?: string;
    displayName: string;
    isBot: boolean;
  };
  lifetime: {
    gamesPlayed: number;
    gamesWon: number;
    totalPoints: number;
    mostConsecutiveWins: number;
    mostConsecutiveLosses: number;
    currentWinStreak?: number;
    currentLossStreak?: number;
    totalMisplays?: number;
  };
}

interface TestClient {
  socket: WebSocket;
  playerId: string;
  state: ClientGameView;
}

describe('server integration: stats', () => {
  let server: TestServer;

  beforeAll(async () => {
    // Ensure DB is enabled
    server = await startTestServer({ turnTimeoutMs: 50, enableDb: true });
  });

  afterAll(async () => {
    await server.stop();
  });

  it('tracks stats after game completion', async () => {
    const hostProfile = buildProfile('Host Stats');
    // Use a unique user ID for stats tracking
    hostProfile.userId = `stats-test-${Date.now()}`;

    const createBody = {
      displayName: hostProfile.displayName,
      avatarSeed: hostProfile.avatarSeed,
      color: hostProfile.color,
      userId: hostProfile.userId,
      minPlayers: 2,
      maxPlayers: 2,
      roundCount: 1, // Short game
      isPublic: false,
    };

    const createResult = await requestJson<CreateRoomResponse>(server, {
      path: '/api/create-room',
      method: 'POST',
      body: createBody,
      expectedStatus: 201,
    });

    const joinerProfile = buildProfile('Joiner Stats');
    joinerProfile.userId = `stats-test-joiner-${Date.now()}`;
    
    const joinResult = await requestJson<JoinRoomResponse>(server, {
      path: '/api/join-by-code',
      method: 'POST',
      body: {
        joinCode: createResult.joinCode,
        displayName: joinerProfile.displayName,
        avatarSeed: joinerProfile.avatarSeed,
        color: joinerProfile.color,
        userId: joinerProfile.userId,
      },
    });

    const hostClient = await connectClient(server.wsUrl, createResult.gameId, createResult.playerToken);
    const joinerClient = await connectClient(server.wsUrl, joinResult.gameId, joinResult.playerToken);
    
    const clients = new Map<string, TestClient>([
      [hostClient.playerId, hostClient],
      [joinerClient.playerId, joinerClient],
    ]);

    try {
      const room = server.registry.getRoom(createResult.gameId);
      expect(room).toBeDefined();
      const activeRoom = room!;

      // Bidding
      await submitBid(activeRoom, clients.get(hostClient.playerId)!, 1);
      await submitBid(activeRoom, clients.get(joinerClient.playerId)!, 1);
      
      await waitFor(() => Boolean(activeRoom.gameState.roundState?.biddingComplete));
      expect(activeRoom.gameState.phase).toBe('PLAYING');

      // Playing
      await playOutRound(activeRoom, clients);
      
      // Wait for game completion
      await waitFor(() => activeRoom.gameState.phase === 'COMPLETED');

      // Check stats
      const stats = await requestJson<PlayerStatsResponse>(server, {
        path: `/api/player-stats?userId=${hostProfile.userId}`,
        method: 'GET',
      });

      expect(stats.lifetime.gamesPlayed).toBe(1);
      expect(stats.lifetime.totalPoints).toBeDefined();
    } finally {
      await closeClient(hostClient);
      await closeClient(joinerClient);
    }
  });
});

async function connectClient(wsUrl: string, gameId: string, token: string): Promise<TestClient> {
  return await new Promise<TestClient>((resolve, reject) => {
    const socket = new WebSocket(`${wsUrl}?gameId=${gameId}&token=${token}`);
    const state: Partial<TestClient> = { socket };
    const timer = setTimeout(() => {
      reject(new Error('Timed out waiting for WELCOME'));
    }, 5000).unref();

    socket.on('message', (raw) => {
      const message = JSON.parse(raw.toString()) as ServerMessage;
      if (message.type === 'WELCOME') {
        state.playerId = message.playerId;
      }
      if (message.type === 'STATE_FULL') {
        state.state = message.state;
      }
      if (state.playerId && state.state) {
        clearTimeout(timer);
        resolve(state as TestClient);
      }
    });

    socket.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

async function closeClient(client: TestClient): Promise<void> {
  await new Promise<void>((resolve) => {
    client.socket.once('close', () => resolve());
    client.socket.close();
  });
}

async function submitBid(room: { gameState: GameState }, client: TestClient, bid: number) {
  const before = room.gameState.roundState?.bids[client.playerId] ?? null;
  sendMessage(client, { type: 'BID', value: bid });
  await waitFor(() => room.gameState.roundState?.bids[client.playerId] === bid && room.gameState.roundState?.bids[client.playerId] !== before);
}

async function playOutRound(room: { gameState: GameState }, clients: Map<string, TestClient>) {
  await waitFor(() => Boolean(room.gameState.roundState));
  while (room.gameState.roundState) {
    const nextPlayer = getNextPlayer(room.gameState);
    if (!nextPlayer) {
      await delay(10);
      continue;
    }
    const card = chooseCard(room.gameState, nextPlayer);
    const beforeHand = room.gameState.playerStates[nextPlayer].hand.length;
    sendMessage(clients.get(nextPlayer)!, { type: 'PLAY_CARD', cardId: card.id });
    await waitFor(() => room.gameState.playerStates[nextPlayer].hand.length === beforeHand - 1);
  }
}

function getNextPlayer(state: GameState): string | null {
  if (!state.roundState) {
    return null;
  }
  const order = getTurnOrder(state);
  for (const playerId of order) {
    if (isPlayersTurn(state, playerId)) {
      return playerId;
    }
  }
  return null;
}

function chooseCard(state: GameState, playerId: string): Card {
  const round = state.roundState;
  const playerState = state.playerStates[playerId];
  if (!round || !playerState) {
    throw new Error('Round state missing');
  }
  const hand = playerState.hand;
  if (hand.length === 0) {
    throw new Error('No cards left');
  }
  const trick = round.trickInProgress;
  if (!trick || trick.plays.length === 0 || !trick.ledSuit) {
    const nonTrump = hand.find((card) => card.suit !== round.trumpSuit);
    return nonTrump ?? hand[0];
  }
  const ledSuit = trick.ledSuit;
  const matching = hand.find((card) => card.suit === ledSuit);
  return matching ?? hand[0];
}

function sendMessage(client: TestClient, message: ClientMessage) {
  client.socket.send(JSON.stringify(message));
}

async function waitFor(predicate: () => boolean, timeoutMs = 5000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (predicate()) {
      return;
    }
    await delay(10);
  }
  throw new Error('Timed out waiting for condition');
}
