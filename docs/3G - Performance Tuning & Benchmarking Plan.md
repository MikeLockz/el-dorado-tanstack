# Performance Tuning & Benchmarking Plan

## 1. Goal and Objectives

*   **Goal:** Ensure the AI provides a competitive challenge without degrading server performance.
*   **Objective 1 (Latency):** 95th percentile response time < 1.5 seconds.
*   **Objective 2 (Throughput):** Support concurrent games via Docker scaling.

**Related Documentation:**
*   See [3A - MCTS AI container.md](3A%20-%20MCTS%20AI%20container.md).

---

## 2. Methodology

### 2.1. Profiling (Python)
*   **Tools:** `cProfile`, `py-spy`.
*   **Target:** `game_sim.py` (rules engine).

### 2.2. Optimization Strategies
1.  **Slotting:** Use `__slots__` for `Card` and `Node`.
2.  **Constraint Solver:** If determinization becomes a bottleneck (due to heavy backtracking), optimize the card allocation algorithm.

### 2.3. Deployment Scaling
Since we are using `docker-compose`, we can scale the AI service easily:
```yaml
# docker-compose.yml
services:
  mcts-ai:
    deploy:
      replicas: 3 # Run 3 instances
```
*   **Load Balancing:** Docker's internal DNS round-robins requests to the replicas. This allows us to handle more concurrent games by simply adding more containers.

---

## 3. Plan

### Phase 1: Benchmark
1.  Establish baseline sims/s.

### Phase 2: Optimize
1.  Focus on `determinize` function (it runs frequently).

### Phase 3: Scale
1.  Test with `replicas: 1` vs `replicas: 3` to verify Docker load balancing works.
