# 3H — MCTS Observability & Instrumentation

Version: 1.0  
Status: Draft  
Owner: Platform Engineering / AI Team  
Last Updated: 2025-01-XX

---

## 1. Purpose

This document specifies the **observability and instrumentation strategy** for the **MCTS AI service**. It defines:

- Golden metrics (SRE-style SLIs/SLOs)
- MCTS-specific performance metrics
- Request/response logging
- Error tracking and alerting
- Integration with existing OpenTelemetry infrastructure
- Dashboards and monitoring

**Related Documentation:**
- See [10 — Observability, Logging, Metrics.md](10%20—%20Observability,%20Logging,%20Metrics.md) for general observability architecture
- See [2B - Observability.md](2B%20-%20Observability.md) for telemetry bridge configuration
- See [3A - MCTS AI container.md](3A%20-%20MCTS%20AI%20container.md) for service architecture

---

## 2. Observability Principles for MCTS

1. **No Game State Exposure**  
   Never log full player hands, deck contents, or complete game state in observability data.

2. **Performance Transparency**  
   Every MCTS request must expose: iterations attempted, time spent, determinization attempts, tree depth.

3. **Correlatability**  
   All MCTS requests must include trace IDs from the originating game server request.

4. **Actionable Metrics**  
   Metrics must enable debugging of performance issues and optimization opportunities.

5. **Zero Overhead in Production**  
   Observability must not significantly impact MCTS decision time (< 1% overhead).

---

## 3. Golden Metrics (SRE SLIs)

The **Four Golden Signals** for MCTS service:

### 3.1 Latency

| Metric | Type | Description | Target |
|--------|------|-------------|--------|
| `mcts_request_duration_ms` | Histogram | End-to-end request latency (bid/play) | p95 < 1500ms, p99 < 2000ms |
| `mcts_search_duration_ms` | Histogram | MCTS search algorithm duration | p95 < 1200ms |
| `mcts_determinization_duration_ms` | Histogram | Time spent in determinization | p95 < 50ms |

**Labels:**
- `endpoint` (bid/play)
- `phase` (bidding/playing)
- `timeout_ms` (requested timeout)

### 3.2 Throughput

| Metric | Type | Description | Target |
|--------|------|-------------|--------|
| `mcts_requests_total` | Counter | Total requests received | N/A (monitor rate) |
| `mcts_requests_per_second` | Gauge | Current request rate | Alert if > 10 req/s per replica |

**Labels:**
- `endpoint` (bid/play)
- `status` (success/error)

### 3.3 Error Rate

| Metric | Type | Description | Target |
|--------|------|-------------|--------|
| `mcts_errors_total` | Counter | Total errors encountered | Error rate < 1% |
| `mcts_timeout_errors_total` | Counter | Requests that exceeded timeout | < 0.5% |
| `mcts_validation_errors_total` | Counter | Invalid payloads received | < 0.1% |

**Labels:**
- `error_type` (timeout/validation/engine/unknown)
- `endpoint` (bid/play)

### 3.4 Saturation

| Metric | Type | Description | Target |
|--------|------|-------------|--------|
| `mcts_concurrent_requests` | Gauge | Currently processing requests | Alert if > 5 per replica |
| `mcts_queue_depth` | Gauge | Requests waiting for processing | Alert if > 2 |

---

## 4. MCTS-Specific Metrics

### 4.1 Search Algorithm Metrics

| Metric | Type | Description | Purpose |
|--------|------|-------------|---------|
| `mcts_iterations_total` | Counter | Total MCTS iterations across all requests | Track search intensity |
| `mcts_iterations_per_request` | Histogram | Iterations per request | Identify optimization opportunities |
| `mcts_tree_depth_max` | Histogram | Maximum tree depth reached | Understand search depth |
| `mcts_tree_nodes_created` | Histogram | Nodes created during search | Memory usage indicator |
| `mcts_rollout_duration_ms` | Histogram | Time spent in rollout simulations | Identify rollout bottlenecks |

**Labels:**
- `endpoint` (bid/play)
- `timeout_ms` (requested timeout)

### 4.2 Determinization Metrics

