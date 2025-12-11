#!/usr/bin/env python3
"""
Benchmark script for MCTS performance.
Measures simulations per second and identifies bottlenecks.
"""
import time
import cProfile
import pstats
import io
from typing import List, Dict
import sys
import os

# Add parent directory to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from src.engine.state import GameState, RoundState, TrickState, PlayerInGame, ServerPlayerState, Card, GameConfig, TrickPlay
from src.engine.cards import Suit, Rank, SUITS, RANKS, create_card_id
from src.engine.mcts import MCTS, get_legal_moves
from src.engine.determinization import determinize
from src.engine.rules import play_card, complete_trick

def create_test_state() -> GameState:
    """Create a minimal test game state for benchmarking."""
    players = [
        PlayerInGame(
            playerId=f"p{i}",
            seatIndex=i,
            profile={"displayName": f"Player {i}", "avatarSeed": "x", "color": "blue"},
            isBot=(i > 0),
            spectator=False
        )
        for i in range(4)
    ]
    
    # Create a deck
    deck: List[Card] = []
    for suit in SUITS:
        for rank in RANKS:
            deck.append(Card(
                id=create_card_id(0, suit, rank),
                suit=suit,
                rank=rank,
                deckIndex=0
            ))
    
    # Deal hands (9 cards each for 4 players = 36 cards)
    player_states = {}
    for i, player in enumerate(players):
        hand = deck[i*9:(i+1)*9]
        player_states[player.playerId] = ServerPlayerState(
            playerId=player.playerId,
            hand=hand,
            tricksWon=0,
            bid=None,
            roundScoreDelta=0
        )
    
    # Create a trick in progress
    trick = TrickState(
        trickIndex=0,
        leaderPlayerId="p0",
        ledSuit=None,
        plays=[],
        winningPlayerId=None,
        winningCardId=None,
        completed=False
    )
    
    round_state = RoundState(
        roundIndex=0,
        cardsPerPlayer=9,
        roundSeed="test",
        trumpCard=None,
        trumpSuit="spades",
        trumpBroken=False,
        bids={p.playerId: None for p in players},
        biddingComplete=True,
        trickInProgress=trick,
        completedTricks=[],
        dealerPlayerId=None,
        startingPlayerId=None,
        deck=deck,
        remainingDeck=[]
    )
    
    return GameState(
        gameId="benchmark",
        config=GameConfig(
            gameId="benchmark",
            sessionSeed="test",
            roundCount=10,
            minPlayers=4,
            maxPlayers=4
        ),
        phase="PLAYING",
        players=players,
        playerStates=player_states,
        roundState=round_state,
        cumulativeScores={p.playerId: 0 for p in players}
    )

def benchmark_determinization(state: GameState, iterations: int = 100) -> Dict[str, float]:
    """Benchmark the determinization function."""
    observer_id = "p0"
    
    start = time.time()
    for _ in range(iterations):
        _ = determinize(state, observer_id)
    elapsed = time.time() - start
    
    return {
        "iterations": iterations,
        "total_time": elapsed,
        "time_per_iteration": elapsed / iterations,
        "iterations_per_second": iterations / elapsed
    }

def benchmark_mcts_search(state: GameState, time_limit_ms: int = 500, iterations: int = 10) -> Dict[str, float]:
    """Benchmark MCTS search."""
    observer_id = "p0"
    
    total_loops = 0
    total_time = 0
    
    for _ in range(iterations):
        mcts = MCTS(state, observer_id)
        start = time.time()
        result = mcts.search(time_limit_ms=time_limit_ms)
        elapsed = time.time() - start
        
        # Access internal loop count if available
        # We'll need to modify MCTS to track this
        total_time += elapsed
        total_loops += getattr(mcts, 'last_loop_count', 0)
    
    avg_time = total_time / iterations
    avg_loops = total_loops / iterations if total_loops > 0 else 0
    
    return {
        "iterations": iterations,
        "time_limit_ms": time_limit_ms,
        "avg_time_per_search": avg_time,
        "avg_loops_per_search": avg_loops,
        "loops_per_second": avg_loops / avg_time if avg_time > 0 else 0
    }

def profile_determinization(state: GameState, iterations: int = 50):
    """Profile determinization to find hotspots."""
    observer_id = "p0"
    
    profiler = cProfile.Profile()
    profiler.enable()
    
    for _ in range(iterations):
        _ = determinize(state, observer_id)
    
    profiler.disable()
    
    s = io.StringIO()
    ps = pstats.Stats(profiler, stream=s)
    ps.sort_stats('cumulative')
    ps.print_stats(20)  # Top 20 functions
    
    return s.getvalue()

def profile_mcts_search(state: GameState, time_limit_ms: int = 500):
    """Profile MCTS search to find hotspots."""
    observer_id = "p0"
    mcts = MCTS(state, observer_id)
    
    profiler = cProfile.Profile()
    profiler.enable()
    
    _ = mcts.search(time_limit_ms=time_limit_ms)
    
    profiler.disable()
    
    s = io.StringIO()
    ps = pstats.Stats(profiler, stream=s)
    ps.sort_stats('cumulative')
    ps.print_stats(20)  # Top 20 functions
    
    return s.getvalue()

def main():
    print("=" * 60)
    print("MCTS Performance Benchmark")
    print("=" * 60)
    
    state = create_test_state()
    observer_id = "p0"
    
    print("\n1. Benchmarking Determinization...")
    det_results = benchmark_determinization(state, iterations=100)
    print(f"   Iterations: {det_results['iterations']}")
    print(f"   Total time: {det_results['total_time']:.3f}s")
    print(f"   Time per iteration: {det_results['time_per_iteration']*1000:.2f}ms")
    print(f"   Iterations per second: {det_results['iterations_per_second']:.2f}")
    
    print("\n2. Benchmarking MCTS Search...")
    mcts_results = benchmark_mcts_search(state, time_limit_ms=500, iterations=5)
    print(f"   Iterations: {mcts_results['iterations']}")
    print(f"   Time limit: {mcts_results['time_limit_ms']}ms")
    print(f"   Avg time per search: {mcts_results['avg_time_per_search']*1000:.2f}ms")
    print(f"   Avg loops per search: {mcts_results['avg_loops_per_search']:.0f}")
    print(f"   Loops per second: {mcts_results['loops_per_second']:.2f}")
    
    print("\n3. Profiling Determinization (top 20 functions)...")
    det_profile = profile_determinization(state, iterations=50)
    print(det_profile)
    
    print("\n4. Profiling MCTS Search (top 20 functions)...")
    mcts_profile = profile_mcts_search(state, time_limit_ms=500)
    print(mcts_profile)
    
    print("\n" + "=" * 60)
    print("Benchmark Complete")
    print("=" * 60)

if __name__ == "__main__":
    main()
