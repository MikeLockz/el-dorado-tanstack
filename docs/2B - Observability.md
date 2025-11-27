# 2B — Observability & Telemetry Bridge
Version: 1.1
Status: Draft
Owner: Platform Engineering
Last Updated: 2025-11-26

---

## I. Telemetry Agents and Configuration

### 1. `app-docker-compose-extension.yml`
Add the following standalone compose extension file at the repository root and merge it during deployments with `docker compose -f docker-compose.yml -f app-docker-compose-extension.yml up -d`. It introduces the two telemetry sidecars required to reach the external PLG/OTel stack that lives at `OBSERVABILITY_LXC_IP`.

```yaml
version: "3.9"

services:
  promtail-sidecar:
    image: grafana/promtail:2.9.5
    container_name: promtail-sidecar
    restart: unless-stopped
    user: root
    environment:
      OBSERVABILITY_LXC_IP: ${OBSERVABILITY_LXC_IP:?Set OBSERVABILITY_LXC_IP before running promtail-sidecar}
    command:
      - -config.file=/etc/promtail/promtail-config.yml
    volumes:
      - /var/lib/docker/containers:/var/lib/docker/containers:ro
      - /var/run/docker.sock:/var/run/docker.sock:ro
      - ./config/promtail-config-app.yml:/etc/promtail/promtail-config.yml:ro
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://127.0.0.1:9080/ready"]
      interval: 30s
      timeout: 5s
      retries: 5

  node-exporter-sidecar:
    image: prom/node-exporter:v1.8.1
    container_name: node-exporter-sidecar
    restart: unless-stopped
    privileged: true
    pid: host
    command:
      - --path.procfs=/host/proc
      - --path.sysfs=/host/sys
      - --collector.filesystem.ignored-mount-points=^/(sys|proc|dev|host|etc)($|/)
      - --collector.filesystem.ignored-fs-types=^(tmpfs|devtmpfs|overlay|squashfs)$
    volumes:
      - /proc:/host/proc:ro
      - /sys:/host/sys:ro
      - /:/host:ro,rslave
    ports:
      - "9100:9100"
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://127.0.0.1:9100/metrics"]
      interval: 30s
      timeout: 5s
      retries: 5
```

**Key behaviors**
- `promtail-sidecar` runs as root with Docker socket + container log directory mounts so it can tail `nginx`, `backend`, and `postgres` logs, then forwards batches to external Loki.
- `node-exporter-sidecar` is privileged, shares the host PID namespace, and publishes `9100/tcp` so Prometheus on the LXC can scrape full LXC-level resource metrics.

### 2. `config/promtail-config-app.yml`
The promtail config relies on Docker service discovery and interpolates `$OBSERVABILITY_LXC_IP` at runtime for the Loki push address. Drop the file under `config/`.

```yaml
server:
  http_listen_port: 9080
  grpc_listen_port: 0

positions:
  filename: /tmp/promtail-positions.yaml

clients:
  - url: http://$OBSERVABILITY_LXC_IP:3100/loki/api/v1/push
    batchwait: 1s
    batchsize: 1048576
    external_labels:
      compose_stack: el-dorado
      source: docker

scrape_configs:
  - job_name: docker-logs
    pipeline_stages:
      - docker: {}
    docker_sd_configs:
      - host: unix:///var/run/docker.sock
        refresh_interval: 5s
    relabel_configs:
      - source_labels: [__meta_docker_container_id]
        target_label: __path__
        replacement: /var/lib/docker/containers/$1/$1-json.log
      - source_labels: [__meta_docker_container_label_com_docker_compose_service]
        target_label: compose_service
      - source_labels: [__meta_docker_container_label_com_docker_compose_project]
        target_label: compose_project
      - source_labels: [__meta_docker_container_name]
        target_label: container
      - action: drop
        regex: promtail-sidecar|node-exporter-sidecar
        source_labels: [__meta_docker_container_name]
```

