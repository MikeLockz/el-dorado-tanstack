# 1B — Game Statistics

Version: 1.0  
Status: Implementation Guide  
Last Updated: 2025-11-23  
Owner: Engineering

---

## 1. Purpose

This document provides comprehensive technical requirements and implementation details for the player statistics system in El Dorado. It serves as a practical guide for developers implementing, maintaining, and extending the statistics features.

**Scope:**

- Per-game statistics tracking and computation
- Lifetime statistics persistence and updates
- Historical game summaries and queries
- Statistics API endpoints and client integration
- Cross-game streak tracking algorithms
- Bot statistics handling and filtering

**Related Documents:**

- `07 — Player Profiles & Statistics Specification.md` - Original requirements
- `06 — Database Schema & Persistence Specification.md` - Database design
- `04 — Event & Replay Model Specification.md` - Event sourcing context
- `05 — Networking & Protocol Specification.md` - API protocol

---

## 2. Statistics Architecture Overview

### 2.1 Three-Tier Statistics Model

```
┌─────────────────────────────────────────────────────────────┐
│                    Real-Time Game Stats                      │
│  • Tracked in ServerPlayerState during active game           │
│  • Updated on each game event (bid, trick completion)        │
│  • Ephemeral - exists only in memory during game             │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                    Per-Game Aggregates                       │
│  • Computed at game completion from game state + events      │
│  • Stored in game_summaries table                            │
│  • Used for game history and detailed game analysis          │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                   Lifetime Statistics                        │
│  • Updated transactionally on game completion                │
│  • Stored in player_lifetime_stats table                     │
│  • Used for player profiles, rankings, achievements          │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 Data Flow

```typescript
// Game Events → Real-Time Updates
BID_PLACED event → ServerPlayerState.bid = amount
TRICK_COMPLETED event → ServerPlayerState.tricksWon++
ROUND_COMPLETED event → ServerPlayerState.roundScoreDelta = computed

// Game Completion → Aggregation
GAME_COMPLETED event → computeGameStats(room.gameState, room.eventLog)
  ├─ Iterate roundSummaries for per-player totals
  ├─ Count INVALID_ACTION events for misplays
  ├─ Calculate consecutive streaks from round deltas
  └─ Determine winners by max final score

// Aggregates → Persistence
insertGameSummary(gameStats) → game_summaries table
updatePlayerLifetimeStats(gameStats) → player_lifetime_stats table
  ├─ Increment counters (games played, won, total points)
  ├─ Update high/low scores
  ├─ Update best/worst streaks
  └─ Set last played timestamp
