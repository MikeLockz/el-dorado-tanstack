import { roomRegistry } from '../rooms/index.js';
import { BotManager } from './BotManager.js';
import { RemoteBotStrategy } from './RemoteBotStrategy.js';
import { logger } from '../observability/logger.js';
import type { BotStrategy } from '@game/domain';

const mctsEnabled = process.env.MCTS_ENABLED === 'true';
const mctsEndpoint = process.env.MCTS_ENDPOINT;

let strategy: BotStrategy | undefined;

if (mctsEnabled) {
  if (!mctsEndpoint) {
    logger.error('MCTS_ENABLED is true but MCTS_ENDPOINT is not set. Falling back to baseline.');
  } else {
    logger.info('Enabling MCTS RemoteBotStrategy', { endpoint: mctsEndpoint });
    strategy = new RemoteBotStrategy({
      endpoint: mctsEndpoint,
      timeoutMs: 2000,
    });
  }
}

export const botManager = new BotManager({
  registry: roomRegistry,
  strategy,
});
