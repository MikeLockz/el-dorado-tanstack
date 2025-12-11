# Python Service Architecture & API

## 1. Goal and Objectives

*   **Goal:** Expose the Python MCTS engine as a robust HTTP service.
*   **Objective 1 (Auto-Generated Schemas):** Generate Pydantic models from TypeScript interfaces to guarantee type safety.
*   **Objective 2 (Control):** Support "Early Exit" via timeouts to prevent stuck threads.
*   **Objective 3 (Deployment):** Deploy via `docker-compose` only.

**Related Documentation:**
*   See [3A - MCTS AI container.md](3A%20-%20MCTS%20AI%20container.md).

---

## 2. Technical Specification

### 2.1. API Schema (`schemas.py`)

**Auto-Generation Strategy:**
*   Use `datamodel-code-generator` in the build process.
*   **CI Enforcement:** The CI pipeline must verify that `schemas.py` is up-to-date with the TypeScript sources. If a delta is detected (i.e., generating models results in file changes), the build should fail.
*   **Source:** `packages/domain/src/bots/strategy.ts` (BotContext) and `types/cards.ts`.
*   **Target:** `apps/mcts-ai/src/schemas.py`.

**Enhanced Payload:**
The request must include dynamic rule configs to avoid "magic number" drift.

```python
class RulesConfig(BaseModel):
    max_score: int
    round_count: int
    # ...

class DecisionRequest(BaseModel):
    # ... standard fields ...
    config: RulesConfig
    timeout_ms: int = 1000 # Client tells us how long we have
```

### 2.2. Service Structure (`main.py`)

#### Early Exit Implementation
The Python service must respect the `timeout_ms`.

```python
@app.post("/api/v1/bid")
async def get_bid(request: DecisionRequest):
    # Calculate deadline
    deadline = time.time() + (request.timeout_ms / 1000.0)
    
    # Pass deadline to MCTS
    # MCTS loop checks time.time() > deadline every N iterations
    result = await run_mcts(request, deadline)
    return result
```

### 2.3. Deployment (`docker-compose`)
*   **No Fly.io:** We are strictly using `docker-compose` for all environments (dev, prod-sim).
*   **Updates:**
    *   `docker-compose.yml`: Add `mcts-ai` service.
    *   `docker-compose.prod.yml`: Add `mcts-ai` service.
    *   `docker-compose.dev.yml`: Add `mcts-ai` with volume mounts for hot reload.

---

## 3. Implementation Plan

### Phase 1: Model Generation
1.  Add `datamodel-code-generator` to dev dependencies.
2.  Create a script `scripts/generate-python-models.sh`.
3.  Run it to bootstrap `schemas.py`.

### Phase 2: Service Implementation
1.  Implement endpoints with `timeout_ms` handling.
2.  Pass `RulesConfig` down to the `GameState`.

### Phase 3: Docker Setup
1.  Update all `docker-compose*.yml` files.
