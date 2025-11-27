import { EventEmitter } from 'node:events';
import { randomBytes, randomUUID } from 'node:crypto';
import type { WebSocket } from 'ws';
import {
  type Card,
  type GameEvent,
  type GameId,
  type GameState,
  type PlayerId,
  type PlayerInGame,
  type PlayerProfile,
  type PlayerReadyState,
  type ServerPlayerState,
  createGame,
} from '@game/domain';
import { isTokenExpired, signPlayerToken, verifyPlayerToken } from '../auth/playerTokens.js';
import type { GamePersistence } from '../persistence/GamePersistence.js';
import { logger } from '../observability/logger.js';
import { trackGameCreated } from '../observability/metrics.js';

const DEFAULT_MIN_PLAYERS = 2;
const DEFAULT_MAX_PLAYERS = 4;
const DEFAULT_ROUND_COUNT = 10;
const JOIN_CODE_LENGTH = 6;
const JOIN_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export type PlayerToken = string;

export interface CreateRoomOptions {
  hostProfile: PlayerProfile;
  minPlayers?: number;
  maxPlayers?: number;
  roundCount?: number;
  isPublic?: boolean;
  hostIsBot?: boolean;
}

export interface CreateRoomResult {
  room: ServerRoom;
  playerId: PlayerId;
  playerToken: PlayerToken;
}

export type JoinRoomResult = CreateRoomResult;

export interface ServerRoom {
  gameId: GameId;
  joinCode: string;
  isPublic: boolean;
  gameState: GameState;
  lobby: ServerLobbyState;
  playerStates: Record<PlayerId, ServerPlayerState>;
  deck: Card[];
  sockets: Map<string, RoomSocket>;
  eventLog: GameEvent[];
  eventIndex: number;
  createdAt: number;
  updatedAt: number;
  playerTokens: Map<PlayerId, PlayerToken>;
  persistence?: RoomPersistenceContext | null;
}

export interface ServerLobbyState {
  readyState: PlayerReadyState;
  overrideReadyRequirement: boolean;
  autoStartEnabled: boolean;
}

export interface RoomSocket {
  socketId: string;
  playerId: PlayerId;
  socket: WebSocket;
  connectedAt: number;
  disconnectMeta?: Record<string, unknown>;
}

export interface RoomPersistenceContext {
  adapter: GamePersistence;
  playerDbIds: Map<PlayerId, string>;
}

export interface RoomRegistryOptions {
  persistence?: GamePersistence;
}

interface AddPlayerOptions {
  isBot?: boolean;
  spectator?: boolean;
}

export type RoomRegistryErrorCode =
  | 'ROOM_NOT_FOUND'
  | 'ROOM_FULL'
  | 'INVALID_JOIN_CODE'
  | 'INVALID_TOKEN'
  | 'TOKEN_EXPIRED';

export class RoomRegistryError extends Error {
  constructor(
    public readonly code: RoomRegistryErrorCode,
    message: string,
    public readonly status: number = 400,
  ) {
    super(message);
    this.name = 'RoomRegistryError';
  }
}

export class RoomRegistry extends EventEmitter {
  private readonly persistence?: GamePersistence;
  private roomsById = new Map<GameId, ServerRoom>();
  private joinCodeToGameId = new Map<string, GameId>();
  private readonly log = logger.child({ context: { component: 'room-registry' } });

  constructor(options: RoomRegistryOptions = {}) {
    super();
    this.persistence = options.persistence;
  }

  async createRoom(options: CreateRoomOptions): Promise<CreateRoomResult> {
    const now = Date.now();
    const gameId = randomUUID();
    const joinCode = this.generateJoinCode();

    const config = {
      gameId,
      sessionSeed: this.createSeed(),
      roundCount: options.roundCount ?? DEFAULT_ROUND_COUNT,
      minPlayers: options.minPlayers ?? DEFAULT_MIN_PLAYERS,
      maxPlayers: options.maxPlayers ?? DEFAULT_MAX_PLAYERS,
    };

    const gameState = createGame(config);
    gameState.updatedAt = now;

    const persistenceContext = this.persistence
      ? { adapter: this.persistence, playerDbIds: new Map<PlayerId, string>() }
      : null;

    const room: ServerRoom = {
      gameId,
      joinCode,
      isPublic: options.isPublic ?? true,
      gameState,
      lobby: {
        readyState: {},
        overrideReadyRequirement: false,
        autoStartEnabled: Boolean(options.hostIsBot),
      },
      playerStates: gameState.playerStates,
      deck: [],
      sockets: new Map(),
      eventLog: [],
      eventIndex: 0,
      createdAt: now,
      updatedAt: now,
      playerTokens: new Map(),
      persistence: persistenceContext,
    };

    const { playerId, playerToken, player } = await this.addPlayerToRoom(room, options.hostProfile, {
      isBot: options.hostIsBot,
    });
    this.initializeLobbyEntry(room, player);

    this.roomsById.set(room.gameId, room);
    this.joinCodeToGameId.set(joinCode, room.gameId);

    await this.persistRoomCreation(room);
    await this.syncRoomDirectory(room);
    trackGameCreated({ isPublic: room.isPublic });
    this.log.info('game created', {
      gameId: room.gameId,
      context: {
        minPlayers: room.gameState.config.minPlayers,
        maxPlayers: room.gameState.config.maxPlayers,
        roundCount: room.gameState.config.roundCount,
        isPublic: room.isPublic,
        hostIsBot: options.hostIsBot ?? false,
      },
    });

    return { room, playerId, playerToken };
  }

