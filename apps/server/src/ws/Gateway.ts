import { randomUUID } from 'node:crypto';
import type http from 'node:http';
import { URL } from 'node:url';
import { WebSocketServer, WebSocket } from 'ws';
import type { RawData } from 'ws';
import {
  type EngineEvent,
  type GameEvent,
  type GameState,
  type PlayerId,
  applyBid,
  completeTrick,
  getActivePlayers,
  isPlayersTurn,
  playCard,
  startRound,
} from '@game/domain';
import { EngineError } from '@game/domain';
import { RoomRegistry, RoomRegistryError, type RoomSocket, type ServerRoom } from '../rooms/RoomRegistry.js';
import { buildClientGameView, recordEngineEvents } from './state.js';
import { parseClientMessage, type ClientMessage, type ServerMessage } from './messages.js';
import { selectFallbackCard } from './fallback.js';

interface GatewayOptions {
  registry: RoomRegistry;
  turnTimeoutMs?: number;
}

interface ConnectionContext extends RoomSocket {
  room: ServerRoom;
  token: string;
}

interface UpgradeContext {
  room: ServerRoom;
  playerId: PlayerId;
  token: string;
}

const DEFAULT_TURN_TIMEOUT_MS = 60_000;

export class WebSocketGateway {
  private readonly registry: RoomRegistry;
  private readonly turnTimeoutMs: number;
  private readonly wss: WebSocketServer;
  private readonly connections = new Map<string, ConnectionContext>();
  private readonly timers = new Map<string, NodeJS.Timeout>();

  constructor(server: http.Server, options: GatewayOptions) {
    this.registry = options.registry;
    this.turnTimeoutMs = options.turnTimeoutMs ?? DEFAULT_TURN_TIMEOUT_MS;
    this.wss = new WebSocketServer({ noServer: true });

    server.on('upgrade', (req, socket, head) => {
      this.handleUpgrade(req, socket, head);
    });

    this.wss.on('connection', (socket, _request, auth: UpgradeContext) => {
      this.handleConnection(socket, auth);
    });
  }

  private handleUpgrade(req: http.IncomingMessage, socket: http.Socket, head: Buffer) {
    const parsedUrl = this.parseRequestUrl(req);
    if (parsedUrl.pathname !== '/ws') {
      this.rejectUpgrade(socket, 404, 'Not Found');
      return;
    }

    const token = parsedUrl.searchParams.get('token');
    const gameId = parsedUrl.searchParams.get('gameId');
    if (!token || !gameId) {
      this.rejectUpgrade(socket, 400, 'Missing credentials');
      return;
    }

    let auth: UpgradeContext | null = null;
    try {
      const resolved = this.registry.resolvePlayerToken(token, gameId);
      auth = { room: resolved.room, playerId: resolved.playerId, token };
    } catch (error) {
      if (error instanceof RoomRegistryError) {
        this.rejectUpgrade(socket, error.status ?? 401, error.message);
        return;
      }
      this.rejectUpgrade(socket, 500, 'Internal error');
      return;
    }

    this.wss.handleUpgrade(req, socket, head, (ws) => {
      this.wss.emit('connection', ws, req, auth as UpgradeContext);
    });
  }

  protected handleConnection(socket: WebSocket, auth: UpgradeContext) {
    const socketId = randomUUID();
    const { room, playerId, token } = auth;

    this.disconnectExistingConnections(room, playerId);

    const connection: ConnectionContext = {
      socketId,
      playerId,
      socket,
      connectedAt: Date.now(),
      room,
      token,
    };

    room.sockets.set(socketId, connection);
    this.connections.set(socketId, connection);
    this.setPlayerStatus(room, playerId, 'active');
    this.cancelTimer(room, playerId);

    socket.on('message', (data) => this.handleMessage(connection, data));
    socket.on('close', () => this.handleDisconnect(connection));
    socket.on('error', (error) => {
      console.error('[ws] socket error', error);
    });

    this.send(socket, this.buildWelcome(room, playerId));
    this.sendState(connection);
    this.broadcastState(room);
    this.pushTokenRefresh(connection);
  }

  private handleMessage(connection: ConnectionContext, raw: RawData) {
    const message = parseClientMessage(raw);
    if (!message) {
      this.emitInvalidAction(connection.room, connection.playerId, 'INVALID_MESSAGE', 'Unable to parse message');
      return;
    }

    try {
      switch (message.type) {
        case 'PLAY_CARD':
          this.handlePlayCard(connection, message.cardId);
          break;
        case 'BID':
          this.handleBid(connection, message.value);
          break;
        case 'REQUEST_STATE':
          this.sendState(connection);
          break;
        case 'UPDATE_PROFILE':
          this.handleProfileUpdate(connection, message);
          break;
        case 'PING':
          this.send(connection.socket, { type: 'PONG', nonce: message.nonce, ts: Date.now() });
          break;
        default:
          this.emitInvalidAction(connection.room, connection.playerId, 'UNKNOWN_TYPE', message.type);
          break;
      }
    } catch (error) {
      this.handleActionError(connection, error);
    }
  }

