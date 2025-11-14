# El Dorado — Development Quickstart

This repository is a PNPM workspace with a TypeScript game engine (`packages/domain`), a Node backend (`apps/server`), and a Vite/TanStack client (`apps/web`).

## Prerequisites

- Node 20+
- PNPM `9.1.1` (run `pnpm install -g pnpm@9.1.1` if needed)
- Google Chrome (needed for Chrome MCP or browser-based testing)

Install dependencies once:

```bash
pnpm install
```

## Running both dev servers with hot reload

From the repo root, run:

```bash
pnpm dev
```

This launches both services concurrently:

- **Backend**: `pnpm --filter @game/server dev:watch` listening on `http://localhost:4000` with hot reload via `tsx watch`.
- **Client**: `pnpm --filter @game/web dev` (Vite) pointing at the backend via `VITE_API_URL=http://localhost:4000` and `VITE_WS_URL=ws://localhost:4000/ws`. Vite picks an available port starting at `5173` and reloads automatically.

Stop both by hitting `Ctrl+C` in the terminal.

## Running servers individually

If you prefer separate terminals:

```bash
# Terminal 1 — backend with CORS + websocket gateway
PORT=4000 pnpm --filter @game/server dev:watch

# Terminal 2 — frontend pointing at that backend
VITE_API_URL=http://localhost:4000 \
VITE_WS_URL=ws://localhost:4000/ws \
pnpm --filter @game/web dev -- --host 0.0.0.0 --port 5173
```

You can still hit the API directly with `curl http://localhost:4000/api/health` to verify the server is up.

## Tests & builds

- `pnpm --filter @game/web test` runs client tests (Vitest + JSDOM).
- `pnpm --filter @game/server test` runs server-side Vitest suites.
- `pnpm --filter @game/domain test` runs engine tests.
- `pnpm build` compiles all packages.

For any questions about the architecture or specs, see the documents in `docs/` starting with `00 — IMPLEMENTATION_PLAN.md`.
