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
  type ServerPlayerState,
  createGame,
} from '@game/domain';

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
  playerStates: Record<PlayerId, ServerPlayerState>;
  deck: Card[];
  sockets: Map<string, RoomSocket>;
  eventLog: GameEvent[];
  eventIndex: number;
  createdAt: number;
  updatedAt: number;
  playerTokens: Map<PlayerId, PlayerToken>;
}

export interface RoomSocket {
  socketId: string;
  playerId: PlayerId;
  socket: WebSocket;
  connectedAt: number;
}

export type RoomRegistryErrorCode = 'ROOM_NOT_FOUND' | 'ROOM_FULL' | 'INVALID_JOIN_CODE' | 'INVALID_TOKEN';

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

export class RoomRegistry {
  private roomsById = new Map<GameId, ServerRoom>();
  private joinCodeToGameId = new Map<string, GameId>();
  private tokenDirectory = new Map<PlayerToken, { gameId: GameId; playerId: PlayerId }>();

  createRoom(options: CreateRoomOptions): CreateRoomResult {
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

    const room: ServerRoom = {
      gameId,
      joinCode,
      isPublic: options.isPublic ?? true,
      gameState,
      playerStates: gameState.playerStates,
      deck: [],
      sockets: new Map(),
      eventLog: [],
      eventIndex: 0,
      createdAt: now,
      updatedAt: now,
      playerTokens: new Map(),
    };

    const { playerId, playerToken } = this.addPlayerToRoom(room, options.hostProfile);

    this.roomsById.set(room.gameId, room);
    this.joinCodeToGameId.set(joinCode, room.gameId);

    return { room, playerId, playerToken };
  }

  joinRoomByCode(joinCode: string, profile: PlayerProfile): JoinRoomResult {
    const normalized = joinCode.trim().toUpperCase();
    if (normalized.length !== JOIN_CODE_LENGTH) {
      throw new RoomRegistryError('INVALID_JOIN_CODE', 'Join code must be 6 characters');
    }

    const room = this.findByJoinCode(normalized);
    if (!room) {
      throw new RoomRegistryError('ROOM_NOT_FOUND', 'Room was not found', 404);
    }

    const { playerId, playerToken } = this.addPlayerToRoom(room, profile);
    return { room, playerId, playerToken };
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
    const mapping = this.tokenDirectory.get(playerToken);
    if (!mapping) {
      throw new RoomRegistryError('INVALID_TOKEN', 'Player token is invalid', 401);
    }

    if (expectedGameId && mapping.gameId !== expectedGameId) {
      throw new RoomRegistryError('INVALID_TOKEN', 'Token does not grant access to this game', 403);
    }

    const room = this.roomsById.get(mapping.gameId);
    if (!room) {
      throw new RoomRegistryError('ROOM_NOT_FOUND', 'Room for token was not found', 404);
    }

    return { room, playerId: mapping.playerId };
  }

  private addPlayerToRoom(room: ServerRoom, profile: PlayerProfile) {
    if (this.isRoomFull(room)) {
      throw new RoomRegistryError('ROOM_FULL', 'Room is full', 409);
    }

    const seatIndex = this.nextSeatIndex(room);
    const player = this.createPlayer(profile, seatIndex);
    room.gameState.players.push(player);
    room.gameState.playerStates[player.playerId] = this.createServerPlayerState(player.playerId);
    room.gameState.cumulativeScores[player.playerId] = 0;
    const updatedAt = Date.now();
    room.updatedAt = updatedAt;
    room.gameState.updatedAt = updatedAt;

    const playerToken = this.issueToken(room.gameId, player.playerId);
    room.playerTokens.set(player.playerId, playerToken);

    return { playerId: player.playerId, playerToken };
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

  private createPlayer(profile: PlayerProfile, seatIndex: number | null): PlayerInGame {
    return {
      playerId: this.createPlayerId(),
      seatIndex,
      profile,
      status: 'active',
      isBot: false,
      spectator: false,
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

  private issueToken(gameId: GameId, playerId: PlayerId): PlayerToken {
    const token = randomBytes(24).toString('base64url');
    this.tokenDirectory.set(token, { gameId, playerId });
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
