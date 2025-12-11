# Python MCTS Implementation

## 1. Goal and Objectives

*   **Goal:** Implement the Monte Carlo Tree Search (MCTS) algorithm in Python.
*   **Objective 1 (Algorithm):** Implement UCT search.
*   **Objective 2 (Advanced Determinization):** Handle imperfect information by creating concrete states that respect *known constraints* (void suits).
*   **Objective 3 (Efficiency):** Optimize the search loop.

**Related Documentation:**
*   See [3A - MCTS AI container.md](3A%20-%20MCTS%20AI%20container.md).
*   See [3B - Porting rules engine to python.md](3B%20-%20Porting%20rules%20engine%20to%20python.md).

---

## 2. Technical Specification

### 2.1. Core Classes
*   `Node` (Tree structure)
*   `MCTS` (Search manager)

### 2.2. Constraint-Based Determinization (Crucial Improvement)

Standard random dealing is insufficient because it creates impossible states (e.g., giving a Heart to a player who previously renounced Hearts).

**Algorithm:**
1.  **Input:**
    *   `observer_hand`: Cards known to be held by the bot.
    *   `played_cards`: Cards already played.
    *   `history`: List of past tricks (to derive constraints).
2.  **Derive Constraints:**
    *   Iterate through `history`.
    *   If Player P did not follow suit when Suit S was led, mark Player P as `void_in[S]`.
3.  **Card Allocation:**
    *   Pool = All cards - `observer_hand` - `played_cards`.
    *   Shuffle Pool.
    *   For each card in Pool:
        *   Try to assign to a player who needs cards AND is not void in the card's suit.
    *   *Backtracking/Retry:* If assignment fails (corner case), restart the shuffle (or use a constraint solver if needed, but simple retry usually works for card games).

### 2.3. Rollout Policy
*   Use a lightweight heuristic: "Play winning card if available, else play low."

---

## 3. Implementation Plan

### Phase 1: Basic MCTS
*   Implement `Node` and `MCTS` classes.

### Phase 2: Smart Determinization
*   Implement `GameState.derive_constraints(history)`.
*   Implement `GameState.determinize(observer_id, constraints)`.
*   **Test:** Create a scenario where Player 2 is void in Hearts. Run 100 determinizations. Assert Player 2 *never* receives a Heart.

### Phase 3: Integration
*   Connect Determinization to the `MCTS.search` loop.