```

---

## 3. Real-Time Game Statistics

### 3.1 ServerPlayerState Interface

**Location:** `packages/domain/src/types.ts`

```typescript
export interface ServerPlayerState {
  playerId: PlayerId;
  hand: Card[];
  tricksWon: number; // Incremented on TRICK_COMPLETED
  bid: number | null; // Set on BID_PLACED
  roundScoreDelta: number; // Computed on ROUND_COMPLETED
}
```

**Update Triggers:**

| Event             | Field Updated     | Logic                                |
| ----------------- | ----------------- | ------------------------------------ |
| `BID_PLACED`      | `bid`             | Set to bid amount from event payload |
| `TRICK_COMPLETED` | `tricksWon`       | Increment for winner of trick        |
| `ROUND_COMPLETED` | `roundScoreDelta` | `calculateScore(bid, tricksWon)`     |

### 3.2 Round Summary Tracking

**Location:** `packages/domain/src/types.ts`

```typescript
export interface RoundSummary {
  roundIndex: number;
  cardsPerPlayer: number;
  dealerPlayerId: PlayerId;
  startingPlayerId: PlayerId;
  trumpSuit: Suit | null;
  scores: Record<
    PlayerId,
    {
      bid: number;
      tricksWon: number;
      delta: number; // Score change for this round
    }
  >;
  completedAt: Date;
}
```

**Accumulated in:** `ServerGameState.roundSummaries[]`

**Used for:**

- Calculating per-game aggregates
- Determining consecutive win/loss streaks within game
- Providing historical round details in game summaries

---

## 4. Per-Game Aggregate Statistics

### 4.1 ComputedGameStats Interface

**Location:** `apps/server/src/persistence/gameStats.ts`

```typescript
export interface ComputedGameStats {
  gameId: string;
  sessionSeed: string;
  players: Array<{
    playerId: PlayerId;
    playerDbId: string; // UUID from players table
    displayName: string;
    finalScore: number;
    totalTricksWon: number;
    highestBid: number;
    misplays: number; // Count of INVALID_ACTION events
    longestWinStreak: number; // Max consecutive rounds with positive delta
    longestLossStreak: number; // Max consecutive rounds with negative delta
    isWinner: boolean; // True if finalScore === max
  }>;
  rounds: RoundSummary[]; // Copy of all round summaries
  completedAt: Date;
}
```

### 4.2 Computation Algorithm

**Function:** `computeGameStats(gameState: ServerGameState, eventLog: GameEvent[])`

**Location:** `apps/server/src/persistence/gameStats.ts`

```typescript
export function computeGameStats(
  gameState: ServerGameState,
  eventLog: GameEvent[]
): ComputedGameStats {
  const finalScores = gameState.cumulativeScores;
  const maxScore = Math.max(...Object.values(finalScores));

  // Per-player aggregates
  const playerStats = gameState.players.map(player => {
    const playerId = player.playerId;

    // Aggregate from round summaries
    let totalTricksWon = 0;
    let highestBid = 0;
    let longestWinStreak = 0;
    let longestLossStreak = 0;
    let currentWinStreak = 0;
    let currentLossStreak = 0;

    for (const round of gameState.roundSummaries) {
      const roundData = round.scores[playerId];
      if (!roundData) continue;

      totalTricksWon += roundData.tricksWon;
      highestBid = Math.max(highestBid, roundData.bid);

      // Streak calculation
      if (roundData.delta > 0) {
        currentWinStreak++;
        currentLossStreak = 0;
        longestWinStreak = Math.max(longestWinStreak, currentWinStreak);
      } else if (roundData.delta < 0) {
        currentLossStreak++;
        currentWinStreak = 0;
        longestLossStreak = Math.max(longestLossStreak, currentLossStreak);
      }
      // delta === 0 breaks both streaks
      else {
        currentWinStreak = 0;
        currentLossStreak = 0;
      }
    }

    // Count misplays from event log
    const misplays = eventLog.filter(
      e => e.type === 'INVALID_ACTION' && e.playerId === playerId
    ).length;

    return {
      playerId,
      playerDbId: /* lookup from persistence.playerDbIds */,
      displayName: player.profile.displayName,
      finalScore: finalScores[playerId] || 0,
      totalTricksWon,
      highestBid,
      misplays,
      longestWinStreak,
      longestLossStreak,
      isWinner: finalScores[playerId] === maxScore
    };
  });

  return {
    gameId: gameState.gameId,
    sessionSeed: gameState.config.sessionSeed,
    players: playerStats,
    rounds: gameState.roundSummaries,
    completedAt: new Date()
  };
}
```

### 4.3 Streak Calculation Details

**Within-Game Streaks (Currently Implemented):**

- Track consecutive rounds with positive delta (wins)
- Track consecutive rounds with negative delta (losses)
- Round with delta = 0 breaks both streaks
- Reset at start of each game

**Example:**

```
Round 1: +10 → win_streak=1, loss_streak=0
Round 2: +5  → win_streak=2, loss_streak=0
Round 3: -5  → win_streak=0, loss_streak=1
Round 4: 0   → win_streak=0, loss_streak=0  // Breaks both
Round 5: -3  → win_streak=0, loss_streak=1
```

**Longest streaks stored:** `max(all_streaks_during_game)`

---

## 5. Lifetime Statistics

### 5.1 Database Schema

**Table:** `player_lifetime_stats`

```sql
CREATE TABLE player_lifetime_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID NOT NULL UNIQUE REFERENCES players(id) ON DELETE CASCADE,

  -- Game counts
  games_played INTEGER NOT NULL DEFAULT 0,
  games_won INTEGER NOT NULL DEFAULT 0,

  -- Score aggregates
  highest_score INTEGER,
  lowest_score INTEGER,
  total_points INTEGER NOT NULL DEFAULT 0,

  -- Trick aggregates
  total_tricks_won INTEGER NOT NULL DEFAULT 0,

  -- Streak records
  most_consecutive_wins INTEGER NOT NULL DEFAULT 0,
  most_consecutive_losses INTEGER NOT NULL DEFAULT 0,

  -- Timestamps
  last_game_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX pls_last_game_idx ON player_lifetime_stats(last_game_at);
```

### 5.2 Update Algorithm

**Function:** `updatePlayerLifetimeStats(db, gameStats)`

**Location:** `apps/server/src/persistence/GamePersistence.ts`

**Transaction Flow:**

```typescript
async function updatePlayerLifetimeStats(
  db: Database,
  gameStats: ComputedGameStats
): Promise<void> {
  // Execute within transaction
  await db.transaction(async (tx) => {
    for (const playerStat of gameStats.players) {
      const playerDbId = playerStat.playerDbId;

      // Fetch existing stats
      const existing = await tx.query.playerLifetimeStats.findFirst({
        where: eq(schema.playerLifetimeStats.playerId, playerDbId),
      });

      if (!existing) {
        // First game for this player - insert
        await tx.insert(schema.playerLifetimeStats).values({
          playerId: playerDbId,
          gamesPlayed: 1,
          gamesWon: playerStat.isWinner ? 1 : 0,
          highestScore: playerStat.finalScore,
          lowestScore: playerStat.finalScore,
          totalPoints: playerStat.finalScore,
          totalTricksWon: playerStat.totalTricksWon,
          mostConsecutiveWins: playerStat.longestWinStreak,
          mostConsecutiveLosses: playerStat.longestLossStreak,
          lastGameAt: gameStats.completedAt,
        });
      } else {
        // Update existing stats
        await tx
          .update(schema.playerLifetimeStats)
          .set({
            gamesPlayed: existing.gamesPlayed + 1,
            gamesWon: existing.gamesWon + (playerStat.isWinner ? 1 : 0),
            highestScore: Math.max(
              existing.highestScore ?? playerStat.finalScore,
              playerStat.finalScore
            ),
            lowestScore: Math.min(
              existing.lowestScore ?? playerStat.finalScore,
              playerStat.finalScore
            ),
            totalPoints: existing.totalPoints + playerStat.finalScore,
            totalTricksWon: existing.totalTricksWon + playerStat.totalTricksWon,
            mostConsecutiveWins: Math.max(
              existing.mostConsecutiveWins,
              playerStat.longestWinStreak
            ),
            mostConsecutiveLosses: Math.max(
              existing.mostConsecutiveLosses,
              playerStat.longestLossStreak
            ),
            lastGameAt: gameStats.completedAt,
            updatedAt: new Date(),
          })
          .where(eq(schema.playerLifetimeStats.id, existing.id));
      }
    }
  });
}
```

### 5.3 Cross-Game Streak Tracking (Future Enhancement)

**Current Limitation:** Streaks track consecutive rounds within a single game, not consecutive games won/lost.

**Proposed Implementation:**

```typescript
// Add to player_lifetime_stats table
current_win_streak INTEGER NOT NULL DEFAULT 0,
current_loss_streak INTEGER NOT NULL DEFAULT 0,

