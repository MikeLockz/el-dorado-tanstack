# 12 — Implementation Roadmap & Milestones  
Version: 1.0  
Status: Final  
Last Updated: YYYY-MM-DD  
Owner: Engineering / Product  

---

# 1. Purpose

This roadmap defines the **end-to-end implementation plan** for building the entire multiplayer trick-taking card game.  
It outlines:

- Development phases
- Priorities
- Task breakdowns
- Estimated timelines
- Dependencies between subsystems
- Stretch goals and future enhancements

The roadmap is intentionally detailed and implementation-oriented.  
It assumes **1–2 senior engineers** working in parallel.

---

# 2. Guiding Principles

1. **Start with correctness, not optimization.**  
2. **Pure game engine first, UI last.**  
3. **One source of truth: event log.**  
4. **Server authoritative—client is a view layer only.**  
5. **Everything deterministic.**  
6. **Incremental deployments.**  
7. **Bots must work from day one of playtesting.**  

---

# 3. Phase Breakdown (High-Level)

Phase 0 — Project Setup
Phase 1 — Pure Game Engine
Phase 2 — Backend Infrastructure
Phase 3 — WebSocket Protocol + Rooms
Phase 4 — Client UI & Sync
Phase 5 — Persistence & Stats
Phase 6 — Bots
Phase 7 — Observability + QA
Phase 8 — Polish, Hardening, Production

yaml
Copy code

Approximate timeline: **4–6 weeks** of part-time engineering.

---

# 4. Phase 0 — Monorepo Setup (Day 1–2)

### Goals
- Single codebase with backend + frontend + domain logic shared.
- Local environment standardized.

### Tasks
- Create monorepo using PNPM workspaces:
/apps/web
/apps/server
/packages/domain
/packages/shared
/packages/config

markdown
Copy code
- Setup TypeScript project references.
- Install TanStack Start in server.
- Install React/TanStack Router in web app.
- Setup ESLint + Prettier.
- Setup Fly.io config (Dockerfile + fly.toml).
- Setup `.env` structure and example file.
- Configure local Postgres via docker-compose.

### Deliverables
- `pnpm dev` runs server + client
- Basic homepage available
- CI pipeline with lint/typecheck

---

# 5. Phase 1 — Pure Game Engine (Week 1)

### Goals
- Fully working deterministic game engine.
- No network or UI yet.
- 100% test coverage.

### Tasks
- Define all domain types (03-domain-model.md).
- Implement reducers:
- createGame
- startRound
- dealCards
- revealTrump
- applyBid
- playCard
- completeTrick
- scoreRound
- completeGame
- Implement seeded shuffle.
- Implement trick resolution.
- Implement trump break rules.
- Implement follow-suit logic.
- Implement fallback card selection for forfeitures.
- Unit test every function exhaustively.

### Deliverables
- Pass all engine tests.
- Full round test from 10 → 1 cards.
- Deterministic replay on fixture logs.

---

# 6. Phase 2 — Backend Infrastructure (Week 2)

### Goals
- Minimal TanStack Start server with basic HTTP endpoints.
- Game rooms exist and can hold players.

### Tasks
- Implement RoomRegistry (in-memory).
- Implement game lifecycle:
- create room
- join room
- join by code
- matchmaking stub
- Implement JWT creation/validation.
- HTTP endpoints for create/join/matchmake.
- Server logging (info/debug).
- Implement PlayerInGame model server-side.

### Deliverables
- Can create/join rooms via HTTP.
- RoomRegistry displays active rooms in logs.

---

# 7. Phase 3 — WebSocket Protocol + Rooms (Week 3)

### Goals
- Real server-authoritative networking fully functional.
- Players can join, see state, take turns.

### Tasks
- Implement WS Gateway per 05-protocol-spec.md.
- Implement message validation.
- Implement STATE_FULL broadcasting.
- Implement client → server actions:
- PLAY_CARD
- BID
- REQUEST_STATE
- UPDATE_PROFILE
- Implement forced turn forfeiture (60s rule).
- Implement disconnect → reconnect flow.
- Implement spectator mode.
- Hook WS to RoomRegistry + Engine reducers.

### Deliverables
- Two browser tabs can join & play a full round.
- Logs show eventIndex increments and state updates.

---

# 8. Phase 4 — Client UI & Game Sync (Week 4)

### Goals
- Playable UI in mobile portrait.
- State synced via WebSocket.

