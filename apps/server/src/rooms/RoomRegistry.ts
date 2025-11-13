import { randomBytes, randomUUID } from 'node:crypto';
import {
  type Card,
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

export interface ServerRoom {
  gameId: GameId;
  joinCode: string;
  isPublic: boolean;
  gameState: GameState;
  playerStates: Record<PlayerId, ServerPlayerState>;
  deck: Card[];
  sockets: Map<string, unknown>;
  eventIndex: number;
  createdAt: number;
  updatedAt: number;
  playerTokens: Map<PlayerId, PlayerToken>;
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
    const hostPlayer = this.createPlayer(options.hostProfile, 0);
    gameState.players.push(hostPlayer);
    gameState.playerStates[hostPlayer.playerId] = this.createServerPlayerState(hostPlayer.playerId);
    gameState.cumulativeScores[hostPlayer.playerId] = 0;
    gameState.updatedAt = now;

    const room: ServerRoom = {
      gameId,
      joinCode,
      isPublic: options.isPublic ?? true,
      gameState,
      playerStates: gameState.playerStates,
      deck: [],
      sockets: new Map(),
      eventIndex: 0,
      createdAt: now,
      updatedAt: now,
      playerTokens: new Map(),
    };

    const playerToken = this.issueToken(room.gameId, hostPlayer.playerId);
    room.playerTokens.set(hostPlayer.playerId, playerToken);

    this.roomsById.set(room.gameId, room);
    this.joinCodeToGameId.set(joinCode, room.gameId);

    return { room, playerId: hostPlayer.playerId, playerToken };
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
