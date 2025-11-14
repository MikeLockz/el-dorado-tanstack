# 11 — Testing, QA, & Validation Strategy  
Version: 1.0  
Status: Final  
Last Updated: YYYY-MM-DD  
Owner: Engineering / QA  

---

# 1. Purpose

This document defines the complete **testing and quality assurance strategy** for **El Dorado**, the multiplayer trick-taking game, including:

- Unit tests (engine, reducers, utility functions)
- Integration tests (WS + HTTP flows)
- Replay determinism tests
- End-to-end (E2E) UI tests
- Load tests (bots)
- Chaos & resilience tests
- CI/CD workflow integration
- Test data / fixtures

The goal:  
**Absolute correctness, replay consistency, and a smooth user experience.**

---

# 2. Testing Principles

1. **The game engine must be 100% deterministic.**  
   All pure engine functions must behave identically under replay.

2. **Client behavior is untrusted but must be validated.**

3. **Every meaningful bug must be reproducible via event replay.**

4. **Bots must behave deterministically given the same seed.**

5. **All network flows tested with real WS + HTTP servers in integration tests.**

6. **CI must run the full suite on every commit.**

---

# 3. Test Categories & Coverage

Unit Tests
Integration Tests
End-to-End Tests
Load Tests
Chaos Tests
Replay & Determinism Tests
Database Tests

yaml
Copy code

---

# 4. Unit Tests (Jest + TS)

These cover all pure logic:

## 4.1 Game Engine

Test for each reducer:

- `startRound()`
- `dealCards()`
- `playCard()`
- `completeTrick()`
- `scoreRound()`
- `nextRound()`
- `completeGame()`

Test cases include:

- Following suit validation
- Trump break rules
- Illegal moves (leading trump too early)
- Tie resolution (duplicate decks)
- Fallback logic (forced lowest legal card)
- Trick winner logic

### Required Unit Tests

- `test_engine_playCard_followsSuit.ts`
- `test_engine_playCard_trumpBreak.ts`
- `test_engine_trickWinner_simple.ts`
- `test_engine_trickWinner_duplicateDeck.ts`
- `test_engine_scoreRound.ts`
- `test_engine_fullRound_10_to_1_cards.ts`
- `test_engine_bid_validation.ts`

---

## 4.2 Utility Functions

Test:

- Deterministic shuffle
- Seed hashing
- Card comparison logic
- Legal move determination
- PRNG correctness

---

## 4.3 Bot Logic

Bots must:

- Produce same bid every time under same seed
- Pick legal card every time
- Never cheat (access hidden info)
- Use correct fallback when forced

Tests:

- `test_bots_seeded_determinism.ts`
- `test_bots_followSuit.ts`
- `test_bots_avoidLeadingTrump.ts`
- `test_bots_endGameBehavior.ts`

---

# 5. Replay & Determinism Tests

Replay is critical for correctness.

## 5.1 Golden Game Tests

For each major scenario:

- Build a predefined event log (fixtures)
- Replay using engine
- Compare to expected final state

Test logs include:

- Simple 2-player game
- 4-player full game  
- Trump break scenario  
- Tie-breaking trick  
- Player disconnect + fallback play  
- Bot behavior  
- Multiple rounds  

## 5.2 Regression Replay

Every time a bug is found, capture its event log in `/fixtures/regressions/`.

CI must replay all regression logs on every commit.

---

# 6. Integration Tests

Use **Vitest** or Jest + Supertest + WS library.

## 6.1 HTTP + WS Flow

Simulate:

- Create room
- Join room
- Establish WS
- Send bids
- Play cards
- Score rounds
- Complete game

Ensure:

- Messages follow protocol spec
- GameState sync correct
- Invalid messages rejected
- Disconnected → turn forfeiture triggered
- Reconnect resumes state

---

## 6.2 Client Reconnection Tests

Simulate:

1. WS disconnect (network drop)
2. Reconnect
3. REQUEST_STATE
4. STATE_FULL matches expected

---

## 6.3 Spectator Tests

- Join as spectator
- Confirm no hand shown
- Confirm plays visible
- Confirm invalid actions rejected

---

# 7. End-to-End (E2E) Tests

Use Playwright or Cypress.

### E2E Scenarios

- Create → Join → Bid → Play → Score → Complete  
- 4 players (mix of bots + humans)
- Reload page mid-round → resumes correctly  
- Profile update flows  
- Stats update  
- Spectator joining a live game  
- Responsive UI layout on mobile size  

### Autofill Tests

Ensure simple mass games run without UI issues.

---

# 8. Load Tests (Bots)

Load testing uses test bots, not real UI.

## 8.1 Load Test Goals

- 100 concurrent games  
- 400–1000 WS connections  
- 1000–2000 events/s  
- No reducer slowdown  

## 8.2 Load Test Scripts

Using k6 or custom Node scripts:

- Spawn 100 bot-only games  
- Run full 10-round session  
- Measure total duration  
- Confirm determinism  

---

# 9. Chaos & Resilience Tests

Simulate failures:

- Kill WS connection randomly
- Drop packets
- Restart server during mid-game
- Kill DB temporarily (game must continue in-memory)
- Insert artificial latency  
- Crash during scoring → recover via replay

Ensure reconnection & recovery behavior works.

---

# 10. Database Tests

Test:

- game_events integrity  
- game_summaries creation  
- lifetime stats updating  
- Constraints  
- Unique indices  
- Query performance for game replay  

Use a temporary Postgres instance (`docker-compose`).

---

# 11. CI/CD Integration

Workflow:

on: [push, pull_request]

jobs:
lint:
typecheck:
unit-tests:
integration-tests:
replay-tests:
e2e-tests:
load-tests (nightly or weekly)

yaml
Copy code

Artifacts:
- Coverage reports  
- Replay mismatch diffs  
- Event logs for regressions  

Minimum coverage:  
**90%** for engine, **100%** for reducers.

---

# 12. Test Data & Fixtures

Directory:

/tests
/fixtures
/games
2p_simple.json
4p_trump_break.json
4p_disconnected_mid_trick.json
4p_duplicate_decks.json
/regressions
bug_2025_01_bid_off_by_one.json
bug_2025_03_trickNotEnding.json

yaml
Copy code

Fixtures contain event logs only.

---

# 13. Manual QA Procedures

## 13.1 Smoke Test Checklist

- Create room  
- Join room  
- Start game  
- Bid correctly  
- Play legal card  
- Lead trump (reject)  
- Disconnect → recon → fallback  
- Spectator view  
- Scoreboard accuracy  
- Final summary correct  

## 13.2 Mobile QA

- iOS Safari  
- Android Chrome  
- Small screens  
- Landscape rotation  

---

# 14. Release Checklist

Before production deployment:

- All unit tests pass  
- All integration tests pass  
- All replay tests pass  
- Load test passes thresholds  
- No regression logs failing  
- Manual QA and smoke tests complete  
- Observability dashboards green  

---

# 15. Compliance

This document covers QA for:

- 01-game-design.md  
- 03-domain-model.md  
- 04-event-replay.md  
- 05-protocol-spec.md  
- 08-bots.md  
- 09-client-architecture.md  

Any logic change must update test cases accordingly.

---

# End of Document