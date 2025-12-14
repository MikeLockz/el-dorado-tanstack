import { describe, it, expect } from 'vitest';
import { RemoteBotStrategy } from '../../src/bots/RemoteBotStrategy.js';
import type { Card, BotContext } from '@game/domain';

const mctsEndpoint = process.env.MCTS_ENDPOINT || 'http://localhost:5001';
// Default to running if we can reach the port, or just use explicit flag
const isLive = process.env.MCTS_LIVE_TEST === 'true';

describe.skipIf(!isLive)('MCTS Live Integration', () => {
  const strategy = new RemoteBotStrategy({ endpoint: mctsEndpoint });

  const mockHand: Card[] = [
    { id: 'H-10', rank: '10', suit: 'hearts', deckIndex: 0 },
    { id: 'D-5', rank: '5', suit: 'diamonds', deckIndex: 1 }
  ];

  const mockContext: BotContext = {
    roundIndex: 1,
    cardsPerPlayer: 9,
    trumpSuit: 'spades',
    trumpBroken: false,
    trickIndex: 0,
    currentTrick: {
      trickIndex: 0,
      ledSuit: 'hearts',
      plays: [
        { playerId: 'p1', card: { id: 'H-A', rank: 'A', suit: 'hearts', deckIndex: 2 }, order: 0 }
      ],
      leaderPlayerId: 'p1',
      winningPlayerId: null,
      winningCardId: null,
      completed: false
    },
    playedCards: [{ id: 'S-A', rank: 'A', suit: 'spades', deckIndex: 3 }],
    bids: {
      'p1': 2,
      'bot_1': null
    },
    cumulativeScores: { 'p1': 10, 'bot_1': 5 },
    myPlayerId: 'bot_1',
    rng: () => 0.5,
    config: {
      maxPlayers: 4,
      roundCount: 10
    },
    gameId: 'live-test-game'
  };

  it('successfully bids', async () => {
    const bid = await strategy.bid(mockHand, mockContext);
    console.log('Bot bid:', bid);
    expect(bid).toBeGreaterThanOrEqual(0);
    expect(bid).toBeLessThanOrEqual(mockContext.cardsPerPlayer);
  });

  it('successfully plays a card', async () => {
    // Modify context for play phase
    const playContext = { ...mockContext };
    // We are playing now, so bids should be done.
    playContext.bids = { 'p1': 2, 'bot_1': 2 };

    const card = await strategy.playCard(mockHand, playContext);
    console.log('Bot played:', card);
    expect(card).toBeDefined();
    expect(mockHand.some(c => c.id === card.id)).toBe(true);
  });
});
