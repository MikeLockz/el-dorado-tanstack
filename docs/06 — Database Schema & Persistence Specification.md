# 06 — Database Schema & Persistence Specification  
Version: 1.0  
Status: Final  
Last Updated: YYYY-MM-DD  
Owner: Engineering  

---

# 1. Purpose

This document defines the **complete Postgres schema** for storing all persistent data associated with:

- Players & profiles  
- Games & sessions  
- Game events (for replay)  
- Game summaries  
- Player lifetime stats  
- Bot metadata (optional)  

It includes table definitions, constraints, indexes, triggers, and migration guidance using **Drizzle ORM**.

This is the authoritative reference for all persistence logic.

---

# 2. Requirements Summary

The database must support:

1. **Persistent player profiles**  
2. **Per-game event log** (exact sequence, fully replayable)  
3. **Full game summaries**  
4. **Lifetime player statistics**  
5. **Spectators + bots** support  
6. **Infinite retention** (never delete events or games)  
7. **Efficient querying** for:
   - Player stats  
   - Game summaries  
   - Replays  
   - Room history  

Data must be append-only where possible.

---

# 3. High-Level Schema Overview

+----------------------+
| players |
+----------------------+
|
| 1-to-1
v
+---------------------------+
| player_lifetime_stats |
+---------------------------+

+----------------------+
| games |
+----------------------+
|
| 1-to-many
v
+----------------------+
| game_events |
+----------------------+

+----------------------+
| game_summaries |
+----------------------+

yaml
Copy code

Bots are stored as “players” as well, with a flag.

---

# 4. Naming Conventions

- Table names: **snake_case plural**
- Columns: **snake_case**
- Primary keys: `id` UUID
- Foreign keys: `<table>_id`
- JSON fields use `jsonb`
- Event types use lowercase strings (`'card_played'`, `'round_started'`)

All timestamps are UTC.

---

# 5. Table Definitions

## 5.1 players

Represents a persistent identity across games.

