import type { Card } from '@game/domain';
import { type BotContext, type BotStrategy, BaselineBotStrategy } from '@game/domain';
import { logger } from '../observability/logger.js';
import { trackRemoteBotRequest } from '../observability/metrics.js';

export interface RemoteBotConfig {
  endpoint: string;
  timeoutMs?: number;
  fallbackStrategy?: BotStrategy;
}

interface RemoteBotContext extends Omit<BotContext, 'playedCards'> {
  playedCards: string[];
}

interface RemoteBotPayload {
  phase: 'bid' | 'play';
  hand: Card[];
  context: RemoteBotContext;
  config: {
    maxPlayers: number;
    roundCount: number;
  };
}

interface BidResponse {
  bid: number;
}

interface PlayResponse {
  card: string;
}

const SUIT_MAP: Record<string, string> = {
  'C': 'clubs',
  'D': 'diamonds',
  'H': 'hearts',
  'S': 'spades',
};

function mapCardToRemote(card: Card): any {
  return {
    ...card,
    suit: SUIT_MAP[card.suit] ?? card.suit,
  };
}

export class RemoteBotStrategy implements BotStrategy {
  private readonly endpoint: string;
  private readonly timeoutMs: number;
  private readonly fallback: BotStrategy;
  private readonly log = logger.child({ context: { component: 'remote-bot' } });

  constructor(config: RemoteBotConfig) {
    this.endpoint = config.endpoint;
    this.timeoutMs = config.timeoutMs ?? 2000;
    this.fallback = config.fallbackStrategy ?? new BaselineBotStrategy();
  }

  async bid(hand: Card[], context: BotContext): Promise<number> {
    try {
      const payload = this.createPayload('bid', hand, context);
      const response = await this.sendRequest<BidResponse>(payload, context.gameId);
      trackRemoteBotRequest({ phase: 'bid', status: 'success' });
      return response.bid;
    } catch (error) {
      this.log.error('failed to get remote bid, using fallback', { error });
      trackRemoteBotRequest({ phase: 'bid', status: 'fallback' });
      return this.fallback.bid(hand, context);
    }
  }

  async playCard(hand: Card[], context: BotContext): Promise<Card> {
    try {
      const payload = this.createPayload('play', hand, context);
      const response = await this.sendRequest<PlayResponse>(payload, context.gameId);
      const card = hand.find((c) => c.id === response.card);
      if (!card) {
        throw new Error(`Remote bot returned invalid card ID: ${response.card}`);
      }
      trackRemoteBotRequest({ phase: 'play', status: 'success' });
      return card;
    } catch (error) {
      this.log.error('failed to get remote play, using fallback', { error });
      trackRemoteBotRequest({ phase: 'play', status: 'fallback' });
      return this.fallback.playCard(hand, context);
    }
  }

  private createPayload(phase: 'bid' | 'play', hand: Card[], context: BotContext): RemoteBotPayload {
    const { playedCards, currentTrick, trumpSuit, gameId, ...rest } = context;

    const mappedHand = hand.map(mapCardToRemote);
    const mappedTrump = trumpSuit ? (SUIT_MAP[trumpSuit] ?? trumpSuit) : null;

    let mappedTrick: any = null;
    if (currentTrick) {
      mappedTrick = {
        ...currentTrick,
        ledSuit: currentTrick.ledSuit ? (SUIT_MAP[currentTrick.ledSuit] ?? currentTrick.ledSuit) : null,
        plays: currentTrick.plays.map((p) => ({
          ...p,
          card: mapCardToRemote(p.card),
        })),
      };
    }

    return {
      phase,
      hand: mappedHand,
      context: {
        ...rest,
        trumpSuit: mappedTrump,
        playedCards: playedCards.map((c) => c.id),
        currentTrick: mappedTrick,
      } as any,
      config: context.config,
    };
  }

  private async sendRequest<T>(payload: RemoteBotPayload, gameId?: string): Promise<T> {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const endpoint = `${this.endpoint}/${payload.phase === 'bid' ? 'bid' : 'play'}`;
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (gameId) {
        headers['X-Game-Id'] = gameId;
      }

      const res = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      if (!res.ok) {
        const text = await res.text();
        this.log.error(`Remote bot returned status ${res.status}`, { context: { body: text } });
        throw new Error(`Remote bot returned status ${res.status}`);
      }

      return (await res.json()) as T;
    } finally {
      clearTimeout(id);
    }
  }
}
