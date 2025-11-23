import type { GameEvent, PlayerId, PlayerInGame } from "@game/domain";
import { eq } from "drizzle-orm";
import type { Database } from "../db/client.js";
import { dbSchema } from "../db/client.js";
import type { ServerRoom } from "../rooms/RoomRegistry.js";
import { computeGameStats } from "./gameStats.js";
import { logger } from "../observability/logger.js";

const persistenceLogger = logger.child({
  context: { component: "game-persistence" },
});

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
        status: "created",
        createdAt: new Date(room.createdAt),
      })
      .onConflictDoNothing();
  }

  async syncRoomDirectory(room: ServerRoom) {
    if (!room.isPublic) {
      await this.db
        .delete(dbSchema.roomDirectory)
        .where(eq(dbSchema.roomDirectory.gameId, room.gameId));
      return;
    }

    const activePlayers = room.gameState.players.filter(
      (player) => !player.spectator
    ).length;

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
      }))
    );

    await this.updateGameStatus(room);
    if (events.some((event) => event.type === "GAME_COMPLETED")) {
      await this.finalizeGame(room);
    }
  }

  private async updateGameStatus(room: ServerRoom) {
    const status =
      room.gameState.phase === "COMPLETED" ? "completed" : "in_progress";
    const timestamp = new Date(room.gameState.updatedAt);

    await this.db
      .update(dbSchema.games)
      .set({
        status,
        startedAt: status === "in_progress" ? timestamp : undefined,
        completedAt: status === "completed" ? timestamp : undefined,
      })
      .where(eq(dbSchema.games.id, room.gameId));
  }

  private async finalizeGame(room: ServerRoom) {
    const stats = computeGameStats(room);
    await this.insertGameSummary(room, stats);
    await this.updatePlayerLifetimeStats(room, stats);
  }

  private async insertGameSummary(
    room: ServerRoom,
    stats: ReturnType<typeof computeGameStats>
  ) {
    await this.db
      .insert(dbSchema.gameSummaries)
      .values({
        gameId: room.gameId,
        players: stats.summary.players,
        rounds: stats.summary.rounds,
        finalScores: stats.summary.finalScores,
        highestBid: stats.summary.highestBid,
        highestScore: stats.summary.highestScore,
        lowestScore: stats.summary.lowestScore,
        mostConsecutiveWins: stats.summary.mostConsecutiveWins,
        mostConsecutiveLosses: stats.summary.mostConsecutiveLosses,
        highestMisplay: stats.summary.highestMisplay,
      })
      .onConflictDoUpdate({
        target: dbSchema.gameSummaries.gameId,
        set: {
          players: stats.summary.players,
          rounds: stats.summary.rounds,
          finalScores: stats.summary.finalScores,
          highestBid: stats.summary.highestBid,
          highestScore: stats.summary.highestScore,
          lowestScore: stats.summary.lowestScore,
          mostConsecutiveWins: stats.summary.mostConsecutiveWins,
          mostConsecutiveLosses: stats.summary.mostConsecutiveLosses,
          highestMisplay: stats.summary.highestMisplay,
        },
      });
  }

  private async updatePlayerLifetimeStats(
    room: ServerRoom,
    stats: ReturnType<typeof computeGameStats>
  ) {
    const playerDbIds = room.persistence?.playerDbIds;
    if (!playerDbIds) {
      persistenceLogger.warn(
        "missing player identity map; skipping lifetime stats",
        {
          gameId: room.gameId,
        }
      );
      return;
    }

    const completedAt = new Date(room.gameState.updatedAt);

    for (const [playerId, snapshot] of Object.entries(stats.perPlayer)) {
      const playerDbId = playerDbIds.get(playerId as PlayerId);
      if (!playerDbId) {
        continue;
      }

      const existing = await this.db.query.playerLifetimeStats.findFirst({
        where: eq(dbSchema.playerLifetimeStats.playerId, playerDbId),
      });

      if (!existing) {
        await this.db.insert(dbSchema.playerLifetimeStats).values({
          playerId: playerDbId,
          gamesPlayed: 1,
          gamesWon: snapshot.isWinner ? 1 : 0,
          highestScore: snapshot.finalScore,
          lowestScore: snapshot.finalScore,
          totalPoints: snapshot.finalScore,
          totalTricksWon: snapshot.totalTricks,
          mostConsecutiveWins: snapshot.isWinner ? 1 : 0,
          mostConsecutiveLosses: snapshot.isWinner ? 0 : 1,
          currentWinStreak: snapshot.isWinner ? 1 : 0,
          currentLossStreak: snapshot.isWinner ? 0 : 1,
          totalMisplays: snapshot.misplays,
          lastGameAt: completedAt,
          createdAt: completedAt,
          updatedAt: completedAt,
        });
        continue;
      }

      const currentWinStreak = snapshot.isWinner
        ? existing.currentWinStreak + 1
        : 0;
      const currentLossStreak = snapshot.isWinner
        ? 0
        : existing.currentLossStreak + 1;

      await this.db
        .update(dbSchema.playerLifetimeStats)
        .set({
          gamesPlayed: existing.gamesPlayed + 1,
          gamesWon: existing.gamesWon + (snapshot.isWinner ? 1 : 0),
          highestScore:
            existing.highestScore == null
              ? snapshot.finalScore
              : Math.max(existing.highestScore, snapshot.finalScore),
          lowestScore:
            existing.lowestScore == null
              ? snapshot.finalScore
              : Math.min(existing.lowestScore, snapshot.finalScore),
          totalPoints: existing.totalPoints + snapshot.finalScore,
          totalTricksWon: existing.totalTricksWon + snapshot.totalTricks,
          mostConsecutiveWins: Math.max(
            existing.mostConsecutiveWins,
            currentWinStreak
          ),
          mostConsecutiveLosses: Math.max(
            existing.mostConsecutiveLosses,
            currentLossStreak
          ),
          currentWinStreak,
          currentLossStreak,
          totalMisplays: existing.totalMisplays + snapshot.misplays,
          lastGameAt: completedAt,
          updatedAt: completedAt,
        })
        .where(eq(dbSchema.playerLifetimeStats.playerId, playerDbId));
    }
  }

  private resolveUserId(player: PlayerInGame) {
    return (player.profile.userId ?? player.playerId).trim();
  }
}