  async joinRoomByCode(
    joinCode: string,
    profile: PlayerProfile,
    options: { spectator?: boolean } = {},
  ): Promise<JoinRoomResult> {
    const normalized = joinCode.trim().toUpperCase();
    if (normalized.length !== JOIN_CODE_LENGTH) {
      throw new RoomRegistryError('INVALID_JOIN_CODE', 'Join code must be 6 characters');
    }

    const room = this.findByJoinCode(normalized);
    if (!room) {
      throw new RoomRegistryError('ROOM_NOT_FOUND', 'Room was not found', 404);
    }

    const { playerId, playerToken, player } = await this.addPlayerToRoom(room, profile, options);
    this.initializeLobbyEntry(room, player);
    await this.syncRoomDirectory(room);
    return { room, playerId, playerToken };
  }

  async addBotToRoom(room: ServerRoom, profile: PlayerProfile): Promise<PlayerInGame> {
    const { player } = await this.addPlayerToRoom(room, profile, { isBot: true });
    this.initializeLobbyEntry(room, player);
    await this.syncRoomDirectory(room);
    this.emit('botAdded', { room, player });
    return player;
  }

  async removePlayer(room: ServerRoom, playerId: PlayerId): Promise<PlayerInGame> {
    const playerIndex = room.gameState.players.findIndex((p) => p.playerId === playerId);
    if (playerIndex === -1) {
      throw new RoomRegistryError('ROOM_NOT_FOUND', 'Player not found in room', 404);
    }

    const player = room.gameState.players[playerIndex];

    // Remove from game state
    room.gameState.players.splice(playerIndex, 1);
    delete room.gameState.playerStates[playerId];
    delete room.lobby.readyState[playerId];
    room.playerTokens.delete(playerId);

    // Update persistence
    await this.syncRoomDirectory(room);

    this.emit('playerRemoved', { room, playerId, kicked: true });

    return player;
  }

  async assignSeat(room: ServerRoom, playerId: PlayerId): Promise<void> {
    const player = room.gameState.players.find((p) => p.playerId === playerId);
    if (!player) {
      throw new RoomRegistryError('ROOM_NOT_FOUND', 'Player not found in room', 404);
    }

    if (!player.spectator) {
      return;
    }

    if (this.isRoomFull(room)) {
      throw new RoomRegistryError('ROOM_FULL', 'Room is full', 409);
    }

    const seatIndex = this.nextSeatIndex(room);
    player.seatIndex = seatIndex;
    player.spectator = false;

    // Initialize lobby entry for the new seat
    this.initializeLobbyEntry(room, player);

    // Update persistence
    await this.syncRoomDirectory(room);

    // Issue new token with updated claims
    this.issueToken(room, player);
  }

  getRoom(gameId: GameId): ServerRoom | undefined {
    return this.roomsById.get(gameId);
  }

  findByJoinCode(joinCode: string): ServerRoom | undefined {
    const normalized = joinCode.trim().toUpperCase();
    const roomId = this.joinCodeToGameId.get(normalized);
    if (!roomId) return undefined;
    return this.roomsById.get(roomId);
  }

  listPublicRooms(): ServerRoom[] {
    return Array.from(this.roomsById.values()).filter((room) => room.isPublic);
  }

  resolvePlayerToken(playerToken: PlayerToken, expectedGameId?: GameId): { room: ServerRoom; playerId: PlayerId } {
    let claims;
    try {
      claims = verifyPlayerToken(playerToken);
    } catch (error) {
      if (isTokenExpired(error)) {
        throw new RoomRegistryError('TOKEN_EXPIRED', 'Player token has expired', 401);
      }
      throw new RoomRegistryError('INVALID_TOKEN', 'Player token is invalid', 401);
    }

    if (expectedGameId && claims.gameId !== expectedGameId) {
      throw new RoomRegistryError('INVALID_TOKEN', 'Token does not grant access to this game', 403);
    }

    const room = this.roomsById.get(claims.gameId);
    if (!room) {
      throw new RoomRegistryError('ROOM_NOT_FOUND', 'Room for token was not found', 404);
    }

    const exists = room.gameState.players.some((player) => player.playerId === claims.playerId);
    if (!exists) {
      throw new RoomRegistryError('INVALID_TOKEN', 'Player token is invalid', 401);
    }

    return { room, playerId: claims.playerId };
  }

