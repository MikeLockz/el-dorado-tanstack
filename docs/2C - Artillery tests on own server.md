# 2C - Operational Plan: Artillery Tests on Own Server

Version: 1.0
Owner: Engineering
Last Updated: 2025-12-02
Status: Draft

---

## 1. Objective

Establish a robust operational workflow to run Artillery load tests against the deployed "Own Server" environment. This ensures:
1.  **Continuous Validation**: Verify that new deployments handle concurrency correctly.
2.  **Performance Baselines**: Track latency and error rates over time.
3.  **Availability Monitoring**: Periodic "smoke tests" to ensure the system is reachable and functional.

## 2. Architecture

We will leverage the existing **Self-Hosted GitHub Actions Runner** to execute the load tests. This keeps the traffic "local" to the infrastructure (if desired) or at least controlled, and avoids external SaaS costs.

### 2.1 Execution Flow

1.  **Trigger**: Schedule (Nightly), On-Demand (Manual), or Post-Deploy.
2.  **Runner**: Executes on `[self-hosted, docker-deploy]`.
3.  **Target**: The publicly accessible URL of the deployed server (e.g., defined in `VITE_API_URL`) or the internal Docker network address if running on the same host.
    *   *Recommendation*: Target the **public URL** to test the full network path including Nginx/Reverse Proxy configuration.

## 3. Pipeline Design

We will create a new GitHub Action workflow: `.github/workflows/artillery-tests.yml`.

### 3.1 Workflow Triggers

```yaml
on:
  # 1. On Demand
  workflow_dispatch:
    inputs:
      target_url:
        description: 'Base API URL (e.g. https://my-game.com)'
        required: true
        default: 'http://localhost:4000' # Default to local if run manually on dev machine, or adjust for prod
      ws_url:
        description: 'Base WS URL (e.g. wss://my-game.com/ws)'
        required: true
        default: 'ws://localhost:4000/ws'
      player_count:
        description: 'Number of players'
        default: '4'
      
  # 2. Scheduled (Nightly at 3 AM UTC)
  schedule:
    - cron: '0 3 * * *'

  # 3. After Successful Deployment
  workflow_run:
    workflows: ["Self-Hosted Production Deploy"]
    types:
      - completed
```

### 3.2 Job Steps

The job needs to build the dependency `packages/domain` because the test script uses it directly.

1.  **Checkout**: Get the repository content.
2.  **Setup Node**: Use `actions/setup-node` (ensure compatible version).
3.  **Install Dependencies**: `pnpm install --frozen-lockfile`.
4.  **Build Domain**: `pnpm build --filter @game/domain`.
5.  **Execute Tests**:
    *   If triggered by `workflow_dispatch`, use provided inputs.
    *   If triggered by schedule/deploy, use secrets/vars from the environment.

### 3.3 Environment Variables

The workflow will need mapping for:
*   `API_BASE_URL`: Points to the deployed HTTP API.
*   `WS_URL`: Points to the deployed WebSocket endpoint.
*   `ARTILLERY_RECORD_OUTPUT`: Set to `true` to capture artifacts.

## 4. Constant Traffic (The 4th Way)

**Requirement**: Continuously simulate traffic (start over when finished) to create a "noisy" background for observability dashboards.

**Strategy Change**:
*   **GitHub Actions**: NOT SUITABLE. Long-running jobs block the runner, preventing deployments and other tasks.
*   **Solution**: Run as a **Docker Service** within the infrastructure.

### 4.1 Implementation

Add a `traffic-generator` service to a new compose file (e.g., `docker-compose.traffic.yml`).

**Location**:
*   **Same Host**: Run this container on the **same Docker host** as the application (`server`, `web`, `postgres`).
    *   **Pros**: Zero network latency (uses internal Docker network), simple management (same `docker compose` stack), no extra infrastructure cost.
    *   **Cons**: Consumes CPU/RAM from the production host.
*   **Different Host**: Only necessary if the load test is aggressive enough to starve the application resources. For "background noise" (e.g., 1-4 concurrent games), the same host is preferred.

