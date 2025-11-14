# 10 — Observability, Logging, Metrics & Tracing Specification  
Version: 1.0  
Status: Final  
Last Updated: YYYY-MM-DD  
Owner: Platform / Infrastructure Engineering  

---

# 1. Purpose

This document defines the **observability architecture** for **El Dorado**, the multiplayer card game backend.  
It specifies:

- Structured logging format  
- Application metrics  
- Distributed tracing  
- Error reporting  
- Performance monitoring  
- Local and production configurations  
- How observability ties into gameplay debugging, replay integrity, and bot analysis  

All observability is implemented using **OpenTelemetry**, with optional sinks such as:

- Console (local dev)
- Fly.io log streams
- Grafana Cloud / Prometheus / OTLP collector
- Honeycomb / Datadog (optional)

---

# 2. Observability Principles

1. **Everything is structured**  
   Logs are JSON, not text.

2. **No PII**  
   Player display names and profile fields are not logged unless required for debugging, and are sanitized.

3. **No hidden state**  
   Errors or invalid events must be fully logged with eventIndex and playerId.

4. **Correlatable via trace + span IDs**  
   Every HTTP call and WS message must belong to a trace.

5. **Zero-impact to game fairness**  
   Observability must never expose sensitive game state such as player hands.

6. **Reproducibility**  
   Logs + events must enable full replay for debugging.

---

# 3. Logging Specification

All logs are JSON objects with the following fields:

{
"timestamp": "...",
"level": "debug|info|warn|error",
"message": "short summary",
"gameId": "<uuid>|null",
"playerId": "<uuid>|null",
"eventIndex": "<number>|null",
"context": { ... }, // custom attributes
"traceId": "...",
"spanId": "..."
}

yaml
Copy code

### 3.1 Required Logging Fields

| Field        | Description                                       |
|--------------|---------------------------------------------------|
| gameId       | Present if event relates to a specific game       |
| playerId     | Present if tied to a player action                |
| eventIndex   | Present when logging reducer or event emission    |
| context      | Extra metadata (no secrets, no full game state)   |

### 3.2 Sensitive Data Never Logged

- Full player hands  
- Deck contents  
- Full GameState snapshots  
- Authentication tokens  
- JWT payloads  
- Player profile fields except sanitized displayName  

### 3.3 Log Levels

- `debug` — reducer internals, for dev mode only  
- `info` — game lifecycle, connections, events  
- `warn` — invalid actions, recoverable errors  
- `error` — crashes, engine assertion failures, DB issues  

---

# 4. Log Events to Capture

## 4.1 Connection Lifecycle

- Client connected (gameId, playerId)
- Client disconnected
- Reconnect success
- Reconnect failure
- Token refresh issued

## 4.2 HTTP API

For each request:
- Method + URL
- PlayerId (if auth)
- Status code
- Latency
- Error context

## 4.3 WebSocket Messages

For incoming messages:
- Type
- Validation result
- Rejection reason (if any)

For outgoing state:
- STATE_FULL (only log metadata)
- GAME_EVENT (log eventIndex + type only)

## 4.4 Engine Reducers

Log:
- Event type applied
- Result of reducer state checks
- Invalid transitions (error)

## 4.5 Persistence

- New event inserted (eventIndex)
- Event log flush OK / ERROR
- Game summary inserted successfully

---

# 5. Metrics

All metrics exported via OpenTelemetry.

## 5.1 Connection Metrics

| Metric                     | Type      | Description                       |
|---------------------------|-----------|-----------------------------------|
| ws_connections_active     | gauge     | Current active WebSocket clients  |
| ws_messages_in            | counter   | Incoming WS messages              |
| ws_messages_out           | counter   | Outgoing WS messages              |
| http_requests_total       | counter   | HTTP calls                        |
| http_request_latency_ms   | histogram | Duration of HTTP requests         |

---

## 5.2 Game Lifecycle Metrics

| Metric                          | Type    | Description                                   |
|---------------------------------|---------|-----------------------------------------------|
| games_created_total             | counter | Number of created games                       |
| games_completed_total           | counter | Number of finished games                      |
| game_duration_seconds           | gauge   | Duration from start to completion             |
| player_disconnects_total        | counter | How many disconnects observed                 |
| turn_timeouts_total             | counter | How many 60s turn forfeitures                 |

---

## 5.3 Engine / Gameplay Metrics

| Metric                          | Type      | Description                         |
|---------------------------------|-----------|-------------------------------------|
| avg_round_duration_seconds      | histogram | Time between ROUND_STARTED and SCORED |
| avg_action_latency_ms           | histogram | Latency applying a CARD_PLAYED event |
| invalid_actions_total           | counter   | Illegal moves attempted              |
| trump_breaks_total              | counter   | Times trump is broken                |

