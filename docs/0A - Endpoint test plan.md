# 0A — Endpoint Test Plan
Version: 1.0  
Owner: Engineering  
Last Updated: YYYY-MM-DD  

---

## 0. Purpose

Guarantee every HTTP endpoint remains functional after any change by:

- Running fast, deterministic integration tests in CI and locally.
- Providing a reusable harness that new endpoints can plug into with minimal boilerplate.
- Enforcing both happy-path and representative failure-path coverage so regressions are caught early.

This plan complements:

- `00 — IMPLEMENTATION_PLAN.md` (Phases 3 & 10 requirements).
- `11 — Testing, QA, & Validation Strategy.md` (integration test mandate).

---

## 1. Test Harness Architecture

1. **In-process server spins**  
   - Export `createAppServer` (already done) and spin it up per test suite using Node’s `http.Server.listen(0)` to pick an ephemeral port.
   - Avoid OS-level port conflicts and privileged socket restrictions—keeps tests runnable without elevated permissions.

2. **Shared utilities (under `apps/server/tests/utils`)**  
   - `server.ts`: `startTestServer()` → starts server, returns `{ baseUrl, stop() }`. Handles retries if port binding fails.
   - `http.ts`: thin wrapper over `fetch` or `supertest` that auto-serializes JSON bodies, checks status codes, and returns typed payloads.
   - `factories.ts`: profile + payload builders so tests stay concise and deterministic.

3. **Runner configuration**  
   - Create a dedicated Vitest config (`vitest.http.config.ts`) scoped to HTTP suites for faster runs.
   - Enable `threads: true`, `maxWorkers: CPU_COUNT` to parallelize independent suites.

---

## 2. Suite Layout & Coverage

| File | Endpoints | Notes |
|------|-----------|-------|
| `tests/http/health.test.ts` | `GET /api/health` | Smoke check; run first to fail fast. |
| `tests/http/lobby.test.ts` | `POST /api/create-room`, `POST /api/join-by-code`, `POST /api/matchmake` | Covers happy paths + errors (`ROOM_FULL`, `INVALID_JOIN_CODE`). |
| _Future_ `tests/http/profile.test.ts` | `POST /api/update-profile`, etc. | Add as endpoints ship. |
| _Future_ `tests/http/stats.test.ts` | `GET /api/player-stats` | Example placeholder. |

Guidelines:

- Keep each file focused on one feature slice to maximize parallelism.
- Use helper factories to chain calls (e.g., create → join) without copy/paste.
- Assert both status codes and response schema (see §4).

---

## 3. Execution Workflow

1. **Local development**
   - Run `pnpm --filter @game/server test` to execute unit + HTTP suites.
   - For endpoint-only runs: `pnpm --filter @game/server test -- --config vitest.http.config.ts`.

2. **CI integration**
   - Add a pipeline step `server_http_tests` that runs the same command.
   - Cache installation + build artifacts so suites stay sub-minute.
   - Block merges on failures per doc 11 requirements.

3. **Watch mode (optional)**
   - Developers can run `vitest --watch --config vitest.http.config.ts` to iterate quickly on new endpoints.

---

## 4. Validation & Confidence

1. **Schema assertions**
   - Define lightweight Zod/TypeBox validators per response.  
   - Example: `expect(response).toMatchObject(CreateRoomSchema.parse(expected))`.

2. **Negative-path coverage**
   - Each suite must include at least one error-case assertion (e.g., duplicate join, malformed payload).
   - Ensures validation regressions surface immediately.

3. **Deterministic seeds**
   - Seed Math.random (if used) or rely on deterministic factories so tests produce stable IDs/join codes when asserted.

4. **Logging hygiene**
   - Suppress server console noise during tests (wrap `console.log` or set a env flag) to keep CI output readable.

---

## 5. Extending to Future Functionality

1. **WebSocket flows (Phase 4+)**
   - Extend `startTestServer` to return the bound `http.Server`.  
   - Use `ws` client to connect, send `PLAY_CARD` etc., and assert broadcast events.

2. **Game simulation**
   - Add higher-level helpers that run an entire round (create → join → bid → play).  
   - Align with `00 — IMPLEMENTATION_PLAN.md` §10 to cover full replayable scenarios.

3. **Load/perf hooks**
   - As endpoints grow, consider a perf smoke (parallel requests) to catch obvious slowdowns.

---

## 6. Deliverables Checklist

- [ ] `tests/utils/server.ts` + `http.ts` scaffolding.
- [ ] Vitest HTTP config + npm script (`"test:http": "vitest run --config vitest.http.config.ts"`).
- [ ] Health + lobby endpoint test suites with both success + failure paths.
- [ ] CI job executing the new suite.
- [ ] Documentation update (this file) referenced from `docs/11 — Testing, QA, & Validation Strategy.md`.

Once checked off, we can trust every PR to validate the lobby endpoints automatically, and extending coverage for future endpoints becomes a drop-in addition.  

---  
_End of document_  
