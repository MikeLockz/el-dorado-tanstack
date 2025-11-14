import { boolean, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import type { GameConfig, GameEvent, PlayerId, PlayerProfile } from '@game/domain';

export interface SummaryPlayerEntry {
  playerId: PlayerId;
  displayName: string;
  seatIndex: number | null;
  score: number;
}

export interface RoundSummaryEntry {
  roundIndex: number;
  bids: Record<PlayerId, number | null>;
  tricksWon: Record<PlayerId, number>;
  scoreDelta: Record<PlayerId, number>;
}

export type SummaryFinalScores = Record<PlayerId, number>;

export const players = pgTable(
  'players',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: text('user_id').unique(),
    displayName: text('display_name').notNull(),
    avatarSeed: text('avatar_seed').notNull(),
    color: text('color').notNull(),
    isBot: boolean('is_bot').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    userIdIdx: index('players_user_id_idx').on(table.userId),
  }),
);

export const games = pgTable(
  'games',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    sessionSeed: text('session_seed').notNull(),
    config: jsonb('config').$type<GameConfig>().notNull(),
    status: text('status').notNull(),
    startedAt: timestamp('started_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    statusIdx: index('games_status_idx').on(table.status),
    createdIdx: index('games_created_at_idx').on(table.createdAt),
  }),
);

export const gameEvents = pgTable(
  'game_events',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    gameId: uuid('game_id')
      .notNull()
      .references(() => games.id, { onDelete: 'cascade' }),
    eventIndex: integer('event_index').notNull(),
    type: text('type').notNull(),
    payload: jsonb('payload').$type<GameEvent>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    gameIdIdx: index('game_events_game_id_idx').on(table.gameId),
    gameIdEventIdx: uniqueIndex('game_events_game_id_event_index_idx').on(table.gameId, table.eventIndex),
  }),
);

export const gameSummaries = pgTable(
  'game_summaries',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    gameId: uuid('game_id')
      .notNull()
      .unique()
      .references(() => games.id, { onDelete: 'cascade' }),
    players: jsonb('players').$type<SummaryPlayerEntry[]>().notNull(),
    rounds: jsonb('rounds').$type<RoundSummaryEntry[]>().notNull(),
    finalScores: jsonb('final_scores').$type<SummaryFinalScores>().notNull(),
    highestBid: integer('highest_bid'),
    highestScore: integer('highest_score'),
    lowestScore: integer('lowest_score'),
    mostConsecutiveWins: integer('most_consecutive_wins'),
    mostConsecutiveLosses: integer('most_consecutive_losses'),
    highestMisplay: integer('highest_misplay'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    gameIdIdx: index('game_summaries_game_id_idx').on(table.gameId),
  }),
);

export const playerLifetimeStats = pgTable(
  'player_lifetime_stats',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    playerId: uuid('player_id')
      .notNull()
      .unique()
      .references(() => players.id, { onDelete: 'cascade' }),
    gamesPlayed: integer('games_played').notNull().default(0),
    gamesWon: integer('games_won').notNull().default(0),
    highestScore: integer('highest_score'),
    lowestScore: integer('lowest_score'),
    totalPoints: integer('total_points').notNull().default(0),
    totalTricksWon: integer('total_tricks_won').notNull().default(0),
    mostConsecutiveWins: integer('most_consecutive_wins').notNull().default(0),
    mostConsecutiveLosses: integer('most_consecutive_losses').notNull().default(0),
    lastGameAt: timestamp('last_game_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    lastGameIdx: index('pls_last_game_idx').on(table.lastGameAt),
  }),
);

export const roomDirectory = pgTable('room_directory', {
  id: uuid('id').defaultRandom().primaryKey(),
  gameId: uuid('game_id')
    .notNull()
    .unique()
    .references(() => games.id, { onDelete: 'cascade' }),
  joinCode: text('join_code').notNull(),
  isPublic: boolean('is_public').notNull().default(true),
  maxPlayers: integer('max_players').notNull(),
  currentPlayers: integer('current_players').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type PlayerRow = typeof players.$inferSelect;
export type GameRow = typeof games.$inferSelect;
export type GameEventRow = typeof gameEvents.$inferSelect;
export type GameSummaryRow = typeof gameSummaries.$inferSelect;
export type PlayerLifetimeStatsRow = typeof playerLifetimeStats.$inferSelect;

export type PlayerProfileInput = Pick<PlayerProfile, 'displayName' | 'avatarSeed' | 'color' | 'userId'> & {
  isBot?: boolean;
};
