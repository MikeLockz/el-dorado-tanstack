import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import WebSocket from 'ws';
import { setTimeout as delay } from 'node:timers/promises';
import type { ClientGameView, ClientRoundState, Card, GameState } from '@game/domain';
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

interface TestClient {
  socket: WebSocket;
  playerId: string;
  state: ClientGameView;
}

describe('server integration: game flow', () => {
  let server: TestServer;

  beforeAll(async () => {
    server = await startTestServer({ turnTimeoutMs: 50 });
  });

  afterAll(async () => {
    await server.stop();
  });

  it('creates, joins, and completes a deterministic game', async () => {
    const hostProfile = buildProfile('Host One');
    const createBody = {
      displayName: hostProfile.displayName,
      avatarSeed: hostProfile.avatarSeed,
      color: hostProfile.color,
      minPlayers: 2,
      maxPlayers: 2,
      roundCount: 1,
      isPublic: false,
    };
    const createResult = await requestJson<CreateRoomResponse>(server, {
      path: '/api/create-room',
      method: 'POST',
      body: createBody,
      expectedStatus: 201,
    });

    const joinResult = await requestJson<JoinRoomResponse>(server, {
      path: '/api/join-by-code',
      method: 'POST',
      body: {
        joinCode: createResult.joinCode,
        ...buildProfile('Guest Two'),
      },
      expectedStatus: 200,
    });

    const hostClient = await connectClient(server.wsUrl, createResult.gameId, createResult.playerToken);
    const guestClient = await connectClient(server.wsUrl, joinResult.gameId, joinResult.playerToken);
    const clients = new Map<string, TestClient>([
      [hostClient.playerId, hostClient],
      [guestClient.playerId, guestClient],
    ]);

    try {
      const room = server.registry.getRoom(createResult.gameId);
      expect(room).toBeDefined();
      const activeRoom = room!;

      // Start the game
      sendMessage(clients.get(hostClient.playerId)!, { type: 'SET_READY', ready: true });
      sendMessage(clients.get(guestClient.playerId)!, { type: 'SET_READY', ready: true });

      // Give a tiny delay for ready state to propagate (optional but safe)
      await delay(50);
      sendMessage(clients.get(hostClient.playerId)!, { type: 'START_GAME' });

      await waitFor(() => activeRoom.gameState.phase === 'BIDDING');

      await submitBid(activeRoom, clients.get(hostClient.playerId)!);
      await submitBid(activeRoom, clients.get(guestClient.playerId)!);
      await waitFor(() => Boolean(activeRoom.gameState.roundState?.biddingComplete));
      expect(activeRoom.gameState.phase).toBe('PLAYING');

      await playOutRound(activeRoom, clients);
      await waitFor(() => activeRoom.gameState.phase === 'COMPLETED');

      expect(activeRoom.gameState.roundSummaries).toHaveLength(1);
      const finalScores = activeRoom.gameState.roundSummaries[0]?.deltas ?? {};
      expect(Object.keys(finalScores)).toHaveLength(2);
    } finally {
      await closeClient(hostClient);
      await closeClient(guestClient);
    }
  }, 15000);
});

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

import { BaselineBotStrategy, createBotContextFromState } from '@game/domain';

const bot = new BaselineBotStrategy();

async function submitBid(room: { gameState: GameState }, client: TestClient) {
  const before = room.gameState.roundState?.bids[client.playerId] ?? null;

  // Use server state to ensure we have the latest info
  const clientView = asClientView(room.gameState, client.playerId);
  const context = createBotContextFromState(clientView, client.playerId);
  const bid = bot.bid(clientView.hand ?? [], context);

  sendMessage(client, { type: 'BID', value: bid });
  await waitFor(() => room.gameState.roundState?.bids[client.playerId] !== null && room.gameState.roundState?.bids[client.playerId] !== before);
}

async function playOutRound(room: { gameState: GameState }, clients: Map<string, TestClient>) {
  await waitFor(() => Boolean(room.gameState.roundState));
  while (room.gameState.roundState) {
    const nextPlayer = getNextPlayer(room.gameState);
    if (!nextPlayer) {
      await delay(10);
      continue;
    }

    const client = clients.get(nextPlayer)!;
    // Use server state
    const clientView = asClientView(room.gameState, client.playerId);
    const context = createBotContextFromState(clientView, client.playerId);
    const card = bot.playCard(clientView.hand ?? [], context);

    const beforeHand = room.gameState.playerStates[nextPlayer].hand.length;
    sendMessage(client, { type: 'PLAY_CARD', cardId: card.id });
    await waitFor(() => room.gameState.playerStates[nextPlayer].hand.length === beforeHand - 1);
  }
}

function asClientView(state: GameState, playerId: string): ClientGameView {
  return {
    gameId: state.gameId,
    phase: state.phase,
    players: state.players,
    you: playerId,
    hand: state.playerStates[playerId]?.hand ?? [],
    cumulativeScores: state.cumulativeScores,
    roundSummaries: state.roundSummaries,
    round: state.roundState ? (state.roundState as unknown as ClientRoundState) : null,
    config: {
      minPlayers: state.config.minPlayers,
      maxPlayers: state.config.maxPlayers,
      roundCount: state.config.roundCount,
    },
    isPublic: true,
  };
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