CREATE TABLE players (
id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
user_id TEXT UNIQUE, -- nullable anonymous identity
display_name TEXT NOT NULL,
avatar_seed TEXT NOT NULL,
color TEXT NOT NULL,
is_bot BOOLEAN NOT NULL DEFAULT FALSE,

created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

makefile
Copy code

Indexes:
CREATE INDEX players_user_id_idx ON players(user_id);

yaml
Copy code

Notes:
- `user_id` can be null for one-off players.
- If player modifies profile, update row + updated_at timestamp.
- Bot players: `is_bot = true`.

---

## 5.2 games

Represents a full 10-round session.

CREATE TABLE games (
id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

session_seed TEXT NOT NULL,
config JSONB NOT NULL, -- includes maxPlayers, minPlayers, etc.
status TEXT NOT NULL, -- 'created', 'in_progress', 'completed'

started_at TIMESTAMPTZ,
completed_at TIMESTAMPTZ,

created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

makefile
Copy code

Indexes:
CREATE INDEX games_status_idx ON games(status);
CREATE INDEX games_created_at_idx ON games(created_at);

yaml
Copy code

Notes:
- `status` transitions: created → in_progress → completed
- No deletion of games ever

---

## 5.3 game_events

Stores the full event log for replay.

CREATE TABLE game_events (
id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

game_id UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
event_index INTEGER NOT NULL, -- strictly increasing
type TEXT NOT NULL,
payload JSONB NOT NULL,
created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

UNIQUE(game_id, event_index)
);

makefile
Copy code

Indexes:
CREATE INDEX game_events_game_id_idx ON game_events(game_id);
CREATE INDEX game_events_game_id_event_index_idx
ON game_events(game_id, event_index);

yaml
Copy code

Notes:
- This is the backbone of replay functionality.
- `payload` stores event data exactly as defined in 04-event-replay.md.
- `payload` should include `_v` version if used.

---

## 5.4 game_summaries

Contains compact data for scoreboard and history views.

CREATE TABLE game_summaries (
id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

game_id UUID NOT NULL UNIQUE REFERENCES games(id) ON DELETE CASCADE,

players JSONB NOT NULL, -- [{ playerId, displayName, seatIndex, score }]
rounds JSONB NOT NULL, -- round-level aggregates
final_scores JSONB NOT NULL, -- { playerId: score }

highest_bid INTEGER,
highest_score INTEGER,
lowest_score INTEGER,
most_consecutive_wins INTEGER,
most_consecutive_losses INTEGER,
highest_misplay INTEGER,

created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

yaml
Copy code

Notes:
- Generated at end of game.
- Stored as JSON for flexibility.

---

## 5.5 player_lifetime_stats

Updated after every completed game.

CREATE TABLE player_lifetime_stats (
id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,

games_played INTEGER NOT NULL DEFAULT 0,
games_won INTEGER NOT NULL DEFAULT 0,
highest_score INTEGER,
lowest_score INTEGER,

total_points INTEGER NOT NULL DEFAULT 0,
total_tricks_won INTEGER NOT NULL DEFAULT 0,

most_consecutive_wins INTEGER NOT NULL DEFAULT 0,
most_consecutive_losses INTEGER NOT NULL DEFAULT 0,

last_game_at TIMESTAMPTZ,

UNIQUE(player_id)
);

makefile
Copy code

Indexes:
CREATE INDEX pls_last_game_idx ON player_lifetime_stats(last_game_at);

yaml
Copy code

Notes:
- On game completion, computed deltas are applied.
- Concurrency-safe via Postgres transactions.

---

# 6. Additional Supporting Tables

## 6.1 room_directory (optional for public rooms)

Stores public rooms for matchmaking.

CREATE TABLE room_directory (
id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
game_id UUID NOT NULL UNIQUE REFERENCES games(id) ON DELETE CASCADE,
join_code TEXT NOT NULL,
is_public BOOLEAN NOT NULL DEFAULT TRUE,
max_players INTEGER NOT NULL,
current_players INTEGER NOT NULL,

created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

yaml
Copy code

---

# 7. Migration Strategy (Drizzle ORM)

Recommended folder structure:

/db
/schema
players.ts
games.ts
gameEvents.ts
gameSummaries.ts
playerStats.ts
roomDirectory.ts
/migrations
0001_initial.sql
0002_add_stats.sql

sql
Copy code

Key migration rules:

- Use timestamp-based migration filenames.
- All schema changes must be backward-compatible to allow event replay.
- Never modify or delete old events.
- Add new fields as optional → fill defaults later.
- Use versioned events for breaking changes.

---

# 8. Insertion & Query Patterns

## 8.1 Insert New Game

1. Insert row into `games`
2. Insert first event: GAME_CREATED
3. Insert row into `room_directory` (if public)

## 8.2 Insert Event

INSERT INTO game_events (game_id, event_index, type, payload)
VALUES ($1, $nextIndex, $type, $payload);

shell
Copy code

Events must be inserted in a transaction to guarantee sequential event_index.

## 8.3 Fetch Events for Replay

SELECT * FROM game_events
WHERE game_id = $1
ORDER BY event_index ASC;

shell
Copy code

## 8.4 Update Player Lifetime Stats

Transaction example:

BEGIN;
UPDATE player_lifetime_stats SET
games_played = games_played + 1,
games_won = games_won + CASE WHEN $playerWon THEN 1 ELSE 0 END,
highest_score = GREATEST(highest_score, $score),
lowest_score = LEAST(lowest_score, $score),
total_points = total_points + $score,
total_tricks_won = total_tricks_won + $tricks,
last_game_at = now()
WHERE player_id = $playerId;
COMMIT;

yaml
Copy code

---

# 9. Data Retention & Growth

## Event Log Storage Estimates

- Average event payload: 200 bytes  
- Average event count per game: ~400 events  
- Storage per game: ~80 KB  
- 1,000 games → ~80 MB  
- 1 million games → ~80 GB  

Long-term retention is viable with partitioning or archival tables if needed.

---

# 10. Integrity Constraints

- No orphaned events (FK game_id)
- Unique (game_id, event_index)
- Stats rows unique per player
- `games.completed_at` NOT NULL implies game_summaries exists

Optional check constraint:

CHECK (status IN ('created','in_progress','completed'))

yaml
Copy code

---

# 11. Performance Considerations

- Index all foreign keys
- Index event_index for replay
- Use JSONB for flexible metadata
- Avoid heavy queries in game loop; precompute summaries at game end
- Use batching for bulk event writes (if needed)

---

# 12. Backups & Disaster Recovery

- Enable Fly.io nightly backups
- Test restore pipeline quarterly
- Ensure WAL archiving is enabled for point-in-time recovery

---

# 13. Future Expansion

Schema supports future enhancements:

- Tournaments  
- Leaderboards  
- Player achievements  
- Multiple game variants  
- Multi-table lobbies  

No breaking schema changes required.
