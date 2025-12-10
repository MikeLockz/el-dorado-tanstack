import json
import pytest
from pathlib import Path
from typing import List, Dict, Any
from src.engine.cards import Card, Suit, Rank, SUITS
from src.engine.state import GameState, RoundState, TrickState, PlayerInGame, ServerPlayerState, TrickPlay, GameConfig
from src.engine.rules import play_card, complete_trick, EngineError

FIXTURE_PATH = Path(__file__).parent.parent.parent.parent / "fixtures" / "compliance_suite.json"

def parse_suit(s: str) -> Suit:
    s = s.upper()
    mapping = {'C': 'clubs', 'D': 'diamonds', 'H': 'hearts', 'S': 'spades'}
    return mapping[s]

def parse_rank(r: str) -> Rank:
    return r

def parse_card(c: str) -> Card:
    suit_str, rank_str = c.split('-')
    return Card(
        id=c,
        suit=parse_suit(suit_str),
        rank=parse_rank(rank_str),
        deckIndex=0
    )

def create_mock_state(setup: Dict[str, Any]) -> GameState:
    trick_plays_data = setup.get("trick_plays", [])
    trick_player_ids = [p["player"] for p in trick_plays_data]
    
    unique_ids = sorted(list(set(['p1', 'p2', 'p3', 'p4'] + trick_player_ids)))
    
    players = [
        PlayerInGame(
            playerId=pid,
            seatIndex=i,
            profile={"displayName": f"Player {pid}", "avatarSeed": "x", "color": "red"},
            isBot=False,
            spectator=False
        )
        for i, pid in enumerate(unique_ids)
    ]
    
    player_states = {}
    for pid in unique_ids:
        player_states[pid] = ServerPlayerState(
            playerId=pid,
            hand=[],
            tricksWon=0,
            bid=None
        )
        
    if "hand" in setup:
        player_states['p1'].hand = [parse_card(c) for c in setup["hand"]]
        
    trick_plays = [
        TrickPlay(
            playerId=p["player"],
            card=parse_card(p["card"]),
            order=i
        )
        for i, p in enumerate(trick_plays_data)
    ]
    
    leader_id = trick_plays[0].playerId if trick_plays else 'p1'
    
    trick_in_progress = TrickState(
        trickIndex=0,
        leaderPlayerId=leader_id,
        ledSuit=parse_suit(setup["led_suit"]) if setup.get("led_suit") else None,
        plays=trick_plays,
        winningPlayerId=None,
        winningCardId=None,
        completed=False
    )
    
    round_state = RoundState(
        roundIndex=0,
        cardsPerPlayer=10,
        roundSeed="test",
        trumpCard=None,
        trumpSuit=parse_suit(setup["trump_suit"]) if "trump_suit" in setup else None,
        trumpBroken=setup.get("trump_broken", False),
        bids={pid: 1 for pid in unique_ids},
        biddingComplete=True,
        trickInProgress=trick_in_progress,
        completedTricks=[],
        dealerPlayerId='p4',
        startingPlayerId='p1',
        deck=[],
        remainingDeck=[]
    )
    
    return GameState(
        gameId="test-game",
        config=GameConfig(
            gameId="test-game",
            sessionSeed="seed",
            roundCount=1,
            minPlayers=len(unique_ids),
            maxPlayers=len(unique_ids)
        ),
        phase="PLAYING",
        players=players,
        playerStates=player_states,
        roundState=round_state,
        cumulativeScores={pid: 0 for pid in unique_ids}
    )

def load_scenarios():
    with open(FIXTURE_PATH, "r") as f:
        return json.load(f)

@pytest.mark.parametrize("scenario", load_scenarios())
def test_scenario(scenario):
    state = create_mock_state(scenario["setup"])
    
    if scenario["type"] == "legal_move":
        card_to_play = parse_card(scenario["action"]["card"])
        player_id = "p1"
        
        if scenario["expected"].get("valid"):
            play_card(state, player_id, card_to_play.id)
        else:
            with pytest.raises(EngineError) as excinfo:
                play_card(state, player_id, card_to_play.id)
            assert excinfo.value.code == scenario["expected"]["error"]
            
    elif scenario["type"] == "trick_winner":
        # Note: In TS test, they sliced players. In Python we might not need to if logic is robust.
        # But let's check what complete_trick relies on.
        # It relies on trickInProgress.plays.
        result = complete_trick(state)
        # Result is dict with state, or modified state object
        # In our implementation we returned {"state": state}
        # But state was mutated.
        
        last_trick = state.roundState.completedTricks[-1]
        assert last_trick.winningPlayerId == scenario["expected"]["winning_player"]
