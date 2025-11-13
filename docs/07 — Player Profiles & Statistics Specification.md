# 07 — Player Profiles & Statistics Specification  
Version: 1.0  
Status: Final  
Last Updated: YYYY-MM-DD  
Owner: Engineering  

---

# 1. Purpose

This document defines:

- Player profile data (persistent + in-game)
- Editable profile fields and constraints
- Per-game stats logic
- Lifetime stats logic
- How stats are updated, stored, and exposed
- How spectators and bots interact with profiles & stats

This spec informs:
- Domain Model (03-domain-model.md)
- Database Schema (06-database-schema.md)
- Protocol Spec (05-protocol-spec.md)
- Scoring & Engine behavior

---

# 2. Player Profile Model

Defined in `players` table and engine.

## 2.1 Profile Fields

```ts
export interface PlayerProfile {
  userId?: UserId; 
  displayName: string;
  avatarSeed: string;
  color: string;
}
Constraints
Field	Constraints
displayName	1–24 chars, no control chars, UTF-8 allowed
avatarSeed	1–64 chars, used by client to derive an avatar
color	hex #rrggbb or CSS color name
userId	optional; generated from anonymous identity or OAuth

Profile fields are editable anytime, including mid-game.

Behavior
On join → initial profile is sent to server via HTTP

Server stores profile in memory for the current game

On update → server broadcasts PROFILE_UPDATED

3. Player Identity
Three identity layers:

userId

Optional persistent identity (localStorage or login)

Exists even across multiple games

playerId

Unique identifier for a player in a specific game

Generated when they join a room

Encoded in JWT token

seatIndex

Assigned when joining

Null for spectators

4. Spectators
Spectators have:

A playerId

isSpectator = true

No seatIndex

No hand, no bidding, no trick participation

Appear in players[] client list

No per-game stats

No lifetime stats

Spectators cannot play or bid but can update profiles.

5. Bot Profiles
Bots are stored in players table with:

ini
Copy code
is_bot = true
Bot profile rules:

name convention: "Bot <N>"

avatarSeed: "bot:<N>"

color: default blue/purple

cannot update profile

lifetime stats may or may not be tracked (configurable)

6. Per-Game Statistics
These stats reset every round and every game.

Defined in:

ts
Copy code
export interface ServerPlayerState {
  playerId: PlayerId;
  hand: Card[];
  tricksWon: number;
  bid: number | null;
  roundScoreDelta: number;
}
6.1 Stats Tracked In-Game
Trick-Based Stats
tricksWon

highestBid (record across rounds)

misplays (illegal move attempts allowed? depends on rules)

In this game: misplays = number of attempts at illegal plays
(captured before rejection)

Streak Stats
consecutiveHandsWon

consecutiveHandsLost

Game-Level Aggregates
At end of round:

roundScoreDelta
At end of game:

compute:

total score

highestBid

highestMisplay

most consecutive wins/losses

Trick-Level Metadata for Debug/Replay
Not exposed to players but stored in events:

card played order

break-trump events

fallback auto-play events

7. Lifetime Statistics
Stored in player_lifetime_stats.

7.1 Fields Defined
Field	Description
gamesPlayed	Count of completed games
gamesWon	Final scoreboard winner(s)
highestScore	Max final score across games
lowestScore	Min final score across games
totalPoints	Sum of final scores across all games
totalTricksWon	Sum of all tricks won
mostConsecutiveWins	Max wins streak across games
mostConsecutiveLosses	Max losses streak across games
lastGameAt	Timestamp of most recent completed game

7.2 Update Timing
Lifetime stats update once, after game completion.

Steps:

Load or create stats row for each player.

Determine whether they won the game.

Update:

Games played +1

Games won (if applicable)

Highest & lowest score

totalPoints += finalScore

totalTricksWon += tricksWon

Update streaks

Set lastGameAt = now()

Save back to DB.

All updates must occur inside a transaction.

8. Profile Update Flow
8.1 Client → Server
Client sends WS message:

csharp
Copy code
{
  "type": "UPDATE_PROFILE",
  "displayName"?: string,
  "avatarSeed"?: string,
  "color"?: string
}
8.2 Server Validation
Check allowed fields

Check formatting & length

Update in memory

Insert event: PROFILE_UPDATED

Broadcast WS:

arduino
Copy code
{
  "type": "GAME_EVENT",
  "event": {
    "type": "PROFILE_UPDATED",
    "payload": {
      "playerId": "...",
      "profile": { ... }
    }
  }
}
Update persistent profile (players table) if userId known.

9. Stats Event Mapping
All stats come from event log replay.

9.1 CARD_PLAYED
pgsql
Copy code
misplays += 1 // only if rejected attempt before valid play
9.2 TRICK_COMPLETED
Copy code
tricksWon[winningPlayer] += 1
9.3 ROUND_SCORED
bash
Copy code
consecutive wins/losses updated
highestBid updated
roundScoreDelta set
9.4 GAME_COMPLETED
Compute:

finalScore

max consecutive wins/losses

highest misplay count

highest total trick count

highest bid

10. Stats in ClientGameView
Expose the following fields:

less
Copy code
players[]:
  displayName
  color
  avatarSeed
  seatIndex
  isConnected
  isAbsent

  // per-round
  bid
  tricksWon

  // cumulative
  cumulativeScore
Not exposed:

misplays

streaks

internal trick metadata

card ownership

11. Stats in Game Summaries
game_summaries.rounds contains per-round summary:

yaml
Copy code
rounds: [
  {
    roundIndex: number,
    bids: Record<PlayerId, number>,
    tricksWon: Record<PlayerId, number>,
    scoreDelta: Record<PlayerId, number>
  }
]
game_summaries.final_scores:

css
Copy code
{ playerId: score }
game_summaries.players:

ini
Copy code
[
  { playerId, displayName, seatIndex, score }
]
12. Stats Query API
From protocol spec:

bash
Copy code
GET /api/player-stats?userId=...
Response
yaml
Copy code
{
  profile: PlayerProfile,
  lifetime: PlayerLifetimeStats
}
Lifetime Stats API Use Cases:
Profile screen

Leaderboards (future)

Long-term achievements (future)

13. Important Notes & Constraints
Stats MUST NOT depend on:

Real-time clock order

Message arrival order
Only event order matters.

All stats must be derived from event log + scoring.

When performing replay, game stats must match actual final stats exactly.

State corruption protection:

Stats calculation must assert invariants

Missing events → throw

Invalid scoring transitions → throw

14. Compliance & Integration
This spec integrates with:

Game engine → updates per-game stats

Database → stores persistent stats

WebSocket protocol → profile updates

Event log → captures all necessary data

Replay system → ensures deterministic scoring and stats correctness