**Highlights**
- `docker_sd_configs` keeps the scrape list in sync with running containers; no manual target curation is needed.
- `pipeline_stages` enables Promtail's Docker log parsing so Loki receives structured metadata, and relabel rules ensure each Loki stream is tagged with service + project labels while avoiding recursion loops.

## II. Application Service Updates (As Instructions)

Update environment variables directly in `docker-compose.yml` for the services in scope. The Node.js backend must emit OTLP traces/metrics, `nginx` should surface trace context when proxying (via existing OpenTelemetry instrumentation), and `postgres` needs a metrics exporter sidecar for Prometheus.

| Service | Data Type | Required Environment Variables | Value Structure |
| :--- | :--- | :--- | :--- |
| **`backend` (Node.js)** | Application Traces & Metrics | `OTEL_EXPORTER_OTLP_ENDPOINT` | `http://$OBSERVABILITY_LXC_IP:4318/v1/traces` |
|  |  | `OTEL_SERVICE_NAME` | `node-backend` |
| **`nginx`** | Access Logs/Spans | `OTEL_EXPORTER_OTLP_ENDPOINT`<sup>1</sup> | `http://$OBSERVABILITY_LXC_IP:4318/v1/traces` |
|  |  | `OTEL_SERVICE_NAME` | `edge-nginx` |
| **`postgres`** | Database Metrics | Use a dedicated `postgres-exporter` sidecar (e.g., `wrouesnel/postgres_exporter`) wired to the primary `postgres` container with `DATA_SOURCE_NAME=postgresql://$POSTGRES_USER:$POSTGRES_PASSWORD@postgres:5432/postgres?sslmode=disable`. Expose port `9187` to the host so Prometheus on the LXC can scrape it. | N/A |

<sup>1</sup> If `nginx` is not yet instrumented, at minimum emit enriched access logs that Promtail forwards; the OTLP variables can be added now so that existing OpenTelemetry modules pick them up automatically.

**PostgreSQL Exporter Sidecar Sketch**
Add this service directly next to `postgres` in `docker-compose.yml` (names and credentials must match the existing stack):

```yaml
  postgres-exporter:
    image: wrouesnel/postgres_exporter:v0.15.0
    restart: unless-stopped
    environment:
      DATA_SOURCE_NAME: postgresql://$POSTGRES_USER:$POSTGRES_PASSWORD@postgres:5432/postgres?sslmode=disable
    depends_on:
      - postgres
    ports:
      - "9187:9187"
    networks:
      - default
```

## III. Frontend vs. Backend Telemetry

We distinguish between **Frontend Product Analytics** and **Backend Observability** to capture the complete user journey.

| Feature | Frontend Telemetry (`web`) | Backend Telemetry (`server`) |
| :--- | :--- | :--- |
| **Purpose** | Product Analytics (UX, Growth) | System Observability (Perf, Errors) |
| **Data Source** | User Clicks, Clipboard Actions, UI States | WebSocket Messages, DB Queries, HTTP Requests |
| **Example Event** | `lobby.invite.copied` | `ws.message` (type: `START_GAME`) |
| **Implementation** | `apps/web/src/lib/telemetry.ts` | `apps/server/src/observability/*` |

### 1. Frontend Telemetry (User Analytics)
- **Location:** `apps/web/src/lib/telemetry.ts`
- **Scope:** Captures user intent and client-side interactions that may not reach the server (e.g., copying a link, clicking a button that fails to fire a request).
- **Usage:** Use `recordUiEvent(eventName, metadata)` in React components.
- **Destination:** Currently logs to console in dev; intended for product analytics tools (e.g., PostHog, Segment).

### 2. Backend Telemetry (System Observability)
- **Location:** `apps/server/src/observability/`
- **Scope:** Captures the execution and performance of server-side logic.
- **Usage:** Uses OpenTelemetry (OTEL) for distributed tracing and Prometheus for metrics.
- **Destination:** OTLP collector (Jaeger/Tempo) and Prometheus.