// Update logic on game completion
if (playerStat.isWinner) {
  currentWinStreak = existing.currentWinStreak + 1;
  currentLossStreak = 0;
  mostConsecutiveWins = Math.max(existing.mostConsecutiveWins, currentWinStreak);
} else {
  currentLossStreak = existing.currentLossStreak + 1;
  currentWinStreak = 0;
  mostConsecutiveLosses = Math.max(existing.mostConsecutiveLosses, currentLossStreak);
}
```

**Migration Required:**

```sql
ALTER TABLE player_lifetime_stats
  ADD COLUMN current_win_streak INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN current_loss_streak INTEGER NOT NULL DEFAULT 0;
```

---

## 6. Game Summaries

### 6.1 Database Schema

**Table:** `game_summaries`

```sql
CREATE TABLE game_summaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id UUID NOT NULL UNIQUE REFERENCES games(id) ON DELETE CASCADE,

  -- Denormalized player data
  players JSONB NOT NULL,              -- Array of player stats objects
  rounds JSONB NOT NULL,               -- Array of RoundSummary objects
  final_scores JSONB NOT NULL,         -- Map of playerId → finalScore

  -- Game-level aggregates
  highest_bid INTEGER,
  highest_score INTEGER,
  lowest_score INTEGER,
  most_consecutive_wins INTEGER,       -- Best streak in this game
  most_consecutive_losses INTEGER,     -- Worst streak in this game
  highest_misplay INTEGER,             -- Max misplays by any player

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX game_summaries_game_id_idx ON game_summaries(game_id);
```

### 6.2 JSONB Structure

**players field:**

```json
[
  {
    "playerId": "player-uuid",
    "displayName": "Alice",
    "finalScore": 42,
    "totalTricksWon": 15,
    "highestBid": 4,
    "misplays": 0,
    "longestWinStreak": 3,
    "longestLossStreak": 2,
    "isWinner": true
  }
]
```

**rounds field:**

```json
[
  {
    "roundIndex": 0,
    "cardsPerPlayer": 10,
    "dealerPlayerId": "player-uuid",
    "startingPlayerId": "player-uuid",
    "trumpSuit": "spades",
    "scores": {
      "player-uuid-1": { "bid": 3, "tricksWon": 3, "delta": 10 },
      "player-uuid-2": { "bid": 2, "tricksWon": 1, "delta": -5 }
    },
    "completedAt": "2025-11-23T10:30:00Z"
  }
]
```

### 6.3 Insertion

**Function:** `insertGameSummary(db, gameStats)`

**Location:** `apps/server/src/persistence/GamePersistence.ts`

```typescript
async function insertGameSummary(
  db: Database,
  gameStats: ComputedGameStats
): Promise<void> {
  const highestScore = Math.max(...gameStats.players.map((p) => p.finalScore));
  const lowestScore = Math.min(...gameStats.players.map((p) => p.finalScore));
  const highestBid = Math.max(...gameStats.players.map((p) => p.highestBid));
  const mostConsecutiveWins = Math.max(
    ...gameStats.players.map((p) => p.longestWinStreak)
  );
  const mostConsecutiveLosses = Math.max(
    ...gameStats.players.map((p) => p.longestLossStreak)
  );
  const highestMisplay = Math.max(...gameStats.players.map((p) => p.misplays));

  await db.insert(schema.gameSummaries).values({
    gameId: gameStats.gameId,
    players: gameStats.players,
    rounds: gameStats.rounds,
    finalScores: Object.fromEntries(
      gameStats.players.map((p) => [p.playerId, p.finalScore])
    ),
    highestBid,
    highestScore,
    lowestScore,
    mostConsecutiveWins,
    mostConsecutiveLosses,
    highestMisplay,
    createdAt: gameStats.completedAt,
  });
}
```

---

## 7. API Endpoints

### 7.1 Get Player Statistics

**Endpoint:** `GET /api/player-stats?userId={userId}`

**Implementation:** `apps/server/src/server.ts:handlePlayerStats()`

**Query Parameters:**

- `userId` (required) - The user ID to look up

**Response:**

```typescript
{
  profile: {
    userId: string;
    displayName: string;
    avatarSeed: string;
    color: string;
    isBot: boolean;
  }
  lifetime: {
    gamesPlayed: number;
    gamesWon: number;
    highestScore: number | null;
    lowestScore: number | null;
    totalPoints: number;
    totalTricksWon: number;
    mostConsecutiveWins: number;
    mostConsecutiveLosses: number;
    lastGameAt: string | null; // ISO timestamp
  }
}
```

**Error Cases:**

- `400 INVALID_INPUT` - Missing userId parameter
- `404 PLAYER_NOT_FOUND` - No player with that userId
- `500 DB_NOT_READY` - Database unavailable

**Implementation:**

```typescript
async function handlePlayerStats(
  res: ServerResponse,
  ctx: RequestContext,
  url: URL
) {
  if (!ctx.db) {
    throw new HttpError(500, "DB_NOT_READY", "Stats database is unavailable");
  }

  const userId = url.searchParams.get("userId");
  if (!userId) {
    throw new HttpError(
      400,
      "INVALID_INPUT",
      "userId query parameter is required"
    );
  }

  const player = await ctx.db.query.players.findFirst({
    where: eq(dbSchema.players.userId, userId),
  });

  if (!player) {
    throw new HttpError(404, "PLAYER_NOT_FOUND", "Player not found");
  }

  const stats = await ctx.db.query.playerLifetimeStats.findFirst({
    where: eq(dbSchema.playerLifetimeStats.playerId, player.id),
  });

  sendJson(res, 200, {
    profile: {
      userId: player.userId ?? undefined,
      displayName: player.displayName,
      avatarSeed: player.avatarSeed,
      color: player.color,
      isBot: player.isBot,
    },
    lifetime: stats
      ? {
          gamesPlayed: stats.gamesPlayed,
          gamesWon: stats.gamesWon,
          highestScore: stats.highestScore,
          lowestScore: stats.lowestScore,
          totalPoints: stats.totalPoints,
          totalTricksWon: stats.totalTricksWon,
          mostConsecutiveWins: stats.mostConsecutiveWins,
          mostConsecutiveLosses: stats.mostConsecutiveLosses,
          lastGameAt: stats.lastGameAt?.toISOString() ?? null,
        }
      : {
          // Default empty stats for players who haven't completed a game
          gamesPlayed: 0,
          gamesWon: 0,
          highestScore: null,
          lowestScore: null,
          totalPoints: 0,
          totalTricksWon: 0,
          mostConsecutiveWins: 0,
          mostConsecutiveLosses: 0,
          lastGameAt: null,
        },
  });
}
```

### 7.2 Get Game Summary (Future)

**Endpoint:** `GET /api/game-summary/:gameId`

**Purpose:** Retrieve detailed statistics for a completed game

**Response:**

```typescript
{
  gameId: string;
  completedAt: string; // ISO timestamp
  players: Array<{
    playerId: string;
    displayName: string;
    finalScore: number;
    totalTricksWon: number;
    highestBid: number;
    misplays: number;
    longestWinStreak: number;
    longestLossStreak: number;
    isWinner: boolean;
  }>;
  rounds: Array<RoundSummary>;
  aggregates: {
    highestBid: number;
    highestScore: number;
    lowestScore: number;
  }
}
```

**Implementation Sketch:**

```typescript
async function handleGameSummary(
  res: ServerResponse,
  ctx: RequestContext,
  gameId: string
) {
  if (!ctx.db) {
    throw new HttpError(500, "DB_NOT_READY");
  }

  const summary = await ctx.db.query.gameSummaries.findFirst({
    where: eq(dbSchema.gameSummaries.gameId, gameId),
  });

  if (!summary) {
    throw new HttpError(404, "GAME_NOT_FOUND");
  }

  sendJson(res, 200, {
    gameId: summary.gameId,
    completedAt: summary.createdAt.toISOString(),
    players: summary.players,
    rounds: summary.rounds,
    aggregates: {
      highestBid: summary.highestBid,
      highestScore: summary.highestScore,
      lowestScore: summary.lowestScore,
    },
  });
}
```

### 7.3 List Player Games (Future)

**Endpoint:** `GET /api/player-games?userId={userId}&limit={limit}&offset={offset}`

**Purpose:** Retrieve paginated list of games for a player

**Query Parameters:**

- `userId` (required) - Player to look up
- `limit` (optional, default 20) - Number of games to return
- `offset` (optional, default 0) - Pagination offset
- `includeBots` (optional, default false) - Include games with bots

**Response:**

```typescript
{
  games: Array<{
    gameId: string;
    completedAt: string;
    playerCount: number;
    finalScore: number; // This player's score
    isWinner: boolean;
    tricksWon: number;
    highestBid: number;
  }>;
  total: number; // Total games matching criteria
}
```

---

## 8. Client Integration

### 8.1 StatsPage Component

**Location:** `apps/web/src/pages/StatsPage.tsx`

**Current Features:**

- Search by userId
- Display profile information
- Show lifetime statistics grid

**Future Enhancements:**

```typescript
export function StatsPage() {
  const { userId } = useParams({ from: "/stats/$userId" });

  // Existing lifetime stats query
  const statsQuery = useQuery({
    queryKey: ["playerStats", userId],
    queryFn: () => getPlayerStats(userId),
    enabled: Boolean(userId),
  });

  // NEW: Recent games query
  const gamesQuery = useQuery({
    queryKey: ["playerGames", userId],
    queryFn: () => getPlayerGames(userId, { limit: 10 }),
    enabled: Boolean(userId),
  });

  // Render lifetime stats + recent games list
  return (
    <div className="space-y-6">
      <ProfileCard profile={statsQuery.data?.profile} />
      <LifetimeStatsCard stats={statsQuery.data?.lifetime} />
      <RecentGamesCard games={gamesQuery.data?.games} />
    </div>
  );
}
```

### 8.2 Derived Metrics

**Win Rate:**

```typescript
const winRate =
  lifetime.gamesPlayed > 0
    ? ((lifetime.gamesWon / lifetime.gamesPlayed) * 100).toFixed(1)
    : "—";