| Metric | Type | Description | Purpose |
|--------|------|-------------|---------|
| `mcts_determinization_attempts_total` | Counter | Total determinization attempts | Track constraint satisfaction |
| `mcts_determinization_retries` | Histogram | Retries needed per determinization | Identify constraint difficulty |
| `mcts_determinization_success_rate` | Gauge | Success rate of determinization | Monitor constraint solver health |
| `mcts_constraint_violations_total` | Counter | Times constraints couldn't be satisfied | Track impossible states |

**Labels:**
- `constraint_type` (void_suit/card_count/unknown)

### 4.3 Decision Quality Metrics

| Metric | Type | Description | Purpose |
|--------|------|-------------|---------|
| `mcts_best_move_confidence` | Histogram | UCT score of selected move | Measure decision confidence |
| `mcts_alternative_moves_evaluated` | Histogram | Number of moves considered | Understand search breadth |
| `mcts_win_rate_estimate` | Histogram | Estimated win rate from search | Track decision quality |

**Labels:**
- `endpoint` (bid/play)

---

## 5. Structured Logging

### 5.1 Request Log Format

Every MCTS request must log:

```json
{
  "timestamp": "2025-01-XXT12:34:56.789Z",
  "level": "info",
  "message": "MCTS request received",
  "trace_id": "abc123...",
  "span_id": "def456...",
  "context": {
    "endpoint": "play",
    "player_id": "bot_123",
    "game_id": "game_456",
    "timeout_ms": 1000,
    "hand_size": 5,
    "trick_index": 3,
    "round_index": 1,
    "trump_suit": "spades"
  }
}
```

### 5.2 Response Log Format

Every MCTS response must log:

```json
{
  "timestamp": "2025-01-XXT12:34:57.234Z",
  "level": "info",
  "message": "MCTS request completed",
  "trace_id": "abc123...",
  "span_id": "def456...",
  "context": {
    "endpoint": "play",
    "player_id": "bot_123",
    "game_id": "game_456",
    "duration_ms": 578,
    "iterations": 42,
    "tree_depth": 8,
    "determinization_attempts": 3,
    "selected_move": "H-10",
    "confidence_score": 0.73,
    "status": "success"
  }
}
```

### 5.3 Error Log Format

```json
{
  "timestamp": "2025-01-XXT12:34:57.500Z",
  "level": "error",
  "message": "MCTS request failed",
  "trace_id": "abc123...",
  "span_id": "def456...",
  "context": {
    "endpoint": "play",
    "player_id": "bot_123",
    "game_id": "game_456",
    "error_type": "timeout",
    "error_message": "MCTS search exceeded timeout",
    "duration_ms": 1001,
    "iterations": 15,
    "partial_result": true
  }
}
```

### 5.4 Sensitive Data Never Logged

- **Never log:**
  - Full player hands (only hand size)
  - Complete game state
  - Deck contents
  - Other players' cards
  - Full determinization results

- **Safe to log:**
  - Hand size
  - Trick index
  - Round index
  - Trump suit
  - Selected move (card ID)
  - Performance metrics
  - Error types (not full stack traces with state)

---

## 6. Distributed Tracing

### 6.1 Trace Structure

MCTS requests must create spans within the game server's trace:

```
Trace: Game Server Request
├── Span: HTTP POST /api/v1/play
│   ├── Span: Validate Payload
│   ├── Span: Map Payload to GameState
│   ├── Span: MCTS Search
│   │   ├── Span: Determinization
│   │   ├── Span: Tree Selection
│   │   ├── Span: Tree Expansion
│   │   ├── Span: Rollout Simulation
│   │   └── Span: Backpropagation
│   └── Span: Format Response
```

### 6.2 Span Attributes

Each span must include:

- `mcts.endpoint` (bid/play)
- `mcts.player_id`
- `mcts.game_id`
- `mcts.timeout_ms`
- `mcts.iterations` (for search span)
- `mcts.tree_depth` (for search span)
- `mcts.determinization_attempts` (for determinization span)

---

## 7. Instrumentation Implementation

### 7.1 Python OpenTelemetry Setup

The MCTS service must use OpenTelemetry Python SDK:

