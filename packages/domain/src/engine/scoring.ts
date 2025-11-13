import type { GameState, RoundSummary } from '../types/game';
import type { PlayerId } from '../types/player';
import { EngineError, assertEngine } from './errors';
import { EngineEvent, event } from './events';
import { requireRoundState } from './validation';

export interface ScoreResult {
  state: GameState;
  events: EngineEvent[];
}

export function scoreRound(state: GameState): ScoreResult {
  const roundState = requireRoundState(state);
  assertEngine(roundState.completedTricks.length === roundState.cardsPerPlayer, 'ROUND_NOT_COMPLETE', 'All tricks must complete before scoring');

  const deltas: Record<PlayerId, number> = {};
  const tricksWon: Record<PlayerId, number> = {};
  const playerStates = { ...state.playerStates };
  const cumulativeScores = { ...state.cumulativeScores };

  for (const playerId of Object.keys(roundState.bids)) {
    const bid = roundState.bids[playerId];
    if (bid === null) {
      throw new EngineError('INVALID_BID', 'Cannot score before all bids are set');
    }
    const serverState = playerStates[playerId];
    assertEngine(Boolean(serverState), 'INVALID_PLAY', 'Missing player state during scoring');
    const tricks = serverState?.tricksWon ?? 0;
    const delta = tricks === bid ? 5 + bid : -(5 + bid);
    deltas[playerId] = delta;
    tricksWon[playerId] = tricks;
    playerStates[playerId] = {
      ...serverState,
      roundScoreDelta: delta,
      hand: [],
    };
    cumulativeScores[playerId] = (cumulativeScores[playerId] ?? 0) + delta;
  }

  const roundSummary: RoundSummary = {
    roundIndex: roundState.roundIndex,
    cardsPerPlayer: roundState.cardsPerPlayer,
    trumpSuit: roundState.trumpSuit,
    bids: { ...roundState.bids },
    tricksWon,
    deltas,
  };

  const roundSummaries = [...state.roundSummaries, roundSummary];

  const events: EngineEvent[] = [
    event('ROUND_SCORED', {
      deltas,
      cumulativeScores,
    }),
  ];

  return {
    state: {
      ...state,
      phase: 'SCORING',
      playerStates,
      cumulativeScores,
      roundSummaries,
    },
    events,
  };
}
