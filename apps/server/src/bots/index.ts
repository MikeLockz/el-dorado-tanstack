import { roomRegistry } from '../rooms/index.js';
import { BotManager } from './BotManager.js';
import { RemoteBotStrategy } from './RemoteBotStrategy.js';
import { logger } from '../observability/logger.js';
import type { BotStrategy } from '@game/domain';

const mctsEnabled = process.env.MCTS_ENABLED === 'true';
const mctsEndpoint = process.env.MCTS_ENDPOINT;

let strategy: BotStrategy | undefined;

const mctsStrategyType = process.env.MCTS_STRATEGY_TYPE ?? 'DEFAULT';
const mctsParamsStr = process.env.MCTS_STRATEGY_PARAMS;

let strategyParams: Record<string, any> | undefined;
if (mctsParamsStr) {
  try {
    strategyParams = JSON.parse(mctsParamsStr);
  } catch (e) {
    logger.warn('Failed to parse MCTS_STRATEGY_PARAMS', { error: e });
  }
}

if (mctsEnabled) {
  if (!mctsEndpoint) {
    logger.error('MCTS_ENABLED is true but MCTS_ENDPOINT is not set. Falling back to baseline.');
  } else {
    logger.info('Enabling MCTS RemoteBotStrategy', {
      context: {
        endpoint: mctsEndpoint,
        strategyType: mctsStrategyType
      }
    });
    strategy = new RemoteBotStrategy({
      endpoint: mctsEndpoint,
      timeoutMs: 2000,
      strategyConfig: {
        strategy_type: mctsStrategyType,
        strategy_params: strategyParams
      }
    });
  }
}

export const botManager = new BotManager({
  registry: roomRegistry,
  strategy,
});