**Why both?**
Frontend telemetry reveals *intent* (user clicked "Start"), while backend telemetry reveals *execution* (server received "Start" command). Discrepancies between the two help identify network issues or UI bugs.

## IV. Documentation

A dedicated integration guide now lives in `docs/app_telemetry_changes.md`. It covers:
- Required Docker networking so every service can reach `OBSERVABILITY_LXC_IP`.
- Mandatory Promtail bind mounts (`/var/lib/docker/containers` and `/var/run/docker.sock`) along with the read-only flags that keep the host secure.
- Environment provisioning for `$OBSERVABILITY_LXC_IP` (e.g., `.env`, CI secrets, Fly.io secrets) and validation steps before shipping traffic.

Once `$OBSERVABILITY_LXC_IP` is defined, all three layers—logs, metrics, and traces—flow automatically to the external observability LXC.

## V. Runtime Endpoints & Environments

This section summarizes the concrete URLs and ports used in local development and in the self-hosted production stack for observability and backend access.

### 1. Metrics Endpoints (Prometheus scrape)

| Environment | Service | URL |
| :--- | :--- | :--- |
| **Local dev** | Game server | `http://localhost:3000/metrics` |
| **Self-hosted prod (Docker)** | Game server | `http://192.168.1.44:3001/metrics` |

- The game server exposes `/metrics` directly from the Node HTTP server (`apps/server/src/server.ts`) via the OpenTelemetry Prometheus exporter (`apps/server/src/observability/telemetry.ts`).
- In prod, `docker-compose.prod.yml` maps host port `3001` to container port `3000` for the `server` service, so Prometheus (or a browser) can scrape `192.168.1.44:3001/metrics`.

### 2. Backend HTTP & WebSocket Endpoints

The web frontend always talks to a single origin; in the self-hosted stack this is `https://eldorado.lockdev.com`.

**Local dev (full stack via `pnpm dev:stack`)**

- `VITE_API_URL = http://localhost:4000`
- `VITE_WS_URL = ws://localhost:4000/ws`

**Self-hosted prod (Traefik → web nginx → server)**

- `VITE_API_URL = https://eldorado.lockdev.com`
- `VITE_WS_URL = wss://eldorado.lockdev.com/ws`
- Traefik routes `eldorado.lockdev.com` to the `web` container (nginx on port `8080`).
- The app nginx in `Dockerfile.web` uses `nginx.conf` to:
  - Serve the SPA at `/` and `/el-dorado-tanstack/*`.
  - Proxy `/api/*` → `http://server:3000` (Docker service name for the game server).
  - Proxy `/ws` → `http://server:3000/ws` for WebSocket traffic.

This means the browser only ever calls `https://eldorado.lockdev.com`, and the container-local nginx handles fan-out to the game server.

### 3. Database Schema Management (Drizzle migrations)

Schema changes are managed via Drizzle and applied automatically in the self-hosted pipeline.

- Drizzle config: `drizzle.config.ts` (schema at `apps/server/src/db/schema.ts`, migrations in `db/migrations/`).
- Root script: `pnpm db:migrate` → `drizzle-kit migrate --config drizzle.config.ts`.
- Self-hosted deploy workflow (`.github/workflows/deploy-self-hosted.yml`) runs:

  ```bash
  docker compose \
    -f docker-compose.prod.yml \
    -f app-docker-compose-extension.yml \
    run --rm server pnpm db:migrate
  ```

  before `docker compose up -d`.

- The `server` service in `docker-compose.prod.yml` already sets `DATABASE_URL`, so migrations run against the correct Postgres instance (`el_dorado` database in the `postgres` service).

As a result, any new schema changes added as Drizzle migrations are applied automatically on each self-hosted deploy; no manual `psql` or `init-db.sql` calls are required.