  refreshPlayerToken(room: ServerRoom, playerId: PlayerId): PlayerToken {
    const player = room.gameState.players.find((p) => p.playerId === playerId);
    if (!player) {
      throw new RoomRegistryError('ROOM_NOT_FOUND', 'Player was not found in the room', 404);
    }
    const token = this.issueToken(room, player);
    return token;
  }

  private async addPlayerToRoom(room: ServerRoom, profile: PlayerProfile, options: AddPlayerOptions = {}) {
    if (!options.spectator && this.isRoomFull(room)) {
      throw new RoomRegistryError('ROOM_FULL', 'Room is full', 409);
    }

    const seatIndex = options.spectator ? null : this.nextSeatIndex(room);
    const player = this.createPlayer(profile, seatIndex, options);
    room.gameState.players.push(player);
    room.gameState.playerStates[player.playerId] = this.createServerPlayerState(player.playerId);
    room.gameState.cumulativeScores[player.playerId] = 0;
    const updatedAt = Date.now();
    room.updatedAt = updatedAt;
    room.gameState.updatedAt = updatedAt;

    await this.registerPlayer(room, player);

    const playerToken = this.issueToken(room, player);
    return { playerId: player.playerId, playerToken, player };
  }

  private initializeLobbyEntry(room: ServerRoom, player: PlayerInGame) {
    const now = Date.now();
    room.lobby.readyState[player.playerId] = {
      ready: Boolean(player.isBot),
      updatedAt: now,
    };
  }

  private isRoomFull(room: ServerRoom) {
    return room.gameState.players.filter((player) => !player.spectator).length >= room.gameState.config.maxPlayers;
  }

  private nextSeatIndex(room: ServerRoom) {
    const taken = new Set(
      room.gameState.players
        .map((player) => player.seatIndex)
        .filter((seatIndex): seatIndex is number => typeof seatIndex === 'number'),
    );
    for (let seat = 0; seat < room.gameState.config.maxPlayers; seat += 1) {
      if (!taken.has(seat)) {
        return seat;
      }
    }
    throw new RoomRegistryError('ROOM_FULL', 'Room is full', 409);
  }

  private createSeed() {
    return randomBytes(16).toString('hex');
  }

  private async registerPlayer(room: ServerRoom, player: PlayerInGame) {
    if (!room.persistence) {
      return;
    }
    const record = await room.persistence.adapter.registerPlayerProfile(player);
    room.persistence.playerDbIds.set(player.playerId, record.id);
  }

  private async syncRoomDirectory(room: ServerRoom) {
    if (!room.persistence) {
      return;
    }
    await room.persistence.adapter.syncRoomDirectory(room);
  }

  private async persistRoomCreation(room: ServerRoom) {
    if (!room.persistence) {
      return;
    }
    await room.persistence.adapter.createGame(room);
  }

  private createPlayer(profile: PlayerProfile, seatIndex: number | null, options: AddPlayerOptions = {}): PlayerInGame {
    return {
      playerId: this.createPlayerId(),
      seatIndex,
      profile,
      status: 'active',
      isBot: options.isBot ?? false,
      spectator: options.spectator ?? false,
    };
  }

  private createPlayerId(): PlayerId {
    return `player_${randomBytes(8).toString('hex')}`;
  }

  private createServerPlayerState(playerId: PlayerId): ServerPlayerState {
    return {
      playerId,
      hand: [],
      tricksWon: 0,
      bid: null,
      roundScoreDelta: 0,
    };
  }

  private issueToken(room: ServerRoom, player: PlayerInGame): PlayerToken {
    const token = signPlayerToken({
      playerId: player.playerId,
      gameId: room.gameId,
      seatIndex: player.seatIndex ?? null,
      isSpectator: player.spectator ?? false,
    });
    room.playerTokens.set(player.playerId, token);
    return token;
  }

  private generateJoinCode(): string {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const randomBuffer = randomBytes(JOIN_CODE_LENGTH);
      const candidate = Array.from(randomBuffer)
        .map((value) => JOIN_CODE_CHARS[value % JOIN_CODE_CHARS.length])
        .join('');

      if (!this.joinCodeToGameId.has(candidate)) {
        return candidate;
      }
    }

    throw new Error('Unable to allocate join code');
  }
}
