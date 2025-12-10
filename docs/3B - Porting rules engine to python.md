# Porting Rules Engine to Python for MCTS

## 1. Goal and Objectives

*   **Goal:** Create a high-performance, functionally identical Python implementation of the game rules found in `packages/domain` to power the MCTS AI.
*   **Objective 1 (Accuracy):** Ensure Python logic perfectly matches TypeScript logic for determining legal moves, trick winners, and scoring.
*   **Objective 2 (Performance):** Optimize the Python implementation for mutable state transitions to support high-frequency MCTS simulations.
*   **Objective 3 (Verification):** Establish a "Compliance Suite" of cross-language tests to guarantee the two engines never drift apart.

**Related Documentation:**
*   See [3A - MCTS AI container.md](3A%20-%20MCTS%20AI%20container.md) for the high-level architecture.
*   See [3D - Python MCTS Implementation.md](3D%20-%20Python%20MCTS%20Implementation.md) for how this engine is used.

---

## 2. Technical Specification

### 2.1. File Structure

The Python engine will reside within the `apps/mcts-ai` service.

```text
apps/mcts-ai/
├── src/
│   ├── engine/
│   │   ├── __init__.py
│   │   ├── cards.py       # Enums for Rank, Suit; Card dataclass
│   │   ├── consts.py      # Game constants (points, etc.)
│   │   ├── rules.py       # Core logic: validation, trick resolution
│   │   └── state.py       # GameState class with mutable apply_move()
│   └── tests/
│       ├── __init__.py
│       └── test_compliance.py # Runs shared fixture tests
├── fixtures/
│   └── compliance_suite.json  # SHARED source of truth (symlinked or copied)
```

### 2.2. Data Modeling

#### Cards & Suits (`engine/cards.py`)
Use `IntEnum` for performance during comparisons, but include methods to serialize/deserialize to the string IDs used by the TypeScript backend.

```python
from enum import IntEnum, auto
from dataclasses import dataclass

class Suit(IntEnum):
    CLUBS = 0
    DIAMONDS = 1
    HEARTS = 2
    SPADES = 3

    def to_str(self) -> str:
        return self.name.lower()

    @staticmethod
    def from_str(s: str) -> 'Suit':
        return Suit[s.upper()]

class Rank(IntEnum):
    TWO = 2
    # ...
    ACE = 14

@dataclass(slots=True)
class Card:
    suit: Suit
    rank: Rank
    id: str  # Original TS ID, e.g., "d0:hearts:K"
```

#### Mutable Game State (`engine/state.py`)
Unlike the TS Redux-style state, this class handles in-place mutations.

```python
class GameState:
    def __init__(self, ...):
        # Internal state representations
        self.hands: Dict[int, List[Card]] = {} # PlayerId -> Cards
        self.trick_plays: List[Card] = []
        self.led_suit: Optional[Suit] = None
        
    def clone(self) -> 'GameState':
        # Fast shallow copy logic
        pass

    def apply_move(self, player_id: int, card: Card):
        # Update internal state
        pass
```

### 2.3. Core Logic Functions (`engine/rules.py`)

Must implement the following critical functions, mirroring `packages/domain/src/engine`:

1.  `beats(card: Card, incumbent: Card, led_suit: Suit, trump_suit: Suit) -> bool`
2.  `get_legal_moves(hand: List[Card], trick: TrickState, trump_suit: Suit, trump_broken: bool) -> List[Card]`
    *   *Constraint:* Must strictly enforce "Follow Suit" and "Trump Breaking" rules.
3.  `score_trick(plays: List[Card]) -> int`

---

## 3. Verification Strategy: The Compliance Suite

To solve the "Double Truth" problem, we will treat the TypeScript engine as the **Reference Implementation**.

### 3.1. The Fixture File (`fixtures/compliance_suite.json`)

A standardized JSON file containing scenarios.

```json
[
  {
    "id": "scenario_01_must_follow_suit",
    "description": "Player holds Heart but plays Spade when Heart led",
    "setup": {
      "hand": ["H-10", "S-2"],
      "led_suit": "H",
      "trump_suit": "C",
      "trump_broken": false
    },
    "action": { "card": "S-2" },
    "expected": { "valid": false, "error": "MUST_FOLLOW_SUIT" }
  },
  {
    "id": "scenario_02_trick_winner",
    "setup": {
      "trick_plays": [
        {"card": "H-10", "player": "p1"},
        {"card": "H-A", "player": "p2"},
        {"card": "C-2", "player": "p3"} // Trump is C
      ],
      "led_suit": "H",
      "trump_suit": "C"
    },
    "expected": { "winning_player": "p3" }
  }
]
```

### 3.2. TypeScript Test Runner
Create a test in `apps/server/src/tests/compliance.test.ts` (or `domain`) that:
1.  Reads `compliance_suite.json`.
2.  Iterates through every scenario.
3.  Executes the scenario against the **TypeScript Domain Engine**.
4.  Asserts the `expected` outcome matches.

### 3.3. Python Test Runner
Create `apps/mcts-ai/src/tests/test_compliance.py` that:
1.  Reads the same `compliance_suite.json`.
2.  Hydrates the Python `GameState` from the `setup` block.
3.  Executes `get_legal_moves` or `beats`.
4.  Asserts the `expected` outcome matches.

---

## 4. Implementation Plan

### Phase 1: Compliance Infrastructure (Day 1)
1.  Create `fixtures/compliance_suite.json` with 5 basic scenarios (valid play, invalid play, trick winner).
2.  Write the **TypeScript** compliance test runner to verify the fixture format works against the current engine.

### Phase 2: Python Skeleton & Primitives (Day 1-2)
1.  Initialize `apps/mcts-ai` Python project.
2.  Implement `engine/cards.py` (Enums).
3.  Implement `engine/rules.py` (Empty stubs).
4.  Write the **Python** compliance test runner (It will fail).

### Phase 3: Porting Logic (Day 2-3)
1.  Implement `beats()` in Python. -> *Verify Trick Winner tests pass.*
2.  Implement `get_legal_moves()` in Python. -> *Verify Validation tests pass.*
3.  Expand `compliance_suite.json` to cover edge cases:
    *   Trump breaking rules.
    *   Leading rules (can lead trump?).
    *   Void suits (renouncing).

### Phase 4: State Machine & Performance (Day 4)
1.  Implement `GameState` class with `clone()` and `apply_move()`.
2.  Write a performance benchmark: "Random Playouts per Second".
    *   Target: > 10,000 playouts/sec on a single core.

### Phase 5: Integration
1.  Hook up the validated Python Engine to the MCTS Loop.

---

## 5. Risks & Mitigations

| Risk | Mitigation |
| :--- | :--- |
| **Drift:** TS logic changes, Python stays old. | **CI Failure:** If `compliance_suite.json` is updated for TS, Python tests will fail in CI until updated. |
| **Subtle Bugs:** e.g., Sort order of cards. | Ensure Compliance Suite includes scenarios checking specific sorting or priority logic. |
| **Performance:** Python object overhead. | Use `__slots__` in classes, `IntEnum`, and avoid deep copying where possible (use manual attribute copying). |

---

## 6. Future Considerations

### 6.1. WebAssembly (WASM)
If maintaining two separate rule engines proves too costly or prone to drift, consider compiling the TypeScript domain engine to WebAssembly (WASM).
*   **Strategy:** Run the WASM binary within the Python environment using a runtime like `wasmtime`.
*   **Benefit:** Zero logic drift, as the exact same code runs in both places.
*   **Trade-off:** Potential overhead in marshalling data across the WASM boundary, and increased build complexity. This is currently a backup plan.