```python
from opentelemetry import trace
from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor
from opentelemetry.sdk.resources import Resource
from opentelemetry import metrics
from opentelemetry.exporter.otlp.proto.http.metric_exporter import OTLPMetricExporter
from opentelemetry.sdk.metrics import MeterProvider
from opentelemetry.sdk.metrics.export import PeriodicExportingMetricReader

# Initialize tracing
resource = Resource.create({"service.name": "mcts-ai"})
trace_provider = TracerProvider(resource=resource)
trace_provider.add_span_processor(
    BatchSpanProcessor(OTLPSpanExporter(endpoint=os.getenv("OTEL_EXPORTER_OTLP_ENDPOINT")))
)
trace.set_tracer_provider(trace_provider)

# Initialize metrics
metric_reader = PeriodicExportingMetricReader(
    OTLPMetricExporter(endpoint=os.getenv("OTEL_EXPORTER_OTLP_ENDPOINT")),
    export_interval_millis=5000
)
metrics_provider = MeterProvider(resource=resource, metric_readers=[metric_reader])
metrics.set_meter_provider(metrics_provider)
```

### 7.2 FastAPI Middleware

Add OpenTelemetry instrumentation to FastAPI:

```python
from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor

FastAPIInstrumentor.instrument_app(app)
```

### 7.3 Custom Instrumentation Points

Instrument the following functions:

1. **`MCTS.search()`**
   - Create span for entire search
   - Record iterations, tree depth, duration
   - Record metrics: `mcts_iterations_total`, `mcts_search_duration_ms`

2. **`determinize()`**
   - Create span for determinization
   - Record attempts, retries, duration
   - Record metrics: `mcts_determinization_attempts_total`, `mcts_determinization_duration_ms`

3. **`MCTS._apply_move()` / rollout**
   - Record rollout duration
   - Record metrics: `mcts_rollout_duration_ms`

4. **Request handlers (`/api/v1/bid`, `/api/v1/play`)**
   - Extract trace context from headers
   - Record request/response metrics
   - Log structured request/response

---

## 8. Metrics Export

### 8.1 Prometheus Endpoint

Expose `/metrics` endpoint for Prometheus scraping:

```python
from prometheus_client import make_asgi_app
from fastapi import FastAPI

app = FastAPI()
metrics_app = make_asgi_app()
app.mount("/metrics", metrics_app)
```

### 8.2 OTLP Export

Export metrics via OTLP to the observability stack:

- Endpoint: `OTEL_EXPORTER_OTLP_ENDPOINT` environment variable
- Format: OTLP/HTTP
- Export interval: 5 seconds

---

## 9. Dashboards

### 9.1 Golden Metrics Dashboard

**Panel 1: Request Rate**
- Graph: `rate(mcts_requests_total[5m])` by endpoint
- Alert threshold: > 10 req/s per replica

**Panel 2: Latency**
- Graph: `histogram_quantile(0.95, mcts_request_duration_ms)` by endpoint
- Target line: 1500ms
- Alert threshold: p95 > 1500ms for 5 minutes

**Panel 3: Error Rate**
- Graph: `rate(mcts_errors_total[5m]) / rate(mcts_requests_total[5m])`
- Alert threshold: > 1%

**Panel 4: Saturation**
- Graph: `mcts_concurrent_requests` by replica
- Alert threshold: > 5 per replica

### 9.2 MCTS Performance Dashboard

**Panel 1: Search Performance**
- Graph: `histogram_quantile(0.95, mcts_iterations_per_request)` by timeout_ms
- Graph: `histogram_quantile(0.95, mcts_search_duration_ms)` by timeout_ms
- Graph: `histogram_quantile(0.95, mcts_tree_depth_max)`

**Panel 2: Determinization Performance**
- Graph: `rate(mcts_determinization_attempts_total[5m])`
- Graph: `histogram_quantile(0.95, mcts_determinization_retries)`
- Graph: `mcts_determinization_success_rate`

**Panel 3: Decision Quality**
- Graph: `histogram_quantile(0.50, mcts_best_move_confidence)`
- Graph: `histogram_quantile(0.95, mcts_alternative_moves_evaluated)`
- Graph: `histogram_quantile(0.50, mcts_win_rate_estimate)`

### 9.3 Request Logs Dashboard

Query structured logs in Loki/Grafana:

```
{service="mcts-ai"} |= "MCTS request"
| json
| line_format "{{.timestamp}} [{{.level}}] {{.message}} endpoint={{.context.endpoint}} duration={{.context.duration_ms}}ms iterations={{.context.iterations}}"
```

---

## 10. Alerting

### 10.1 Critical Alerts

