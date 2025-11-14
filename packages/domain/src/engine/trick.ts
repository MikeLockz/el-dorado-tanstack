import type { Card } from '../types/cards.js';
import { RANK_VALUE } from '../types/cards.js';
import type { GameState, RoundState, TrickState } from '../types/game.js';
import type { PlayerId } from '../types/player.js';
import { EngineError, assertEngine } from './errors.js';
import { EngineEvent, event } from './events.js';
import {
  canLeadTrump,
  determineTrickLeader,
  ensureTrick,
  getActivePlayers,
  getTurnOrder,
  mustFollowSuit,
  ownsCard,
  playerHasSuit,
  requireRoundState,
} from './validation.js';

export interface TrickResult {
  state: GameState;
  events: EngineEvent[];
}

export function playCard(state: GameState, playerId: PlayerId, cardId: string): TrickResult {
  const roundState = requireRoundState(state);
  assertEngine(roundState.biddingComplete, 'ROUND_NOT_READY', 'Cannot play before bidding completes');

  const players = getActivePlayers(state);
  if (players.length === 0) {
    throw new EngineError('INVALID_PLAY', 'No active players');
  }

  const turnOrder = getTurnOrder(state);
  const leader = determineTrickLeader(roundState, turnOrder);
  let trick = roundState.trickInProgress ?? ensureTrick(roundState, leader);
  if (!trick.leaderPlayerId && leader) {
    trick = { ...trick, leaderPlayerId: leader };
  }

  const expectedPlayerId = getExpectedPlayer(trick, turnOrder);
  assertEngine(expectedPlayerId === playerId, 'NOT_PLAYERS_TURN', `It is ${expectedPlayerId}'s turn`);

  const card = ownsCard(state, playerId, cardId);
  assertEngine(Boolean(card), 'CARD_NOT_IN_HAND', 'Player does not own this card');
  const playerState = state.playerStates[playerId];
  assertEngine(Boolean(playerState), 'INVALID_PLAY', 'Missing player state');

  assertEngine(!mustFollowSuit(state, playerId, card as Card), 'MUST_FOLLOW_SUIT', 'Player must follow suit');
  if ((trick.plays.length === 0 || !trick.ledSuit) && !canLeadTrump(state, playerId, card as Card)) {
    throw new EngineError('CANNOT_LEAD_TRUMP', 'Cannot lead trump until broken');
  }

  const updatedHand = removeCardFromHand(playerState?.hand ?? [], cardId);
  const playerStates = {
    ...state.playerStates,
    [playerId]: {
      ...playerState,
      hand: updatedHand,
    },
  };

  const nextLedSuit = trick.ledSuit ?? (card as Card).suit;
  const trickIndex = trick.trickIndex ?? roundState.completedTricks.length;
  const updatedTrick: TrickState = {
    ...trick,
    trickIndex,
    ledSuit: nextLedSuit,
    plays: [...trick.plays, { playerId, card: card as Card, order: trick.plays.length }],
  };

  const events: EngineEvent[] = [];
  if (!roundState.trickInProgress) {
    events.push(
      event('TRICK_STARTED', {
        trickIndex,
        leaderPlayerId: updatedTrick.leaderPlayerId ?? playerId,
      }),
    );
  }
  events.push(event('CARD_PLAYED', { playerId, card: card as Card }));

  const brokeTrump = shouldBreakTrump(state, updatedTrick, playerId, card as Card);
  const nextRoundState: RoundState = {
    ...roundState,
    trumpBroken: roundState.trumpBroken || brokeTrump,
    trickInProgress: updatedTrick,
  };
  if (brokeTrump) {
    events.push(event('TRUMP_BROKEN', {}));
  }

  const updatedState: GameState = {
    ...state,
    playerStates,
    roundState: nextRoundState,
    phase: 'PLAYING',
  };

  return { state: updatedState, events };
}

