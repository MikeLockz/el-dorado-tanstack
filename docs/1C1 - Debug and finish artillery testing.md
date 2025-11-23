# 1C1 — Debug and Finish Artillery Testing

This document captures the step‑by‑step plan to debug and complete the multiplayer Artillery test. The scenarios **must** exercise the full game rules exactly as used in production — no shortcuts, no relaxed or approximate logic.

## Ground Rules

- Goal: `pnpm artillery:test` should complete successfully (no failed VUs) while exercising **full, correct, multi‑player game behavior** against the backend.
- Every Artillery scenario must:
  - Respect all game rules: bidding, trick taking, following suit, trump, scoring, round and game completion.
  - Play the correct number of rounds, tricks, and cards per player, in the correct order.
  - Use the same phases and transitions as real games.
- We **can** drive the flow purely from the backend (like integration tests), but the behavior must be identical to real‑world usage with the web client.
- Existing unrelated failures (e.g. `/api/player-stats` 404 in `stats.test.ts`) are **out of scope** for this task.

---

## Step 1 — Confirm Server, Routing, and Logging Coverage

**1.1. Start the dev server**

- In terminal A:

  ```bash
  cd /workspace
  pnpm dev
  ```

**1.2. Run Artillery and watch both logs and traces**

- In terminal B:

  ```bash
  cd /workspace
  ARTILLERY_PHASE_DURATION=60 pnpm artillery:test
  ```

- During the run, verify (in the server terminal and tracing backend):
  - HTTP logs/spans for `/api/create-room`, `/api/join-by-code`, and any `/api/game/*` endpoints.
  - WebSocket logs / OTEL spans (`ws.message`, `ws-gateway`, `event-log`).
  - Domain/phase transitions, trick resolution, round completion, and final game completion.

**1.3. Check logging and tracing coverage**

- From the logs and spans, confirm that the following are **all** observed for each game:
  - Room creation and configuration.
  - Each player joining/leaving.
  - Bidding start, each BID message, and bidding completion.
  - Every PLAY_CARD message with gameId, playerId, card, round index, and trick index.
  - Trick winners, round completion, and game completion with scores.
- If any of these lifecycle events are **not** logged or traced:
  - Add structured logs and/or OTEL spans in the relevant server modules (HTTP handlers, WS gateway, domain event handlers) so that:
    - Each BID and PLAY_CARD has a clear log line and span with identifying attributes.
    - Each phase transition, trick completion, round completion, and game completion is explicitly logged.

**If no logs appear in the server terminal:**

- Likely `API_BASE_URL` / `WS_URL` mismatch, or the server is not actually running.
- Actions:

  - Check environment variables (`API_BASE_URL`, `WS_URL`).
  - Verify connectivity:

    ```bash
    curl -v http://localhost:4000/api/health || curl -v http://localhost:4000
    ```

  - Fix server startup or URL mismatch, then re‑run `pnpm artillery:test`.

**If logs and traces appear but Artillery still times out:**

- Move on to **Step 2**.

---

## Step 2 — Treat `game-flow` Integration Test as Canonical

`tests/integration/game-flow.test.ts` is the **authoritative reference** for a complete, deterministic game that respects all rules. The Artillery flow must follow the same protocol.

**2.1. Extract the canonical flow from `game-flow.test.ts`**

- Open `tests/integration/game-flow.test.ts` and document:
  - HTTP endpoints and payloads:
    - How rooms are created (minPlayers, roundCount, and any game settings).
    - How players join (host vs guests, join code usage).
  - WebSocket lifecycle:
    - Connection URL (path + query string, including `gameId` and token).
    - Message types and order: `BID`, `PLAY_CARD`, and any control messages like `READY`, `START_GAME`, `START_ROUND`, etc.
  - Domain flow:
    - How bids are chosen (strategy, ordering, constraints).
    - How cards are chosen and played for each trick, per player.
    - How round and game completion are detected and asserted.
- Summarize this “canonical sequence” in a short section at the top of this doc (or a linked helper doc) for quick comparison.

**2.2. Compare `load-testing/processor.js` to the canonical flow**

- Open `load-testing/processor.js` and verify:
  - HTTP calls use exactly the same endpoints, parameters, and ordering as `game-flow.test.ts`.
  - WebSocket messages follow the same types and order as the integration test (no missing control messages, no extra approximate ones).
  - Wait conditions and assertions align with the canonical phases, rounds, and trick counts, not with any "best effort" checks.

