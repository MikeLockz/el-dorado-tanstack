from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import List, Dict, Optional, Any
import logging

from src.engine.state import GameState, RoundState, TrickState, PlayerInGame, ServerPlayerState, Card, GameConfig, TrickPlay
from src.engine.cards import Suit, Rank
from src.engine.mcts import MCTS

app = FastAPI()
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class CardModel(BaseModel):
    id: str
    rank: str
    suit: str

class TrickPlayModel(BaseModel):
    playerId: str
    card: CardModel

class TrickModel(BaseModel):
    trickIndex: int
    ledSuit: Optional[str]
    plays: List[TrickPlayModel]
    leaderPlayerId: Optional[str] = None

class BotContextModel(BaseModel):
    roundIndex: int
    cardsPerPlayer: int
    trumpSuit: Optional[str]
    trumpBroken: bool
    trickIndex: int
    currentTrick: Optional[TrickModel]
    playedCards: List[str]
    bids: Dict[str, Optional[int]]
    cumulativeScores: Dict[str, int]
    myPlayerId: str
    
class GameConfigModel(BaseModel):
    maxPlayers: int
    roundCount: int
    # sessionSeed etc might be missing in payload, mock them

class Payload(BaseModel):
    phase: str
    hand: List[CardModel]
    context: BotContextModel
    config: GameConfigModel
    timeout_ms: Optional[int] = 1000

def map_card(c: CardModel) -> Card:
    return Card(id=c.id, suit=c.suit, rank=c.rank, deckIndex=0)

def map_payload_to_state(payload: Payload) -> GameState:
    ctx = payload.context
    my_id = ctx.myPlayerId
    
    # Reconstruct Players
    # We don't have full player list in BotContext usually?
    # We can infer from bids/scores keys.
    player_ids = sorted(list(ctx.cumulativeScores.keys()))
    players = [
        PlayerInGame(
            playerId=pid,
            seatIndex=i,
            profile={"displayName": f"Player {pid}", "avatarSeed": "x", "color": "blue"},
            isBot=(pid == my_id),
            spectator=False
        )
        for i, pid in enumerate(player_ids)
    ]
    
    # Reconstruct PlayerStates
    player_states = {}
    for pid in player_ids:
        player_states[pid] = ServerPlayerState(
            playerId=pid,
            hand=[], # Hidden for others
            tricksWon=0, # We might need to infer this from history or it's missing
            bid=ctx.bids.get(pid),
            roundScoreDelta=0
        )
    
    # Fill my hand
    player_states[my_id].hand = [map_card(c) for c in payload.hand]
    
    # Reconstruct RoundState
    # Completed tricks?
    # Context usually has `playedCards` (list of IDs) but not structure of past tricks.
    # However, `determinization` needs past tricks to derive constraints!
    # `BotContext` in Domain might be insufficient if it only lists `playedCards`.
    # Let's check Domain `BotContext` definition in TS.
    # `packages/domain/src/bots/strategy.ts`? No, `BotContext` usually in types.
    # `packages/domain/src/bots/adapter.ts` usually defines what is sent.
    
    # If the payload lacks trick history, we CANNOT derive constraints effectively.
    # We can only assume random distribution.
    # But `playedCards` allows us to remove cards from deck.
    
    # Assuming for now we map what we have.
    # If we need history, we might need to update TS side to send it.
    # Docs 3A Payload example has `playedCards`.
    
    # MCTS needs `completedTricks`.
    # If not provided, we start with empty completed tricks.
    # But `trickIndex` tells us how many passed.
    # If `trickIndex` > 0, we have missing history.
    # This is a limitation of the current spec if `BotContext` is minimal.
    
    # However, `currentTrick` is available.
    
    current_trick_plays = []
    if ctx.currentTrick:
        for p in ctx.currentTrick.plays:
            current_trick_plays.append(TrickPlay(
                playerId=p.playerId,
                card=map_card(p.card),
                order=0 # infer order
            ))
            
    trick_in_progress = TrickState(
        trickIndex=ctx.trickIndex,
        leaderPlayerId=ctx.currentTrick.leaderPlayerId if ctx.currentTrick and ctx.currentTrick.leaderPlayerId else (current_trick_plays[0].playerId if current_trick_plays else my_id), # Hacky fallback
        ledSuit=ctx.currentTrick.ledSuit if ctx.currentTrick else None,
        plays=current_trick_plays,
        winningPlayerId=None,
        winningCardId=None,
        completed=False
    )
    
    # Mock completed tricks to satisfy state validity (though empty)
    # If we want to support constraints, we need full history.
    # For now, we ignore constraints from past tricks if not provided.
    completed_tricks = [] 
    
    round_state = RoundState(
        roundIndex=ctx.roundIndex,
        cardsPerPlayer=ctx.cardsPerPlayer,
        roundSeed="mock",
        trumpCard=None,
        trumpSuit=ctx.trumpSuit,
        trumpBroken=ctx.trumpBroken,
        bids=ctx.bids,
        biddingComplete=True, # If we are in play phase
        trickInProgress=trick_in_progress,
        completedTricks=completed_tricks,
        dealerPlayerId=None,
        startingPlayerId=None,
        deck=[], # Secret
        remainingDeck=[]
    )
    
    return GameState(
        gameId="game",
        config=GameConfig(
            gameId="game",
            sessionSeed="seed",
            roundCount=payload.config.roundCount,
            minPlayers=payload.config.maxPlayers, # Assumption
            maxPlayers=payload.config.maxPlayers
        ),
        phase="PLAYING",
        players=players,
        playerStates=player_states,
        roundState=round_state,
        cumulativeScores=ctx.cumulativeScores
    )

@app.post("/api/v1/play")
async def play_card_endpoint(payload: Payload):
    logger.info(f"Received play request for {payload.context.myPlayerId}")
    
    try:
        state = map_payload_to_state(payload)
        mcts = MCTS(state, observer_id=payload.context.myPlayerId)
        
        # Determine time budget
        time_limit = payload.timeout_ms or 1000
        
        best_card = mcts.search(time_limit_ms=time_limit)
        
        if not best_card:
            raise HTTPException(status_code=500, detail="MCTS failed to find a move")
            
        return {"card": best_card.id}
    except Exception as e:
        logger.error(f"Error in play endpoint: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/v1/bid")
async def bid_endpoint(payload: Payload):
    # MCTS for bidding?
    # Current MCTS only plays cards.
    # Bidding strategy might be rule-based or separate MCTS.
    # For now, return simple heuristic or random.
    # Docs don't specify MCTS for bidding in detail, just "Decision Engine".
    # We'll implement a placeholder or simple logic.
    
    # Simple rule: Bid based on high cards + trump.
    # Or just return 1 to be safe.
    return {"bid": 1}

@app.get("/health")
async def health():
    return {"status": "ok"}
