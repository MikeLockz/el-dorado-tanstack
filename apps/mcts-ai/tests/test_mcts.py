import pytest
from src.engine.mcts import MCTS
from src.engine.state import GameState, RoundState, TrickState, PlayerInGame, ServerPlayerState, TrickPlay, GameConfig, Card
from src.engine.cards import Suit, Rank
from src.engine.rules import play_card
from tests.test_compliance import create_mock_state, parse_card

def test_mcts_finds_winning_move_simple():
    # Scenario: 
    # Player p1 (Bot) holds S-A and H-2.
    # Player p2 holds S-K and H-3.
    # p1 leads. Spades are trump (or no trump, S-A wins anyway).
    # p1 should play S-A to win the trick immediately?
    # No, if p1 leads S-A, p2 must follow S-K. p1 wins.
    # If p1 leads H-2, p2 plays H-3. p2 wins.
    # So S-A is better.
    
    setup = {
        "hand": ["S-A", "H-2"],
        "trick_plays": [], # New trick
        "led_suit": None,
        "trump_suit": "S",
        "trump_broken": False
    }
    
    # We need to set p2's hand too for the simulation to be accurate?
    # But MCTS deals with hidden info.
    # If we don't set p2's hand in `create_mock_state`, it's empty.
    # `determinize` will fill it.
    # But `determinize` uses random cards.
    # If p1 holds S-A, H-2.
    # Remaining deck has S-K, H-3 (implied from my scenario description).
    # But `determinize` will generate a full standard deck minus S-A, H-2.
    # S-K is high probability to be in p2's hand if deck is small?
    # Or just random.
    
    # To make the test deterministic-ish or obvious:
    # Give p1 S-A (Boss card). It always wins.
    # Give p1 H-2 (Loser card).
    # Playing S-A guarantees a win. Playing H-2 might lose.
    # So MCTS should pick S-A.
    
    state = create_mock_state(setup)
    
    # Ensure config has correct player count (2 for simplicity)
    state.config.minPlayers = 2
    state.config.maxPlayers = 2
    state.players = state.players[:2]
    state.playerStates = {k: v for k, v in state.playerStates.items() if k in ['p1', 'p2']}
    state.roundState.bids = {'p1': 1, 'p2': 1}
    state.cumulativeScores = {'p1': 0, 'p2': 0}
    
    # MCTS
    mcts = MCTS(state, observer_id='p1')
    
    # Search with short timeout
    best_move = mcts.search(time_limit_ms=500)
    
    assert best_move is not None
    assert best_move.id == "S-A" # Ace of Spades is the winner

def test_mcts_must_follow_suit_logic():
    # Scenario: p2 led Hearts. p1 holds H-5 and S-A.
    # p1 MUST play H-5. S-A is illegal.
    setup = {
        "hand": ["H-5", "S-A"],
        "trick_plays": [{"player": "p2", "card": "H-10"}],
        "led_suit": "H",
        "trump_suit": "S"
    }
    state = create_mock_state(setup)
    state.config.minPlayers = 2
    state.config.maxPlayers = 2
    state.players = state.players[:2]
    state.playerStates = {k: v for k, v in state.playerStates.items() if k in ['p1', 'p2']}
    
    mcts = MCTS(state, observer_id='p1')
    best_move = mcts.search(time_limit_ms=200)
    
    assert best_move is not None
    assert best_move.id == "H-5" # Only legal move