export function completeTrick(state: GameState): TrickResult {
  const roundState = requireRoundState(state);
  const players = getActivePlayers(state);
  const trick = roundState.trickInProgress;
  if (!trick) {
    throw new EngineError('TRICK_INCOMPLETE', 'No trick in progress');
  }
  assertEngine(
    trick.plays.length === players.length,
    'TRICK_INCOMPLETE',
    'Cannot complete trick before all players act',
  );

  const winningPlay = determineWinningPlay(trick, roundState.trumpSuit);
  const updatedTrick: TrickState = {
    ...trick,
    completed: true,
    winningPlayerId: winningPlay.playerId,
    winningCardId: winningPlay.card.id,
  };

  const playerStates = { ...state.playerStates };
  const winnerState = playerStates[winningPlay.playerId];
  playerStates[winningPlay.playerId] = {
    ...winnerState,
    tricksWon: (winnerState?.tricksWon ?? 0) + 1,
  };

  const completedTricks = [...roundState.completedTricks, updatedTrick];

  const nextRoundState: RoundState = {
    ...roundState,
    completedTricks,
    trickInProgress: null,
  };

  const events: EngineEvent[] = [
    event('TRICK_COMPLETED', {
      trickIndex: updatedTrick.trickIndex,
      winningPlayerId: winningPlay.playerId,
      winningCardId: winningPlay.card.id,
    }),
  ];

  return {
    state: {
      ...state,
      playerStates,
      roundState: nextRoundState,
    },
    events,
  };
}

function getExpectedPlayer(trick: TrickState, order: PlayerId[]): PlayerId {
  const leaderId = trick.leaderPlayerId ?? order[0];
  const leaderIndex = order.indexOf(leaderId);
  const baseIndex = leaderIndex === -1 ? 0 : leaderIndex;
  const expectedIndex = (baseIndex + trick.plays.length) % order.length;
  return order[expectedIndex];
}

function removeCardFromHand(hand: Card[], cardId: string): Card[] {
  const index = hand.findIndex((card) => card.id === cardId);
  if (index === -1) {
    return hand;
  }
  return [...hand.slice(0, index), ...hand.slice(index + 1)];
}

function shouldBreakTrump(
  state: GameState,
  trick: TrickState,
  playerId: PlayerId,
  card: Card,
): boolean {
  const roundState = state.roundState;
  if (!roundState) {
    return false;
  }
  if (roundState.trumpBroken || !roundState.trumpSuit) {
    return false;
  }
  if (!trick.ledSuit || trick.ledSuit === roundState.trumpSuit) {
    return false;
  }
  if (card.suit !== roundState.trumpSuit) {
    return false;
  }
  return !playerHasSuit(state, playerId, trick.ledSuit);
}

function determineWinningPlay(trick: TrickState, trumpSuit: RoundState['trumpSuit']): TrickState['plays'][number] {
  const plays = trick.plays;
  if (plays.length === 0) {
    throw new EngineError('INVALID_PLAY', 'Cannot determine a winner without plays');
  }
  let winningPlay = plays[0];
  let winningIndex = 0;
  for (let i = 1; i < plays.length; i += 1) {
    const current = plays[i];
    const comparison = compareCardsForTrick(current.card, winningPlay.card, trick.ledSuit, trumpSuit);
    if (comparison > 0 || (comparison === 0 && i > winningIndex)) {
      winningPlay = current;
      winningIndex = i;
    }
  }
  return winningPlay;
}

function compareCardsForTrick(card: Card, incumbent: Card, ledSuit: Card['suit'] | null, trumpSuit: Card['suit'] | null): number {
  const isCardTrump = trumpSuit ? card.suit === trumpSuit : false;
  const isIncumbentTrump = trumpSuit ? incumbent.suit === trumpSuit : false;

  if (isCardTrump && !isIncumbentTrump) {
    return 1;
  }
  if (!isCardTrump && isIncumbentTrump) {
    return -1;
  }

  const followsLedSuit = ledSuit ? card.suit === ledSuit : false;
  const incumbentFollowsLed = ledSuit ? incumbent.suit === ledSuit : false;

  if (followsLedSuit && !incumbentFollowsLed) {
    return 1;
  }
  if (!followsLedSuit && incumbentFollowsLed) {
    return -1;
  }

  if (card.suit === incumbent.suit) {
    if (RANK_VALUE[card.rank] > RANK_VALUE[incumbent.rank]) {
      return 1;
    }
    if (RANK_VALUE[card.rank] < RANK_VALUE[incumbent.rank]) {
      return -1;
    }
  }

  return 0;
}
