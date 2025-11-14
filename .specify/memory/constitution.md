<!--
Sync Impact Report
Version change: 0.0.0 → 1.0.0
Modified principles:
- Principle slot 1 → Rulebook Fidelity & Single Engine Ownership
- Principle slot 2 → Deterministic Event Sourcing & Replay Guarantees
- Principle slot 3 → Trustless Protocol & Authenticated Interactions
- Principle slot 4 → Observability Without Leakage
- Principle slot 5 → Test-First Delivery & Regression Sealing
Added sections:
- Implementation Constraints & Stack Guardrails
- Delivery Workflow & Quality Gates
Removed sections:
- None
Templates requiring updates:
- ✅ .specify/templates/plan-template.md (Constitution Check replaced with concrete gates)
- ✅ .specify/templates/spec-template.md (User scenarios and success criteria tied to Principle V)
- ✅ .specify/templates/tasks-template.md (Story-grouped flow + regression + observability hooks)
Follow-up TODOs:
- None
-->
# El Dorado Constitution

## Core Principles

### Rulebook Fidelity & Single Engine Ownership
- All gameplay rules are implemented once inside `packages/domain` pure reducers that mirror `docs/01 — Game Design & Rules Specification.md`; server routes and clients may only call exported APIs and MUST never duplicate scoring or trick logic.
- Any change to bidding, deck handling, or scoring requires an accompanying update to the rulebook doc plus versioned changelog inside the domain package before UI or transport changes land.
- Runtime services (TanStack Start backend, WebSocket gateway, React client) act purely as orchestrators that validate inputs against the domain engine.
*Rationale: Keeps every surface aligned with a single authoritative rulebook and prevents divergent interpretations between engine, backend, bots, and UI.*

### Deterministic Event Sourcing & Replay Guarantees
- Every state transition emits an ordered event recorded in Postgres exactly as defined in `docs/04 — Event & Replay Model Specification.md`; no hidden mutable state is allowed outside the log.
- Randomness MUST derive from the session seed > round seed > deterministic PRNG pipeline so any replay using the same event log reproduces the game bit-for-bit, including bot choices.
- Regression debugging requires adding failing event logs to `/fixtures/regressions/` and wiring them into automated replay tests before shipping fixes.
*Rationale: Deterministic event sourcing is the only way to guarantee fairness, enable audits, and unblock fast debugging after production incidents.*

### Trustless Protocol & Authenticated Interactions
- HTTP and WebSocket endpoints defined in `docs/05 — Networking & Protocol Specification.md` treat every client message as adversarial: validation, rate limiting, and JWT checks MUST occur before a reducer mutates state.
- Only the server decides turn order, legal moves, forfeits, and reconnect handling; clients merely request actions and render authoritative state snapshots.
- Tokens, join codes, and player identities MUST be scoped per game, rotated on reconnect, and never logged verbatim.
*Rationale: A multiplayer betting-style game collapses if clients can forge turns or leak seats; the protocol must assume zero trust while keeping UX responsive.*

### Observability Without Leakage
- All processes emit structured OpenTelemetry logs, metrics, and traces per `docs/10 — Observability, Logging, Metrics.md`; no plaintext logs or ad-hoc console statements are permitted.
- Sensitive material (hands, deck contents, JWT payloads) is never recorded; instead, logs include event indices, seat IDs, and sanitized metadata so investigators can correlate without exposing secrets.
- Each feature ships explicit dashboards/alerts or extends existing ones so fairness regressions, latency spikes, and disconnect storms are caught before players report them.
*Rationale: Deterministic games still fail without insight—structured telemetry enables rapid incident response while protecting competitive integrity.*

### Test-First Delivery & Regression Sealing
- Test suites in `docs/11 — Testing, QA, & Validation Strategy.md` are mandatory gates: unit tests for every reducer, integration tests for HTTP+WS flows, replay determinism fixtures, and E2E coverage for core journeys.
- New work begins with failing tests or captured regression logs; implementation only proceeds once red tests exist and ends once CI proves deterministic replays and seed-based bots still behave.
- CI must block merges unless it runs lint, typecheck, unit, integration, and replay suites under identical seeds; local shortcuts require a documented waiver and follow-up automation.
*Rationale: Deterministic seeds make bugs reproducible—locking every change behind tests keeps gameplay trusted and lets small teams evolve fast without regressions.*

## Implementation Constraints & Stack Guardrails

- Tooling: `pnpm` workspaces, TypeScript 5.x, Vitest, and TanStack Start/Router/Query are the default stack; deviations demand a design note plus approval because cross-package typing is critical.
- Runtime shape: Apps live under `apps/server` (TanStack Start backend) and `apps/web` (React client); shared logic resides in `packages/domain` and `packages/*` libraries so every consumer compiles against one type system.
- Persistence: PostgreSQL stores the append-only `game_events` table, player stats, and summaries; no feature may introduce a second source of truth without a replication plan.
- Randomness & seeds: All randomness flows through the session/round seed pipeline; utilities wrapping RNG MUST live under `packages/domain/src/random` for reuse.
- Observability: OpenTelemetry exporters, JSON logs, and Prometheus-style metrics are required in every environment; local dev may down-scope sinks but not the structured format.

## Delivery Workflow & Quality Gates

1. **Constitution Check (Phase 0 gate)**
   - `Domain-first`: plans/specs identify the domain API surface that changes and reference rulebook sections before UI or protocol updates begin.
   - `Replay contract`: proposed events, payload shapes, and seeds are listed (or confirmed unchanged) so `/fixtures` and DB schemas remain replayable.
   - `Trustless wiring`: networking impacts describe validation, JWT scopes, flood limits, and reconnect handling; missing answers block planning.
   - `Observability + tests`: every change states which logs/metrics/traces and which test suites (unit/integration/replay/E2E) will prove compliance.
2. **Spec & Plan expectations**
   - Specs enumerate independently testable user stories with acceptance criteria tied to deterministic outputs and fairness guarantees.
   - Implementation plans map work to repo directories, ensuring all story slices preserve server authority and event log invariants.
3. **Task breakdown**
   - `/speckit.tasks` outputs stay grouped by user story with explicit file paths, mandated pre-implementation tests, and observability hooks where relevant.
4. **Review & merge**
   - Code reviews verify principles via checklists: domain package touched first, event log schemas versioned, auth enforced, telemetry & tests added.
   - Violations require a Complexity Tracking entry plus an owner + deadline to restore compliance.

## Governance

- **Authority**: This constitution supersedes other engineering practices; when conflicts arise, update downstream docs (`/docs`, templates, runbooks) to match this source.
- **Amendments**: Proposed changes require a written rationale referencing impacted principles, a migration/communication plan, and sign-off from gameplay + platform leads. Approved amendments update version + dates here and must mention downstream template changes in the sync report.
- **Versioning**: Semantic versioning applies—MAJOR for principle rewrites/removals, MINOR for new principles/sections, PATCH for clarifications. Change notes live in the Sync Impact Report.
- **Compliance reviews**: Each feature plan performs the Constitution Check; code reviewers confirm all principles plus governance items before merge. Release managers perform a quarterly audit sampling at least one feature per principle to ensure living compliance.
- **Incident response**: Bugs tied to constitutional violations trigger a retro documenting which gate failed and what automation/test/observability addition will prevent recurrence.

**Version**: 1.0.0 | **Ratified**: 2025-11-12 | **Last Amended**: 2025-11-12
