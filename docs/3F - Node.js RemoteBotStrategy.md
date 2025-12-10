# Node.js RemoteBotStrategy

## 1. Goal and Objectives

*   **Goal:** Implement the client-side strategy in TypeScript.
*   **Objective 1 (Resilience):** Handle network failures and timeouts.
*   **Objective 2 (Consistency):** Pass dynamic rule configurations to the AI.

**Related Documentation:**
*   See [3C - Refactor bots to async.md](3C%20-%20Refactor%20bots%20to%20async.md) for the interface.
*   See [3E - Python Service Architecture & API.md](3E%20-%20Python%20Service%20Architecture%20&%20API.md) for the API.

---

## 2. Technical Specification

### 2.1. Class Definition

```typescript
export class RemoteBotStrategy implements BotStrategy {
  constructor(
    private readonly endpoint: string,
    private readonly fallback: BotStrategy,
    private readonly config: GameConfig // Inject game config
  ) {}

  async bid(hand: Card[], context: BotContext): Promise<number> {
    const payload = {
      hand,
      context,
      config: this.config, // Pass dynamic config
      timeout_ms: 2000     // Tell AI it has 2s
    };
    
    // ... post ...
  }
}
```

### 2.2. Configuration Injection
The `BotManager` must pass the `GameConfig` (from `room.gameState.config`) into the strategy when initializing it.

---

## 3. Implementation Plan

### Phase 1: Serialization
1.  Ensure `GameConfig` is included in the JSON payload.

### Phase 2: Error Handling
1.  Implement retries? **No.** For real-time games, retries add too much latency. Fail fast and fallback to a **lightweight** heuristic bot (e.g., Random Bot or Simple Greedy Bot).
    *   *Constraint:* The fallback must not perform heavy computation, as the time budget has already been partially consumed by the failed request.
