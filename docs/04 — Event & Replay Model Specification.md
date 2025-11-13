# 04 — Event & Replay Model Specification  
Version: 1.0  
Status: Final  
Last Updated: YYYY-MM-DD  
Owner: Engineering  

---

# 1. Purpose

This document defines the **event-sourced architecture** for the game, including:

- Deterministic randomness design
- Event schema (all event types)
- The authoritative event log stored in Postgres
- How replay reconstructs a full game state
- How state versioning works
- Guarantees provided by the event system

This spec is essential for:
- Deterministic game replay
- Debugging
- Bot reproducibility
- Testing
- Auditing correctness after bug fixes

---

# 2. Deterministic Randomness

All randomness in the game (shuffling, bot decisions, fallback moves) must be **deterministic**.

Determinism is achieved using:
- A **sessionSeed** (string)
- A **roundSeed = hash(sessionSeed + roundIndex)**
- A pure pseudo-random generator (PRNG), e.g., **SeedRandom**, **mulberry32**, or **xoshiro128**.

## 2.1 Session Seed Generation

```ts
sessionSeed = crypto.randomUUID(); // or random alphanumeric
Stored in GameConfig.sessionSeed.

2.2 Round Seed Derivation
ts
Copy code
roundSeed = hash(`${sessionSeed}:${roundIndex}`);
This ensures:

Replayable randomness

No cross-round contamination

2.3 Shuffling Algorithm
Use a deterministic Fisher-Yates shuffle:

ts
Copy code
function shuffle(deck: Card[], seed: string): Card[]
The shuffle result must be:

Deterministic

Pure (no mutation outside function)

Based on roundSeed

3. Event Log Overview
Every meaningful change to game state is logged as an event.

Characteristics:

Append-only

Strictly ordered with an integer eventIndex

Immutable (cannot be edited or removed)

Replayed to derive authoritative game state

Events are written to the DB in game_events table.

4. Event Schema
Events use a discriminated union structure:

ts
Copy code
export interface GameEvent {
  eventIndex: number;
  gameId: GameId;
  timestamp: number;
  type: GameEventType;
  payload: any; // Constrained by type
}
5. Event Types
Here are all event types required for the game.

5.1 Game Lifecycle
GAME_CREATED
lua
Copy code
{
  type: "GAME_CREATED",
  payload: {
    sessionSeed,
    config,
    creatorPlayerId,
  }
}
PLAYER_JOINED
css
Copy code
payload: {
  playerId,
  seatIndex,
  profile
}
PLAYER_LEFT
css
Copy code
payload: {
  playerId
}
PLAYER_RECONNECTED
PLAYER_DISCONNECTED
PLAYER_BECAME_SPECTATOR
5.2 Round Events
ROUND_STARTED
css
Copy code
payload: {
  roundIndex,
  cardsPerPlayer,
  roundSeed
}
CARDS_DEALT
yaml
Copy code
payload: {
  hands: Record<PlayerId, CardId[]>,
  deckStateHash: string
}
Implementation note: The deck itself is not stored—only CardId arrays.

TRUMP_REVEALED
css
Copy code
payload: {
  card: Card
}
5.3 Bidding Events
PLAYER_BID
css
Copy code
payload: {
  playerId,
  bid
}
BIDDING_COMPLETE
css
Copy code
payload: {}
5.4 Trick & Play Events
TRICK_STARTED
css
Copy code
payload: {
  trickIndex,
  leaderPlayerId
}
CARD_PLAYED
css
Copy code
payload: {
  playerId,
  card
}
TRUMP_BROKEN
css
Copy code
payload: {}
TRICK_COMPLETED
css
Copy code
payload: {
  trickIndex,
  winningPlayerId,
  winningCardId
}
5.5 Scoring Events
ROUND_SCORED
yaml
Copy code
payload: {
  deltas: Record<PlayerId, number>,
  cumulativeScores: Record<PlayerId, number>
}
GAME_COMPLETED
css
Copy code
payload: {
  finalScores: Record<PlayerId, number>
}
5.6 Profile/Meta Events
PROFILE_UPDATED
css
Copy code
payload: {
  playerId,
  profile
}
PLAYER_MARKED_ABSENT
css
Copy code
payload: { playerId }
5.7 Error / System Events (for debugging only)
INVALID_ACTION
css
Copy code
payload: {
  playerId,
  actionType,
  reason
}
Not replayed; stored optionally if debugging.

6. Event Ordering Guarantees
Each event has a monotonic eventIndex starting at 0.

All events for a game share the same gameId.

No events are ever reordered.

Replay applies events strictly in stored order.

7. Replay Algorithm
Replay reconstructs a game state from empty to final by applying events.

7.1 Pseudocode
ts
Copy code
function replayGame(events: GameEvent[]): GameState {
  let state = createEmptyState();

  for (const event of events) {
    state = applyEvent(state, event);
  }

  return state;
}
7.2 applyEvent is pure & side-effect-free
Each event type has a reducer function:

nginx
Copy code
applyGameCreated
applyPlayerJoined
applyRoundStarted
applyCardsDealt
applyTrumpRevealed
applyPlayerBid
applyCardPlayed
applyTrickCompleted
applyRoundScored
applyGameCompleted
All reducers:

Must be pure

Must validate invariants

Must return new updated state without mutation

8. Event Deduplication & Idempotency
When replaying, events are applied exactly once in order.

No event must:

Rely on server time

Depend on external state

Execute side effects

This ensures idempotency.

9. Event Log Storage Format (Database)
Stored in game_events table:

Column	Type	Description
id	UUID	Primary key
game_id	UUID	FK to games table
event_index	Integer	Sequential index
type	Text	Event type
payload	JSONB	Event payload
created_at	Timestamp	When the event was stored

Indexes:

(game_id, event_index) unique

(game_id) for fetching all events of a game

10. Time Travel Support
The replay system allows:

Jump to any eventIndex

Visualize the state at any point

10.1 Partial Replay
To get state at event N:

ts
Copy code
replayGame(events.slice(0, N+1))
10.2 Trick Reconstruction
Since CARD_PLAYED emissions are complete, UI can show past tricks perfectly.

11. Versioning & Backwards Compatibility
Future changes to events must support:

11.1 Event Version Field
css
Copy code
payload: {
  ...,
  _v: 1
}
11.2 Migrations
New code must:

Detect old event version

Interpret accordingly

Provide migration tooling if needed

12. Error Handling
Invalid events in an event log indicate corruption.

Replay must:

Throw on invalid transitions

Provide a debug trace for the failing eventIndex

In production:

Alert + quarantine problematic game

Sync with monitoring system

13. Seeding Bot Behavior
Bot logic must consume randomness only from:

roundSeed

trickIndex

playerIndex

Consumed via deterministic PRNG instance.

Bot actions are logged as events like any other player.

14. Compliance Requirements
This document drives:

Game engine reducers

Database schema for game events

Client UI for replay viewer

Bot determinism
