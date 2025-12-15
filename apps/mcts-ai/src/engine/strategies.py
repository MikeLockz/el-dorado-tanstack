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
    StrategyType.DEFAULT: lambda: DefaultStrategy(),
    StrategyType.SLOUGH_POINTS: lambda: SloughPointsStrategy(),
}

def get_strategy(strategy_type: StrategyType) -> EvaluationStrategy:
    factory = STRATEGY_MAP.get(strategy_type)
    if not factory:
        return DefaultStrategy()
    if callable(factory):
        return factory()
    return factory

class SloughPointsStrategy:
    """
    Goal: Avoid winning tricks with point cards. Bonus for sloughing point cards on opponents.
    """
    def evaluate(self, state: GameState, player_id: PlayerId, config: StrategyConfig) -> float:
        # Defaults
        # alpha: weight for base tricks (we might want to MINIMIZE tricks or just ignore winning unless it has points?)
        # For "Point Slougher", we usually want to avoid points, but winning 'clean' tricks is okay or irrelevant?
        # If we win clean tricks, it's fine. If we win point tricks, bad.
        # But if we want to "Avoid Points", simply not winning tricks is the safest way.
        # However, usually "Sloughing" implies we WANT to lose tricks to dump cards.
        
        alpha = config.strategy_params.get("alpha", 0.0) # Base tricks might not matter or could be negative?
        # If alpha is 1.0, we try to win tricks. If we want to LOSE tricks, alpha might be negative?
        # But let's stick to the composite formula provided: S = alpha * Objective + beta * Strategy.
        # If Objective is "Default (Max Tricks)", and we want to slough, alpha should probably be low or negative.
        # The user/config will provide alpha.
        
        beta = config.strategy_params.get("beta", 1.0)
        point_values = config.strategy_params.get("point_values", {"hearts": 1, "spades:Q": 13})
        
        # Base Score (Tricks Won Ratio)
        base_eval = DefaultStrategy().evaluate(state, player_id, config)
        
        slough_score = 0.0
        r = state.roundState
        if not r: return alpha * base_eval

        # Max potential points per hand (approximate for normalization)
        # 13 Hearts + QS = 26.
        total_game_points = 26.0 
        
        for trick in r.completedTricks:
            trick_points = 0
            has_points = False
            
            # Calculate points in trick
            for play in trick.plays:
                c = play.card
                p_val = 0
                if c.suit in point_values:
                    p_val = point_values[c.suit]
                elif f"{c.suit}:{c.rank}" in point_values:
                    p_val = point_values[f"{c.suit}:{c.rank}"]
                elif c.suit == 'hearts': # Default fallback if not in map but conceptually a point card
                     p_val = point_values.get('hearts', 1)
                elif c.suit == 'spades' and c.rank == 'Q':
                     p_val = point_values.get('spades:Q', 13)
                
                trick_points += p_val
            
            if trick_points > 0:
                if trick.winningPlayerId == player_id:
                    # Penalty for eating points
                    slough_score -= trick_points
                else:
                    # Bonus if WE played a point card on this lost trick
                    my_play = next((p for p in trick.plays if p.playerId == player_id), None)
                    if my_play:
                        c = my_play.card
                        my_p_val = 0
                        # Check logic again specifically for my card
                        if c.suit == 'hearts': 
                            my_p_val = point_values.get('hearts', 1)
                        elif c.suit == 'spades' and c.rank == 'Q':
                            my_p_val = point_values.get('spades:Q', 13)
                        
                        if my_p_val > 0:
                            slough_score += my_p_val
        
        # Normalize slough_score
        # Range is roughly [-26, +26] per hand?
        # Let's normalize to [-1, 1] relative to total_game_points
        norm_slough = slough_score / total_game_points
        
        return alpha * base_eval + beta * norm_slough