**2.3. Refactor `processor.js` to use shared deterministic helpers**

- Extract shared helpers for bidding and card play (if not already present) into a reusable module (e.g. `tests/utils/gameFlowHelpers.ts` or a domain helper in `packages/domain`).
- Update both:
  - `tests/integration/game-flow.test.ts`, and
  - `load-testing/processor.js`
    to call the **same** deterministic helpers for:
  - Generating bids.
  - Selecting legal cards to play each trick.
  - Waiting for phase and state transitions.
- This ensures any future change to domain rules is reflected in both integration tests and Artillery without divergence.

**2.4. Re-run the full Artillery scenario**

- Run:

  ```bash
  ARTILLERY_PHASE_DURATION=60 pnpm artillery:test
  ```

- If the scenario completes with 0 errors, keep going with decomposition in Step 3 to add smaller scenarios for easier debugging and CI.
- If timeouts or errors remain, proceed to Step 3 to break the flow into strict, smaller scenarios while keeping the exact rules.

---

## Step 3 — Decompose into Strict, Rule-Correct Scenarios

We split the full end‑to‑end game into smaller, composable scenarios. Each scenario still obeys **all** rules; the decomposition is purely for debuggability and CI ergonomics.

### 3.1. Scenario A — Single-Player Initial State (Ruleful Handshake)

**Goal:** Prove a single player can create a correctly configured room, join, connect WS, and receive a complete, rule‑consistent initial state.

- In `load-testing/artillery.config.yml`, add/adjust a `single-player-initial-state` scenario:
  - Flow:
    - `assignPersona` (host persona).
    - `createRoomOnce` using canonical settings from `game-flow.test.ts` (same deck config, `roomMinPlayers`, `roomRoundCount`, etc.).
    - `joinRoom` as host.
    - `connectWebSocket`.
    - Wait for an initial `STATE_FULL` (or equivalent) that shows:
      - Correct phase (e.g. lobby or initial phase).
      - Correct hand sizes and deck state.
      - Rule invariants satisfied (no impossible state).
    - Clean disconnect.
- Logs and spans:
  - Log room creation, host join, WS connect, and initial state reception.
  - Ensure OTEL spans exist for the HTTP calls and WS handshake.

If this fails, focus on connectivity, auth, and initial state assembly until it passes reliably.

### 3.2. Scenario B — Full Bidding Phase (All Players, No Shortcuts)

**Goal:** Exercise the complete, correct bidding phase for N players, ending in a valid `biddingComplete` state.

- Add/adjust a `bidding-phase-complete` scenario in `artillery.config.yml`:
  - Use host + (N−1) guests (e.g. 4 total players matching the canonical game).
  - Flow:
    - `assignPersona` for each VU.
    - Host runs `createRoomOnce` with canonical settings (including `roomMinPlayers` and rounds).
    - Guests run `joinRoom` using the join code from the host.
    - All players `connectWebSocket`.
    - Wait until phase is exactly `BIDDING`.
    - Invoke the shared deterministic bidding helper (from Step 2) so that:
      - Each player submits a legal bid based on their hand.
      - Any domain constraints (e.g. last bidder cannot make total bids == tricks) are obeyed.
    - Wait until `round.biddingComplete === true` and all players have bids.
    - Disconnect (no cards played in this scenario).
- Logs and spans:
  - Log `bidding_phase_started`, each `player_bid_placed`, and `bidding_phase_completed`.
  - Ensure `ws.message` spans for `BID` and any associated domain spans are present.

### 3.3. Scenario C — Single Round, All Tricks (Strict Card Play)

**Goal:** After bidding completes, play a full round under exact rules: every trick, every card, correct leader and winner logic.

- Add a `round-complete` scenario:
  - Reuse flow from Scenario B up to `biddingComplete === true`.
  - Then:
    - Use the shared deterministic play helper from Step 2 to:
      - Lead each trick with the correct player.
      - Enforce following suit when possible; otherwise play allowed cards.
      - Determine trick winner and next leader according to domain rules.
    - Continue until the round’s hands are exhausted or the domain marks the round as complete.
    - Wait for round completion state (correct phase and per‑round scores).
  - Disconnect after the round (this scenario stops before multi‑round logic).
