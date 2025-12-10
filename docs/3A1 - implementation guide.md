# Implementation Guide & Execution Order

> **Status Tracking:** This document is a living guide. As we progress, update the status badges (e.g., `[Pending]` -> `[In Progress]` -> `[Done]`) and add notes or links to specific commits/PRs.

This guide provides a step-by-step execution plan for the MCTS integration project. It is designed to allow parallel work streams where possible, while enforcing strict validation gates to ensure system stability.

## 🏁 Phase 0: The Contract (Compliance)

**Goal:** Establish the shared "truth" before writing logic.
**Docs:** `3B - Porting rules engine to python.md`

1.  **Create Fixtures** `[Pending]`
    *   **Task:** Create `fixtures/compliance_suite.json` with initial scenarios (valid moves, trick winning, following suit).
    *   **Commit:** `test(fixtures): add initial compliance suite for cross-language validation`

2.  **Verify TypeScript (The Reference)** `[Pending]`
    *   **Task:** Create `apps/server/src/tests/compliance.test.ts`.
    *   **Validation:** Run `pnpm test apps/server`. Must pass 100%.
    *   **Commit:** `test(server): add compliance test runner for typescript engine`

---

## 🏗️ Stream A: Python Engine (The Brain)

**Goal:** Build the AI service. Can be done in parallel with Stream B.
**Docs:** `3B`, `3D`, `3E`, `3G`

### Step A1: Python Boilerplate & Rules `[Pending]`
1.  **Setup:** Initialize `apps/mcts-ai` with `poetry` or `pip`, `Dockerfile`, and directory structure.
2.  **Model Gen:** Configure `datamodel-code-generator` to generate Pydantic models from TS interfaces.
3.  **Port Rules:** Implement `engine/cards.py`, `engine/rules.py`, `engine/state.py`.
4.  **Validate:** Implement `tests/test_compliance.py` in Python. **MUST pass all fixtures from Phase 0.**
5.  **Commit:** `feat(mcts): implement python rules engine and pass compliance tests`

### Step A2: MCTS Implementation `[Pending]`
1.  **Core:** Implement `engine/mcts.py` (Node, Search, Backprop).
2.  **Determinization:** Implement "Constraint-Based Determinization" to handle hidden info/void suits.
3.  **Validation:** Add scenario tests (e.g., "Find winning move in 1 step").
4.  **Commit:** `feat(mcts): implement MCTS algorithm with determinization`

### Step A3: Service & API `[Pending]`
1.  **API:** Implement FastAPI endpoints (`/bid`, `/play`) in `main.py`.
2.  **Timeout:** Implement "Early Exit" logic.
3.  **Docker:** Add to `docker-compose.yml`.
4.  **Validation:** `curl` the endpoint with a mock payload.
5.  **Commit:** `feat(mcts): add fastapi service and docker-compose config`

---

## 🛠️ Stream B: TypeScript Backend (The Client)

**Goal:** Prepare the server to consume the AI. Can be done in parallel with Stream A.
**Docs:** `3C`, `3F`

### Step B1: Async Refactor (Breaking Change) `[Pending]`
1.  **Interface:** Change `BotStrategy` to return `Promise`.
2.  **Update Implementation:** Update `BaselineBotStrategy` to be async.
3.  **Refactor Manager:** Update `BotManager` to use `await`.
4.  **Concurrency:** Add `version` check to `ServerRoom` and `BotManager` (Optimistic Concurrency).
5.  **Validation:** Run existing server tests. **MUST pass.**
6.  **Commit:** `refactor(server): make bot strategy async and add optimistic concurrency control`

### Step B2: Remote Strategy `[Pending]`
1.  **Client:** Implement `RemoteBotStrategy.ts` using `fetch`.
2.  **Config:** Ensure `RulesConfig` and `timeout_ms` are sent in payload.
3.  **Fallback:** Implement error handling to revert to `BaselineBotStrategy`.
4.  **Validation:** Unit test the serialization logic.
5.  **Commit:** `feat(server): add RemoteBotStrategy client`

---

## 🔗 Phase C: Integration & Verification

### Step C1: Wiring & E2E `[Pending]`

1.  **Wiring:**
    *   Update `server.ts` to instantiate `RemoteBotStrategy` if `MCTS_ENABLED=true`.
    *   Ensure `docker-compose` networks allow communication.
2.  **E2E Test:**
    *   Start full stack: `docker-compose up`.
    *   Create a game with 3 bots.
    *   Watch logs: Ensure TS sends requests -> Python calculates -> TS applies move.
3.  **Commit:** `feat(integration): enable mcts bot in server`

---

## 🚀 Phase D: Optimization (Post-MVP)

**Docs:** `3G`

### Step D1: Benchmark & Scale `[Pending]`

1.  **Benchmark:** Run `benchmarks/run_sims.py`.
2.  **Profile:** Identify hotspots.
3.  **Tune:** Optimize `determinize` or `game_sim`.
4.  **Scale:** Increase `replicas` in `docker-compose`.
