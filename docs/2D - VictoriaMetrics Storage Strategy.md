# Long-Term Metrics Storage Strategy: VictoriaMetrics

## 1. Executive Summary
This document outlines the infrastructure plan to transition from a purely local, NVMe-bound Prometheus storage model to a **Tiered Storage Architecture**. 

**Goal:** Offload long-term historical data (weeks/months/years) to high-capacity networked storage (Unraid) while keeping active ingestion and alerting fast on local NVMe.

**Solution:** Implement **VictoriaMetrics** as a long-term remote storage backend for Prometheus.

---

## 2. Architecture

### Current State
*   **Prometheus:** Scrapes targets, stores data locally on NVMe (`vm-100-disk-0` or similar).
*   **Retention:** Limited by expensive NVMe space.
*   **Risk:** High disk usage on critical VMs; loss of historical data if retention is lowered to save space.

### Target State (Tiered)

```mermaid
flowchart LR
    subgraph "Proxmox Host (NVMe)"
        P[Prometheus] -->|Scrape| Targets
        P -->|Remote Write (Hot Data)| VM[VictoriaMetrics]
        G[Grafana] -->|Query| VM
    end

    subgraph "Unraid Server (HDD)"
        NFS[NFS Share]
    end

    VM -->|Store (Cold Data)| NFS
```

*   **Prometheus:** Becomes a stateless "scraper". Retention reduced to 2-3 days.
*   **VictoriaMetrics:** Receives pushed data. optimized for high compression and high latency storage (HDD).
*   **Unraid:** Provides the physical storage via NFS.

---

## 3. Implementation Plan

### Phase 1: Unraid Storage Configuration
**Objective:** Create a secure, accessible location for bulk data.

1.  **Create Share:**
    *   Name: `metrics_archive` (or similar).
    *   Disk Strategy: Cache: No (write directly to array for safety) OR Cache: Yes -> Mover (for write speed).
2.  **NFS Settings:**
    *   Export: `Yes`
    *   Security: `Private`
    *   Rule: `192.168.1.30(rw,insecure)` (Allow Proxmox Host IP).

### Phase 2: Proxmox Host Mount
**Objective:** Mount the Unraid storage so LXC containers can bind-mount it.

1.  **Mount via UI:**
    *   Datacenter -> Storage -> Add -> NFS.
    *   ID: `unraid-metrics`
    *   Server: `<UNRAID_IP>`
    *   Export: `/mnt/user/metrics_archive`
    *   Content: `Container` (allows bind mounting).

### Phase 3: VictoriaMetrics Deployment (LXC)
**Objective:** Deploy the storage engine in a lightweight container.

*Why LXC?* Lower overhead than a VM, easy raw device mapping.

1.  **Create LXC:**
    *   OS: Alpine Linux (Minimal footprint).
    *   Resources: 1 Core, 512MB RAM (VictoriaMetrics is extremely efficient).
    *   Network: Static IP (e.g., `192.168.1.50`).
2.  **Bind Mount Storage:**
    *   Edit `/etc/pve/lxc/1xx.conf`.
    *   Add: `mp0: /mnt/pve/unraid-metrics,mp=/var/lib/victoria-metrics-data`
3.  **Install:**
    *   Download single binary `victoria-metrics-prod`.
    *   Create systemd service pointing `-storageDataPath` to `/var/lib/victoria-metrics-data`.

### Phase 4: Prometheus Reconfiguration
**Objective:** Forward data and free up NVMe space.

1.  **Update `prometheus.yml`:**
    ```yaml
    remote_write:
      - url: "http://<VICTORIA_METRICS_IP>:8428/api/v1/write"
        queue_config:
          max_shards: 10
          capacity: 2500
    ```
2.  **Adjust Retention:**
    *   Change startup flag: `--storage.tsdb.retention.time=2d` (Keep only 48h locally).
3.  **Restart:** Prometheus will flush old data (reclaiming space) and start shipping new data.

### Phase 5: Grafana Switchover
**Objective:** Visualize the long-term data.

1.  **Add Data Source:**
    *   Type: `Prometheus` (VictoriaMetrics is API compatible).
    *   URL: `http://<VICTORIA_METRICS_IP>:8428`
    *   Name: `VictoriaMetrics`
2.  **Update Dashboards:**
    *   Change default datasource from `Prometheus-Local` to `VictoriaMetrics`.

---

## 4. Maintenance & Monitoring

*   **Backups:** Rely on Unraid parity for hardware failure. Use Proxmox Backup Server (PBS) to backup the LXC *configuration* (the data is safely on Unraid).
*   **Alerting:** Ensure Prometheus alerts if the `remote_write` queue fills up (indicates network/Unraid issues).