  private handlePlayCard(connection: ConnectionContext, cardId: string) {
    const { room, playerId } = connection;
    this.ensureRound(room);

    this.executePlay(room, playerId, cardId);
  }

  private handleBid(connection: ConnectionContext, value: number) {
    const { room, playerId } = connection;
    this.ensureRound(room);

    const result = applyBid(room.gameState, playerId, value);
    this.commitState(room, result.state);
    const recorded = recordEngineEvents(room, result.events);
    this.broadcastEvents(room, recorded);
    this.broadcastState(room);
  }

  private handleProfileUpdate(connection: ConnectionContext, message: Extract<ClientMessage, { type: 'UPDATE_PROFILE' }>) {
    const { room, playerId } = connection;
    const updates: Record<string, string> = {};
    if (message.displayName) updates.displayName = message.displayName;
    if (message.avatarSeed) updates.avatarSeed = message.avatarSeed;
    if (message.color) updates.color = message.color;

    if (Object.keys(updates).length === 0) {
      this.emitInvalidAction(room, playerId, 'INVALID_PROFILE', 'No profile fields provided');
      return;
    }

    const playerIndex = room.gameState.players.findIndex((player) => player.playerId === playerId);
    if (playerIndex === -1) {
      this.emitInvalidAction(room, playerId, 'PLAYER_NOT_FOUND', 'Unable to update profile');
      return;
    }

    const existing = room.gameState.players[playerIndex];
    const updatedProfile = { ...existing.profile, ...updates };

    room.gameState.players[playerIndex] = {
      ...existing,
      profile: updatedProfile,
    };
    room.gameState.updatedAt = Date.now();

    const events = recordEngineEvents(room, [
      {
        type: 'PROFILE_UPDATED',
        payload: { playerId, profile: updatedProfile },
      } as EngineEvent<'PROFILE_UPDATED'>,
    ]);
    this.broadcastEvents(room, events);
    this.broadcastState(room);
  }

  private handleDisconnect(connection: ConnectionContext) {
    const { room, socketId, playerId } = connection;
    room.sockets.delete(socketId);
    this.connections.delete(socketId);
    this.setPlayerStatus(room, playerId, 'disconnected');
    this.broadcastState(room);
    this.scheduleTimer(room, playerId);
  }

  private ensureRound(room: ServerRoom) {
    if (room.gameState.roundState) {
      return;
    }

    const roundIndex = room.gameState.roundSummaries.length;
    if (roundIndex >= room.gameState.config.roundCount) {
      throw new EngineError('GAME_COMPLETED', 'All rounds have been played');
    }

    try {
      const nextState = startRound(room.gameState, roundIndex, `${room.gameState.config.sessionSeed}:${roundIndex}`);
      this.commitState(room, nextState);
    } catch (error) {
      if (error instanceof EngineError) {
        throw error;
      }
      const message = error instanceof Error ? error.message : 'Unable to start round';
      throw new EngineError('ROUND_NOT_READY', message);
    }
  }

  private commitState(room: ServerRoom, nextState: GameState) {
    room.gameState = nextState;
    room.playerStates = nextState.playerStates;
    room.updatedAt = Date.now();
  }

  private broadcastState(room: ServerRoom) {
    for (const socket of room.sockets.values()) {
      this.send(socket.socket, {
        type: 'STATE_FULL',
        state: buildClientGameView(room, socket.playerId),
      });
    }
  }

  private pushTokenRefresh(connection: ConnectionContext) {
    try {
      const token = this.registry.refreshPlayerToken(connection.room, connection.playerId);
      connection.token = token;
      this.send(connection.socket, {
        type: 'TOKEN_REFRESH',
        gameId: connection.room.gameId,
        token,
      });
    } catch (error) {
      if (error instanceof RoomRegistryError) {
        console.error('[ws] unable to refresh token', error.message);
        return;
      }
      console.error('[ws] unexpected token refresh error', error);
    }
  }

  private sendState(connection: ConnectionContext) {
    this.send(connection.socket, {
      type: 'STATE_FULL',
      state: buildClientGameView(connection.room, connection.playerId),
    });
  }

  private broadcastEvents(room: ServerRoom, events: GameEvent[]) {
    if (events.length === 0) {
      return;
    }

    for (const event of events) {
      for (const socket of room.sockets.values()) {
        this.send(socket.socket, { type: 'GAME_EVENT', event });
      }
    }
  }

  private emitInvalidAction(room: ServerRoom, playerId: PlayerId, action: string, reason: string) {
    const events = recordEngineEvents(room, [
      {
        type: 'INVALID_ACTION',
        payload: { playerId, action, reason },
      } as EngineEvent<'INVALID_ACTION'>,
    ]);
    this.broadcastEvents(room, events);
  }