```

**Average Score:**

```typescript
const avgScore =
  lifetime.gamesPlayed > 0
    ? (lifetime.totalPoints / lifetime.gamesPlayed).toFixed(1)
    : "—";
```

**Average Tricks per Game:**

```typescript
const avgTricks =
  lifetime.gamesPlayed > 0
    ? (lifetime.totalTricksWon / lifetime.gamesPlayed).toFixed(1)
    : "—";
```

### 8.3 Game History Component (Future)

```typescript
function RecentGamesCard({ games }: { games: PlayerGame[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent Games</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {games.map((game) => (
            <Link
              key={game.gameId}
              to="/game-summary/$gameId"
              params={{ gameId: game.gameId }}
              className="block p-3 rounded border hover:bg-accent"
            >
              <div className="flex justify-between items-center">
                <div>
                  <Badge variant={game.isWinner ? "success" : "secondary"}>
                    {game.isWinner ? "Won" : "Lost"}
                  </Badge>
                  <span className="ml-2 text-sm text-muted-foreground">
                    {game.playerCount} players
                  </span>
                </div>
                <div className="text-right">
                  <div className="text-lg font-bold">{game.finalScore}</div>
                  <div className="text-xs text-muted-foreground">
                    {game.tricksWon} tricks
                  </div>
                </div>
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                {new Date(game.completedAt).toLocaleString()}
              </div>
            </Link>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
```

---

## 9. Bot Statistics Handling

### 9.1 Current Behavior

**Bots are tracked identically to human players:**

- Have entries in `players` table with `is_bot = true`
- Receive lifetime stats updates on game completion
- Appear in stats queries without distinction

### 9.2 Filtering Bots

**Query-Level Filtering:**

```typescript
// Get stats excluding bot games
async function getPlayerStatsExcludingBots(userId: string) {
  const player = await db.query.players.findFirst({
    where: eq(schema.players.userId, userId),
  });

  // Query game_summaries and recompute stats excluding games with bots
  const games = await db.query.gameSummaries.findMany({
    where: sql`${schema.gameSummaries.players}::jsonb @> '[{"playerId": ${player.id}}]'`,
  });

  const humanOnlyGames = games.filter((game) => {
    const players = game.players as Array<{ isBot?: boolean }>;
    return players.every((p) => !p.isBot);
  });

  // Recompute aggregates from filtered games
  return computeLifetimeStatsFromGames(player.id, humanOnlyGames);
}
```

**Display-Level Filtering:**

```typescript
// Frontend - filter by game type
const gamesQuery = useQuery({
  queryKey: ["playerGames", userId, { includeBots }],
  queryFn: () =>
    getPlayerGames(userId, {
      limit: 10,
      includeBots, // Pass as query param
    }),
});
```

### 9.3 Bot Stats Configuration (Future)

**Environment variable:**

```bash
# .env
TRACK_BOT_STATS=false  # Don't persist stats for bot players
```

**Implementation:**

```typescript
// In updatePlayerLifetimeStats()
for (const playerStat of gameStats.players) {
  const player = gameState.players.find(
    (p) => p.playerId === playerStat.playerId
  );

  if (player?.isBot && !process.env.TRACK_BOT_STATS) {
    continue; // Skip bot stats
  }

  // ... update stats
}
```

---

## 10. Misplay Tracking

### 10.1 Event Generation

**INVALID_ACTION events must be emitted for:**

- Playing card out of turn
- Playing card not in hand
- Playing non-trump when required to follow suit
- Bidding out of turn
- Bidding invalid amount

**Location:** `packages/domain/src/engine.ts`

```typescript
export function playCard(
  state: ServerGameState,
  playerId: PlayerId,
  cardId: CardId
): ServerGameState {
  // Validation
  const errors = validatePlay(state, playerId, cardId);

  if (errors.length > 0) {
    // Emit INVALID_ACTION event
    state.eventLog.push({
      type: "INVALID_ACTION",
      playerId,
      action: "PLAY_CARD",
      reason: errors[0],
      timestamp: Date.now(),
    });

    throw new GameError(errors[0]);
  }

  // ... proceed with play
}
```

### 10.2 Counting Misplays

**In computeGameStats():**

```typescript
const misplays = eventLog.filter(
  (e) => e.type === "INVALID_ACTION" && e.playerId === playerId
).length;
```

**Stored in:**

- `game_summaries.players[].misplays` (per-game)
- Not currently aggregated in lifetime stats

**Future Enhancement:**

```sql
ALTER TABLE player_lifetime_stats
  ADD COLUMN total_misplays INTEGER NOT NULL DEFAULT 0;
```

---

## 11. Testing Strategy

### 11.1 Unit Tests

**computeGameStats():**

```typescript
describe("computeGameStats", () => {
  it("calculates total tricks won across all rounds", () => {
    const gameState = createMockGame({
      roundSummaries: [
        { scores: { p1: { tricksWon: 3 } } },
        { scores: { p1: { tricksWon: 5 } } },
      ],
    });

    const stats = computeGameStats(gameState, []);
    expect(stats.players[0].totalTricksWon).toBe(8);
  });

  it("tracks consecutive win streaks correctly", () => {
    const gameState = createMockGame({
      roundSummaries: [
        { scores: { p1: { delta: 10 } } }, // win
        { scores: { p1: { delta: 5 } } }, // win
        { scores: { p1: { delta: -5 } } }, // loss
        { scores: { p1: { delta: 10 } } }, // win
      ],
    });

    const stats = computeGameStats(gameState, []);
    expect(stats.players[0].longestWinStreak).toBe(2);
  });

  it("counts misplays from event log", () => {
    const eventLog = [
      { type: "INVALID_ACTION", playerId: "p1" },
      { type: "INVALID_ACTION", playerId: "p1" },
      { type: "CARD_PLAYED", playerId: "p1" },
    ];

    const stats = computeGameStats(createMockGame(), eventLog);
    expect(stats.players[0].misplays).toBe(2);
  });
});
```

### 11.2 Integration Tests

**Full game flow:**

```typescript
describe("Stats persistence integration", () => {
  it("updates lifetime stats on game completion", async () => {
    const { room, gateway } = await createTestGame();

    // Play through entire game
    await playFullGame(room, gateway);

    // Verify database updates
    const stats = await db.query.playerLifetimeStats.findFirst({
      where: eq(schema.playerLifetimeStats.playerId, room.players[0].dbId),
    });

    expect(stats.gamesPlayed).toBe(1);
    expect(stats.totalPoints).toBeGreaterThan(0);
  });

  it("creates game summary on completion", async () => {
    const { room, gateway } = await createTestGame();
    await playFullGame(room, gateway);

    const summary = await db.query.gameSummaries.findFirst({
      where: eq(schema.gameSummaries.gameId, room.gameId),
    });

    expect(summary).toBeDefined();
    expect(summary.players).toHaveLength(4);
    expect(summary.rounds).toHaveLength(room.gameState.roundSummaries.length);
  });
});
```

### 11.3 Regression Tests

**Stats verification via replay:**

```typescript
describe("Stats replay verification", () => {
  it("produces identical stats when replaying events", async () => {
    const { gameId } = await playRandomGame();

    // Get stored stats
    const stored = await db.query.gameSummaries.findFirst({
      where: eq(schema.gameSummaries.gameId, gameId),
    });

    // Replay events and recompute
    const events = await db.query.gameEvents.findMany({
      where: eq(schema.gameEvents.gameId, gameId),
      orderBy: asc(schema.gameEvents.eventIndex),
    });

    const replayed = replayGame(events);
    const recomputed = computeGameStats(replayed, events);

    // Verify match
    expect(recomputed.players).toEqual(stored.players);
    expect(recomputed.rounds).toEqual(stored.rounds);
  });
});
```

---

## 12. Performance Considerations

### 12.1 Database Indexing

**Critical indexes:**

```sql
-- Fast player lookup by userId
CREATE INDEX players_user_id_idx ON players(user_id);

-- Fast stats retrieval
CREATE INDEX pls_player_id_idx ON player_lifetime_stats(player_id);

-- Recent games query
CREATE INDEX pls_last_game_idx ON player_lifetime_stats(last_game_at DESC);

-- Game summary lookup
CREATE INDEX game_summaries_game_id_idx ON game_summaries(game_id);
CREATE INDEX game_summaries_created_idx ON game_summaries(created_at DESC);
```

### 12.2 JSONB Queries

**Efficient player filtering:**

```sql
-- Find games containing specific player
SELECT * FROM game_summaries
WHERE players @> '[{"playerId": "player-uuid"}]'::jsonb;

-- Create GIN index for JSONB containment
CREATE INDEX game_summaries_players_gin
  ON game_summaries USING GIN (players);
```

### 12.3 Caching Strategy

**Client-side caching:**

```typescript
// TanStack Query automatic caching
const statsQuery = useQuery({
  queryKey: ["playerStats", userId],
  queryFn: () => getPlayerStats(userId),
  staleTime: 5 * 60 * 1000, // 5 minutes
  cacheTime: 30 * 60 * 1000, // 30 minutes
});
```

**Server-side caching (future):**

```typescript
// Redis cache for frequently accessed stats
const cacheKey = `stats:${userId}`;
const cached = await redis.get(cacheKey);

if (cached) {
  return JSON.parse(cached);
}

const stats = await fetchFromDatabase(userId);
await redis.setex(cacheKey, 300, JSON.stringify(stats)); // 5 min TTL
return stats;
```

---

## 13. Future Enhancements

### 13.1 Leaderboards

**Endpoints:**

```typescript
GET /api/leaderboard/wins?limit=100&includeBots=false
GET /api/leaderboard/win-rate?minGames=10&limit=100
GET /api/leaderboard/highest-score?limit=100
GET /api/leaderboard/total-tricks?limit=100
```

**Implementation:**

```typescript
async function getLeaderboard(
  type: "wins" | "winRate" | "highestScore" | "totalTricks",
  options: { limit: number; includeBots: boolean; minGames?: number }
) {
  const query = db
    .select()
    .from(schema.playerLifetimeStats)
    .innerJoin(
      schema.players,
      eq(schema.players.id, schema.playerLifetimeStats.playerId)
    );

  if (!options.includeBots) {
    query.where(eq(schema.players.isBot, false));
  }

  if (options.minGames) {
    query.where(gte(schema.playerLifetimeStats.gamesPlayed, options.minGames));
  }

  switch (type) {
    case "wins":
      query.orderBy(desc(schema.playerLifetimeStats.gamesWon));
      break;
    case "winRate":
      query.orderBy(
        desc(
          sql`${schema.playerLifetimeStats.gamesWon}::float / ${schema.playerLifetimeStats.gamesPlayed}`
        )
      );
      break;
    case "highestScore":
      query.orderBy(desc(schema.playerLifetimeStats.highestScore));
      break;
    case "totalTricks":
      query.orderBy(desc(schema.playerLifetimeStats.totalTricksWon));
      break;
  }

  return query.limit(options.limit);
}
```

### 13.2 Achievements System

**Database schema:**

```sql
CREATE TABLE achievements (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  criteria JSONB NOT NULL,  -- Flexible criteria definition
  icon TEXT NOT NULL,
  tier TEXT NOT NULL  -- bronze, silver, gold, platinum
);

CREATE TABLE player_achievements (
  player_id UUID REFERENCES players(id),
  achievement_id UUID REFERENCES achievements(id),
  unlocked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (player_id, achievement_id)
);
```

**Example achievements:**

```json
[
  {
    "name": "First Blood",
    "description": "Win your first game",
    "criteria": { "gamesWon": { "gte": 1 } },
    "tier": "bronze"
  },
  {
    "name": "Perfect Bid",
    "description": "Bid and win exact tricks 10 times in one game",
    "criteria": { "type": "per_game", "perfectBids": { "gte": 10 } },
    "tier": "gold"
  },
  {
    "name": "Unstoppable",
    "description": "Win 10 games in a row",
    "criteria": { "mostConsecutiveWins": { "gte": 10 } },
    "tier": "platinum"
  }
]
```

### 13.3 Advanced Analytics

**Per-round performance trends:**

```typescript
interface RoundPerformanceAnalytics {
  avgScoreByRoundIndex: Record<number, number>;
  bidAccuracyByRoundIndex: Record<number, number>; // % of exact bids
  trumpWinRate: Record<Suit, number>;
}
```

**Head-to-head statistics:**

```typescript
interface HeadToHeadStats {
  opponent: PlayerProfile;
  gamesPlayed: number;
  wins: number;
  losses: number;
  avgScoreDifferential: number;
}

GET /api/head-to-head?userId1={id1}&userId2={id2}
```

---

## 14. Implementation Checklist

### ✅ Completed

- [x] Database schema for players, games, events, summaries, lifetime stats
- [x] Real-time stat tracking in ServerPlayerState
- [x] RoundSummary accumulation during game
- [x] computeGameStats() function with streak calculation
- [x] insertGameSummary() persistence
- [x] updatePlayerLifetimeStats() with transaction
- [x] GET /api/player-stats endpoint
- [x] StatsPage component with lifetime stats display
- [x] Basic error handling and validation

### 🚧 In Progress / Missing

- [ ] Cross-game win/loss streak tracking
- [ ] GET /api/game-summary/:gameId endpoint
- [ ] GET /api/player-games endpoint with pagination
- [ ] Bot filtering in queries
- [ ] Game history display in StatsPage
- [ ] Derived metrics (win rate, avg score) in UI
- [ ] JSONB GIN indexes for game summaries
- [ ] Misplay tracking audit and verification
- [ ] Stats replay verification tests
- [ ] Documentation for adding new stats

### 🔮 Future

- [ ] Leaderboard endpoints and UI
- [ ] Achievements system
- [ ] Advanced analytics (trends, head-to-head)
- [ ] Redis caching layer
- [ ] Stats export (CSV, JSON)
- [ ] Historical graphs and charts
- [ ] Real-time stats updates via WebSocket

---

## 15. Migration Guide

### 15.1 Adding New Per-Game Stat

**Example: Track "Trump Steals" (winning with trump after non-trump lead)**

1. **Add to ComputedGameStats:**

```typescript
interface ComputedGameStats {
  players: Array<{
    // ... existing fields
    trumpSteals: number; // NEW
  }>;
}
```

2. **Compute in gameStats.ts:**

```typescript
export function computeGameStats(state, eventLog) {
  // ... existing logic

  // Count trump steals from trick data
  let trumpSteals = 0;
  for (const round of state.roundSummaries) {
    for (const trick of round.tricks || []) {
      if (
        trick.winnerId === playerId &&
        trick.winningCard.suit === round.trumpSuit &&
        trick.leadCard.suit !== round.trumpSuit
      ) {
        trumpSteals++;
      }
    }
  }

  return { ...playerStat, trumpSteals };
}
```

3. **Store in game_summaries:**

   - Already stored via JSONB `players` field
   - No schema migration needed

4. **Add to lifetime stats (optional):**

```sql
ALTER TABLE player_lifetime_stats
  ADD COLUMN total_trump_steals INTEGER NOT NULL DEFAULT 0;
```

5. **Update persistence:**

```typescript
totalTrumpSteals: existing.totalTrumpSteals + playerStat.trumpSteals;
```

6. **Expose in API:**

```typescript
// Response includes new field automatically via JSONB
```

### 15.2 Backfilling Stats

**When schema changes, backfill from existing data:**

```typescript
async function backfillTrumpSteals() {
  const summaries = await db.query.gameSummaries.findMany();

  for (const summary of summaries) {
    // Recompute stats with new logic
    const events = await db.query.gameEvents.findMany({
      where: eq(schema.gameEvents.gameId, summary.gameId),
    });

    const recomputed = computeGameStats(replayGame(events), events);

    // Update summary with new stats
    await db
      .update(schema.gameSummaries)
      .set({ players: recomputed.players })
      .where(eq(schema.gameSummaries.id, summary.id));
  }
}
```

---

## 16. Monitoring & Observability

### 16.1 Metrics to Track

**Performance metrics:**

- `stats_computation_duration_ms` - Time to compute game stats
- `stats_persistence_duration_ms` - Time to persist stats to DB
- `stats_query_duration_ms` - Time to retrieve stats via API

**Business metrics:**

- `games_completed_total` - Counter of completed games
- `players_with_stats_total` - Gauge of players with stats
- `average_game_duration_seconds` - Histogram

**Error metrics:**

- `stats_computation_errors_total` - Failures in computeGameStats
- `stats_persistence_errors_total` - Database write failures
- `stats_mismatch_errors_total` - Replay verification failures

### 16.2 Logging

**Structured logs at key points:**

```typescript
logger.info("Computing game stats", {
  gameId: gameState.gameId,
  playerCount: gameState.players.length,
  roundCount: gameState.roundSummaries.length,
});

logger.info("Stats persisted", {
  gameId,
  duration_ms: performance.now() - start,
  playersUpdated: gameStats.players.length,
});

logger.error("Stats computation failed", {
  gameId,
  error: err.message,
  stack: err.stack,
});
```

---

## 17. Security Considerations

### 17.1 Data Privacy

**Player data visibility:**

- Stats are publicly queryable by userId
- Consider privacy settings for profile visibility
- Implement rate limiting on stats queries

### 17.2 Input Validation

**API endpoints must validate:**

- userId format and existence
- Pagination parameters (limit, offset)
- Query parameter injection

```typescript
const limit = Math.min(parseInt(url.searchParams.get("limit") || "20"), 100);
const offset = Math.max(parseInt(url.searchParams.get("offset") || "0"), 0);
```

### 17.3 Data Integrity

**Ensure stats cannot be manipulated:**

- Stats computed server-side only
- No client-submitted stat values
- Transactional updates prevent partial writes
- Event log immutability prevents retroactive changes

---

## 18. Appendix

### 18.1 Related Code Files

**Core Statistics Logic:**

- `apps/server/src/persistence/gameStats.ts` - Computation
- `apps/server/src/persistence/GamePersistence.ts` - Persistence
- `apps/server/src/db/schema.ts` - Database schema
- `apps/server/src/server.ts` - API endpoints

**Client Integration:**

- `apps/web/src/pages/StatsPage.tsx` - UI
- `apps/web/src/api/client.ts` - API client
- `packages/domain/src/types.ts` - Shared types

### 18.2 Database Queries Reference

**Common queries:**

```sql
-- Get player lifetime stats
SELECT * FROM player_lifetime_stats
JOIN players ON players.id = player_lifetime_stats.player_id
WHERE players.user_id = 'user@example.com';

-- Top 10 players by wins
SELECT
  players.display_name,
  player_lifetime_stats.games_won,
  player_lifetime_stats.games_played,
  (player_lifetime_stats.games_won::float / player_lifetime_stats.games_played) as win_rate
FROM player_lifetime_stats
JOIN players ON players.id = player_lifetime_stats.player_id
WHERE players.is_bot = false
  AND player_lifetime_stats.games_played >= 10
ORDER BY player_lifetime_stats.games_won DESC
LIMIT 10;

-- Recent games for player
SELECT
  game_summaries.game_id,
  game_summaries.created_at,
  game_summaries.players,
  game_summaries.final_scores
FROM game_summaries
WHERE game_summaries.players @> '[{"playerId": "player-uuid"}]'::jsonb
ORDER BY game_summaries.created_at DESC
LIMIT 20;
```

---

**Document Status:** Implementation guide complete, ready for development reference.

**Next Steps:**

1. Implement cross-game streak tracking
2. Add game summary retrieval endpoint
3. Enhance StatsPage with game history
4. Add bot filtering options
5. Implement stats verification tests
