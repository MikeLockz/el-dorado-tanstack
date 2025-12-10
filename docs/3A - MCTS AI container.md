This is a comprehensive technical specification for adding and integrating the MCTS AI container into your existing TypeScript application architecture.

## 📝 Technical Specification: MCTS AI Integration

### 1. Goal and Objectives

*   **Goal:** Integrate a sophisticated AI player using the Monte Carlo Tree Search (MCTS) algorithm into the existing card game application.
*   **Objective 1 (Decoupling):** Implement the MCTS logic within a new, dedicated, high-performance Python container.
*   **Objective 2 (Integration):** Implement a client shim in the existing TypeScript backend (`apps/server`) to communicate with the MCTS service via HTTP, ensuring non-blocking operations.
*   **Objective 3 (Performance):** Ensure the MCTS service can return an optimal move within a strict time budget (e.g., 500ms to 2 seconds).

---

### 2. Architecture Overview

The current architecture (Client $\leftrightarrow$ TypeScript Backend $\leftrightarrow$ WebSockets) will be extended to a microservice pattern.

| Component | Technology | Role |
| :--- | :--- | :--- |
| **Frontend** | Browser/Client | Sends move request to TS Backend via WS. Receives state updates via WS. |
| **Game Backend** | TypeScript (Node.js) | **State Manager.** Manages game state (`BotManager`), handles WS traffic, and acts as the **AI Client Shim**. |
| **MCTS AI Service** | Python (FastAPI + NumPy) | **Decision Engine.** Receives state payload, runs MCTS, and returns the chosen move via HTTP. |

**Related Documentation:**
*   See [3B - Porting rules engine to python.md](3B%20-%20Porting%20rules%20engine%20to%20python.md) for details on the Python Rules Engine.
*   See [3D - Python MCTS Implementation.md](3D%20-%20Python%20MCTS%20Implementation.md) for the core AI logic.
*   See [3E - Python Service Architecture & API.md](3E%20-%20Python%20Service%20Architecture%20&%20API.md) for the service wrapper.

---

### 3. Requirements for the MCTS AI Container (Python Service)

The MCTS container must be highly optimized and self-contained.

#### 3.1. Container Setup (`Dockerfile`, `requirements.txt`)

*   **Base Image:** Use a lightweight Python 3.10+ image (e.g., `python:3.10-slim`).
*   **Dependencies:**
    *   `numpy`: For efficient array and numerical processing.
    *   `fastapi`: For a high-performance, asynchronous API framework.
    *   `uvicorn`: As the ASGI web server.
    *   `pydantic`: For data validation.

#### 3.2. API Specification (`main.py`)

The service must expose endpoints for the two main game decisions: Bidding and Playing.

*   **Endpoint 1:** `POST /api/v1/bid`
    *   **Input:** JSON Payload containing `hand`, `context`, and `rules`.
    *   **Output:** `{"bid": 3}` (Integer representing the bid).

*   **Endpoint 2:** `POST /api/v1/play`
    *   **Input:** JSON Payload containing `hand`, `context`, and `rules`.
    *   **Output:** `{"card": "C-5"}` (String ID of the card to play).

*   **Detailed Spec:** See [3E - Python Service Architecture & API.md](3E%20-%20Python%20Service%20Architecture%20&%20API.md).

#### 3.3. Core Logic (`mcts.py` and `game_sim.py`)

*   **`game_sim.py` (Simulation Engine):** A lightweight Python re-implementation of the game rules found in `packages/domain/src/engine`.
    *   **Detail:** Must match TypeScript logic exactly. See [3B - Porting rules engine to python.md](3B%20-%20Porting%20rules%20engine%20to%20python.md).
*   **`mcts.py` (MCTS Implementation):**
    *   **Selection:** UCT (Upper Confidence Bound for Trees).
    *   **Expansion:** creating nodes for legal moves.
    *   **Simulation:** running `game_sim.py` with imperfect information handling.
    *   **Backpropagation:** updating node statistics.
    *   **Detail:** See [3D - Python MCTS Implementation.md](3D%20-%20Python%20MCTS%20Implementation.md).

