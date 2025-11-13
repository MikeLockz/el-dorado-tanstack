export const SUITS = ['clubs', 'diamonds', 'hearts', 'spades'] as const;
export type Suit = typeof SUITS[number];

export const RANKS = [
  '2',
  '3',
  '4',
  '5',
  '6',
  '7',
  '8',
  '9',
  '10',
  'J',
  'Q',
  'K',
  'A',
] as const;
export type Rank = typeof RANKS[number];

export type CardId = string;

export interface Card {
  id: CardId;
  suit: Suit;
  rank: Rank;
  deckIndex: number;
}

export const RANK_VALUE: Record<Rank, number> = RANKS.reduce<Record<Rank, number>>(
  (acc, rank, index) => {
    acc[rank] = index;
    return acc;
  },
  {} as Record<Rank, number>,
);

export function compareRank(a: Rank, b: Rank): number {
  return RANK_VALUE[a] - RANK_VALUE[b];
}

export function createCardId(deckIndex: number, suit: Suit, rank: Rank): CardId {
  return `d${deckIndex}:${suit}:${rank}`;
}
