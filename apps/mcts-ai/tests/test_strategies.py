import pytest
from src.engine.strategies import SloughPointsStrategy, StrategyConfig
from src.engine.state import TrickState, TrickPlay
from src.engine.cards import Card
from tests.test_compliance import create_mock_state

def test_slough_points_strategy_evaluation():
    # Scenario: p1 is the player.
    # Trick 1: p1 played H-2 (Point), Trick Winner p2. (Sloughed points! +Bonus)
    # Trick 2: p1 plays S-Q (Point), Trick Winner p1. (Ate points! -Penalty)
    
    config = StrategyConfig()
    config.strategy_params = {"alpha": 0.0, "beta": 1.0} # Pure slough test
    
    strategy = SloughPointsStrategy()
    
    # Fake state
    state = create_mock_state({"hand": []})
    
    # Setup player
    p1_id = "p1"
    
    # RoundState with completed tricks
    # Trick 1: p1 plays H-2, p2 plays H-10. p2 wins.
    t1 = TrickState(
        trickIndex=0,
        leaderPlayerId="p1",
        ledSuit="hearts",
        plays=[
            TrickPlay(playerId="p1", card=Card(id="H-2", suit="hearts", rank="2", deckIndex=0), order=0),
            TrickPlay(playerId="p2", card=Card(id="H-10", suit="hearts", rank="10", deckIndex=1), order=1)
        ],
        winningPlayerId="p2",
        winningCardId="H-10",
        completed=True
    )
    
    # Trick 2: p2 plays S-2, p1 plays S-Q. p1 wins.
    t2 = TrickState(
        trickIndex=1,
        leaderPlayerId="p2",
        ledSuit="spades",
        plays=[
            TrickPlay(playerId="p2", card=Card(id="S-2", suit="spades", rank="2", deckIndex=2), order=0),
            TrickPlay(playerId="p1", card=Card(id="S-Q", suit="spades", rank="Q", deckIndex=3), order=1)
        ],
        winningPlayerId="p1",
        winningCardId="S-Q",
        completed=True
    )
    
    state.roundState.completedTricks = [t1, t2]
    
    score = strategy.evaluate(state, p1_id, config)
    
    # Calculation:
    # T1: p1 sloughed H-2 (+1 point). Winner p2. Bonus = +1.
    # T2: p1 won trick with S-Q (+13 points). Winner p1. Penalty = -13.
    # Total Slough Score = 1 - 13 = -12.
    # Normalization: -12 / 26 = -0.4615...
    
    expected_score = -12.0 / 26.0
    assert abs(score - expected_score) < 0.0001