---

## 5.4 Database Metrics

| Metric                     | Type      | Description                                   |
|----------------------------|-----------|-----------------------------------------------|
| db_query_latency_ms        | histogram | generic query timings                         |
| db_events_written_total    | counter   | number of events inserted                     |
| db_summaries_written_total | counter   | number of summaries inserted                  |
| db_errors_total            | counter   | DB errors                                     |

---

# 6. Distributed Tracing

Distributed tracing is required for:

- HTTP requests
- WebSocket message receive → event apply → state update → broadcast
- DB writes
- Seeding & shuffling generation
- Reducers

## 6.1 Trace Structure

Example:

traceId: 123abc
└── span: HTTP POST /api/join
├── span: validateJoinCode
├── span: loadGame
├── span: insertPlayerJoinedEvent
└── span: issuePlayerToken

yaml
Copy code

---

## 6.2 WebSocket Traces

WS messages create spans:

traceId: 456def
└── span: WS_MESSAGE_RECEIVED (PLAY_CARD)
├── span: validateAction
├── span: reducer: CARD_PLAYED
├── span: event_insert
└── span: broadcast_state

yaml
Copy code

This allows debugging slow plays or heavy rooms.

---

# 7. Error Reporting

Errors produce:

{
"level": "error",
"message": "Engine rejected illegal play",
"playerId": "...",
"gameId": "...",
"eventIndex": 54,
"context": {
"invalidCode": "MUST_FOLLOW_SUIT",
"cardId": "9H#A"
}
}

yaml
Copy code

### 7.1 Engine Assertion Failures

If engine detects corrupted state:

- Log at `error` level
- Include:
  - eventIndex
  - previous event type
  - state invariant broken
  - deck hash mismatch (if any)
- Emit alert to monitoring
- Game transitions into “error” mode until manual inspection

---

# 8. Performance Monitoring

Priority areas:

1. WS broadcast latency  
2. Reducer speed  
3. Event insert latency  
4. Game replay duration  
5. Per-round duration  
6. Per-trick duration  

Use histograms to expose:
- p50, p95, p99 timings

---

# 9. Local Development Observability

Local mode (non-production):

- Console logger prints JSON objects in color-coded groups
- Tracing logged inline for debugging
- WS logs can be toggled:

localStorage.debugWS = "true"

yaml
Copy code

- Optional log viewer React component:
  - Displays last 200 events
  - Shows reducer output diffs
  - Shows player turns / bidding timeline

---

# 10. Production Observability Configuration

### Deployment on Fly.io

- Export OTLP traces over HTTPS
- Use Fly’s built-in log aggregation
- Push metrics to Grafana Cloud (Prometheus remote write) or OTLP endpoint
- Use log retention rules (default 7–30 days)
- Store error-level logs in long-term sink (2+ years)

### Health Checks

Provide:
- `/health` → basic
- `/ready` → ensures DB connection and WS hub ready
- `/metrics` → Prometheus-style metrics endpoint

---

# 11. Operational Dashboards

Dashboards should include:

## 11.1 Game Engine Dashboard
- Active games
- Active players
- Event processing rate
- Invalid actions
- Turn forfeitures
- Round durations

## 11.2 WebSocket Dashboard
- Connected clients
- Message rates
- WS errors
- Reconnect attempts

## 11.3 Database Dashboard
- Event writes per second
- Summary writes
- Query errors
- Slow queries

## 11.4 System Health Dashboard
- CPU / memory usage
- Fly.io VM status
- Container restart counts

---

# 12. Alerting

Alerts should fire on:

| Condition                               | Severity |
|------------------------------------------|----------|
| WS connection failure > threshold        | Medium   |
| DB unavailable (5s+)                     | High     |
| Event insert failures > 0                | High     |
| Reducer runtime > 50ms (p99)             | Medium   |
| Game stuck in phase > 60s                | High     |
| High invalid actions spike               | Low      |

Alerts routed via:
- Slack
- PagerDuty (optional)
- Email (fallback)

---

# 13. Replay Debugging Tool (Optional)

A dev tool to load events and inspect:

- GameState per eventIndex
- Trick outcomes
- Trump break events
- Turn order transitions
- Bot decisions (show RNG values)
- Player connection timeline

Should be built into `/devtools/replay` route.

---

# 14. Testing Observability

Tests must assert:

- All required logs emitted for critical paths  
- Event logs correctly formatted  
- No logs include forbidden data  
- Metrics counters increment properly  
- Traces contain relevant spans  

Replay tests should validate that logs match event sequence.

---

# 15. Compliance

This document integrates with:

- 03-domain-model.md  
- 04-event-replay.md  
- 05-protocol-spec.md  
- 08-bots.md  

Any change to game logic or message flow must update observability fields accordingly.
