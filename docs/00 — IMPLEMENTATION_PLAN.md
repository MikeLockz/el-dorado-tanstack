# IMPLEMENTATION_PLAN.md
Version: 1.0  
Owner: Engineering  
Last Updated: YYYY-MM-DD  

---

## 0. Overview

This document is the **practical build order** for the project.

It answers:  
> “In what order do I implement things, and what exactly do I do at each step?”

It is intentionally **implementation-focused** and references the deeper specs in `/docs`:

- `01-game-design.md`
- `02-architecture-overview.md`
- `03-domain-model.md`
- `04-event-replay.md`
- `05-protocol-spec.md`
- `06-database-schema.md`
- `07-profiles-and-stats.md`
- `08-bots.md`
- `09-client-architecture.md`
- `10-observability.md`
- `11-testing-and-qa.md`
- `12-roadmap.md`

---

## 1. Repository & Monorepo Setup

**Goal:** Have a working mono-repo with a shared domain package, server app, and web app.

### 1.1. Create repo and directory layout

```text
/ .gitignore
/ package.json
/ pnpm-workspace.yaml   (or yarn workspaces)
/ tsconfig.base.json
/
/ apps
  / server              (TanStack Start backend)
/ web                  (React client)
/ packages
  / domain              (shared types & engine)
/ docs                  (all the spec markdown files)
Tasks

Initialize git repo.

Create folder structure above.

Copy all 12 spec docs into /docs using the agreed numbered filenames.

1.2. Configure package manager & TS
Choose PNPM or Yarn workspaces.

Root package.json:

workspaces: ["apps/*", "packages/*"]

Create tsconfig.base.json with:

"strict": true

Common compiler options.

Add per-package tsconfig.json extending the base.

1.3. Set up packages/domain
package.json with:

name: "@el-dorado/domain"

main: "dist/index.js"

types: "dist/index.d.ts"

Dev dependencies:

typescript

vitest or jest

ts-node or tsx

Scripts:

build, test, lint (if using ESLint)

Exit Criteria

pnpm install (or equivalent) works.

pnpm build from root builds packages/domain (even if empty).

Specs live in /docs.

2. Domain Types & Pure Game Engine (Core Logic)
Goal: Implement all core rules and state transitions with full unit tests and no networking.

References: 01-game-design.md, 03-domain-model.md, 04-event-replay.md.

2.1. Implement core types
Create files under /packages/domain/src/types:

cards.ts

Suit, Rank, Card

player.ts

PlayerProfile, PlayerInGame, ServerPlayerState

game.ts

GamePhase, GameConfig, RoundState, TrickState, GameState, ClientGameView

events.ts

GameEvent union and per-type payloads

Tasks

Copy & adapt types from 03-domain-model.md.

Ensure no circular imports.

Export everything from src/index.ts.

Exit Criteria

pnpm test for domain passes typecheck (even if no tests yet).

2.2. Deterministic randomness & deck generation
Create /packages/domain/src/engine/shuffle.ts and /engine/deck.ts.

Tasks

Implement createDeck(numDecks: number): Card[].

Implement seed-based PRNG and shuffle(deck, seed): Card[].

Add tests:

Same seed → same order.

Different seed → different order.

Correct number of cards for 1-deck & 2-deck modes.

Exit Criteria

Deck generation works and is deterministic.

Tests verify no duplicate (id,deckIndex) conflicts.

2.3. Game creation & round setup
Create /engine/game.ts & /engine/round.ts.

Tasks

Implement createGame(config: GameConfig): GameState.

Implement startRound(state: GameState, roundIndex: number, roundSeed: string).

Use tricksForRound(r) from 01-game-design.md.

Implement dealCards(state, roundSeed).

Implement revealTrump(state).

Tests

Round 1 → 10 cards per player.

Round 10 → 1 card per player.

2–5 players → 1 deck; 6–10 players → 2 decks.

Trump card is flipped correctly and tracked.

Exit Criteria

You can create a game and start round 1 purely in tests.

All players have correct hand sizes.

2.4. Trick logic & legal moves
Create /engine/trick.ts & /engine/validation.ts.

Tasks

Implement:

playCard(state, playerId, cardId): { newState; events[] }

completeTrick(state): { newState; events[] }

Implement validation helpers:

isPlayersTurn(state, playerId)

ownsCard(state, playerId, cardId)

mustFollowSuit(state, playerId, card)

canLeadTrump(state, playerId, card)

Implement winner determination:

Highest trump OR highest led-suit.

Duplicate cards: last played among equals wins.

Tests

Must follow suit when possible.

Cannot lead trump until broken.

Trump break is triggered correctly when a trump is sloughed while void.

Winner is correct with & without trump.

Duplicate deck: tie-breaking works.

Exit Criteria

Can simulate a single trick in tests with multiple players.

All illegal plays rejected with correct error codes.

2.5. Bidding & scoring
In /engine/bidding.ts and /engine/scoring.ts.

Tasks

Implement applyBid(state, playerId, bid):

Legal range: 0..cardsPerPlayer.

Implement scoreRound(state) using ±(5 + bid) rule.

Update cumulativeScores in GameState.

Tests

Bid 3, win 3 → +8.

Bid 3, win 2 → −8.

Cumulative scores over multiple rounds.

Exit Criteria

One round can be fully simulated: deal → bid → tricks → score.

2.6. Event model & replay
In /engine/events.ts and /engine/replay.ts.

Tasks

Implement applyEvent(state, event).

Implement replayGame(events[]): GameState.

Ensure events follow 04-event-replay.md.

Tests

Golden path: generate events from a full simple game; replay produces same final state.

Corrupt event log → throw with clear error.

Exit Criteria

Replay determinism proven by tests.

Event ordering invariants enforced.

3. Minimal Backend: RoomRegistry + HTTP
Goal: Run the engine in a backend process, manage rooms and players, and expose basic HTTP endpoints.

References: 02-architecture-overview.md, 05-protocol-spec.md.

3.1. Set up apps/server
Tasks

Create TanStack Start app in /apps/server.

Add tsconfig.json extending base.

Add dependencies: TanStack Start, Node types, etc.

Add a simple health check route /api/health.

Exit Criteria

pnpm dev runs server locally.

/api/health returns { ok: true }.

3.2. Implement RoomRegistry (in-memory)
Create /apps/server/src/rooms/RoomRegistry.ts.

Tasks

Define ServerRoom as per 03-domain-model.md.

Implement:

createRoom(config): ServerRoom

getRoom(gameId): ServerRoom | undefined

findByJoinCode(joinCode): ServerRoom | undefined

listPublicRooms(): ServerRoom[]

Track:

gameState

playerStates

deck

sockets (empty for now)

eventIndex

Exit Criteria

Can create and retrieve rooms in a simple server-side unit test.

3.3. Implement basic HTTP endpoints
Implement in /apps/server/src/routes/api:

POST /api/create-room

Creates new GameState via engine.

Creates Room in RoomRegistry.

Generates joinCode.

Returns { gameId, joinCode, playerToken: "TEMP" }.

POST /api/join-by-code

Looks up room by joinCode.

Adds PlayerInGame and ServerPlayerState.

Returns { gameId, playerToken: "TEMP" }.

POST /api/matchmake

Stub: for now, just creates a new room and returns it.

Tokens can be simple random strings for now (upgrade to JWT later).

Exit Criteria

You can curl/postman hit create/join endpoints and see rooms created in logs.

RoomRegistry updates correctly.

4. WebSocket Integration & Real-Time Game Loop
Goal: Real-time game via WS: actions in, state out.

References: 02-architecture-overview.md, 05-protocol-spec.md.

4.1. Implement WS Gateway
Create /apps/server/src/ws/Gateway.ts.

Tasks

Add /ws route:

Validate gameId and token (temporary simple auth).

Look up room & attach socket to sockets map.

On connect:

Send WELCOME.

Send initial STATE_FULL.

Exit Criteria

WS connection works between a simple Node WS client and server.

4.2. Wire client messages → engine
Tasks

Define ClientMessage types as per 05-protocol-spec.md:

PLAY_CARD

BID

REQUEST_STATE

UPDATE_PROFILE

PING

For each message:

Validate schema.

Locate ServerRoom.

Call appropriate engine function.

Update gameState and playerStates.

Append to in-memory event log (DB later).

Broadcast updated STATE_FULL to all room sockets.

Exit Criteria

Manual test: one WS client sends PLAY_CARD, server processes and broadcasts new state.

4.3. Turn timers & disconnect handling (minimal)
Tasks

On connection close:

Mark isConnected = false.

Start 60s timer for current or next turn.

On timer expiry:

If it’s that player’s turn:

Use engine fallback card selection.

Play it and advance the game.

Exit Criteria

Simulated disconnect → fallback move after 60s.

5. Client App: Routing, Store, WS Hook, UI Skeleton
Goal: You can open two browser tabs, join a game, and play cards.

References: 09-client-architecture.md.

5.1. Set up /apps/web
Tasks

Initialize React app with TanStack Router.

Routes:

/ – landing page.

/join – join by code (simple form).

/game/:gameId – main game view.

Configure TypeScript and build scripts.

Exit Criteria

Client dev server runs and renders basic pages.

5.2. Implement game store & WS hook
Tasks

Add Zustand or TanStack Store with GameStore shape from 09-client-architecture.md.

Implement useGameWebSocket(gameId, playerToken):

Connects to /ws.

On STATE_FULL:

setState({ game: state, connection: "open" }).

On close:

connection = "closed" and schedule reconnect.

Store playerToken in localStorage per game.

Exit Criteria

When server sends dummy STATE_FULL, UI responds and shows it.

5.3. Implement minimal game UI
Components:

GamePage – root for /game/:gameId.

PlayerList – shows players, current turn, scores.

TrickArea – shows current trick cards.

Hand – shows player’s hand and lets them click cards.

BiddingModal – appears in BIDDING phase.

Tasks

Wire components to GameStore.

On card click:

Send PLAY_CARD message via WS hook.

On bid selection:

Send BID.

Exit Criteria

Two browser tabs can:

Join the same room.

See trump, players, and hands.

Play legal cards and see trick winner update.

Complete a round and see scores.

6. JWT Tokens & Real Auth Flow
Goal: Replace temporary tokens with proper JWT-based player tokens.

References: 05-protocol-spec.md.

6.1. JWT issuance
Tasks

Add JWT library to server.

When creating/joining a room:

Issue a JWT:

playerId

gameId

seatIndex

isSpectator

exp

Return JWT as playerToken.

6.2. JWT validation in WS
In /ws:

Decode JWT.

Validate signature, exp, gameId.

Use playerId to attach WS.

6.3. Token refresh
Implement TOKEN_REFRESH server → client.

Client replaces stored token in localStorage.

Exit Criteria

Only clients with valid tokens can connect.

Manually tampering token causes WS reject.

7. Persistence: Postgres, Events, Stats
Goal: Store events & stats in Postgres with full replay and lifetime stats.

References: 06-database-schema.md, 04-event-replay.md, 07-profiles-and-stats.md.

7.1. Integrate DB & ORM
Tasks

Add Drizzle or other ORM.

Add connection config using .env.

Apply initial migrations for:

players

games

game_events

game_summaries

player_lifetime_stats

room_directory (if used)

Exit Criteria

DB is running locally via docker-compose.

pnpm db:migrate applies schema.

7.2. Persisting events
Tasks

On each engine action that emits events:

Write entries into game_events with event_index.

On game creation:

Insert into games.

Exit Criteria

Full event log written for a completed game.

Query returns all events, ordered by event_index.

7.3. Game summary & lifetime stats
Tasks

At GAME_COMPLETED:

Build summary object as per 06-database-schema.md.

Insert into game_summaries.

For each player:

Upsert player_lifetime_stats.

Implement /api/player-stats to read profile + stats.

Exit Criteria

Can call /api/player-stats for a userId and see correct totals.

8. Bots
Goal: Bots can fill seats and play complete games deterministically.

References: 08-bots.md.

8.1. Bot strategy & controller
Tasks

Implement BotStrategy with:

bid(hand, context)

playCard(hand, context)

Implement BotManager:

Fill seats up to 4 players on matchmaking.

For bot turns, call strategy and feed actions into same engine path.

Exit Criteria

Bot-only rooms can fully play a 10-round game.

Replays deterministic.

9. Observability
Goal: Structured logs, metrics, basic tracing.

References: 10-observability.md.

Tasks

Add structured JSON logging.

Add basic OpenTelemetry setup:

HTTP request spans.

WS message spans.

Counters for games created, completed, WS connections.

Add /metrics endpoint for Prometheus or similar.

Exit Criteria

Logs show structured entries for:

Game creation

WS connect/disconnect

CARD_PLAYED events

Metrics show active connections and games.

10. Testing & QA Hardening
Goal: Comprehensive coverage for core logic and critical flows.

References: 11-testing-and-qa.md.

Tasks

Ensure unit tests for engine cover:

All rule edge cases.

Deterministic replay.

Add integration tests for:

create-room → join → WS connect → play → complete game.

Add E2E tests (Playwright or Cypress):

Two tabs playing a game.

Add regression fixtures for any bugs found.

Exit Criteria

CI pipeline:

Lint

Typecheck

Unit tests

Integration tests

No red tests; coverage meets target for domain/engine.

11. Polish & Quality of Life
Goal: Make the game pleasant to use, not just functional.

Tasks

Improve UI layout for mobile portrait (hand, trick, players).

Add small animations for played cards and trick win.

Improve error handling UI (toasts, banners).

Add basic profile and stats screens.

Tweak bot strategy for more interesting play.

Exit Criteria

Game is fun and readable on a phone.

Main flows feel smooth (no obvious jank).

12. Ongoing Enhancements (Post-MVP)
After the core is working and stable, consider:

Full replay viewer (UI over event log).

Enhanced bots & difficulty levels.

Social features (friends, rematch).

Tournament structures.

These should be treated as new phases with their own mini-plans.