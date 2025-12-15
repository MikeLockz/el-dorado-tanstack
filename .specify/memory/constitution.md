<!--
Sync Impact Report:
- Version change: 0.0.0 -> 1.0.0 (Initial Ratification)
- Modified principles: Defined all principles (Spec-Driven, TanStack, Deterministic, Cost-Optimized, Testing)
- Added sections: Architecture & Deployment, Development Workflow
- Removed sections: None (Template instantiation)
- Templates requiring updates: ✅ None (Standard templates align with new principles)
- Follow-up: None
-->

# El Dorado TanStack Constitution

## Core Principles

### I. Spec-Driven Development
**No Implementation Without Specification**
Every feature, refactor, or complex fix must begin with a documented specification in `docs/` or `specs/`. We do not write code until the "What" and "Why" are clearly defined and approved. This ensures alignment, reduces rework, and leverages AI assistance effectively.

### II. Modern TanStack Architecture
**Type-Safe, Full-Stack Cohesion**
We leverage the full TanStack ecosystem (Router, Query, Store) to provide a seamless, type-safe experience across frontend and backend.
- **Frontend**: React 19+, TanStack Router, TanStack Query, Tailwind CSS.
- **State**: Client-side state via TanStack Store; Server state via TanStack Query.
- **Language**: TypeScript is mandatory and strict.

### III. Deterministic & Replayable Engine
**Purity is Paramout**
The game engine (`packages/domain`) must remain a pure, deterministic state machine based on Event Sourcing.
- **Rule**: Given the same initial state and sequence of events, the result MUST always be identical.
- **Replay**: All game sessions must be replayable for debugging and verification.
- **Isolation**: Game logic must never depend on system time, random seeds (unless injected), or I/O.

### IV. Cost-Optimized Sustainability
**Frugal Engineering (≤$5/month)**
Architecture decisions must prioritize low operational costs without sacrificing developer experience.
- **Hosting**: Static frontend (GitHub Pages), efficient backend (Fly.io).
- **Resources**: Optimize for low memory and CPU footprint. Avoid heavy "enterprise" infrastructure when simple solutions suffice.

### V. Comprehensive Testing Strategy
**Trust Through Verification**
Rapid iteration requires a safety net. Tests are not optional.
- **Unit**: Vitest for all logic, especially the deterministic engine.
- **Integration**: Server API and WebSocket flows.
- **E2E**: Playwright for critical user journeys (multiplayer flows).
- **Load**: Artillery for performance validation.

## Architecture & Deployment

### Monorepo Structure
We follow a strict monorepo layout to separate concerns while sharing types:
- `packages/domain`: Pure TypeScript game engine (Shared).
- `apps/server`: Node.js backend (API, WebSockets, DB).
- `apps/web`: React frontend (Vite, Static).
- `docs/`: The source of truth for all requirements.

### Infrastructure
- **Containerization**: Docker for consistency (DevContainer & Prod).
- **Database**: PostgreSQL (Persistence) + Redis (Pub/Sub & Cache).
- **Deployment**: Hybrid model—Frontend to CDN (GitHub Pages), Backend to PaaS (Fly.io).

## Development Workflow

### AI-Assisted Process
1.  **Spec**: Define the requirement.
2.  **Plan**: Break it down into tasks.
3.  **Code**: Use AI tools (Gemini, Claude) to implement against the spec.
4.  **Verify**: Run the full test suite (`pnpm test`).

### Quality Gates
- **Linting**: No lint warnings allowed.
- **Types**: Zero TypeScript errors.
- **Tests**: All tests must pass before merge.
- **Review**: Self-review or peer review against the constitution.

## Governance

### Amendments
This constitution represents the foundational rules of the project. Amendments require:
1.  A clear rationale documented in a PR.
2.  Verification that changes do not violate the core "Cost-Optimized" or "Deterministic" principles without extraordinary justification.
3.  Updates to all dependent templates and documentation.

### Compliance
All code, specifications, and architectural decisions must comply with these principles. Non-compliant code should be flagged in review and rejected until corrected.

**Version**: 1.0.0 | **Ratified**: 2025-12-15 | **Last Amended**: 2025-12-15