```yaml
services:
  traffic-generator:
    build:
      context: .
      dockerfile: Dockerfile.server  # Reuse the server image which has Node/pnpm
    entrypoint: ["/bin/sh", "-c"]
    command:
      - |
        while true; do
          echo "Starting Artillery run..."
          ./scripts/run-artillery.sh --players=4 --concurrency=1
          echo "Run complete. Sleeping 5s..."
          sleep 5
        done
    environment:
      - API_BASE_URL=http://server:3000 # Talk directly to server container
      - WS_URL=ws://server:3000/ws
      - ARTILLERY_RECORD_OUTPUT=false
    depends_on:
      - server
    deploy:
      replicas: 1
```

**Usage**:
*   Start: `docker compose -f docker-compose.prod.yml -f docker-compose.traffic.yml up -d`
*   Stop: `docker compose -f docker-compose.traffic.yml down`

## 5. Required Changes

### 4.1 Code Changes

1.  **Artifact Handling**: Ensure `scripts/run-artillery.sh` can accept custom output paths or that the CI pipeline correctly scrapes the `test-results/` folder.
2.  **Traffic Tagging**:
    *   *Problem*: Production analytics might get skewed by test runs.
    *   *Solution*: Add a custom header `X-Test-Traffic: true` or a specific User-Agent string in `artillery.config.yml`.
    *   *Task*: Update `processor.js` to inject this header if an env var `IS_LOAD_TEST` is set.

### 4.2 Pipeline Implementation (Draft)

Create `.github/workflows/artillery-tests.yml`:

```yaml
name: E2E Load Tests

on:
  workflow_dispatch:
    inputs:
      players:
        description: 'Number of players per room'
        default: '4'
      concurrency:
        description: 'Concurrent rooms'
        default: '1'
  schedule:
    - cron: '0 4 * * *' # Daily at 4am
  workflow_run:
    workflows: ["Self-Hosted Production Deploy"]
    types:
      - completed

jobs:
  load-test:
    # Only run if the deploy was successful (for workflow_run trigger)
    if: ${{ github.event_name != 'workflow_run' || github.event.workflow_run.conclusion == 'success' }}
    runs-on: [self-hosted, docker-deploy]
    
    env:
      # fallback to secrets if not provided via input
      API_BASE_URL: ${{ secrets.VITE_API_URL }}
      WS_URL: ${{ secrets.VITE_WS_URL }}
      
    steps:
      - uses: actions/checkout@v4
      
      - uses: pnpm/action-setup@v3
        with:
          version: 9
          
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'pnpm'
          
      - name: Install dependencies
        run: pnpm install
        
      - name: Build Domain Package
        run: pnpm build --filter @game/domain
        
      - name: Run Artillery
        id: artillery
        env:
          PLAYERS: ${{ inputs.players || 4 }}
          CONCURRENCY: ${{ inputs.concurrency || 1 }}
          ARTILLERY_RECORD_OUTPUT: 'true'
        run: |
          ./scripts/run-artillery.sh \
            --players=$PLAYERS \
            --concurrency=$CONCURRENCY \
            --repetitions=1
            
      - name: Upload Results
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: artillery-results
          path: test-results/
```

## 6. Notifications

On test failure, the workflow sends a notification to Slack.

### 6.1 Configuration
1.  **Secret**: `SLACK_WEBHOOK_URL` must be set in the GitHub Repository Secrets.
2.  **Logic**: The `Slack Notification on Failure` step runs only `if: failure()`.
3.  **Payload**: Sends a simple message with a link to the failed GitHub Run.

## 7. Risks & Mitigations

*   **Production Impact**: Running high-concurrency tests against a single-node production server could degrade real user experience.
    *   *Mitigation*: Schedule tests for off-peak hours. Limit concurrency in the post-deploy trigger to a "smoke test" level (e.g., 1 room, 4 players) rather than a stress test.
*   **Database Clutter**: Tests create users and games.
    *   *Mitigation*: Implement a "Sweep" cron job or script to archive/delete test games older than X days. (Future Scope)
*   **Flakiness**: Network glitches can fail tests.
    *   *Mitigation*: Use `repetitions` logic in the script, but for CI, allow a small margin of error or retry logic.

## 6. Next Steps

1.  Add `artillery-tests.yml` to `.github/workflows`.
2.  Configure repository secrets (`VITE_API_URL`, `VITE_WS_URL`) if not already present.
3.  Test the workflow via `workflow_dispatch`.
