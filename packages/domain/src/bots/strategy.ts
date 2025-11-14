import type { Card, Suit } from '../types/cards.js';
import type { TrickState } from '../types/game.js';
import type { PlayerId } from '../types/player.js';
import { RANK_VALUE, SUITS } from '../types/cards.js';
import type { Rng } from '../engine/shuffle.js';

export interface BotContext {
  roundIndex: number;
  cardsPerPlayer: number;
  trumpSuit: Suit | null;
  trumpBroken: boolean;
  trickIndex: number;
  currentTrick: TrickState | null;
  playedCards: Card[];
  bids: Record<PlayerId, number | null>;
  cumulativeScores: Record<PlayerId, number>;
  myPlayerId: PlayerId;
  rng: Rng;
}

export interface BotStrategy {
  bid(hand: Card[], context: BotContext): number;
  playCard(hand: Card[], context: BotContext): Card;
}

const HIGH_CARD_RANKS = new Set(['A', 'K', 'Q'] as const);

export class BaselineBotStrategy implements BotStrategy {
  bid(hand: Card[], context: BotContext): number {
    if (hand.length === 0) {
      return 0;
    }

    const trumpSuit = context.trumpSuit;
    const suitCounts = countSuitDistribution(hand);
    const trumpCount = trumpSuit ? suitCounts[trumpSuit] ?? 0 : 0;
    const highCardStrength = hand.reduce((score, card) => {
      if (!HIGH_CARD_RANKS.has(card.rank)) {
        return score;
      }
      const base = card.suit === trumpSuit ? 0.75 : 0.5;
      return score + base;
    }, 0);

    const voidableSuits = SUITS.filter((suit) => (suitCounts[suit] ?? 0) <= 1 && suit !== trumpSuit).length;

    let expected = trumpCount + highCardStrength * 0.5 + voidableSuits * 0.3;
    expected += context.rng() * 0.5;

    let bid = Math.round(expected);
    bid = Math.min(Math.max(bid, 0), context.cardsPerPlayer);
    if (bid === context.cardsPerPlayer && bid > 0) {
      bid -= 1;
    }
    return bid;
  }

  playCard(hand: Card[], context: BotContext): Card {
    if (hand.length === 0) {
      throw new Error('Bot cannot play without cards');
    }

    const trick = context.currentTrick;
    const ledSuit = trick?.ledSuit ?? null;
    const trumpSuit = context.trumpSuit;
    const legalCards = determineLegalCards(hand, context);
    const sorted = sortByRank(legalCards);
    const currentWinner = determineWinningCard(trick, trumpSuit);

    if (ledSuit && hand.some((card) => card.suit === ledSuit)) {
      const ledSuitCards = sorted.filter((card) => card.suit === ledSuit);
      const winningOptions = ledSuitCards.filter((card) =>
        beats(card, currentWinner, ledSuit, trumpSuit),
      );
      if (winningOptions.length > 0) {
        return winningOptions[0];
      }
      return ledSuitCards[0];
    }

    if (ledSuit && trumpSuit) {
      const trumpCards = sorted.filter((card) => card.suit === trumpSuit);
      if (trumpCards.length > 0) {
        const winningTrump = trumpCards.filter((card) =>
          beats(card, currentWinner, ledSuit, trumpSuit),
        );
        if (winningTrump.length > 0) {
          return winningTrump[0];
        }
      }
    }

    const nonTrump = trumpSuit ? sorted.filter((card) => card.suit !== trumpSuit) : sorted;
    if (!context.trumpBroken && trumpSuit && (trick?.plays.length ?? 0) === 0 && nonTrump.length > 0) {
      return nonTrump[0];
    }

    return sorted[0];
  }
}

function determineLegalCards(hand: Card[], context: BotContext): Card[] {
  const trick = context.currentTrick;
  const trumpSuit = context.trumpSuit;
  const ledSuit = trick?.ledSuit;

  if (!trick || trick.plays.length === 0 || !ledSuit) {
    if (!trumpSuit || context.trumpBroken) {
      return [...hand];
    }
    const nonTrump = hand.filter((card) => card.suit !== trumpSuit);
    return nonTrump.length > 0 ? nonTrump : [...hand];
  }

  const ledSuitCards = hand.filter((card) => card.suit === ledSuit);
  if (ledSuitCards.length > 0) {
    return ledSuitCards;
  }
  return [...hand];
}

function sortByRank(hand: Card[]): Card[] {
  return [...hand].sort((a, b) => {
    const diff = RANK_VALUE[a.rank] - RANK_VALUE[b.rank];
    if (diff !== 0) {
      return diff;
    }
    return a.id.localeCompare(b.id);
  });
}

function determineWinningCard(trick: TrickState | null | undefined, trumpSuit: Suit | null): Card | null {
  if (!trick || trick.plays.length === 0) {
    return null;
  }
  return trick.plays.reduce((best, play) => {
    if (!best) {
      return play.card;
    }
    const ledSuit = trick.ledSuit;
    return beats(play.card, best, ledSuit, trumpSuit) ? play.card : best;
  }, null as Card | null);
}

function beats(candidate: Card, incumbent: Card | null, ledSuit: Suit | null, trumpSuit: Suit | null): boolean {
  if (!incumbent) {
    return true;
  }
  if (candidate.suit === incumbent.suit) {
    return RANK_VALUE[candidate.rank] > RANK_VALUE[incumbent.rank];
  }
  if (trumpSuit && candidate.suit === trumpSuit && incumbent.suit !== trumpSuit) {
    return true;
  }
  if (trumpSuit && incumbent.suit === trumpSuit && candidate.suit !== trumpSuit) {
    return false;
  }
  if (ledSuit && candidate.suit === ledSuit && incumbent.suit !== ledSuit) {
    return true;
  }
  return false;
}

function countSuitDistribution(hand: Card[]): Record<Suit, number> {
  const counts = {} as Record<Suit, number>;
  for (const card of hand) {
    counts[card.suit] = (counts[card.suit] ?? 0) + 1;
  }
  return counts;
}
