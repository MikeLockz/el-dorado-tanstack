import type { GameEvent, PlayerInGame } from '@game/domain';
import { eq } from 'drizzle-orm';
import type { Database } from '../db/client.js';
import { dbSchema } from '../db/client.js';
import type { ServerRoom } from '../rooms/RoomRegistry.js';

export class GamePersistence {
  constructor(private readonly db: Database) {}

  async registerPlayerProfile(player: PlayerInGame) {
    const userId = this.resolveUserId(player);
    const existing = await this.db.query.players.findFirst({
      where: eq(dbSchema.players.userId, userId),
    });

    if (existing) {
      await this.db
        .update(dbSchema.players)
        .set({
          displayName: player.profile.displayName,
          avatarSeed: player.profile.avatarSeed,
          color: player.profile.color,
          updatedAt: new Date(),
        })
        .where(eq(dbSchema.players.id, existing.id));
      return existing;
    }

    const [inserted] = await this.db
      .insert(dbSchema.players)
      .values({
        userId,
        displayName: player.profile.displayName,
        avatarSeed: player.profile.avatarSeed,
        color: player.profile.color,
        isBot: player.isBot ?? false,
      })
      .returning();

    return inserted;
  }

  async createGame(room: ServerRoom) {
    await this.db
      .insert(dbSchema.games)
      .values({
        id: room.gameId,
        sessionSeed: room.gameState.config.sessionSeed,
        config: room.gameState.config,
        status: 'created',
        createdAt: new Date(room.createdAt),
      })
      .onConflictDoNothing();
  }

  async syncRoomDirectory(room: ServerRoom) {
    if (!room.isPublic) {
      await this.db.delete(dbSchema.roomDirectory).where(eq(dbSchema.roomDirectory.gameId, room.gameId));
      return;
    }

    const activePlayers = room.gameState.players.filter((player) => !player.spectator).length;

    await this.db
      .insert(dbSchema.roomDirectory)
      .values({
        gameId: room.gameId,
        joinCode: room.joinCode,
        isPublic: room.isPublic,
        maxPlayers: room.gameState.config.maxPlayers,
        currentPlayers: activePlayers,
      })
      .onConflictDoUpdate({
        target: dbSchema.roomDirectory.gameId,
        set: {
          joinCode: room.joinCode,
          isPublic: room.isPublic,
          maxPlayers: room.gameState.config.maxPlayers,
          currentPlayers: activePlayers,
        },
      });
  }

  async appendEvents(room: ServerRoom, events: GameEvent[]) {
    if (events.length === 0) {
      return;
    }

    await this.db.insert(dbSchema.gameEvents).values(
      events.map((event) => ({
        gameId: room.gameId,
        eventIndex: event.eventIndex,
        type: event.type,
        payload: event.payload,
      })),
    );

    await this.updateGameStatus(room);
  }

  private async updateGameStatus(room: ServerRoom) {
    const status = room.gameState.phase === 'COMPLETED' ? 'completed' : 'in_progress';
    const timestamp = new Date(room.gameState.updatedAt);

    await this.db
      .update(dbSchema.games)
      .set({
        status,
        startedAt: status === 'in_progress' ? timestamp : undefined,
        completedAt: status === 'completed' ? timestamp : undefined,
      })
      .where(eq(dbSchema.games.id, room.gameId));
  }

  private resolveUserId(player: PlayerInGame) {
    return (player.profile.userId ?? player.playerId).trim();
  }
}
