import random
from typing import List, Dict, Set, Optional
from .state import GameState, ServerPlayerState, Card, Suit, PlayerId
from .cards import SUITS
from .rules import must_follow_suit, EngineError

def derive_constraints(state: GameState) -> Dict[PlayerId, Set[Suit]]:
    """
    Derives void suits for each player based on past tricks.
    Returns a dict mapping PlayerId to a set of Suits they are void in.
    """
    voids: Dict[PlayerId, Set[Suit]] = {p.playerId: set() for p in state.players}
    
    # Analyze completed tricks
    if state.roundState:
        for trick in state.roundState.completedTricks:
            if not trick.ledSuit:
                continue
            
            led_suit = trick.ledSuit
            for play in trick.plays:
                # If player did not follow suit, they are void in led_suit
                # UNLESS the card they played was the led_suit (which follows suit)
                if play.card.suit != led_suit:
                    voids[play.playerId].add(led_suit)
    
    return voids

def get_unknown_cards(state: GameState, observer_id: PlayerId) -> List[Card]:
    """
    Returns a list of cards that are unknown to the observer.
    (All cards in deck - observer's hand - played cards)
    """
    if not state.roundState:
        return []

    # In a real full deck, we know all cards.
    # But here we might not have the full deck object populated in state if we just received a partial view?
    # The 'deck' in RoundState might be empty or hidden.
    # The 'remainingDeck' usually tracks the talon (not applicable in this game if all dealt?)
    # El Dorado / Spades / etc usually deal all cards.
    
    # We need a reference "All Cards".
    # Assuming standard deck or we can reconstruct from what we see.
    # Safest is: All valid cards - seen cards.
    
    # But wait, if we are in the middle of a game, we know:
    # 1. My hand
    # 2. Played cards (in completed tricks + current trick)
    
    # We need to know the total set of cards involved.
    # If it's a standard deck, we generate all.
    # If custom deck (e.g. reduced), we need that config.
    # Assuming standard deck for now or extracting from Config if available.
    # Domain types don't show deck config explicitly but `cardsPerPlayer` * `numPlayers`.
    
    # For now, let's assume we can rely on `remainingDeck` if populated, or we must reconstruct.
    # The `RoundState` has `deck`. If it's the server state, it has everything.
    # But `RemoteBotStrategy` sends a context.
    # The `BotContext` usually sends what is visible.
    
    # If the MCTS service receives a "partial state", it won't have other players' hands.
    # But it needs to fill them.
    
    # Let's assume we generate the universe of cards and subtract what we know.
    # OR we use `remainingDeck` + other players' hands if they were just nulled out?
    # The payload spec says "hand": [...], "context": ...
    # The "context" mirrors `BotContext`.
    
    # Let's write a helper to generate a standard deck.
    pass 

# Helper to generate full deck (should be in cards.py really)
def generate_standard_deck() -> List[Card]:
    # Placeholder: implementation depends on deck config.
    # For now assume standard 52 or subset used in game.
    # If the game uses specific subset (e.g. pinochle), this fails.
    # The `compliance_suite` uses standard cards.
    from .cards import RANKS, SUITS, create_card_id
    deck = []
    i = 0
    for s in SUITS:
        for r in RANKS:
            deck.append(Card(id=create_card_id(0, s, r), suit=s, rank=r, deckIndex=0))
            i += 1
    return deck

def get_visible_cards(state: GameState, observer_id: PlayerId) -> Set[str]:
    visible = set()
    
    # Observer's hand
    my_hand = state.playerStates[observer_id].hand
    for c in my_hand:
        visible.add(c.id)
        
    if state.roundState:
        # Completed tricks
        for t in state.roundState.completedTricks:
            for p in t.plays:
                visible.add(p.card.id)
                
        # Current trick
        if state.roundState.trickInProgress:
            for p in state.roundState.trickInProgress.plays:
                visible.add(p.card.id)
                
    return visible

