import { describe, expect, it, vi, beforeEach } from 'vitest';
import { RemoteBotStrategy } from './RemoteBotStrategy.js';
import type { Card, BotContext } from '@game/domain';

// Mock fetch
const fetchMock = vi.fn();
global.fetch = fetchMock;

const mockContext: BotContext = {
  roundIndex: 0,
  cardsPerPlayer: 10,
  trumpSuit: 'spades',
  trumpBroken: false,
  trickIndex: 0,
  currentTrick: null,
  playedCards: [],
  bids: {},
  cumulativeScores: {},
  myPlayerId: 'bot_1',
  rng: () => 0.5,
  config: { maxPlayers: 4, roundCount: 10 },
  gameId: 'test-game',
};

const mockHand: Card[] = [{ id: 'S-A', rank: 'A', suit: 'spades', deckIndex: 0 }];

describe('RemoteBotStrategy', () => {
  beforeEach(() => {
    fetchMock.mockReset();
  });

  it('calls remote endpoint for bid and returns value', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ bid: 3 }),
    });

    const strategy = new RemoteBotStrategy({ endpoint: 'http://localhost:5001' });
    const bid = await strategy.bid(mockHand, mockContext);

    expect(bid).toBe(3);
    expect(fetchMock).toHaveBeenCalledWith('http://localhost:5001/bid', expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({
        'X-Game-Id': 'test-game',
      }),
      body: expect.stringContaining('"phase":"bid"'),
    }));
  });

  it('calls remote endpoint for play and returns card', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ card: 'S-A' }),
    });

    const strategy = new RemoteBotStrategy({ endpoint: 'http://localhost:5001' });
    const card = await strategy.playCard(mockHand, mockContext);

    expect(card.id).toBe('S-A');
    expect(fetchMock).toHaveBeenCalledWith('http://localhost:5001/play', expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({
        'X-Game-Id': 'test-game',
      }),
      body: expect.stringContaining('"phase":"play"'),
    }));
  });

  it('falls back to baseline strategy on error', async () => {
    fetchMock.mockRejectedValueOnce(new Error('Network error'));

    const strategy = new RemoteBotStrategy({ endpoint: 'http://localhost:5001' });
    // Baseline bot with hand length > 0 returns a valid bid (>= 0)
    const bid = await strategy.bid(mockHand, mockContext);

    expect(bid).toBeGreaterThanOrEqual(0);
  });

  it('falls back to baseline strategy on non-200 response', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 500,
    });

    const strategy = new RemoteBotStrategy({ endpoint: 'http://localhost:5001' });
    const bid = await strategy.bid(mockHand, mockContext);

    expect(bid).toBeGreaterThanOrEqual(0);
  });
});
