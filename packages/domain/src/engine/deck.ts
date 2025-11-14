import { RANKS, SUITS, type Card } from '../types/cards.js';
import { createCardId } from '../types/cards.js';

export const CARDS_PER_STANDARD_DECK = SUITS.length * RANKS.length;

export function createDeck(numDecks: number): Card[] {
  if (!Number.isInteger(numDecks) || numDecks <= 0) {
    throw new Error('numDecks must be a positive integer');
  }

  const decks: Card[] = [];
  for (let deckIndex = 0; deckIndex < numDecks; deckIndex += 1) {
    for (const suit of SUITS) {
      for (const rank of RANKS) {
        decks.push({
          id: createCardId(deckIndex, suit, rank),
          suit,
          rank,
          deckIndex,
        });
      }
    }
  }
  return decks;
}

export function getDeckCountForPlayers(playerCount: number): number {
  if (playerCount < 2 || playerCount > 10) {
    throw new Error('playerCount must be between 2 and 10');
  }
  return playerCount <= 5 ? 1 : 2;
}