def determinize(state: GameState, observer_id: PlayerId) -> GameState:
    """
    Creates a concrete state by randomly assigning unknown cards to other players
    respecting derived constraints.
    """
    import copy
    
    # Clone state to avoid mutating original
    new_state = state.model_copy(deep=True) # Pydantic copy
    
    if not new_state.roundState:
        return new_state
        
    # 1. Derive constraints
    constraints = derive_constraints(new_state)
    
    # 2. Identify unknown cards
    # We need the full universe of cards.
    # If `new_state.roundState.deck` is populated and full, we can use it.
    # But likely the input state (from bot context) might not have the full secret deck.
    # We should reconstruct "All Cards" based on game config if possible.
    # For this implementation, let's assume `generate_standard_deck` is correct OR
    # we can union known cards + unknown slots.
    
    # Better approach:
    # We know how many cards each player *should* have.
    # We know what they *do* have (if visible).
    # We distribute the rest.
    
    # For a bot, `playerStates[other].hand` is likely empty or redacted.
    # We need to fill `playerStates[other].hand`.
    
    visible_ids = get_visible_cards(new_state, observer_id)
    full_deck = generate_standard_deck()
    unknown_cards = [c for c in full_deck if c.id not in visible_ids]
    
    # Filter unknown cards: remove those that are invalid for the game?
    # If the game uses a subset, `generate_standard_deck` might be too big.
    # If `state.config.cardsPerPlayer` * `numPlayers` == total cards.
    # We can assume `unknown_cards` size must match `sum(needed_cards)`.
    
    # Calculate needed cards per player
    needed_counts: Dict[PlayerId, int] = {}
    total_needed = 0
    
    for pid, p_state in new_state.playerStates.items():
        if pid == observer_id:
            needed_counts[pid] = 0 # Already have hand
            continue
            
        # How many cards should they have?
        # Initial cards - plays made.
        # But `p_state.hand` might be empty list for others.
        # We need to track how many they hold.
        # `p_state.hand` length might be 0 if hidden.
        # We can infer count from `roundState.cardsPerPlayer` - `tricks_played`?
        # Or maybe the server sends the count?
        # `ServerPlayerState` usually has `hand`. If hidden, it might be empty.
        
        # Let's assume we can calculate it:
        # rounds_played = len(completedTricks)
        # But players play into tricks.
        # Cards in hand = Initial - Plays made.
        
        # Count plays made by this player
        plays_made = 0
        for t in new_state.roundState.completedTricks:
             if any(p.playerId == pid for p in t.plays):
                 plays_made += 1
        if new_state.roundState.trickInProgress:
             if any(p.playerId == pid for p in new_state.roundState.trickInProgress.plays):
                 plays_made += 1
                 
        current_hand_size = new_state.roundState.cardsPerPlayer - plays_made
        needed_counts[pid] = current_hand_size
        total_needed += current_hand_size
        
    # Trim unknown cards if we have too many (e.g. if deck has extras not in play)
    # If `unknown_cards` > `total_needed`, it means there's a talon or we generated too many.
    # For now, just shuffle and take `total_needed`.
    # But constraints matter!
    
    # Optimization: Filter `unknown_cards` to only those valid in the game?
    # If we don't know the deck config, this is risky.
    # We'll assume `unknown_cards` is the pool.
    
    random.shuffle(unknown_cards)
    
    # 3. Allocation with constraints (Optimized: Sort by constraint count)
    # Sort players by number of constraints (most constrained first) for better allocation
    
    # Create list of (player_id, count) sorted by constraint count (descending)
    player_order = sorted(
        [(pid, count) for pid, count in needed_counts.items() if count > 0],
        key=lambda x: len(constraints[x[0]]),
        reverse=True
    )
    
    max_retries = 50  # Reduced from 100 since we're smarter now
    for attempt in range(max_retries):
        pool = list(unknown_cards)
        random.shuffle(pool)
        
        temp_assignments: Dict[PlayerId, List[Card]] = {pid: [] for pid in needed_counts}
        success = True
        
        # Assign to most constrained players first
        for pid, count in player_order:
            # Filter pool for valid cards for this player
            # Valid = suit not in voids[pid]
            # Use list comprehension with filter for better performance
            valid_cards = [c for c in pool if c.suit not in constraints[pid]]
            
            if len(valid_cards) < count:
                success = False
                break
            
            # Take first 'count' valid cards (randomized by shuffle)
            selected = valid_cards[:count]
            temp_assignments[pid] = selected
            
            # Remove selected cards from pool
            selected_ids = {c.id for c in selected}
            pool = [c for c in pool if c.id not in selected_ids]
                
        if success:
            # Apply assignments
            for pid, cards in temp_assignments.items():
                if needed_counts[pid] > 0:
                    new_state.playerStates[pid].hand = cards
            return new_state
            
    # If we fail, just fill randomly ignoring constraints (graceful degradation)
    # Or raise error. Degradation is better for a bot.
    pool = list(unknown_cards)
    random.shuffle(pool)
    for pid, count in needed_counts.items():
        if count > 0:
             new_state.playerStates[pid].hand = [pool.pop() for _ in range(count)]
        
    return new_state
