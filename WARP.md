# WARP.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

## Project Overview

El Dorado is a production-ready multiplayer trick-taking card game built with TanStack ecosystem. The project demonstrates spec-driven development with a deterministic, event-sourced game engine that supports full replay capability.

## Common Commands

### Development
```bash
# Install dependencies (run once after clone)
pnpm install

# Start full development stack (backend + frontend + domain watch)
# Backend: localhost:4000, Frontend: localhost:5173
pnpm dev

# Run individual packages
pnpm --filter @game/server dev:watch
pnpm --filter @game/web dev
pnpm --filter @game/domain dev:watch
```

### Testing
```bash
# Run tests for specific packages
pnpm --filter @game/domain test     # Game engine tests
pnpm --filter @game/server test     # Backend unit tests
pnpm --filter @game/web test        # Frontend tests

# Integration tests (requires PostgreSQL - use DevContainer)
pnpm --filter @game/server test:integration

# E2E tests (Playwright - boots full stack automatically)
pnpm test:e2e

# Artillery load testing (4-player coordinated session)
# Terminal 1: Boot backend on port 4000
PORT=4000 pnpm --filter @game/server dev

# Terminal 2: Run load test
pnpm artillery:test
```

### Building
```bash
# Build all packages
pnpm build

# Type checking without emitting files
pnpm typecheck

# Lint (note: no actual linters configured, just placeholder scripts)
pnpm lint
```

### Database
```bash
# Run database migrations
pnpm db:migrate

# Reset database (uses scripts/reset-db.ts)
pnpm --filter @game/server tsx scripts/reset-db.ts
```

### Environment Variables
Copy `.env.example` to `.env` and configure:
- `DATABASE_URL`: PostgreSQL connection string (default: `postgresql://postgres:postgres@localhost:5432/el_dorado`)
- `VITE_API_URL`: Backend API URL for frontend (default: `http://localhost:4000`)
- `VITE_WS_URL`: WebSocket URL for frontend (default: `ws://localhost:4000/ws`)
- `PORT`: Backend server port (default: 4000)

## Architecture Overview

### Monorepo Structure
```
el-dorado-tanstack/
├── packages/domain/      # Pure TypeScript game engine (no dependencies)
│   └── src/
│       ├── engine/       # Core game logic (deterministic, event-sourced)
│       ├── bots/         # Bot AI implementation
│       └── types/        # Shared type definitions
├── apps/server/          # Node.js backend (WebSocket + REST)
│   └── src/
│       ├── ws/           # WebSocket gateway
│       ├── rooms/        # RoomRegistry (in-memory game state)
│       ├── db/           # Drizzle ORM schema and persistence
│       ├── persistence/  # Game event persistence layer
│       ├── bots/         # Bot manager (server-side coordination)
│       ├── auth/         # JWT player tokens
│       └── observability/# OpenTelemetry logging and metrics
└── apps/web/             # React frontend (Vite)
    └── src/
        ├── pages/        # TanStack Router pages
        ├── components/   # React components
        ├── hooks/        # React hooks (WebSocket, game state)
        ├── store/        # TanStack Store (client state)
        ├── api/          # TanStack Query hooks
        └── lib/          # Utilities and WebSocket client

docs/                     # Comprehensive technical specifications
```

### Key Architectural Principles

**1. Deterministic Game Engine**
- All game logic in `packages/domain/` is pure, side-effect-free
- Uses deterministic randomness (seeded shuffling and bot behavior)
- Every action produces an event that can be replayed exactly
- Engine has ZERO dependencies - it's just TypeScript

**2. Event Sourcing**
- All game state changes are stored as events in `game_events` table
- Events have sequential `event_index` for strict ordering
- Any game can be replayed from event log to reconstruct exact state
- Event types: `GAME_CREATED`, `PLAYER_JOINED`, `ROUND_STARTED`, `CARDS_DEALT`, `TRUMP_REVEALED`, `PLAYER_BID`, `BIDDING_COMPLETE`, `TRICK_STARTED`, `CARD_PLAYED`, `TRUMP_BROKEN`, `TRICK_COMPLETED`, `ROUND_SCORED`, `GAME_COMPLETED`

**3. Server-Authoritative**
- Server owns all game state validation and rules enforcement
- Client sends actions (via WebSocket), server validates and broadcasts results
- `RoomRegistry` holds active game rooms in memory (Map<GameId, ServerRoom>)
- Clients receive full state updates and incremental game events

**4. Separation of Concerns**
```
┌─────────────┐
│   domain    │ ← Pure game engine (rules, validation, scoring)
└──────┬──────┘
       │
┌──────▼──────┐
│   server    │ ← Runtime (WebSocket gateway, RoomRegistry, persistence)
└──────┬──────┘
       │
┌──────▼──────┐
│     web     │ ← Rendering (React, TanStack Router/Query/Store)
└─────────────┘
```

### Data Flow

**Game Initialization**
1. Client calls `POST /api/create-room` or `POST /api/join-by-code`
2. Server creates/joins room in `RoomRegistry`, issues JWT `playerToken`
3. Client stores token in localStorage, connects via WebSocket with token
4. Server validates token, adds socket to room, sends `WELCOME` + `STATE_FULL`

**Game Action Flow**
1. Client sends action message (e.g., `{type: "PLAY_CARD", cardId: "..."}`)
2. WebSocket gateway validates message and player identity
3. Server applies action to game state using domain engine functions
4. Domain function returns new state + game events
5. Server persists events to database (`game_events` table)
6. Server broadcasts `GAME_EVENT` to all sockets in room
7. Clients update local state from event

