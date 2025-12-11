import type { ClientGameView } from '../types/game.js';
import type { BotContext } from './strategy.js';
import type { PlayerId } from '../types/player.js';

export function createBotContextFromState(
  state: ClientGameView,
  playerId: PlayerId,
  rng: () => number = Math.random
): BotContext {
  if (!state.round) {
    throw new Error('Cannot create bot context: round state is missing');
  }

  // Calculate played cards from completed tricks + current trick
  const playedCards = [
    ...(state.round.completedTricks ?? []).flatMap((t) => t.plays.map((p) => p.card)),
    ...(state.round.trickInProgress?.plays.map((p) => p.card) ?? []),
  ];

  return {
    roundIndex: state.round.roundIndex,
    cardsPerPlayer: state.round.cardsPerPlayer,
    trumpSuit: state.round.trumpSuit,
    trumpBroken: state.round.trumpBroken,
    trickIndex: state.round.completedTricks?.length ?? 0,
    currentTrick: state.round.trickInProgress,
    playedCards,
    bids: state.round.bids,
    cumulativeScores: state.cumulativeScores,
    myPlayerId: playerId,
    rng,
    config: {
      maxPlayers: state.config.maxPlayers,
      roundCount: state.config.roundCount,
    },
  };
}
