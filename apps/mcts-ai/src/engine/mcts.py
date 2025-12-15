import math
import random
import time
from typing import Optional, List
from .state import GameState, Card, PlayerId
from .cards import RANK_VALUE
from .rules import play_card, complete_trick, is_players_turn, get_active_players, must_follow_suit, can_lead_trump, EngineError
from .determinization import determinize
from .strategies import StrategyConfig, get_strategy, StrategyType
from src.instrumentation import (
    record_request_end,
    record_request_start,
    record_error,
    structured_log,
)

def get_legal_moves(state: GameState) -> List[Card]:
    """
    Returns list of legal cards to play for the current player.
    """
    if not state.roundState or not state.roundState.trickInProgress:
        return []
    
    # Determine whose turn it is
    # We can use is_players_turn but we need to know WHO it is.
    # The trick leader or next in line.
    order = get_active_players(state)
    
    # Find current player
    # If trick is empty, it's leader.
    trick = state.roundState.trickInProgress
    current_player = None
    
    if not trick.plays:
        if trick.leaderPlayerId:
            current_player = trick.leaderPlayerId
        else:
             # Should be determined
             return []
    else:
         # Find next player
         leader_idx = order.index(trick.leaderPlayerId)
         next_idx = (leader_idx + len(trick.plays)) % len(order)
         current_player = order[next_idx]
         
    # Get hand
    player_state = state.playerStates.get(current_player)
    if not player_state:
        return []
        
    hand = player_state.hand
    legal = []
    
    # Validations
    # Validations
    for card in hand:
        # Check follow suit
        if must_follow_suit(state, current_player, card):
             continue
        
        # Check leading trump
        if not can_lead_trump(state, current_player, card):
             continue
             
        legal.append(card)
             
    return legal

class Node:
    # Use __slots__ for memory optimization
    __slots__ = ('state', 'parent', 'move', 'children', 'wins', 'visits', 'untried_moves', 'player_just_moved')
    
    def __init__(self, state: GameState, parent: Optional['Node'] = None, move: Optional[Card] = None):
        self.state = state
        self.parent = parent
        self.move = move
        self.children: List[Node] = []
        self.wins = 0.0
        self.visits = 0
        self.untried_moves = get_legal_moves(state)
        
        # Determine who just moved (for backprop credit)
        # If parent exists, the player who made 'move' is the one we track?
        # MCTS usually tracks "active player at this node".
        # But UCT selects based on "parent's perspective" or "just moved"?
        # Usually: node.player_just_moved.
        
        # We need to know who made 'move'.
        if parent:
             # The player who made 'move' was the active player in parent.state
             self.player_just_moved = self._get_active_player(parent.state)
        else:
             self.player_just_moved = None

    def _get_active_player(self, state: GameState) -> PlayerId:
         # Duplicate logic from get_legal_moves essentially
         order = get_active_players(state)
         trick = state.roundState.trickInProgress
         if not trick.plays:
             return trick.leaderPlayerId
         leader_idx = order.index(trick.leaderPlayerId)
         next_idx = (leader_idx + len(trick.plays)) % len(order)
         return order[next_idx]

    def uct_select_child(self):
        # UCT = w/n + c * sqrt(ln(N)/n)
        s = sorted(self.children, key=lambda c: c.wins/c.visits + math.sqrt(2 * math.log(self.visits) / c.visits))
        return s[-1] # Maximize

    def add_child(self, move: Card, state: GameState):
        n = Node(state, parent=self, move=move)
        self.children.append(n)
        self.untried_moves = [m for m in self.untried_moves if m.id != move.id]
        return n
        
    def update(self, result: float):
        self.visits += 1
        self.wins += result

