CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS players (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT UNIQUE,
  display_name TEXT NOT NULL,
  avatar_seed TEXT NOT NULL,
  color TEXT NOT NULL,
  is_bot BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS players_user_id_idx ON players(user_id);

CREATE TABLE IF NOT EXISTS games (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_seed TEXT NOT NULL,
  config JSONB NOT NULL,
  status TEXT NOT NULL,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS games_status_idx ON games(status);
CREATE INDEX IF NOT EXISTS games_created_at_idx ON games(created_at);

CREATE TABLE IF NOT EXISTS game_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  event_index INTEGER NOT NULL,
  type TEXT NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(game_id, event_index)
);

CREATE INDEX IF NOT EXISTS game_events_game_id_idx ON game_events(game_id);
CREATE INDEX IF NOT EXISTS game_events_game_id_event_index_idx ON game_events(game_id, event_index);

CREATE TABLE IF NOT EXISTS game_summaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id UUID NOT NULL UNIQUE REFERENCES games(id) ON DELETE CASCADE,
  players JSONB NOT NULL,
  rounds JSONB NOT NULL,
  final_scores JSONB NOT NULL,
  highest_bid INTEGER,
  highest_score INTEGER,
  lowest_score INTEGER,
  most_consecutive_wins INTEGER,
  most_consecutive_losses INTEGER,
  highest_misplay INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS game_summaries_game_id_idx ON game_summaries(game_id);

CREATE TABLE IF NOT EXISTS player_lifetime_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID NOT NULL UNIQUE REFERENCES players(id) ON DELETE CASCADE,
  games_played INTEGER NOT NULL DEFAULT 0,
  games_won INTEGER NOT NULL DEFAULT 0,
  highest_score INTEGER,
  lowest_score INTEGER,
  total_points INTEGER NOT NULL DEFAULT 0,
  total_tricks_won INTEGER NOT NULL DEFAULT 0,
  most_consecutive_wins INTEGER NOT NULL DEFAULT 0,
  most_consecutive_losses INTEGER NOT NULL DEFAULT 0,
  last_game_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS pls_last_game_idx ON player_lifetime_stats(last_game_at);

CREATE TABLE IF NOT EXISTS room_directory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id UUID NOT NULL UNIQUE REFERENCES games(id) ON DELETE CASCADE,
  join_code TEXT NOT NULL,
  is_public BOOLEAN NOT NULL DEFAULT TRUE,
  max_players INTEGER NOT NULL,
  current_players INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