- Logs and spans:
  - Log each PLAY_CARD with `gameId`, `playerId`, `roundIndex`, `trickIndex`, and card ID.
  - Log `trick_resolved` and `round_completed` events.
  - Check that OTEL spans reflect each trick and round resolution.

### 3.4. Scenario D — Full Game Completion (All Rounds, All Tricks)

**Goal:** Run the full multi‑round game exactly as in production, start to finish.

- Add a `full-game-complete` scenario:
  - Builds on Scenario C, but does **not** stop after the first round.
  - Flow:
    - After each `round_completed`, wait for the next round’s `BIDDING` phase.
    - Repeat deterministic bidding and card play helpers for each round.
    - Continue until the configured number of rounds is reached and the game is marked complete by the server.
    - Assert final game completion state and final scores are present and internally consistent.
- Logs and spans:
  - Log a `game_completed` event with final scores and per‑player stats.
  - Ensure one or more top‑level OTEL spans represent the full game lifecycle.

Once A → B → C → D are all solid, the full behavior is covered by multiple, easier‑to‑debug scenarios.

---

## Step 4 — Keep Tests, Artillery, and Domain in Lockstep

**4.1. Scenario twins in integration tests**

- For each scenario (A–D), ensure there is a corresponding deterministic test:
  - Either an existing test already matches it, or
  - Add a small integration test (e.g. in `tests/integration/`) that executes the same flow using the shared helpers.

**4.2. Single-sourced rule logic**

- All bidding and card‑play decisions must come from shared helpers and/or domain utilities, **not** copied or approximated logic inside `processor.js`.
- Any rule change should require changes in one place (the helpers/domain), after which:
  - Integration tests, and
  - Artillery scenarios
    naturally adopt the new behavior.

**4.3. Protocol fidelity with real clients**

- Periodically capture browser WS traffic for a real multiplayer game and compare:
  - Message types, payload shapes, and ordering vs.
    - `game-flow.test.ts` usage and
    - `processor.js` usage.
- If any message type appears in browser flows but not in tests/Artillery, decide whether:
  - The backend should be decoupled from that UI‑specific detail, or
  - The tests and Artillery should be updated to include it.

---

## Step 5 — Diagnostics, Output Capture, and Documentation

**5.1. Strengthen `processor.js` diagnostics**

- Around each important `waitForCondition` or phase change, add logs that include:
  - What condition is being waited on (human‑readable string).
  - Key state summary (phase, roundIndex, trickIndex, bids so far, cards remaining per hand).
- On timeout or error:
  - Log the last known snapshot of game state.
  - Include gameId, playerId (if applicable), and scenario name.

**5.2. Ensure Artillery output is recorded**

- Honor `ARTILLERY_RECORD_OUTPUT` by writing JSON to `test-results/artillery.json` (or similar), including:
  - Scenario name.
  - Game IDs, players.
  - Any failure/timeout details and final state snapshot.

**5.3. Lock in Artillery configuration**

- In `load-testing/artillery.config.yml`:
  - Use explicit, conservative defaults for the smoke scenarios (A–C):
    - `phaseDuration: 60` seconds or similar.
    - `arrivalCount` aligned with room size and scenario goals.
    - Explicit `roomMinPlayers` and `roomRoundCount` matching canonical settings.
  - Add comments explaining how env vars like `ARTILLERY_PHASE_DURATION` and `ARTILLERY_ARRIVAL_COUNT` influence load.

**5.4. Document how to run and interpret the tests**

- In `README.md` or a dedicated load‑testing doc, describe:

  - How to run locally:

    ```bash
    pnpm dev
    pnpm artillery:test
    ```

  - How to run specific scenarios (e.g. `pnpm artillery:test --scenario round-complete`).
  - What “success” means:
    - All VUs complete with no errors.
    - Logs and traces show full rule‑correct bidding and card play.
  - How to adjust load using env vars.

**5.5. CI integration**

- Add a CI job that runs at least the lighter scenarios (A–C) on each PR.
- Optionally run the `full-game-complete` scenario on a schedule or behind a flag if runtime is long.

---

## Summary

This updated plan enforces strict adherence to the full game rules in all Artillery scenarios. The flow is broken into smaller, fully rule‑correct scenarios (initial state, full bidding, full round, full game) that are easier to debug and maintain. Logs and OTEL traces are treated as first‑class signals: every important action and transition should be visible in both logs and spans, making it straightforward to diagnose timeouts or protocol mismatches and to keep Artillery, integration tests, and domain logic in lockstep.
