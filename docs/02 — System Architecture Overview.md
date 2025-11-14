# 02 — System Architecture Overview
Version: 1.0  
Status: Final  
Last Updated: YYYY-MM-DD  
Owner: Engineering  

---

# 1. Purpose

This document describes the overall system architecture of **El Dorado**, the multiplayer trick-taking card game, including its major components, boundaries, deployment model, communication flows, and cross-cutting concerns. It is the "map" engineers consult to understand how the system fits together at a high level.

---

# 2. High-Level Architecture Diagram

+-------------------------+
| Web Client |
| - React (TanStack) |
| - TanStack Router |
| - TanStack Query |
| - Game Store (local) |
+-----------+-------------+
| HTTP (REST)
v
+-------------------------+
| TanStack Start App |
| (Node/TS on Fly.io) |
| |
| +-------------------+ |
| | HTTP Handlers | |
| | (lobby, profile, | |
| | stats, join) | |
| +-------------------+ |
| |
| +-------------------+ |
| | WebSocket Gateway | |
| | - Auth (JWT) | |
| | - Rooms/Players | |
| +-------------------+ |
| |
| +-------------------+ |
| | Game Engine | |
| | (pure functions) | |
| +-------------------+ |
| |
| +-------------------+ |
| | RoomRegistry | |
| | (in-memory rooms) | |
| +-------------------+ |
| |
| +-------------------+ |
| | Persistence DB |--+--> Postgres
| | (stats/events) |
| +-------------------+ |
| |
| +-------------------+ |
| | Observability |--+--> OpenTelemetry
| +-------------------+ |
+-------------------------+

yaml
Copy code

---

# 3. Core Architectural Principles

1. **Server authoritative**  
   The server owns all game state, rules, and validations.

2. **Pure game engine**  
   All game logic lives in deterministic, side-effect-free functions.

3. **Separation of concerns**  
   - Engine = rules  
   - Rooms = runtime state  
   - DB = persistence  
   - WS = transport  
   - Client = rendering & input

4. **Deterministic replay**  
   All randomness is seeded; every action is logged as an event.

5. **Stateless HTTP, stateful WebSockets**

6. **Horizontal scalability**  
   In the future, RoomRegistry can be sharded or externalized.

7. **Graceful reconnects**  
   Player token + seat identity restored on reconnect.

8. **Observability-first**  
   Full logs and metrics via OpenTelemetry.

---

# 4. Components

## 4.1 Web Client
Technology:
- React (TanStack)
- TanStack Router for navigation
- TanStack Query for HTTP
- Local game store (TanStack Store or Zustand)
- WebSocket connection hook

Responsibilities:
- Display player hand, trick, scoreboard, bidding UI
- Render state updates from WS
- Send actions back to server
- Manage player token in localStorage
- Handle reconnect logic

Not responsible for:
- Rules
- Validation
- Scoring computation

---

## 4.2 TanStack Start App (Backend)

This is a Node/TypeScript app deployed on Fly.io.

### Subcomponents

#### 4.2.1 HTTP Layer
Endpoints include:
- `POST /api/create-room`
- `POST /api/join-by-code`
- `POST /api/matchmake`
- `GET /api/player-stats`
- `POST /api/update-profile`
- health checks

All stateless.

#### 4.2.2 WebSocket Gateway
Handles persistent connections:
- Authenticate `playerToken` via JWT
- Map players to rooms
- Broadcast state
- Listen for events
- Ping/pong & heartbeat
- Apply server-side rate limiting and message validation

#### 4.2.3 RoomRegistry (In-memory)
Data structure holding active game rooms.

Each room includes:
- `gameState` (public info)
- `playerStates` (private per-player)
- `deck(s)`
- `sockets`
- scheduler timers (disconnect handling)
- pending timeouts for turn forfeits

For production, the RoomRegistry later can be replaced by:
- Redis Cluster
- In-memory distributed KV layer

But MVP is single-instance memory.

---

## 4.3 Game Engine (Pure Functions)

Located in `/domain/engine/*.ts`.

Properties:
- Pure
- Deterministic
- Testable
- Replayable

Functions include:
- `createInitialState(seed)`
- `dealCards(state)`
- `playCard(state, action)`
- `completeTrick(state)`
- `startNextRound(state)`
- `computeScore(state)`
- `emitEvents(state)`

Engine does not:
- Manage players
- Manage connections
- Touch DB
- Log

---

## 4.4 Database Layer

Using Postgres via Drizzle ORM.

Tables include:
- `games`  
- `game_events`  
- `players`  
- `player_lifetime_stats`  
- `game_summary_stats`  

DB responsibilities:
- Player profiles
- Game summaries
- Lifetime stats
- Replay event log

Not responsible for:
- Active game state
- Turn order
- Decks
- Current rounds

---

## 4.5 Bot Engine

Bots run:
- As part of server process OR  
- As a separate worker that connects via WS (future)

Responsibilities:
- Filling empty seats to reach 4 players
- Automated bidding & play
- Deterministic behavior (seeded)

---

# 5. Communication Patterns

## 5.1 HTTP (TanStack Query)
Used for:
- Lobby creation
- Joining rooms
- Matchmaking
- Updating profile
- Fetching stats
- Fetching game summaries

One-shot requests.

## 5.2 WebSocket
Used for:
- Game actions (“PLAY_CARD”, “BID”, etc.)
- Updates from the server (“STATE_FULL”, “GAME_EVENT”)
- Ping/Pong
- Connection lifecycle events

State always flows from **server → client**.

## 5.3 Event Log
Every action → stored in DB → replayable.

---

# 6. Deployment Model

## 6.1 Running on Fly.io
- Single-region for MVP
- Stateless HTTP instances
- One persistent VM for WebSocket rooms OR
- Keep WS and HTTP on same instance for MVP

## 6.2 Scaling
Future:
- Shard rooms by roomId modulo N
- Redirect WS connections using Fly edge routing
- Move RoomRegistry to Redis if needed

---

# 7. Security Model

- Player identity stored in JWT with:
  - playerId  
  - gameId  
  - seatIndex  
  - expiration  
  - signature
- JWT stored only in localStorage
- Invalid WS auth → immediate disconnect
- Rate limiting on WS messages

---

# 8. Observability

Use OpenTelemetry exporters for:
- Structured logging (JSON)
- Metrics (WS counts, game counts, errors)
- Traces for HTTP and WS events

---

# 9. Failure Modes & Recovery

### Network Drop
Player transitions to `disconnected` → 60s timer → forced turn action.

### Server Restart
Players reconnect using playerToken and restore state.

### DB Failure
Game continues (in-memory)  
Event log flush will resume once DB returns.

### Inconsistent State
Replay event log to determine truth. Engine recomputes deterministically.

---

# 10. Compliance With Other Documents

This architecture is aligned with:
- **03-domain-model.md** (data structures)
- **04-event-replay.md** (event flow)
- **05-protocol-spec.md** (transport)
- **06-database-schema.md** (tables)
- **09-client-architecture.md** (UI & local state flow)

All deeper concerns are defined in those files.
