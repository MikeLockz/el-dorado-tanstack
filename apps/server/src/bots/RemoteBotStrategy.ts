import type { Card } from '@game/domain';
import { type BotContext, type BotStrategy, BaselineBotStrategy } from '@game/domain';
import { logger } from '../observability/logger.js';

export interface RemoteBotConfig {
  endpoint: string;
  timeoutMs?: number;
  fallbackStrategy?: BotStrategy;
}

interface RemoteBotPayload {
  phase: 'bid' | 'play';
  hand: Card[];
  context: BotContext;
  config: {
    maxPlayers: number; // Assuming this is available or we need to pass it
    roundCount: number; // Assuming available
  };
}

interface BidResponse {
  bid: number;
}

interface PlayResponse {
  card: string;
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
      const response = await this.sendRequest<BidResponse>(payload);
      return response.bid;
    } catch (error) {
      this.log.error('failed to get remote bid, using fallback', { error });
      return this.fallback.bid(hand, context);
    }
  }

  async playCard(hand: Card[], context: BotContext): Promise<Card> {
    try {
      const payload = this.createPayload('play', hand, context);
      const response = await this.sendRequest<PlayResponse>(payload);
      const card = hand.find((c) => c.id === response.card);
      if (!card) {
        throw new Error(`Remote bot returned invalid card ID: ${response.card}`);
      }
      return card;
    } catch (error) {
      this.log.error('failed to get remote play, using fallback', { error });
      return this.fallback.playCard(hand, context);
    }
  }

  private createPayload(phase: 'bid' | 'play', hand: Card[], context: BotContext): RemoteBotPayload {
    // Note: BotContext doesn't strictly have 'config' (maxPlayers, roundCount).
    // We might need to derive it or assume it's passed in context if we update BotContext.
    // For now, we'll try to extract what we can or send defaults if the Python side needs them.
    // Actually, looking at BotContext in domain, it has `roundIndex`, `cardsPerPlayer`, etc.
    // But it doesn't have `maxPlayers` or `roundCount` directly.
    // However, the Python spec asks for:
    // "config": { "maxPlayers": 4, "roundCount": 10 }
    
    // We can't easily get maxPlayers/roundCount from BotContext unless we change BotContext.
    // But wait, BotManager calls createBotContext.
    // We could attach config to BotContext?
    // Or we just send what we have.
    // Let's assume for now we can infer maxPlayers from somewhere or hardcode default for now?
    // No, that's bad.
    // Let's look at BotContext again.
    // It has `bids: Record<PlayerId, number | null>`. The number of keys keys might hint at players.
    // But maxPlayers is config.
    
    // DECISION: Update BotContext to include game config?
    // That would require updating domain.
    // Or, RemoteBotStrategy could just send 0 or defaults if the python side is robust.
    // The python side uses it for MCTS simulation config.
    // Let's default to standard 4 players / 10 rounds if missing, or update BotContext.
    // Updating BotContext is cleaner but touches domain.
    
    // Let's check if I can modify BotContext easily.
    // Yes, I can.
    
    return {
      phase,
      hand,
      context,
      config: context.config,
    };
  }

  private async sendRequest<T>(payload: RemoteBotPayload): Promise<T> {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const endpoint = `${this.endpoint}/${payload.phase === 'bid' ? 'bid' : 'play'}`;
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      if (!res.ok) {
        throw new Error(`Remote bot returned status ${res.status}`);
      }

      return (await res.json()) as T;
    } finally {
      clearTimeout(id);
    }
  }
}