  private handleActionError(connection: ConnectionContext, error: unknown) {
    if (error instanceof EngineError) {
      this.emitInvalidAction(connection.room, connection.playerId, error.code, error.message);
      return;
    }
    console.error('[ws] unhandled action error', error);
  }

  private handleTurnTimeout(room: ServerRoom, playerId: PlayerId) {
    if (this.getPlayerStatus(room, playerId) !== 'disconnected') {
      return;
    }
    if (!room.gameState.roundState) {
      this.scheduleTimer(room, playerId);
      return;
    }

    if (!isPlayersTurn(room.gameState, playerId)) {
      this.scheduleTimer(room, playerId);
      return;
    }

    const fallbackCard = selectFallbackCard(room.gameState, playerId);
    if (!fallbackCard) {
      return;
    }

    try {
      this.executePlay(room, playerId, fallbackCard.id);
    } catch (error) {
      this.handleTimerError(room, playerId, error);
    } finally {
      if (this.getPlayerStatus(room, playerId) === 'disconnected') {
        this.scheduleTimer(room, playerId);
      }
    }
  }

  private executePlay(room: ServerRoom, playerId: PlayerId, cardId: string) {
    const playResult = playCard(room.gameState, playerId, cardId);
    let nextState = playResult.state;
    let events = [...playResult.events];

    const roundState = nextState.roundState;
    const activeCount = getActivePlayers(nextState).length;
    if (roundState?.trickInProgress && roundState.trickInProgress.plays.length === activeCount) {
      const completed = completeTrick(nextState);
      nextState = completed.state;
      events = [...events, ...completed.events];
    }

    this.commitState(room, nextState);
    const recorded = recordEngineEvents(room, events);
    this.broadcastEvents(room, recorded);
    this.broadcastState(room);
  }

  private handleTimerError(room: ServerRoom, playerId: PlayerId, error: unknown) {
    if (error instanceof EngineError) {
      this.emitInvalidAction(room, playerId, error.code, error.message);
      return;
    }
    console.error('[ws] fallback failed', error);
  }

  private scheduleTimer(room: ServerRoom, playerId: PlayerId) {
    const key = this.timerKey(room, playerId);
    this.cancelTimer(room, playerId);
    const timer = setTimeout(() => {
      this.timers.delete(key);
      this.handleTurnTimeout(room, playerId);
    }, this.turnTimeoutMs);
    this.timers.set(key, timer);
  }

  private cancelTimer(room: ServerRoom, playerId: PlayerId) {
    const key = this.timerKey(room, playerId);
    const timer = this.timers.get(key);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(key);
    }
  }

  private timerKey(room: ServerRoom, playerId: PlayerId) {
    return `${room.gameId}:${playerId}`;
  }

  private disconnectExistingConnections(room: ServerRoom, playerId: PlayerId) {
    for (const [socketId, socket] of [...room.sockets.entries()]) {
      if (socket.playerId === playerId) {
        socket.socket.terminate();
        room.sockets.delete(socketId);
        this.connections.delete(socketId);
      }
    }
  }

  private setPlayerStatus(room: ServerRoom, playerId: PlayerId, status: 'active' | 'disconnected') {
    const index = room.gameState.players.findIndex((player) => player.playerId === playerId);
    if (index === -1) return;
    const player = room.gameState.players[index];
    if (player.status === status) return;
    room.gameState.players[index] = { ...player, status };
    room.gameState.updatedAt = Date.now();
  }

  private getPlayerStatus(room: ServerRoom, playerId: PlayerId) {
    return room.gameState.players.find((player) => player.playerId === playerId)?.status ?? 'active';
  }

  private buildWelcome(room: ServerRoom, playerId: PlayerId): ServerMessage {
    const player = room.gameState.players.find((p) => p.playerId === playerId);
    return {
      type: 'WELCOME',
      playerId,
      gameId: room.gameId,
      seatIndex: player?.seatIndex ?? null,
      isSpectator: player?.spectator ?? false,
    };
  }

  private send(socket: WebSocket, payload: ServerMessage) {
    if (socket.readyState !== WebSocket.OPEN) {
      return;
    }
    socket.send(JSON.stringify(payload));
  }

  private parseRequestUrl(req: http.IncomingMessage) {
    const origin = `http://${req.headers.host ?? 'localhost'}`;
    return new URL(req.url ?? '/', origin);
  }

  private rejectUpgrade(socket: http.Socket, status: number, message: string) {
    socket.write(
      `HTTP/1.1 ${status} ${status >= 400 && status < 500 ? 'Bad Request' : 'Error'}\r\nConnection: close\r\n\r\n${message}`,
    );
    socket.destroy();
  }
}
