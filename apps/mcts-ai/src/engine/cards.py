from typing import Literal, Dict
from pydantic import BaseModel

Suit = Literal['clubs', 'diamonds', 'hearts', 'spades']
Rank = Literal['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A']

SUITS: list[Suit] = ['clubs', 'diamonds', 'hearts', 'spades']
RANKS: list[Rank] = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A']

RANK_VALUE: Dict[Rank, int] = {rank: i for i, rank in enumerate(RANKS)}

class Card(BaseModel):
    id: str
    suit: Suit
    rank: Rank
    deckIndex: int

    def __hash__(self):
        return hash(self.id)

    def __eq__(self, other):
        if isinstance(other, Card):
            return self.id == other.id
        return False

def compare_rank(a: Rank, b: Rank) -> int:
    return RANK_VALUE[a] - RANK_VALUE[b]

def create_card_id(deck_index: int, suit: Suit, rank: Rank) -> str:
    return f"d{deck_index}:{suit}:{rank}"
