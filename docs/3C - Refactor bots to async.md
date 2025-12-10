# Refactor Bots to Async

## 1. Goal and Objectives

*   **Goal:** Refactor the existing synchronous `BotStrategy` interface and `BotManager` in the TypeScript backend to support asynchronous operations.
*   **Objective 1 (Non-Blocking):** Allow bot strategies to perform I/O (e.g., HTTP requests to MCTS service) without blocking the Node.js event loop.
*   **Objective 2 (Concurrency Safety):** Implement optimistic concurrency control to prevent bots from acting on stale state.
*   **Objective 3 (Stability):** Update the `BotManager` state loop (`advanceRoom`) to safely handle `await` without race conditions.

**Related Documentation:**
*   See [3A - MCTS AI container.md](3A%20-%20MCTS%20AI%20container.md) for context.
*   See [3F - Node.js RemoteBotStrategy.md](3F%20-%20Node.js%20RemoteBotStrategy.md) for the actual remote strategy implementation consuming this interface.

---

## 2. Technical Specification

### 2.1. Interface Changes (`packages/domain`)

The core contract for bots must change. This is a breaking change for the domain package.

**File:** `packages/domain/src/bots/strategy.ts`

```typescript
export interface BotStrategy {
  // Returns a Promise resolving to the bid amount
  bid(hand: Card[], context: BotContext): Promise<number>;

  // Returns a Promise resolving to the Card to play
  playCard(hand: Card[], context: BotContext): Promise<Card>;
}
```

### 2.2. BotManager Refactoring (`apps/server`)

#### Async Control Flow
The `BotManager` loop must be converted to async.

```typescript
// BotManager.ts
async handleStateChange(room: ServerRoom) {
  if (this.processing.has(room.gameId)) return;
  this.processing.add(room.gameId);

  try {
    let keepGoing = true;
    while (keepGoing) {
      keepGoing = await this.advanceRoom(room);
    }
  } finally {
    this.processing.delete(room.gameId);
  }
}
```

#### Optimistic Concurrency Control (Crucial Improvement)
Because `await` yields control, the `room.gameState` object *might* change while the bot is "thinking".

1.  **State Versioning:** Ensure `GameState` (or `ServerRoom`) has a monotonic counter, e.g., `version` or `sequenceId`, which increments on every state change.
2.  **Snapshotting:** Capture the `version` *before* calling the bot strategy.
3.  **Verification:** *After* the bot returns, compare the current room version with the snapshot.
4.  **Action:**
    *   **Match:** Apply the move.
    *   **Mismatch:** Discard the move and return `false` (loop will retry if needed).

```typescript
private async advanceRoom(room: ServerRoom): Promise<boolean> {
  const state = room.gameState;
  const initialVersion = room.version; // Capture version

  // ... determine turn ...

  const bid = await this.strategy.bid(hand, context); // Slow I/O

  // CRITICAL CHECK
  if (room.version !== initialVersion) {
    logger.warn({ gameId: room.gameId }, "State changed during bot think time. Discarding move.");
    return false; // Stop loop, let handleStateChange re-trigger if needed
  }

  await this.executor.processBotBid(room, bidderId, bid);
  return true;
}
```

### 2.3. Timeout Management

*   **Requirement:** Wrap strategy calls in a `withTimeout` helper (default 5000ms).
*   **Fallback:** If timeout occurs, log error and fall back to a random move.

---

## 3. Implementation Plan

### Phase 1: Domain Updates
1.  Update `BotStrategy` interface to return Promises.
2.  Update `BaselineBotStrategy` to be `async`.

### Phase 2: Server Refactoring
1.  Add `version` property to `ServerRoom` (initialize to 0, increment on every action).
2.  Update `BotManager.ts` to use `async/await` and the Optimistic Concurrency check.

### Phase 3: Testing
1.  **Unit:** Verify `BaselineBotStrategy` works with async.
2.  **Concurrency Test:** Mock a slow bot strategy (delay 100ms). While it waits, manually inject a state change. Assert the bot's move is rejected.
