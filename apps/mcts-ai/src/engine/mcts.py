import math
import random
import time
from typing import Optional, List
from .state import GameState, Card, PlayerId
from .rules import play_card, complete_trick, is_players_turn, get_active_players, must_follow_suit, EngineError
from .determinization import determinize

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
    for card in hand:
        # Check follow suit
        if must_follow_suit(state, current_player, card):
             # If must follow suit, then only matching suit is legal?
             # wait, must_follow_suit returns boolean "does this specific card violate the rule?"
             # No, must_follow_suit usually returns "is the player forced to follow suit?" 
             # Let's check rules.py implementation.
             pass
             
    # rules.must_follow_suit implementation:
    # def must_follow_suit(state, pid, card):
    #    if card.suit == led: return False
    #    return player_has_suit(state, pid, led)
    
    # If must_follow_suit returns True, it means playing 'card' is ILLEGAL because you hold the suit but 'card' is not it.
    
    for card in hand:
        try:
             # We can reuse validate_play logic or just check must_follow_suit
             # logic in rules.py: if must_follow_suit(...) -> raise
             if must_follow_suit(state, current_player, card):
                 continue
             legal.append(card)
        except Exception as e:
             continue
             
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
    def __init__(self, root_state: GameState, observer_id: PlayerId):
        self.root_state = root_state
        self.observer_id = observer_id
        self.last_loop_count = 0  # For benchmarking
        
    def search(self, time_limit_ms: int = 1000):
        start_time = time.time() * 1000
        self.root_node = Node(self.root_state)
        
        loops = 0
        while (time.time() * 1000 - start_time) < time_limit_ms:
            loops += 1
            # 1. Determinize
            concrete_state = determinize(self.root_state, self.observer_id)
            
            # 2. Select
            node = self.root_node
            state = concrete_state # Work with the concrete copy
            
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
                self._apply_move(state, node.move)
            
            # 3. Expand
            legal_moves = get_legal_moves(state)
            existing_moves = [c.move.id for c in node.children]
            potential = [m for m in legal_moves if m.id not in existing_moves]
            
            if potential:
                move = random.choice(potential)
                node = node.add_child(move, state)
                self._apply_move(state, move)
            else:
                # If no potential moves, maybe terminal or fully expanded?
                pass
            
            # 4. Rollout
            while not self._is_terminal(state):
                moves = get_legal_moves(state)
                if not moves:
                    break 
                m = random.choice(moves)
                self._apply_move(state, m)
                
            # 5. Backpropagate
            score = self._evaluate(state)
            
            temp_node = node
            while temp_node:
                temp_node.update(score)
                temp_node = temp_node.parent
        
        # Store loop count for benchmarking
        self.last_loop_count = loops
        
        if not self.root_node.children:
            return None
            
        return sorted(self.root_node.children, key=lambda c: c.visits)[-1].move

    def _is_terminal(self, state: GameState) -> bool:
        r = state.roundState
        if not r: return True
        return len(r.completedTricks) == r.cardsPerPlayer

    def _evaluate(self, state: GameState) -> float:
        # Return score for observer [0, 1] based on tricks won
        me = state.playerStates.get(self.observer_id)
        if not me: return 0.0
        total = state.roundState.cardsPerPlayer
        if total == 0: return 0.0
        return me.tricksWon / total

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
