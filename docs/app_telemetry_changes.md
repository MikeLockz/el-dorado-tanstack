# Application Telemetry Integration Guide
_Last updated: 2025-11-25_

## 1. Overview
This guide explains how to attach the existing Docker Compose stack (`nginx`, `backend`, `postgres`) to the external observability LXC that hosts Prometheus/Loki/Grafana and a shared OpenTelemetry Collector. Follow these steps after creating `app-docker-compose-extension.yml` and `config/promtail-config-app.yml`.

## 2. Docker Networking Requirements
- **Outbound routing:** Every container that needs to emit telemetry must resolve and reach `OBSERVABILITY_LXC_IP`. Ensure the host firewall allows outbound `tcp/3100`, `tcp/4317`, and `tcp/9100-9187`.
- **Compose network visibility:** When running on an LXC, the Docker host typically shares the same interface as the LXC itself. No additional Compose network entries are required, but confirm that `docker compose config | grep OBSERVABILITY_LXC_IP` shows the resolved IP so containers inherit it at runtime.
- **Host port exposure:** The `node-exporter-sidecar` and optional `postgres-exporter` map ports `9100` and `9187` respectively to the host so that Prometheus on the LXC can scrape them over the LXC-to-host bridge.

## 3. Promtail Volume Bindings
`promtail-sidecar` must mount two host paths read-only:

| Host Path | Container Path | Purpose |
| --- | --- | --- |
| `/var/lib/docker/containers` | `/var/lib/docker/containers` | Allows promtail to read JSON log files for every container in the stack. |
| `/var/run/docker.sock` | `/var/run/docker.sock` | Enables Docker service discovery so the scrape target list stays in sync with running containers. |
| `./config/promtail-config-app.yml` | `/etc/promtail/promtail-config.yml` | Supplies the Loki client configuration that references `$OBSERVABILITY_LXC_IP`. |

Keep these mounts `:ro` to avoid inadvertently modifying host resources. If Docker is running inside a remote VM, ensure the paths line up with the VM's filesystem layout.

## 4. Environment Variable Management
- Define `OBSERVABILITY_LXC_IP` once, either in `.env`, the CI/CD secrets store, or your shell session (e.g., `export OBSERVABILITY_LXC_IP=10.20.30.40`).
- The compose extension, promtail config, Node exporter port exposure, and backend/nginx OTLP exporters all reference this variable. `docker compose config` will fail fast if it is missing thanks to the `${VAR:?error}` syntax in `app-docker-compose-extension.yml`.
- When deploying through GitHub Actions or Fly.io, surface the variable via secrets (e.g., `OBSERVABILITY_LXC_IP` in repository secrets) so pipelines render the same compose bundle.
- On the observability LXC, define `APP_STACK_HOST_IP` (the routable address of the Docker host that runs this stack). Prometheus uses it inside `config/prometheus-scrape-app.yml` to reach `node-exporter-sidecar` on port `9100` and `postgres-exporter` on port `9187`.

### 4.1 Prometheus Scrape File
The repository ships `config/prometheus-scrape-app.yml`, a merge-ready snippet for the LXC’s Prometheus instance. Include it (or copy the relevant job definitions) so that:
- `el-dorado-node-exporter` targets `${APP_STACK_HOST_IP}:9100` with the compose labels applied.
- `el-dorado-postgres-exporter` targets `${APP_STACK_HOST_IP}:9187`.
Reload Prometheus (or its Agent) after updating the config to pick up the new jobs.

## 5. Bring-Up Checklist
1. Set `OBSERVABILITY_LXC_IP` locally and run `docker compose -f docker-compose.yml -f app-docker-compose-extension.yml up -d promtail-sidecar node-exporter-sidecar`.
2. Verify promtail health at `curl localhost:9080/ready` and watch the logs for successful pushes to `http://$OBSERVABILITY_LXC_IP:3100`.
3. Hit `curl localhost:9100/metrics` to confirm Node exporter is serving host metrics; ensure Prometheus on the LXC has a scrape target pointing to `<docker-host-ip>:9100`.
4. After adding `postgres-exporter`, confirm `curl localhost:9187/metrics` works and register the new scrape job inside Prometheus.
5. Load `config/prometheus-scrape-app.yml` on the LXC (set `APP_STACK_HOST_IP` in its environment), then reload Prometheus and ensure the new jobs report `UP`.
6. Tail `backend` and `nginx` logs in Loki to ensure OTLP traces correlate with the log streams.

Following this checklist guarantees that logs, metrics, and traces emitted by the stack reach the external PLG/OTel platform in a reproducible way.
