import { describe, expect, it } from 'vitest';
import { EventEmitter } from 'node:events';
import type { Server } from 'node:http';
import http from 'node:http';
import type { PlayerId, PlayerProfile } from '@game/domain';
import { startRound } from '@game/domain';
import type { ServerRoom } from '../rooms/RoomRegistry.js';
import { RoomRegistry } from '../rooms/RoomRegistry.js';
import { WebSocketGateway } from './Gateway.js';
import type { ServerMessage } from './messages.js';

class MockSocket extends EventEmitter {
  readyState = 1; // OPEN
  sent: ServerMessage[] = [];

  send(payload: string) {
    const parsed = JSON.parse(payload) as ServerMessage;
    this.sent.push(parsed);
  }

  terminate() {
    this.readyState = 3; // CLOSED
    this.emit('close');
  }
}

class TestGateway extends WebSocketGateway {
  public connect(socket: MockSocket, room: ServerRoom, playerId: PlayerId, token: string) {
    this.handleConnection(socket as unknown as WebSocket, { room, playerId, token } as unknown as {
      room: ServerRoom;
      playerId: PlayerId;
      token: string;
    });
  }
}

const profile: PlayerProfile = {
  displayName: 'WS Tester',
  avatarSeed: 'seed',
  color: '#ffffff',
};

function createServer() {
  const registry = new RoomRegistry();
  const server: Server = http.createServer();
  const gateway = new TestGateway(server, { registry });
  return { registry, server, gateway };
}

describe('WebSocketGateway (headless)', () => {
  it('sends welcome and state payloads on connection', () => {
    const { registry, server, gateway } = createServer();
    const { room, playerId, playerToken } = registry.createRoom({ hostProfile: profile });
    const socket = new MockSocket();

    gateway.connect(socket, room, playerId, playerToken);

    expect(socket.sent.find((msg) => msg.type === 'WELCOME')).toBeDefined();
    expect(socket.sent.find((msg) => msg.type === 'STATE_FULL')).toBeDefined();
    expect(socket.sent.find((msg) => msg.type === 'TOKEN_REFRESH')).toBeDefined();
    server.close();
  });

  it('handles ping and state requests via message flow', () => {
    const { registry, server, gateway } = createServer();
    const { room, playerId, playerToken } = registry.createRoom({ hostProfile: profile });
    const socket = new MockSocket();
    gateway.connect(socket, room, playerId, playerToken);

    socket.emit('message', JSON.stringify({ type: 'PING', nonce: 'abc' }));
    socket.emit('message', JSON.stringify({ type: 'REQUEST_STATE' }));

    expect(socket.sent.find((msg) => msg.type === 'PONG')?.nonce).toBe('abc');
    expect(socket.sent.filter((msg) => msg.type === 'STATE_FULL').length).toBeGreaterThan(1);
    server.close();
  });

  it('processes play messages and emits game events', () => {
    const { registry, server, gateway } = createServer();
    const { room, playerId, playerToken } = registry.createRoom({ hostProfile: profile });
    registry.joinRoomByCode(room.joinCode, {
      displayName: 'Ally',
      avatarSeed: 'ally',
      color: '#000000',
    });

    const next = startRound(room.gameState, 0, 'integration-seed');
    room.gameState = next;
    room.playerStates = next.playerStates;
    const round = room.gameState.roundState;
    if (!round) throw new Error('Missing round state');
    round.biddingComplete = true;
    room.gameState.phase = 'PLAYING';
    for (const p of room.gameState.players) {
      round.bids[p.playerId] = 0;
      room.playerStates[p.playerId] = { ...room.playerStates[p.playerId], bid: 0 };
    }

    const socket = new MockSocket();
    gateway.connect(socket, room, playerId, playerToken);
    const hand = room.playerStates[playerId].hand;
    const playableCard = hand.find((card) => card.suit !== round.trumpSuit) ?? hand[0];
    if (!playableCard) throw new Error('Missing hand card');

    socket.emit('message', JSON.stringify({ type: 'PLAY_CARD', cardId: playableCard.id }));

    expect(
      socket.sent.some((msg) => msg.type === 'GAME_EVENT' && msg.event.type === 'CARD_PLAYED'),
    ).toBe(true);
    server.close();
  });
});
