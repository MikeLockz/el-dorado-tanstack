# 1C - Multiplayer E2E Artillery Tests
Version: 1.0  
Owner: Engineering  
Last Updated: 2025-11-23  
Status: Draft

---

## 0. Purpose

Define how we stress realistic multiplayer sessions using [Artillery](https://github.com/artilleryio/artillery). The suite must:

- Prove that multiple human personas can authenticate, join the same lobby, and progress through a full trick-taking round without race conditions.
- Produce repeatable load tests that run locally (devcontainer) and in CI without flake.
- Surface regressions in lobby flows (HTTP) and gameplay flows (WebSocket) before they reach end-users.

This document complements `05 — Networking & Protocol Specification.md` (transport contract) and `11 — Testing, QA, & Validation Strategy.md` (coverage mandate).

---

## 1. Scope & Success Criteria

1. **Shared-room orchestration**: Every virtual user (VU) joins the exact same room so card-play interactions are observable.
2. **Mixed protocol coverage**: Exercise both REST endpoints (`create-room`, `join-by-code`) and the `/ws` gateway in a single scenario.
3. **Deterministic personas**: Stable player profiles (name, avatar, color) so assertions can be deterministic.
4. **Configurable scale**: Able to run as a 4-player smoke test locally and scale to dozens of rooms for CI soak by changing phase parameters only.
5. **Action scripting**: Cover bidding, card play, and heartbeat (PING) to ensure server-side validation paths execute.
6. **Verification hooks**: Capture metrics/logs and provide manual spot-check steps to confirm success.

Non-goals: simulating bots (handled separately) or front-end UI rendering.

---

## 2. Scenario Architecture

### 2.1 Flow Overview

1. **Room bootstrap (single execution)**
   - `before` hook hits `POST /api/create-room` with `minPlayers=4`, stores `{ gameId, joinCode, hostToken }` in `context.shared`.
2. **Player onboarding (per VU)**
   - Each VU calls `POST /api/join-by-code` using the shared `joinCode`, captures its unique `playerToken`.
   - First VU (host) also retains `hostToken` for privileged actions (start game, sanity pings).
3. **WebSocket session**
   - Connect to `ws://localhost:4000/ws?gameId=<gameId>&token=<playerToken>`.
   - Wait for `WELCOME` then `STATE_FULL` payloads.
4. **Gameplay loop**
   - Execute scripted bids (ascending values) followed by deterministic `PLAY_CARD` messages.
   - Send `PING` every 5 seconds to maintain the socket.
5. **Tear-down**
   - Close sockets cleanly, emit custom metrics, and optionally hit `GET /api/game-summary/<gameId>` to assert completion.

### 2.2 Message Contracts

Refer to doc `05 — Networking & Protocol Specification.md` for full schema. Critical payloads used here:

- **Bid**: `{ "type": "BID", "value": 100 }`
- **Play**: `{ "type": "PLAY_CARD", "cardId": "d0:spades:A" }`
- **Ping**: `{ "type": "PING", "nonce": "<uuid>" }`

Server emits `WELCOME`, `STATE_FULL`, `GAME_EVENT`, and `PONG` which the script logs for debugging.

### 2.3 Auto-start Behavior

Gateway auto-starts a round once `minPlayers` are active (`maybeAutoStart` in `Gateway.ts`). Tests must ensure:

- All VUs connect before bids to avoid `ROUND_NOT_READY` errors.
- Host waits for `STATE_FULL.state.phase === "BIDDING"` before sending the first bid.

---

## 3. Implementation Requirements

### 3.1 Repository Layout

```
load-testing/
  artillery.config.yml         # Main scenario
  processor.js                 # Shared-room coordination logic
  personas.json                # Optional profile seed data
```

`load-testing` lives at repo root (sibling to `docs/`). Add it to `.gitignore` only if we store secrets; otherwise commit scripts so CI can run them.

### 3.2 Environment Variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `API_BASE_URL` | `http://localhost:4000` | REST requests |
| `WS_URL` | `ws://localhost:4000/ws` | Socket endpoint |
| `ROOM_MIN_PLAYERS` | `4` | Controls `create-room` payload |
| `ARTILLERY_RECORD_OUTPUT` | `false` | Enables JSON result export |

Expose them through `config.variables` in Artillery so we can override via CLI (e.g., `ARTILLERY_RECORD_OUTPUT=true artillery run ...`).

### 3.3 Scenario Snippet

```yaml
config:
  target: "{{ $env.API_BASE_URL || 'http://localhost:4000' }}"
  phases:
    - duration: 60
      arrivalCount: 4
      name: "smoke-4-players"
  processor: "./processor.js"
  engines:
    ws:
      maxRedirects: 0
scenarios:
  - name: multiplayer-room
    weight: 1
    flow:
      - function: "createRoomOnce"
      - post:
          url: "/api/join-by-code"
          json:
            joinCode: "{{ $shared.joinCode }}"
            displayName: "{{ player.displayName }}"
            avatarSeed: "{{ player.avatarSeed }}"
            color: "{{ player.color }}"
          capture:
            json: "playerToken"
            as: "playerToken"
          afterResponse: "verifyJoin"
      - function: "connectWebSocket"
      - think: 2
      - function: "playScriptedRound"
      - think: 1
      - function: "closeSocket"
```

### 3.4 Processor API

Key helper functions implemented in `processor.js`:

```js
const WebSocket = require('ws');
const { v4: uuid } = require('uuid');

module.exports = {
  createRoomOnce,
  verifyJoin,
  connectWebSocket,
  playScriptedRound,
  closeSocket,
};

async function createRoomOnce(context, events, done) {
  if (context.shared.gameId) return done();
  const res = await context.http.request({
    method: 'POST',
    path: '/api/create-room',
    json: buildHostProfile(context.vars.hostIndex || 0),
  });
  const body = await res.json();
  context.shared.gameId = body.gameId;
  context.shared.joinCode = body.joinCode;
  context.shared.hostToken = body.playerToken;
  events.emit('log', `Room ${body.gameId} created (${body.joinCode})`);
  return done();
}

function connectWebSocket(context, events, done) {
  const url = new URL(process.env.WS_URL || 'ws://localhost:4000/ws');
  url.searchParams.set('gameId', context.shared.gameId);
  url.searchParams.set('token', context.vars.playerToken);
  const socket = new WebSocket(url);
  context.vars.socket = socket;
  socket.on('open', () => events.emit('log', `WS open ${context.shared.gameId}`));
  socket.on('message', (msg) => events.emit('log', `WS message ${msg}`));
  socket.on('error', (err) => events.emit('error', err));
  socket.on('close', () => events.emit('log', 'WS closed'));
  return done();
}
```

`playScriptedRound` should:

1. Wait for `STATE_FULL` where `state.phase === 'BIDDING'`.
2. Send a deterministic bid from the VU's seat index.
3. After the round enters `PLAYING`, send one `PLAY_CARD` per VU using cards pulled from `state.roundState.trickInProgress` to avoid invalid plays.

Use promises + timeouts to avoid blocking Artillery’s event loop.

### 3.5 Assertions & Guards

- Assert every HTTP response status matches expectation; fail fast via `afterResponse` hook.
- For WebSockets, track `WELCOME` receipt per VU and throw if not received within 3 seconds.
- Capture final `STATE_FULL.state.phase` and assert it reaches `PLAYING` or `COMPLETED` before disconnecting.

---

## 4. Execution Workflow

### 4.1 Local Smoke Test

```bash
# 1. Ensure backend is running
pnpm dev

# 2. Install Artillery globally (once)
npm install -g artillery

# 3. Run the multiplayer scenario
cd load-testing
artillery run artillery.config.yml --output results.json
```

Expected output: `Scenario counts: multiplayer-room 4 (100.0%)` with zero failed requests/messages. Inspect `results.json` if `ARTILLERY_RECORD_OUTPUT=true`.

### 4.2 Coordinated CI Run

- Add a `pnpm artillery:test` script which invokes `artillery run ... --output ./test-results/artillery.json`.
- CI job spins up the dev stack (`pnpm dev:test-stack`) before running Artillery against `http://127.0.0.1:4000`.
- Archive `artillery.json` as a build artifact for traceability.

### 4.3 Scaling Up

Modify `phases` to run multiple staggered rooms:

```yaml
phases:
  - name: warmup
    duration: 30
    arrivalRate: 2  # rooms/minute
  - name: load
    duration: 120
    arrivalRate: 6
```

Expose `ROOMS_PER_MINUTE` via env to keep CI config declarative.

---

## 5. Manual Verification Checklist

1. **Server logs** (`pnpm --filter @game/server dev:watch`)
   - Confirm `game created`, `ws connected`, and `card played` logs for each player.
2. **OpenTelemetry traces**
   - Look for `ws.message` spans tagged with `BID` and `PLAY_CARD` for the test `gameId`.
3. **Runtime API spot-check**
   - `curl "http://localhost:4000/api/game-summary/<gameId>" | jq` should return the players used by Artillery.
4. **Event count sanity**
   - Number of `GAME_EVENT` messages equals cards played (12 for 4 players * 3 tricks in the scripted round).
5. **Artifacts**
   - Ensure `results.json` contains `errors: []` and `latency` percentiles below 100 ms for HTTP calls.

If any step fails, keep the `artillery.json` artifact and server logs for debugging before re-running.

---

## 6. Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Race conditions when rooms auto-start | Delay bids until all `STATE_FULL` snapshots show `phase === BIDDING` |
| Token expiry during long tests | Handle `TOKEN_REFRESH` messages and update `context.vars.playerToken` |
| Deterministic card choices causing invalid plays | Derive next playable card from latest state snapshot rather than a fixed deck order |
| CI port conflicts | Bind backend to `PORT=4000` inside job, expose via `target` env |

---

## 7. Future Enhancements

1. **Replay validation**: After each run, download `gameId` event log and replay using `packages/domain` to ensure determinism.
2. **Bot mixing**: Allow a subset of seats to be bots by hitting `POST /api/matchmake` with `botMode=true` query.
3. **Chaos toggles**: Introduce packet delay or drop via Artillery’s `plugins.expect` to test reconnect paths.
4. **Parameterized card scripts**: Load card orders from fixtures (`fixtures/regressions/*.json`) to reproduce historical bugs at scale.

---

_End of document_
