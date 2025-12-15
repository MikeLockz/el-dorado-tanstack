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
    StrategyType.AGGRESSIVE: lambda: AggressiveStrategy(),
}

def get_strategy(strategy_type: StrategyType) -> EvaluationStrategy:
    factory = STRATEGY_MAP.get(strategy_type)
    if not factory:
        return DefaultStrategy()
    if callable(factory):
        return factory()
    return factory

class AggressiveStrategy:
    """
    Goal: Win tricks early in the hand.
    Uses 'aggression_ratio' (0.0 to 1.0) to determine the 'early' phase.
    """
    def evaluate(self, state: GameState, player_id: PlayerId, config: StrategyConfig) -> float:
        r = state.roundState
        if not r: return 0.0

        # Determine threshold based on ratio (default 0.3 -> first 30% of tricks)
        ratio = config.strategy_params.get("aggression_factor", 0.3)
        threshold = max(2, int(r.cardsPerPlayer * ratio)) # At least 2 tricks if possible
        
        alpha = config.strategy_params.get("alpha", 0.5) # Base weight
        beta = config.strategy_params.get("beta", 1.0) # Bonus weight
        
        base_eval = DefaultStrategy().evaluate(state, player_id, config)
        
        early_wins = 0
        
        for trick in r.completedTricks:
            if trick.trickIndex < threshold:
                if trick.winningPlayerId == player_id:
                    early_wins += 1
        
        # Normalize
        max_possible = min(threshold, r.cardsPerPlayer)
        if max_possible == 0:
            norm_bonus = 0.0
        else:
            norm_bonus = early_wins / max_possible
            
        return alpha * base_eval + beta * norm_bonus


class SloughPointsStrategy:
    """
    Goal: Avoid winning tricks that contain 'point cards'.
    - point_values: Dict[suit_or_card_id, value]. E.g. {"hearts": 1, "spades:Q": 13}
    """
    def evaluate(self, state: GameState, player_id: PlayerId, config: StrategyConfig) -> float:
        r = state.roundState
        if not r: return 0.0

        alpha = config.strategy_params.get("alpha", 0.0) 
        beta = config.strategy_params.get("beta", 1.0)
        
        # Load point config (No hardcoded defaults)
        # If empty, this strategy effectively does nothing besides base_eval
        point_values = config.strategy_params.get("point_values", {})
        
        base_eval = DefaultStrategy().evaluate(state, player_id, config)
        
        slough_score = 0.0
        max_seen_penalty = 0.0 # To help normalization if possible, though hard to know upper bound without rules
        
        for trick in r.completedTricks:
            trick_points = 0
            
            # Calculate points in trick
            for play in trick.plays:
                c = play.card
                p_val = 0
                
                # Check specific card first (e.g. "spades:Q")
                card_key = f"{c.suit}:{c.rank}"
                if card_key in point_values:
                    p_val = point_values[card_key]
                # Check suit (e.g. "hearts")
                elif c.suit in point_values:
                    p_val = point_values[c.suit]
                
                trick_points += p_val
            
            if trick_points > 0:
                if trick.winningPlayerId == player_id:
                    # Penalty for winning points
                    slough_score -= trick_points
                else:
                    # Bonus if WE played a point card on this lost trick
                    my_play = next((p for p in trick.plays if p.playerId == player_id), None)
                    if my_play:
                        c = my_play.card
                        my_p_val = 0
                        # Re-calc my card's value
                        card_key = f"{c.suit}:{c.rank}"
                        if card_key in point_values:
                            my_p_val = point_values[card_key]
                        elif c.suit in point_values:
                            my_p_val = point_values[c.suit]
                        
                        if my_p_val > 0:
                            slough_score += my_p_val

        # Normalization is tricky without knowing Max Points.
        # We can accept raw scores (MCTS will naturally prefer higher), 
        # or we might clamp if weights are standardized.
        # For now, we return raw score weighted by beta.
        # The MCTS UCT works best with [0,1], effectively we might be shifting bounds.
        # Ideally we assume some 'max_points_in_deck' if known, or just use a dampening factor.
        # Let's dampen by 26.0 (Standard Spades/Hearts max) just as a baseline scaler
        # even if not strictly accurate for all games.
        
        scaler = 26.0
        norm_slough = slough_score / scaler
        
        return alpha * base_eval + beta * norm_slough