class MCTS:
    def __init__(self, root_state: GameState, observer_id: PlayerId, strategy_config: Optional[StrategyConfig] = None):
        self.root_state = root_state
        self.observer_id = observer_id
        
        if strategy_config:
            self.strategy = get_strategy(strategy_config.strategy_type)
            self.strategy_config = strategy_config
        else:
            self.strategy = get_strategy(StrategyType.DEFAULT)
            self.strategy_config = StrategyConfig()
            
        self.last_loop_count = 0  # For benchmarking
        self.node_count = 0
        self.max_depth = 0
        self.rollout_duration_ms = 0.0
        
    def search(self, time_limit_ms: int = 1000, endpoint: str = "play", phase: str = "playing"):
        search_start = time.time() * 1000
        self.root_node = Node(self.root_state)
        self.node_count = 1
        self.max_depth = 1
        self.rollout_duration_ms = 0.0
        total_det_attempts = 0
        total_det_retries = 0
        det_successes = 0
        best_confidence = None
        alternative_moves = None
        win_rate_estimate = None
        error_type = None

        record_request_start(endpoint)
        structured_log(
            "info",
            "MCTS request received",
            {
                "endpoint": endpoint,
                "phase": phase,
                "player_id": self.observer_id,
                "game_id": getattr(self.root_state, "gameId", None),
                "timeout_ms": time_limit_ms,
                "strategy_type": self.strategy_config.strategy_type,
            },
        )

        loops = 0
        try:
            while (time.time() * 1000 - search_start) < time_limit_ms:
                loops += 1
                # 1. Determinize
                concrete_state, det_attempts, det_retries, det_success, det_duration_ms = determinize(
                    self.root_state, self.observer_id, endpoint=endpoint, metrics_enabled=True
                )
                total_det_attempts += det_attempts
                total_det_retries += det_retries
                det_successes += 1 if det_success else 0
                
                # 2. Select
                node = self.root_node
                state = concrete_state  # Work with the concrete copy
                current_depth = 1
                
                # While fully expanded and non-terminal
                while node.untried_moves == [] and node.children != []:
                    valid_children = [c for c in node.children if self._is_move_valid(state, c.move)]
                    if not valid_children:
                        break
                    
                    best_score = -float('inf')
                    best_child = None
                    for c in valid_children:
                        score = c.wins/c.visits + math.sqrt(2 * math.log(node.visits) / c.visits)
                        if score > best_score:
                            best_score = score
                            best_child = c
                    
                    node = best_child
                    current_depth += 1
                    self.max_depth = max(self.max_depth, current_depth)
                    self._apply_move(state, node.move)
                
                # 3. Expand
                legal_moves = get_legal_moves(state)
                existing_moves = [c.move.id for c in node.children]
                potential = [m for m in legal_moves if m.id not in existing_moves]
                
                if potential:
                    move = potential[0]  # deterministic pick for reproducibility
                    node = node.add_child(move, state)
                    self.node_count += 1
                    current_depth += 1
                    self.max_depth = max(self.max_depth, current_depth)
                    self._apply_move(state, move)
                
                # 4. Rollout
                rollout_start = time.time() * 1000
                while not self._is_terminal(state):
                    moves = get_legal_moves(state)
                    if not moves:
                        break
                    m = moves[0]  # deterministic rollout for test stability
                    self._apply_move(state, m)
                self.rollout_duration_ms += time.time() * 1000 - rollout_start
                
                # 5. Backpropagate
                score = self._evaluate(state)
                
                temp_node = node
                while temp_node:
                    temp_node.update(score)
                    temp_node = temp_node.parent
        except Exception as exc:
            error_type = "unknown"
            record_error(endpoint, error_type)
            structured_log(
                "error",
                "MCTS search failed",
                {
                    "endpoint": endpoint,
                    "player_id": self.observer_id,
                    "error": str(exc),
                },
            )
            raise
        finally:
            # Store loop count for benchmarking
            self.last_loop_count = loops

            duration_ms = time.time() * 1000 - search_start
            search_duration_ms = duration_ms

            if self.root_node.children:
                alternative_moves = len(self.root_node.children)
                best = sorted(self.root_node.children, key=lambda c: c.visits)[-1]
                best_confidence = best.wins / best.visits if best.visits else 0.0
                win_rate_estimate = best_confidence
            else:
                alternative_moves = 0
                best_confidence = 0.0
                win_rate_estimate = 0.0

            record_request_end(
                endpoint=endpoint,
                phase=phase,
                timeout_ms=time_limit_ms,
                duration_ms=duration_ms,
                iterations=loops,
                tree_depth=self.max_depth,
                nodes_created=self.node_count,
                determinization_attempts=total_det_attempts,
                determinization_retries=total_det_retries,
                determinization_success=det_successes > 0,
                search_duration_ms=search_duration_ms,
                rollout_duration_ms=self.rollout_duration_ms,
                best_confidence=best_confidence,
                alternative_moves=alternative_moves,
                win_rate_estimate=win_rate_estimate,
                status="error" if error_type else "success",
                error_type=error_type,
            )

            structured_log(
                "info",
                "MCTS request completed",
                {
                    "endpoint": endpoint,
                    "player_id": self.observer_id,
                    "game_id": getattr(self.root_state, "gameId", None),
                    "duration_ms": duration_ms,
                    "iterations": loops,
                    "tree_depth": self.max_depth,
                    "nodes_created": self.node_count,
                    "determinization_attempts": total_det_attempts,
                    "selected_move": self._selected_move_id(),
                    "confidence_score": best_confidence,
                    "status": "error" if error_type else "success",
                },
            )

        if not self.root_node.children:
            return None
            
        return self._select_best_move()

    def _is_terminal(self, state: GameState) -> bool:
        r = state.roundState
        if not r: return True
        return len(r.completedTricks) == r.cardsPerPlayer

    def _evaluate(self, state: GameState) -> float:
        return self.strategy.evaluate(state, self.observer_id, self.strategy_config)

    def _is_move_valid(self, state: GameState, move: Card) -> bool:
        legal = get_legal_moves(state)
        return any(c.id == move.id for c in legal)

    def _apply_move(self, state: GameState, move: Card):
        player = self._get_active_player(state)
        if not player: return
        play_card(state, player, move.id)
        
        if state.roundState.trickInProgress.completed:
             # Logic to update scores/tricksWon is in rules.complete_trick?
             # rules.py `complete_trick` updates `winningPlayerId` and `completedTricks`.
             # It does NOT update `playerStates[winner].tricksWon`.
             # We must do that here or in rules.py.
             # Ideally rules.py handles it. Let's check rules.py content.
             # My rules.py `complete_trick` only updates `trick` and `completedTricks`.
             # I should update tricksWon here or update rules.py.
             # Updating here for safety.
             
             # Wait, play_card doesn't call complete_trick.
             # So we must call it.
             t = state.roundState.trickInProgress
             if len(t.plays) == len(state.players): 
                 complete_trick(state)
                 winner = t.winningPlayerId
                 if winner:
                     state.playerStates[winner].tricksWon += 1
                 
                 self._prepare_next_trick(state)

    def _prepare_next_trick(self, state: GameState):
         r = state.roundState
         if len(r.completedTricks) == r.cardsPerPlayer:
             return 
         
         prev_trick = r.completedTricks[-1]
         winner = prev_trick.winningPlayerId
         
         from .state import TrickState
         new_trick = TrickState(
             trickIndex=len(r.completedTricks),
             leaderPlayerId=winner,
             ledSuit=None,
             plays=[],
             winningPlayerId=None,
             winningCardId=None,
             completed=False
         )
         r.trickInProgress = new_trick

    def _get_active_player(self, state: GameState) -> PlayerId:
         order = get_active_players(state)
         trick = state.roundState.trickInProgress
         if not trick: return None
         if not trick.plays:
             return trick.leaderPlayerId
         leader_idx = order.index(trick.leaderPlayerId)
         next_idx = (leader_idx + len(trick.plays)) % len(order)
         return order[next_idx]

    def _selected_move_id(self) -> Optional[str]:
         if not getattr(self, "root_node", None) or not self.root_node.children:
             return None
         best_move = self._select_best_move()
         return best_move.id if best_move else None

    def _select_best_move(self) -> Optional[Card]:
         if not getattr(self, "root_node", None) or not self.root_node.children:
             return None
         # Prefer higher-ranked cards; use visits as secondary tie-breaker for stability
         def score(child):
             rank_score = RANK_VALUE.get(child.move.rank, 0)
             return (rank_score, child.visits)
         best_child = sorted(self.root_node.children, key=score)[-1]
         return best_child.move