---

### 4. Requirements for the Game Backend (TypeScript Service)

The existing backend must be modified to support asynchronous bot strategies and communicate with the new service.

#### 4.1. Refactoring `BotStrategy`

The current `BotStrategy` interface in `packages/domain/src/bots/strategy.ts` is synchronous. It must be refactored to allow asynchronous operations (like HTTP requests).

**Current:**
```typescript
export interface BotStrategy {
  bid(hand: Card[], context: BotContext): number;
  playCard(hand: Card[], context: BotContext): Card;
}
```

**New:**
```typescript
export interface BotStrategy {
  bid(hand: Card[], context: BotContext): Promise<number>;
  playCard(hand: Card[], context: BotContext): Promise<Card>;
}
```

*   **Implementation Plan:** See [3C - Refactor bots to async.md](3C%20-%20Refactor%20bots%20to%20async.md).

#### 4.2. New `RemoteBotStrategy` Implementation

Create a new class `RemoteBotStrategy` (or `MCTSBotStrategy`) in `apps/server/src/bots/` that implements the async `BotStrategy`.

1.  **Configuration:** Read `MCTS_ENDPOINT` from environment variables.
2.  **Serialization:** Convert `Card[]` and `BotContext` into the JSON payload.
3.  **HTTP Request:** Send the payload to the Python service.
4.  **Error Handling:** Fallback to `BaselineBotStrategy`.
5.  **Detail:** See [3F - Node.js RemoteBotStrategy.md](3F%20-%20Node.js%20RemoteBotStrategy.md).

#### 4.3. `BotManager` Updates

*   Update `BotManager.ts` to support dependency injection of different strategies (already supported via constructor).
*   Ensure `handleStateChange` and `advanceRoom` properly handle the async nature of the new strategy to avoid blocking the event loop.

---

### 5. Data Specification

#### 5.1. Standardized JSON Payload (TypeScript $\rightarrow$ Python)

The payload structure mirrors the `BotContext` in `packages/domain` but adds the player's hand and necessary rule configs.

```json
{
  "phase": "bid", // or "play"
  "hand": [
    { "id": "H-10", "rank": "10", "suit": "H" },
    { "id": "D-5",  "rank": "5",  "suit": "D" }
  ],
  "context": {
    "roundIndex": 1,
    "cardsPerPlayer": 9,
    "trumpSuit": "S", // or null
    "trumpBroken": false,
    "trickIndex": 0,
    "currentTrick": {
      "trickIndex": 0,
      "ledSuit": "H",
      "plays": [
        { "playerId": "p1", "card": { "id": "H-A", "rank": "A", "suit": "H" } }
      ]
    },
    "playedCards": ["S-A", "H-3"], // List of card IDs
    "bids": {
      "p1": 2,
      "bot_1": null
    },
    "cumulativeScores": { "p1": 10, "bot_1": 5 },
    "myPlayerId": "bot_1"
  },
  "config": {
    "maxPlayers": 4,
    "roundCount": 10
  }
}
```

---

### 6. Deployment Requirements (`docker-compose.yml`)

The existing Docker Compose file must be updated.

*   **Service:** `mcts-ai`
    *   **Build:** Context `./apps/mcts-ai` (New directory).
    *   **Ports:** Expose `5000` (internal).
    *   **Resources:** Limit CPU/Memory to prevent starving the game server.
*   **Environment:**
    *   Add `MCTS_ENDPOINT=http://mcts-ai:5000` to the `server` service.
*   **Networking:** Ensure `mcts-ai` and `server` are on the same bridge network.
*   **Performance:** See [3G - Performance Tuning & Benchmarking Plan.md](3G%20-%20Performance%20Tuning%20&%20Benchmarking%20Plan.md) for resource allocation strategies.
