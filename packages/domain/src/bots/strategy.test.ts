import { describe, expect, it } from 'vitest';
import type { Card } from '../types/cards.js';
import type { BotContext } from './strategy.js';
import { BaselineBotStrategy } from './strategy.js';
import { createSeededRng } from '../engine/shuffle.js';

const strategy = new BaselineBotStrategy();

function makeCard(partial: Partial<Card> & Pick<Card, 'suit' | 'rank'>): Card {
  return {
    id: partial.id ?? `${partial.suit}-${partial.rank}`,
    deckIndex: partial.deckIndex ?? 0,
    ...partial,
  } as Card;
}

function makeContext(overrides: Partial<BotContext> = {}): BotContext {
  return {
    roundIndex: 0,
    cardsPerPlayer: 5,
    trumpSuit: 'spades',
    trumpBroken: false,
    trickIndex: 0,
    currentTrick: null,
    playedCards: [],
    bids: {},
    cumulativeScores: {},
    myPlayerId: 'bot-1',
    rng: createSeededRng('bot-test'),
    ...overrides,
  } satisfies BotContext;
}

describe('BaselineBotStrategy', () => {
  it('produces deterministic bids for identical context', () => {
    const hand: Card[] = [
      makeCard({ suit: 'spades', rank: 'A' }),
      makeCard({ suit: 'spades', rank: 'K' }),
      makeCard({ suit: 'hearts', rank: '9' }),
      makeCard({ suit: 'diamonds', rank: 'Q' }),
      makeCard({ suit: 'clubs', rank: '5' }),
    ];

    const context = makeContext({ rng: createSeededRng('identical-seed') });
    const first = strategy.bid(hand, context);
    const second = strategy.bid(hand, makeContext({ rng: createSeededRng('identical-seed') }));
    expect(first).toBe(second);
  });

  it('never bids full sweep even with strong hands', () => {
    const hand: Card[] = Array.from({ length: 5 }, (_, idx) =>
      makeCard({ suit: 'spades', rank: idx % 2 === 0 ? 'A' : 'K', id: `s-${idx}` }),
    );
    const bid = strategy.bid(hand, makeContext({ cardsPerPlayer: 5, rng: createSeededRng('strong-hand') }));
    expect(bid).toBeLessThan(5);
  });

  it('bids more aggressively when trailing on score', () => {
    const hand: Card[] = [
      makeCard({ suit: 'spades', rank: 'A', id: 's-a' }),
      makeCard({ suit: 'hearts', rank: 'K', id: 'h-k' }),
      makeCard({ suit: 'clubs', rank: '9', id: 'c-9' }),
      makeCard({ suit: 'diamonds', rank: 'J', id: 'd-j' }),
    ];

    const trailing = strategy.bid(
      hand,
      makeContext({
        rng: createSeededRng('bid-aggression'),
        cumulativeScores: { 'bot-1': 4, rival: 20 },
      }),
    );
    const leading = strategy.bid(
      hand,
      makeContext({
        rng: createSeededRng('bid-aggression'),
        cumulativeScores: { 'bot-1': 18, rival: 3 },
      }),
    );

    expect(trailing).toBeGreaterThanOrEqual(leading);
  });

  it('follows suit and plays the lowest winning card when possible', () => {
    const hand: Card[] = [
      makeCard({ suit: 'hearts', rank: '10', id: 'h-10' }),
      makeCard({ suit: 'hearts', rank: '3', id: 'h-3' }),
      makeCard({ suit: 'clubs', rank: '4', id: 'c-4' }),
    ];

    const context = makeContext({
      currentTrick: {
        trickIndex: 0,
        leaderPlayerId: 'ally',
        ledSuit: 'hearts',
        plays: [{ playerId: 'ally', order: 0, card: makeCard({ suit: 'hearts', rank: '9', id: 'h-9' }) }],
        completed: false,
        winningCardId: null,
        winningPlayerId: null,
      },
    });

    const decision = strategy.playCard(hand, context);
    expect(decision.id).toBe('h-10');
  });

  it('avoids leading trump before broken when alternatives exist', () => {
    const hand: Card[] = [
      makeCard({ suit: 'spades', rank: 'A', id: 'spade-a' }),
      makeCard({ suit: 'clubs', rank: '2', id: 'club-2' }),
    ];
    const decision = strategy.playCard(hand, makeContext({ currentTrick: null }));
    expect(decision.suit).toBe('clubs');
  });

  it('leads high trump when trailing and trump is broken', () => {
    const hand: Card[] = [
      makeCard({ suit: 'spades', rank: 'Q', id: 'spade-q' }),
      makeCard({ suit: 'spades', rank: '8', id: 'spade-8' }),
      makeCard({ suit: 'diamonds', rank: '4', id: 'diamond-4' }),
    ];
    const decision = strategy.playCard(
      hand,
      makeContext({
        currentTrick: null,
        trumpBroken: true,
        cumulativeScores: { 'bot-1': 0, rival: 15 },
      }),
    );
    expect(decision.id).toBe('spade-q');
  });

  it('uses trump to win when void in the led suit', () => {
    const hand: Card[] = [
      makeCard({ suit: 'spades', rank: '2', id: 'spade-2' }),
      makeCard({ suit: 'diamonds', rank: '5', id: 'diamond-5' }),
    ];

    const context = makeContext({
      currentTrick: {
        trickIndex: 1,
        leaderPlayerId: 'ally',
        ledSuit: 'hearts',
        plays: [{ playerId: 'ally', order: 0, card: makeCard({ suit: 'hearts', rank: 'K', id: 'heart-k' }) }],
        completed: false,
        winningCardId: null,
        winningPlayerId: null,
      },
    });

    const decision = strategy.playCard(hand, context);
    expect(decision.suit).toBe('spades');
  });

  it('dumps low cards when comfortably ahead and void in the led suit', () => {
    const hand: Card[] = [
      makeCard({ suit: 'clubs', rank: '2', id: 'club-2' }),
      makeCard({ suit: 'diamonds', rank: '10', id: 'diamond-10' }),
      makeCard({ suit: 'spades', rank: '5', id: 'spade-5' }),
    ];

    const decision = strategy.playCard(
      hand,
      makeContext({
        trumpBroken: false,
        cumulativeScores: { 'bot-1': 30, rival: 0 },
        currentTrick: {
          trickIndex: 3,
          leaderPlayerId: 'ally',
          ledSuit: 'hearts',
          plays: [{ playerId: 'ally', order: 0, card: makeCard({ suit: 'hearts', rank: 'J', id: 'heart-j' }) }],
          completed: false,
          winningCardId: null,
          winningPlayerId: null,
        },
      }),
    );

    expect(decision.id).toBe('club-2');
  });
});