**State Synchronization**
- Clients maintain local game state via TanStack Store
- Server is source of truth - clients apply events as they arrive
- `STATE_FULL` message provides complete game state (on connect or request)
- Reconnecting clients use stored `playerToken` to restore session

## Testing Strategy

### Unit Tests (Vitest)
- **Domain**: Deterministic engine logic, replay, validation
  - Files: `*.test.ts` alongside implementation
  - Pure functions, easy to test
- **Server**: RoomRegistry, WebSocket handlers, persistence
- **Web**: React components, hooks, utilities

### Integration Tests
- Located in `apps/server/src/` with `*.integration.test.ts` suffix
- Require PostgreSQL (use DevContainer or local setup)
- Test full database persistence and event replay

### E2E Tests (Playwright)
- Located in `tests/e2e/`
- Boots full stack automatically via `webServer` config
- Tests complete user flows through browser

### Load Tests (Artillery)
- Located in `load-testing/`
- Simulates coordinated 4-player game sessions
- Run with `pnpm artillery:test` (or `scripts/run-artillery.sh`)

## Critical Files to Understand

### Domain Layer
- `packages/domain/src/engine/game.ts` - Game creation
- `packages/domain/src/engine/replay.ts` - Event sourcing, `applyEvent()` function
- `packages/domain/src/engine/validation.ts` - Rules validation (legal plays, bids)
- `packages/domain/src/engine/trick.ts` - Trick resolution and winner determination
- `packages/domain/src/engine/scoring.ts` - Scoring algorithm
- `packages/domain/src/types/` - All TypeScript interfaces

### Server Layer
- `apps/server/src/server.ts` - HTTP request handler (REST API)
- `apps/server/src/rooms/RoomRegistry.ts` - In-memory room management
- `apps/server/src/ws/Gateway.ts` - WebSocket connection lifecycle
- `apps/server/src/ws/state.ts` - State projection for clients
- `apps/server/src/persistence/GamePersistence.ts` - Event log persistence
- `apps/server/src/db/schema.ts` - Drizzle ORM schema

### Web Layer
- `apps/web/src/router.tsx` - TanStack Router configuration
- `apps/web/src/lib/websocket.ts` - WebSocket client implementation
- `apps/web/src/store/gameStore.ts` - TanStack Store for client game state
- `apps/web/src/hooks/` - Custom hooks (useWebSocket, useGameState, etc.)

## WebSocket Protocol

**Client → Server Messages**
```typescript
{ type: "PING", nonce: string }
{ type: "REQUEST_STATE" }
{ type: "PLAY_CARD", cardId: string }
{ type: "PLACE_BID", bid: number }
{ type: "SET_READY", ready: boolean }
```

**Server → Client Messages**
```typescript
{ type: "WELCOME", gameId: string, playerId: string }
{ type: "STATE_FULL", state: ClientGameView }
{ type: "GAME_EVENT", event: GameEvent }
{ type: "TOKEN_REFRESH", token: string }
{ type: "PONG", nonce: string }
{ type: "ERROR", code: string, message: string }
```

## Bot Behavior

Bots are implemented in both `packages/domain/src/bots/` (AI logic) and `apps/server/src/bots/` (server coordination).
- Bots use deterministic decision-making based on round seed
- Bot actions are scheduled using setTimeout and triggered automatically
- Bots are treated as regular players in the game state

## Development Environment

### DevContainer (Recommended)
The project includes a full DevContainer setup with PostgreSQL, Redis, and Chrome for MCP testing.

**Services**:
- PostgreSQL (port 5432)
- Redis (port 6379) 
- Web client (port 5173)
- Backend server (port 4000)

**To use**: Open in VS Code with Remote-Containers extension or use `devcontainer` CLI.

### Local Development
Requires:
- Node 20+
- PNPM 9.1.1
- PostgreSQL (for integration tests)

## Deployment

**Production Stack**:
- Frontend: GitHub Pages (static build via GitHub Actions)
- Backend: Fly.io (PostgreSQL database included)
- Cost: ~$3/month

**Build for production**:
```bash
pnpm build
```

Frontend build output: `apps/web/dist/`
Backend runs directly from `apps/server/src/` with tsx/ts-node in production.

## Important Notes

- **No linting configured**: Lint scripts exist but are placeholders (`echo 'No lint configured'`)
- **Typescript strict mode**: Full type safety throughout codebase
- **No external state management**: Uses TanStack Store (no Redux/MobX)
- **No REST for game actions**: All real-time actions go through WebSocket
- **Events are immutable**: Never modify event log, only append
- **Sessions use JWT**: Player identity stored in JWT, validated on every WS message
- **RoomRegistry is in-memory**: Active games lost on server restart (can be restored from event log in future)

## Debugging Tips

1. **Check event log**: All game actions stored in `game_events` table - query by `game_id`
2. **Replay from events**: Use `replayGame()` in `packages/domain/src/engine/replay.ts`
3. **WebSocket debugging**: Browser console shows all WS messages (enable in DevTools)
4. **OpenTelemetry**: Metrics exposed at `/metrics` endpoint
5. **Server logs**: Structured JSON logs with context (game_id, player_id, etc.)

## Spec Documents

The `docs/` directory contains comprehensive technical specifications:
- `00 — IMPLEMENTATION_PLAN.md` - Overall project plan
- `02 — System Architecture Overview.md` - High-level architecture
- `04 — Event & Replay Model Specification.md` - Event sourcing details
- `05 — Networking & Protocol Specification.md` - HTTP/WS API contracts
- `06 — Database Schema & Persistence Specification.md` - Database design
- `0B - Local devcontainer environment.md` - DevContainer setup
- `0C - Deployments to flyio and github pages using github actions.md` - Deployment guides

Refer to these documents for detailed implementation requirements.
