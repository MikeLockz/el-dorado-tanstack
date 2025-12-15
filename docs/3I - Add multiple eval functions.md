# Plan: Multiple Evaluation Strategies for MCTS-AI

## Overview
This document outlines the technical and functional requirements to transform the `mcts-ai` service from a simple trick-maximizing bot into a strategic AI capable of distinct playstyles (e.g., "Aggressive", "Point Slougher").

This will be achieved by implementing **Reward Shaping** within the MCTS simulation phase. Instead of a binary win/loss or simple trick ratio, the evaluation function will calculate a composite score based on strategy-specific objectives.

## 1. Functional Requirements

### 1.1 Support for Multiple Strategies
The system must support at least the following distinct strategies:

1.  **Default (Max Tricks)**:
    *   **Goal**: Win as many tricks as possible.
    *   **Current Behavior**: Evaluating `tricks_won / total_tricks`.
    *   **Use Case**: Standard Spades/Oh Hell variations where tricks = points.

2.  **Point Slougher (e.g., "Avoid Points")**:
    *   **Goal**: Avoid winning tricks that contain point cards (e.g., Hearts, Queen of Spades). Actively try to discard ("slough") point cards on opponents' tricks.
    *   **Behavior**:
        *   **Reward**: High bonus for playing a point card on a trick *lost* to an opponent.
        *   **Penalty**: Penalty for winning a trick containing point cards.

3.  **Aggressive Bidder/Lead (Early Aggression)**:
    *   **Goal**: Win tricks early in the hand to secure a bid or control the game, then potentially switch to defensive play.
    *   **Behavior**:
        *   **Reward**: Bonus for winning tricks in the first $N$ tricks (e.g., first 3).
        *   **Secondary**: potentially switch to sloughing/defensive rewards after threshold.

4.  **Bid-Aware / Contract Strategy (Dynamic)**:
    *   **Goal**: Meet the specific bid target exactly (common in Spades, Oh Hell).
    *   **Logic**:
        *   If `tricks_won < bid`: **Aggressive**. High reward for winning tricks.
        *   If `tricks_won == bid`: **Defensive**. High penalty for winning further tricks (avoid "bags" or "busting").
        *   If `tricks_won > bid`: **Damage Control**. Penalty is already incurred, but minimize further damage.
    *   **Mid-Hand Adjustment**: The Agent evaluates the state *at the end of the rollout*. If the rollout results in matching the bid, it gets Max Reward. If it overshoots or undershoots, the reward decays.


### 1.2 Configurable Strategies via API
The strategy to use must be selectable per-request. The `mcts-ai` API payload will accept a configuration object.

**New Request Parameters:**
*   `strategy_type` (enum): `DEFAULT`, `SLOUGH_POINTS`, `AGGRESSIVE`, etc.
*   `strategy_params` (dict): Optional tunable parameters (weights, thresholds).
    *   `alpha`: Weight for the base "Game Win/Loss" or "Tricks Won" score.
    *   `beta`: Weight for the strategy-specific bonus.
    *   `aggression_threshold`: Number of tricks to count as "early game".

### 1.3 Composite Reward Function
The final evaluation score for a simulation rollout ($S_{final}$) will be calculated as:

$$ S_{final} = \alpha \cdot R_{objective} + \beta \cdot R_{strategy} $$

*   $R_{objective}$: The base objective (e.g., Did we fulfill our bid? Did we maximize tricks?).
*   $R_{strategy}$: The cumulative bonus/penalty accumulated during the rollout based on specific moves (e.g., +0.5 for sloughing a heart).

## 2. Technical Implementation Plan

### 2.1 Refactor `MCTS` Class
*   **Encapsulate Evaluation**: Move `_evaluate` logic into dedicated Strategy classes or functions.
*   **State Tracking**: The `GameState` or a wrapper used during rollouts needs to track "Points Sloughed" or "Early Tricks Won" if distinct from standard game state.
    *   *Note*: Ideally, we calculate this incrementally or inspect the `completedTricks` in `state.roundState` at the end of the rollout.

### 2.2 Define Strategy Interface
Create a strategy abstraction in `src/engine/strategies.py`.

```python
class EvaluationStrategy(Protocol):
    def evaluate(self, state: GameState, player_id: str, config: StrategyConfig) -> float:
        ...
```

### 2.3 Implement Specific Strategies

#### Strategy A: `SloughPointsStrategy`
*   **Logic**: Iterate through `state.roundState.completedTricks`.
    *   For each trick where `winner != player_id`:
        *   Find card played by `player_id`.
        *   If card is a "Point Card" (e.g., Heart), add bonus (e.g., +0.5 * card_value).
    *   For each trick where `winner == player_id`:
        *   Calculate points in trick.
        *   Subtract penalty (e.g., -0.2 * points).
*   **Normalization**: Ensure the final score is normalized (0.0 to 1.0) or unbounded comfortably? MCTS usually prefers [0,1]. We may need to clamp the composite score.

#### Strategy B: `EarlyAggressionStrategy`
*   **Logic**:
    *   Count tricks won by `player_id` where `trick_index < threshold`.
    *   Bonus: `+1.0 * early_tricks_won`.
*   **Logic (Late Game)**:
    *   Reward losing tricks if `trick_index >= threshold` with low cards? (Optional refinement).

#### Strategy C: `BidAwareStrategy`
*   **Inputs**: `player.bid`, `player.tricksWon` (from final simulation state).
*   **Logic**:
    *   Calculate `delta = final_tricks_won - bid`.
    *   If `delta == 0`: Reward = 1.0 (Perfect).
    *   If `delta < 0`: Reward = `1.0 - (abs(delta) * penalty_per_missing_trick)` (e.g. 0.2 penalty).
    *   If `delta > 0`: Reward = `1.0 - (delta * penalty_per_overtrick)` (e.g. 0.1 penalty to discourage sandbagging, or 1.0 if overtricks are game-losing).
    *   **Note**: This effectively makes the bot "switch modes" automatically. If the simulation shows it has enough tricks, it naturally starts valuing losing tricks to preserve the `delta == 0` reward.


### 2.4 Update `mcts.py` Rollout & Backprop
*   In `search()`: Initialize the correct strategy based on input configuration.
*   In `_evaluate()`: Delegate to `self.strategy.evaluate(state, self.observer_id)`.
*   **Normalization**: Important: If specific bonuses can push scores > 1.0, MCTS UCT formula might behave oddly if not adjusted or if simpler "Max Child" logic is used. We should ensure the composite score is scaled or simply treat it as "utility".

### 2.5 API Updates (`main.py`)
*   Update `MCTSRequest` Pydantic model to include `StrategyConfig`.
*   Pass these config options into the `MCTS` constructor.

## 3. Work Breakdown

1.  **Refactor**: Create `strategies.py` and move current trick-ratio logic into `DefaultStrategy`.
2.  **Implement Slough Logic**: Add `SloughPointsStrategy`. Requires defining what a "Point Card" is (likely configurable or derived from game rules).
3.  **Implement Aggressive Logic**: Add `EarlyAggressionStrategy`.
4.  **Integrate**: Wire up `MCTS` to use the passed strategy.
5.  **Test**: Create unit tests in `tests/test_strategies.py` validating that:
    *   Slough strategy rates a "losing trick with Heart" state higher than a "winning trick with Heart" state (assuming avoiding points).
    *   Abnormal inputs don't crash the evaluator.

## 4. Future Considerations
*   **Opponent Modeling**: Currently MCTS assumes opponents play randomly or greedily. Future versions could assign strategies to *opponents* during the determinization phase (e.g., "Assume Player B is Aggressive").
