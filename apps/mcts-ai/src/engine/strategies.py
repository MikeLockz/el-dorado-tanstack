from enum import Enum
from typing import Protocol, Dict, Optional, Any, List
from pydantic import BaseModel
from .state import GameState, PlayerId

class StrategyType(str, Enum):
    DEFAULT = "DEFAULT"
    SLOUGH_POINTS = "SLOUGH_POINTS"
    AGGRESSIVE = "AGGRESSIVE"
    BID_AWARE = "BID_AWARE"

class StrategyConfig(BaseModel):
    strategy_type: StrategyType = StrategyType.DEFAULT
    strategy_params: Dict[str, Any] = {}

class EvaluationStrategy(Protocol):
    def evaluate(self, state: GameState, player_id: PlayerId, config: StrategyConfig) -> float:
        ...

class DefaultStrategy:
    """
    Goal: Win as many tricks as possible.
    Behavior: Evaluate tricks_won / total_tricks.
    """
    def evaluate(self, state: GameState, player_id: PlayerId, config: StrategyConfig) -> float:
        me = state.playerStates.get(player_id)
        if not me: return 0.0
        
        r = state.roundState
        if not r: return 0.0
        
        total = r.cardsPerPlayer
        if total == 0: return 0.0
        
        return me.tricksWon / total

STRATEGY_MAP = {
    StrategyType.DEFAULT: DefaultStrategy(),
    # Other strategies will be added here
}

def get_strategy(strategy_type: StrategyType) -> EvaluationStrategy:
    return STRATEGY_MAP.get(strategy_type, DefaultStrategy())