| Condition | Severity | Action |
|-----------|----------|--------|
| Error rate > 5% for 2 minutes | Critical | Page on-call |
| p95 latency > 2000ms for 5 minutes | High | Notify team |
| All replicas unhealthy | Critical | Page on-call |
| Determinization success rate < 80% | Medium | Investigate |

### 10.2 Warning Alerts

| Condition | Severity | Action |
|-----------|----------|--------|
| p95 latency > 1500ms for 10 minutes | Medium | Monitor |
| Concurrent requests > 5 per replica | Low | Scale up |
| Iterations per request < 10 (may indicate timeout) | Low | Investigate |

---

## 11. Integration with Game Server

### 11.1 Trace Context Propagation

The game server (`RemoteBotStrategy`) must:

1. Extract trace context from the current span
2. Inject trace context into HTTP headers when calling MCTS:
   ```typescript
   const span = trace.getActiveSpan();
   const traceContext = propagation.extract(context.active(), {});
   const headers = {
     'traceparent': formatTraceParent(span),
     // ... other headers
   };
   ```

### 11.2 Correlation IDs

Every MCTS request must include:
- `X-Trace-Id`: From game server trace
- `X-Game-Id`: Game identifier
- `X-Player-Id`: Bot player identifier
- `X-Request-Id`: Unique request identifier

### 11.3 Error Propagation

MCTS errors must be:
1. Logged with full context in MCTS service
2. Returned to game server with error details
3. Logged in game server with correlation to game state
4. Tracked in game server metrics (`bot_strategy_errors_total`)

---

## 12. Performance Overhead

### 12.1 Target Overhead

- Tracing: < 0.5% overhead
- Metrics: < 0.3% overhead
- Logging: < 0.2% overhead
- **Total: < 1% overhead**

### 12.2 Optimization Strategies

1. **Async metric export**: Use background threads
2. **Sampling**: Sample traces at 10% in production (100% in dev)
3. **Batch logging**: Buffer logs and flush in batches
4. **Lazy evaluation**: Only compute expensive metrics on-demand

---

## 13. Testing Observability

### 13.1 Unit Tests

Test that:
- Metrics are recorded correctly
- Spans are created with correct attributes
- Logs contain required fields
- No sensitive data is logged

### 13.2 Integration Tests

Test that:
- Trace context propagates from game server to MCTS
- Metrics are exported correctly
- Logs are queryable in Loki
- Dashboards display correct data

### 13.3 Load Tests

Verify that:
- Observability overhead < 1% under load
- Metrics export doesn't block requests
- Log buffering works under high load

---

## 14. Implementation Checklist

- [ ] Install OpenTelemetry Python SDK
- [ ] Configure OTLP exporter
- [ ] Add FastAPI instrumentation
- [ ] Instrument MCTS.search()
- [ ] Instrument determinize()
- [ ] Add Prometheus metrics endpoint
- [ ] Implement structured logging
- [ ] Add trace context propagation
- [ ] Create Grafana dashboards
- [ ] Configure alerts
- [ ] Test observability overhead
- [ ] Document query examples

---

## 15. Example Queries

### 15.1 Prometheus Queries

**Request rate by endpoint:**
```promql
rate(mcts_requests_total[5m]) by (endpoint)
```

**p95 latency:**
```promql
histogram_quantile(0.95, rate(mcts_request_duration_ms_bucket[5m]))
```

**Error rate:**
```promql
rate(mcts_errors_total[5m]) / rate(mcts_requests_total[5m])
```

**Average iterations per request:**
```promql
rate(mcts_iterations_total[5m]) / rate(mcts_requests_total[5m])
```

### 15.2 Loki Log Queries

**Find slow requests:**
```
{service="mcts-ai"} | json | context.duration_ms > 1500
```

**Find timeout errors:**
```
{service="mcts-ai"} | json | context.error_type = "timeout"
```

**Requests with low iterations:**
```
{service="mcts-ai"} | json | context.iterations < 10
```

---

## 16. Compliance

This document integrates with:

- [10 — Observability, Logging, Metrics.md](10%20—%20Observability,%20Logging,%20Metrics.md)
- [2B - Observability.md](2B%20-%20Observability.md)
- [3A - MCTS AI container.md](3A%20-%20MCTS%20AI%20container.md)
- [3G - Performance Tuning & Benchmarking Plan.md](3G%20-%20Performance%20Tuning%20&%20Benchmarking%20Plan.md)

Any changes to MCTS implementation must update observability accordingly.
