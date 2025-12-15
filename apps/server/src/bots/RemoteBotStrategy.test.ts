import { describe, expect, it, vi, beforeEach } from 'vitest';
import { RemoteBotStrategy } from './RemoteBotStrategy.js';
import type { Card, BotContext } from '@game/domain';
import { trackRemoteBotRequest } from '../observability/metrics.js';

// Mock metrics
vi.mock('../observability/metrics.js', () => ({
  trackRemoteBotRequest: vi.fn(),
}));

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
    vi.mocked(trackRemoteBotRequest).mockReset();
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
    expect(trackRemoteBotRequest).toHaveBeenCalledWith({ phase: 'bid', status: 'success' });
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
    expect(trackRemoteBotRequest).toHaveBeenCalledWith({ phase: 'play', status: 'success' });
  });

  it('falls back to baseline strategy on error', async () => {
    fetchMock.mockRejectedValueOnce(new Error('Network error'));

    const strategy = new RemoteBotStrategy({ endpoint: 'http://localhost:5001' });
    // Baseline bot with hand length > 0 returns a valid bid (>= 0)
    const bid = await strategy.bid(mockHand, mockContext);

    expect(bid).toBeGreaterThanOrEqual(0);
    expect(trackRemoteBotRequest).toHaveBeenCalledWith({ phase: 'bid', status: 'fallback' });
  });

  it('falls back to baseline strategy on non-200 response', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: async () => 'Internal Server Error',
    });

    const strategy = new RemoteBotStrategy({ endpoint: 'http://localhost:5001' });
    const bid = await strategy.bid(mockHand, mockContext);

    expect(bid).toBeGreaterThanOrEqual(0);
    expect(trackRemoteBotRequest).toHaveBeenCalledWith({ phase: 'bid', status: 'fallback' });
  });
});
