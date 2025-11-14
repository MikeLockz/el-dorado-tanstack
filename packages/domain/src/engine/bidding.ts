import type { GameState } from '../types/game.js';
import type { PlayerId } from '../types/player.js';
import { EngineError, assertEngine } from './errors.js';
import { EngineEvent, event } from './events.js';
import { requireRoundState } from './validation.js';

export interface BidResult {
  state: GameState;
  events: EngineEvent[];
}

export function applyBid(state: GameState, playerId: PlayerId, bid: number): BidResult {
  const roundState = requireRoundState(state);
  assertEngine(!roundState.biddingComplete, 'INVALID_BID', 'Bidding is already complete');

  const bids = { ...roundState.bids };
  if (!(playerId in bids)) {
    throw new EngineError('INVALID_BID', 'Player is not part of the current round');
  }
  if (bids[playerId] !== null) {
    throw new EngineError('INVALID_BID', 'Player has already bid');
  }
  if (!Number.isInteger(bid) || bid < 0 || bid > roundState.cardsPerPlayer) {
    throw new EngineError('INVALID_BID', 'Bid must be between 0 and cards per player');
  }

  bids[playerId] = bid;

  const playerState = state.playerStates[playerId];
  assertEngine(Boolean(playerState), 'INVALID_BID', 'Missing player state for bid');

  const playerStates = {
    ...state.playerStates,
    [playerId]: {
      ...playerState,
      bid,
    },
  };

  const events: EngineEvent[] = [event('PLAYER_BID', { playerId, bid })];

  const allBidsIn = Object.values(bids).every((value) => value !== null);
  const nextRoundState = {
    ...roundState,
    bids,
    biddingComplete: allBidsIn,
  };

  if (allBidsIn) {
    events.push(event('BIDDING_COMPLETE', {}));
  }

  return {
    state: {
      ...state,
      phase: allBidsIn ? 'PLAYING' : state.phase,
      roundState: nextRoundState,
      playerStates,
    },
    events,
  };
}
