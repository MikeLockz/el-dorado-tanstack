This is a comprehensive technical specification for adding and integrating the MCTS AI container into your existing TypeScript application architecture.

## 📝 Technical Specification: MCTS AI Integration

### 1\. Goal and Objectives

  * **Goal:** Integrate a sophisticated AI player using the Monte Carlo Tree Search (MCTS) algorithm into the existing card game application.
  * **Objective 1 (Decoupling):** Implement the MCTS logic within a new, dedicated, high-performance Python container.
  * **Objective 2 (Integration):** Implement a client shim in the existing TypeScript backend to communicate with the MCTS service via a simple HTTP endpoint, mimicking a human client move.
  * **Objective 3 (Performance):** Ensure the MCTS service can return an optimal move within a strict time budget (e.g., 500ms to 2 seconds).

-----

### 2\. Architecture Overview

The current architecture (Client $\leftrightarrow$ TypeScript Backend $\leftrightarrow$ WebSockets) will be extended to a microservice pattern.

| Component | Technology | Role |
| :--- | :--- | :--- |
| **Frontend** | Browser/Client | Sends move request to TS Backend via WS. Receives state updates via WS. |
| **Game Backend** (Existing) | TypeScript (Node.js) | **State Manager.** Manages game state, handles WS traffic, and acts as the **AI Client Shim**. |
| **MCTS AI Service** (New) | Python (FastAPI/Flask + NumPy) | **Decision Engine.** Receives state payload, runs MCTS, and returns the chosen move via HTTP. |

-----

### 3\. Requirements for the MCTS AI Container (Python Service)

The MCTS container must be highly optimized and self-contained.

#### 3.1. Container Setup (`Dockerfile`, `requirements.txt`)

  * **Base Image:** Use a lightweight Python 3.10+ image (e.g., `python:3.10-slim`).
  * **Dependencies:** Must include `numpy` for efficient array and numerical processing (essential for MCTS tree structure and statistics), and a micro-framework (e.g., `FastAPI` or `Flask`) for the API endpoint.
  * **Web Server:** Use a production WSGI server (e.g., `Gunicorn` or `Uvicorn`) to host the Python API.

#### 3.2. API Specification (`main.py`)

The service must expose a single, synchronous HTTP POST endpoint.

  * **Endpoint:** `POST /api/v1/make_move`
  * **Input (JSON Payload):** The complete, current game state sent by the TypeScript backend. This must be a standardized structure (see Section 5.1).
  * **Output (JSON Response):** The single, recommended card move.
      * Example: `{"card": "Clubs-5"}` or `{"card": "Pass-Left"}` for pre-game actions.

#### 3.3. Core Logic (`mcts.py` and `game_sim.py`)

  * **`game_sim.py` (Simulation Engine):** This is the **most critical file** for performance. It must contain a lightweight, fast re-implementation of the game rules in Python. It handles:
      * State initialization and deep-copying.
      * Valid move generation.
      * Applying a move and updating the state.
      * The **rollout function:** Playing the game randomly until the end to return a score (reward).
  * **`mcts.py` (MCTS Implementation):** Must implement the four phases of MCTS:
      * **Selection:** Using the UCT (Upper Confidence Bound for Trees) formula.
      * **Expansion:** Creating new nodes for unvisited, valid moves.
      * **Simulation (Rollout):** Calling the `game_sim.py` engine.
      * **Backpropagation:** Updating the win/loss statistics up the tree.

-----

### 4\. Requirements for the Game Backend (TypeScript Service)

The existing backend must be modified to act as the client interface for the AI.

#### 4.1. Configuration

  * **Environment Variable:** Add an environment variable to the TypeScript container that stores the internal network address of the MCTS service.
      * `MCTS_ENDPOINT=http://mcts_ai:5000/api/v1/make_move`

#### 4.2. AI Client Shim Implementation

A new internal function, e.g., `resolveAIMove(gameState)`, must be implemented.

1.  **Trigger:** When the game state transition dictates it's the AI's turn, this function is called **instead of** waiting for a WebSocket message from a human player.
2.  **Data Serialization:** The current TypeScript game state object must be converted into the standardized JSON payload required by the MCTS API (Section 5.1).
3.  **HTTP Call:** Use a suitable HTTP client (e.g., `node-fetch` or `axios`) to send the JSON payload to the `$MCTS\_ENDPOINT`. **This should be a blocking/synchronous operation** relative to the game flow, waiting for the AI's response before proceeding.
4.  **Move Injection:** Upon receiving the AI's move (e.g., `{"card": "Clubs-5"}`), the TypeScript backend must **internally call its own move validation and state update logic**—the same logic used for moves received via WebSocket.
5.  **Broadcast:** Broadcast the state change to all connected clients via the existing WebSockets.

-----

### 5\. Data Specification

#### 5.1. Standardized Game State Payload (TypeScript $\rightarrow$ Python)

The payload must provide the MCTS engine with all necessary information to perform a search, including the uncertainty inherent in the game.

```json
{
  "game_id": "uuid-12345",
  "player_id": "player2_ai",             // The ID of the player the MCTS is controlling
  "players": [
    {"id": "p1", "score": 10, "is_ai": false},
    // ... all players
  ],
  "current_turn_index": 1,               // Index of the current player
  "ai_hand": ["H-10", "D-5", "C-A", "S-2"], // Cards held by the AI
  "trick_in_progress": [
    {"player_id": "p1", "card": "D-K"}   // Cards already played in the current trick
  ],
  "played_cards_history": ["S-A", "H-3", "D-Q"], // All cards played previously
  "rules": {                             // Configuration details
    "max_score": 100,
    "pass_cards_rule": "left",
    "must_follow_suit": true
  }
}
```

-----

### 6\. Deployment Requirements (`docker-compose.yml`)

The existing Docker Compose file must be updated to include the new MCTS service and establish networking.

  * **Service Definition:** Add a `mcts_ai` service block referencing the new Python service directory.
  * **Networking:** Ensure both services are on the same internal Docker network.
  * **Resource Allocation:** Consider limiting CPU and memory resources for the MCTS container, especially if it's running many threads for MCTS search (`cpus: '2.0'`, `memory: 4096M`).
  * **Environment Passing:** Pass the `MCTS_ENDPOINT` environment variable to the TypeScript container, ensuring it points to `http://mcts_ai:5000` (using the Docker service name as the hostname).
