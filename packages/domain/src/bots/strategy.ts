import type { Card, Rank, Suit } from '../types/cards.js';
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

const HIGH_CARD_RANKS = new Set<Rank>(['A', 'K', 'Q']);

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
    const longestSuit = Math.max(...Object.values(suitCounts));
    const longSuitBonus = Math.max(0, longestSuit - 2) * 0.35;
    const scoreDelta = computeScoreDelta(context);
    const aggression = scoreDelta < 0 ? Math.min(Math.abs(scoreDelta) / 12, 0.8) : -Math.min(scoreDelta / 15, 0.4);
    const roundPressure = context.cardsPerPlayer > 0 ? (context.roundIndex / context.cardsPerPlayer) * 0.35 : 0;

    let expected = trumpCount + highCardStrength * 0.5 + voidableSuits * 0.3 + longSuitBonus + aggression + roundPressure;
    expected = Math.max(expected, 0);
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
    const scoreDelta = computeScoreDelta(context);
    const nonTrump = trumpSuit ? sorted.filter((card) => card.suit !== trumpSuit) : sorted;

    if (!trick || trick.plays.length === 0) {
      return chooseLeadCard(sorted, context, scoreDelta);
    }

    if (ledSuit) {
      const ledSuitCards = sorted.filter((card) => card.suit === ledSuit);
      if (ledSuitCards.length > 0) {
        const winningOptions = ledSuitCards.filter((card) =>
          beats(card, currentWinner, ledSuit, trumpSuit),
        );
        if (winningOptions.length > 0) {
          return winningOptions[0];
        }
        return ledSuitCards[ledSuitCards.length - 1];
      }
    }

    if (ledSuit && trumpSuit) {
      const trumpCards = sorted.filter((card) => card.suit === trumpSuit);
      if (trumpCards.length > 0) {
        const winningTrump = trumpCards.filter((card) =>
          beats(card, currentWinner, ledSuit, trumpSuit),
        );
        const avoidWinning = scoreDelta > 5 && nonTrump.length > 0;
        if (winningTrump.length > 0 && !avoidWinning) {
          return winningTrump[0];
        }
        if (context.trumpBroken || nonTrump.length === 0 || scoreDelta < 0) {
          return scoreDelta > 5 ? trumpCards[0] : trumpCards[trumpCards.length - 1];
        }
      }
    }

    if (!context.trumpBroken && trumpSuit && nonTrump.length > 0) {
      return scoreDelta > 5 ? nonTrump[0] : nonTrump[nonTrump.length - 1];
    }

    return scoreDelta > 5 ? sorted[0] : sorted[sorted.length - 1];
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

function computeScoreDelta(context: BotContext): number {
  const myScore = context.cumulativeScores[context.myPlayerId] ?? 0;
  const scores = Object.values(context.cumulativeScores);
  if (scores.length === 0) {
    return 0;
  }
  const average = scores.reduce((sum, value) => sum + value, 0) / scores.length;
  return myScore - average;
}

function chooseLeadCard(sortedCards: Card[], context: BotContext, scoreDelta: number): Card {
  if (sortedCards.length === 0) {
    throw new Error('Bot cannot lead without cards');
  }

  const trumpSuit = context.trumpSuit;
  if (trumpSuit && context.trumpBroken && scoreDelta < 0) {
    const trumps = sortedCards.filter((card) => card.suit === trumpSuit);
    if (trumps.length > 0) {
      return trumps[trumps.length - 1];
    }
  }

  const counts = countSuitDistribution(sortedCards);
  let bestSuit: Suit | null = null;
  for (const suit of Object.keys(counts) as Suit[]) {
    if (!bestSuit || counts[suit] > counts[bestSuit]) {
      bestSuit = suit;
    }
  }

  if (bestSuit) {
    const suited = sortedCards.filter((card) => card.suit === bestSuit);
    return scoreDelta > 5 ? suited[0] : suited[suited.length - 1];
  }

  return scoreDelta > 5 ? sortedCards[0] : sortedCards[sortedCards.length - 1];
}
