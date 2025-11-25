# 2B — Observability & Telemetry Bridge
Version: 1.0
Status: Draft
Owner: Platform Engineering
Last Updated: 2025-11-25

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
| **`backend` (Node.js)** | Application Traces & Metrics | `OTEL_EXPORTER_OTLP_ENDPOINT` | `http://$OBSERVABILITY_LXC_IP:4317` |
|  |  | `OTEL_SERVICE_NAME` | `node-backend` |
| **`nginx`** | Access Logs/Spans | `OTEL_EXPORTER_OTLP_ENDPOINT`<sup>1</sup> | `http://$OBSERVABILITY_LXC_IP:4317` |
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

## III. Documentation

A dedicated integration guide now lives in `docs/app_telemetry_changes.md`. It covers:
- Required Docker networking so every service can reach `OBSERVABILITY_LXC_IP`.
- Mandatory Promtail bind mounts (`/var/lib/docker/containers` and `/var/run/docker.sock`) along with the read-only flags that keep the host secure.
- Environment provisioning for `$OBSERVABILITY_LXC_IP` (e.g., `.env`, CI secrets, Fly.io secrets) and validation steps before shipping traffic.

Once `$OBSERVABILITY_LXC_IP` is defined, all three layers—logs, metrics, and traces—flow automatically to the external observability LXC.
