# MCTS Observability Configuration Guide

This guide details the steps required to configure your existing observability stack (Prometheus, Grafana, AlertManager) to monitor the MCTS AI Service.

## 1. Prerequisites

- Access to the **Observability Repository** where your Prometheus and Grafana configurations reside.
- Network connectivity between your Observability stack and the MCTS service (or the machine running it).

## 2. Prometheus Configuration

You need to configure Prometheus to scrape metrics from the MCTS service. There are two common approaches depending on your Setup.

### Option A: Scrape via OTel Agent (Recommended for Prod)

If your `otel-agent` is already exporting to Prometheus, ensure the metrics `mcts_*` are being allowed.

If you are scraping the **OTel Agent's Prometheus Exporter**:

```yaml
scrape_configs:
  - job_name: 'otel-collector'
    static_configs:
      - targets: ['<OTEL_AGENT_IP>:8889'] # Port depends on your otel-agent config
```

### Option B: Scrape MCTS Directly (Dev/Simple)

If you have direct access to the MCTS container port (e.g., mapped to 5001 on host).

Add the following job to your `prometheus.yml`:

```yaml
scrape_configs:
  - job_name: 'mcts-ai'
    scrape_interval: 5s
    metrics_path: '/metrics'
    static_configs:
      - targets: ['host.docker.internal:5001'] # Replace with actual Host IP/Port
```

## 3. Grafana Dashboard Setup

A pre-built dashboard JSON model has been generated for you.

1.  **Locate the Dashboard File**: `docs/artifacts/mcts-dashboard.json`.
2.  **Access Grafana**: Log in to your Grafana instance.
3.  **Import Dashboard**:
    *   Go to **Dashboards** -> **New** -> **Import**.
    *   Upload the JSON file or paste its contents.
    *   Select your Prometheus data source when prompted.
    *   Click **Import**.

**Dashboard Features:**
*   **Golden Signals**: Request Rate, Latency (p95), Error Rate, Saturation.
*   **MCTS Performance**: Iterations/sec, Tree Depth, Search Duration.
*   **Determinization**: Success rates and attempt counts.

## 4. Alerting Configuration

Alert rules have been defined based on the MCTS service service-level objectives (SLOs).

1.  **Locate the Alerts File**: `docs/artifacts/mcts-alerts.yml`.
2.  **Update Prometheus Rules**:
    *   Copy the content of `mcts-alerts.yml` into your Prometheus alerts configuration file (e.g., `alerts.yml`).
    *   Ensure this file is referenced in your `prometheus.yml` under `rule_files`.

```yaml
# prometheus.yml
rule_files:
  - "alerts.yml"
  - "mcts-alerts.yml" 
```

3.  **Reload Prometheus**:
    *   Restart Prometheus or send a SIGHUP to reload configuration.

## 5. Verification

1.  **Generate Traffic**: Run a game with bots or use `curl` against the MCTS endpoint.
2.  **Check Prometheus**: Query `mcts_requests_total` to verify data is arriving.
3.  **Check Grafana**: Ensure the dashboard populates with data.