### Tasks
- Routing:
- `/`
- `/join`
- `/new`
- `/game/:id`
- Local game store (Zustand or TanStack Store).
- WS connection hook.
- Client token persistence in localStorage.
- UI components:
- PlayerList
- TrickArea
- Hand
- Bidding modal
- Scoreboard
- Trump indicator
- Disable illegal moves client-side.
- Implement animations for played cards (minimal).

### Deliverables
- Fully playable alpha UI.
- Manual QA: complete game playable on phone.

---

# 9. Phase 5 — Persistence & Stats (Week 5)

### Goals
- Postgres integration.
- Lifetime stats, profile persistence, game summaries.

### Tasks
- Build schema from 06-database-schema.md.
- Implement DB adapter (Drizzle ORM).
- Write game_events insertion.
- Implement game summary creation on GAME_COMPLETED.
- Implement player_lifetime_stats updater.
- Add player stats endpoint `/api/player-stats`.
- Add profile persistence in DB.

### Deliverables
- Summary page loads correct game summary.
- Lifetime stats update correctly for repeated games.
- Replay from DB event log matches end-state.

---

# 10. Phase 6 — Bots (Week 5–6)

### Goals
- Deterministic bots playable in both matchmaking and testing.

### Tasks
- Implement BotManager.
- Implement BotStrategy (bidding + play-card).
- Connect bots to RoomRegistry game loop.
- Bot PRNG seeding logic.
- Add “Fill with bots” mode for dev/testing.

### Deliverables
- Full 4-bot games run end-to-end with no user input.
- Replaying bot events yields identical behavior.

---

# 11. Phase 7 — Observability & QA (Week 6–7)

### Goals
- Complete visibility into gameplay, errors, and performance.

### Tasks
- Implement OpenTelemetry:
- trace exporting
- log exporter
- metrics exporter
- Add dashboards (Grafana/Honeycomb).
- Add error reporting pipeline.
- Implement engine invariant checks.
- Add load testing scripts (k6 or Node bots).
- Add replay diffing tool for failing tests.

### Deliverables
- Dashboards showing WS message rate, active rooms, errors.
- Load test: 100+ concurrent games.
- Zero “lost games” under normal load.

---

# 12. Phase 8 — Polish, Hardening & Production Release

### Goals
- Clean UX, reliable backend, production-robust deployment.

### Tasks
- UI polish (scores, transitions, animations).
- Comprehensive E2E test suite.
- Graceful room shutdown logic.
- Spectator UI enhancements.
- Improve mobile responsiveness.
- Rate-limit protection & spam detection.
- Security hardening:
- sanitize profile field inputs
- JWT expiry refresh cycle
- WS message throttling
- Production config for Fly.io (scale count 1–2).
- Backup & restore tests for DB.

### Deliverables
- Full production release
- Stable multiplayer support
- Replay viewer (future milestone)
- Admin/debug panel

---

# 13. Stretch Goals (Post-MVP)

These are future enhancements not needed for launch.

## Gameplay Features
- Replay viewer UI
- Tutorials / guided mode
- Chat (text or emoji)
- “Knock” or “Nudge” UX for waiting players

## Advanced Bots
- Defensive AI
- Difficulty tiers
- Predictive learning

## Social Features
- Friends list
- Avatars
- Player ratings (Elo-like)

## Large-Scale
- Multi-region rooms
- Room persistence across deploys
- Horizontal scaling with Redis

## Visual Enhancements
- 2D/3D animations
- Sound design
- Theming & custom decks

---

# 14. Risk Assessment

| Risk                          | Mitigation                                    |
|-------------------------------|-----------------------------------------------|
| Server crash mid-game         | Replay + restore engine state                 |
| WS disconnect storms          | Backoff, reconnect, REQUEST_STATE             |
| Bots stuck in illegal move    | Full engine validation + fallback logic       |
| Race conditions               | Single-threaded RoomRegistry                 |
| DB latency or downtime        | Continue game in-memory, flush later         |
| Replay mismatch bug           | Golden tests, regression suite               |

---

# 15. Success Criteria

1. Players can play full games with no bugs.
2. Replays perfectly match engine logic.
3. Bots produce consistent behavior and no illegal actions.
4. UI performs smoothly on mobile devices.
5. Observability dashboards show system health clearly.
6. Load tests confirm stability up to dozens of concurrent games.
