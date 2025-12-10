from typing import List, Optional, Dict, Literal
from pydantic import BaseModel
from .cards import Card, Suit

# Player Types
PlayerId = str

class PlayerProfile(BaseModel):
    displayName: str
    avatarSeed: str
    color: str
    userId: Optional[str] = None

class PlayerInGame(BaseModel):
    playerId: PlayerId
    seatIndex: Optional[int]
    profile: Optional[PlayerProfile] = None  # Make optional for tests
    status: Literal['active', 'disconnected', 'left'] = 'active' # Default for tests
    isBot: bool
    spectator: bool

class ServerPlayerState(BaseModel):
    playerId: PlayerId
    hand: List[Card]
    tricksWon: int
    bid: Optional[int]
    roundScoreDelta: int = 0

# Game State Types
class TrickPlay(BaseModel):
    playerId: PlayerId
    card: Card
    order: int

class TrickState(BaseModel):
    trickIndex: int
    leaderPlayerId: PlayerId
    ledSuit: Optional[Suit]
    plays: List[TrickPlay]
    winningPlayerId: Optional[PlayerId]
    winningCardId: Optional[str]
    completed: bool

class RoundState(BaseModel):
    roundIndex: int
    cardsPerPlayer: int
    roundSeed: str
    trumpCard: Optional[Card]
    trumpSuit: Optional[Suit]
    trumpBroken: bool
    bids: Dict[PlayerId, Optional[int]]
    biddingComplete: bool
    trickInProgress: Optional[TrickState]
    completedTricks: List[TrickState]
    dealerPlayerId: Optional[PlayerId]
    startingPlayerId: Optional[PlayerId]
    deck: List[Card]
    remainingDeck: List[Card]

class GameConfig(BaseModel):
    gameId: str
    sessionSeed: str
    roundCount: int
    minPlayers: int
    maxPlayers: int

class GameState(BaseModel):
    gameId: str
    config: GameConfig
    phase: Literal['LOBBY', 'BIDDING', 'PLAYING', 'SCORING', 'COMPLETED']
    players: List[PlayerInGame]
    playerStates: Dict[PlayerId, ServerPlayerState]
    roundState: Optional[RoundState]
    cumulativeScores: Dict[PlayerId, int]
