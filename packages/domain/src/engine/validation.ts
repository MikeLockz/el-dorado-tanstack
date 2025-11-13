import type { Card, Suit } from '../types/cards';
import type { GameState, RoundState, TrickState } from '../types/game';
import type { PlayerId, PlayerInGame } from '../types/player';
import { EngineError } from './errors';

export function requireRoundState(state: GameState): RoundState {
  const roundState = state.roundState;
  if (!roundState) {
    throw new EngineError('ROUND_NOT_READY', 'Round has not been initialized');
  }
  return roundState;
}

export function getActivePlayers(state: GameState): PlayerInGame[] {
  return state.players
    .filter((player) => player.seatIndex !== null && !player.spectator)
    .sort((a, b) => (a.seatIndex ?? 0) - (b.seatIndex ?? 0));
}

export function getTurnOrder(state: GameState): PlayerId[] {
  return getActivePlayers(state).map((player) => player.playerId);
}

export function isPlayersTurn(state: GameState, playerId: PlayerId): boolean {
  const roundState = requireRoundState(state);
  const order = getTurnOrder(state);
  if (order.length === 0) {
    return false;
  }

  const trick = roundState.trickInProgress;
  const leaderId = determineTrickLeader(roundState, order);
  if (!trick) {
    return playerId === leaderId;
  }

  const leaderIndex = order.indexOf(trick.leaderPlayerId ?? leaderId);
  if (leaderIndex === -1) {
    return false;
  }
  const expectedIndex = (leaderIndex + trick.plays.length) % order.length;
  return order[expectedIndex] === playerId;
}

export function ownsCard(state: GameState, playerId: PlayerId, cardId: string): Card | undefined {
  const playerState = state.playerStates[playerId];
  return playerState?.hand.find((card) => card.id === cardId);
}

export function playerHasSuit(state: GameState, playerId: PlayerId, suit: Suit): boolean {
  const playerState = state.playerStates[playerId];
  if (!playerState) {
    return false;
  }
  return playerState.hand.some((card) => card.suit === suit);
}

export function mustFollowSuit(state: GameState, playerId: PlayerId, card: Card): boolean {
  const roundState = requireRoundState(state);
  const trick = roundState.trickInProgress;
  if (!trick || trick.plays.length === 0 || !trick.ledSuit) {
    return false;
  }
  if (card.suit === trick.ledSuit) {
    return false;
  }
  return playerHasSuit(state, playerId, trick.ledSuit);
}

export function canLeadTrump(state: GameState, playerId: PlayerId, card: Card): boolean {
  const roundState = requireRoundState(state);
  if (roundState.trumpBroken || roundState.trumpSuit === null) {
    return true;
  }
  const trick = roundState.trickInProgress;
  const isLeading = !trick || trick.plays.length === 0;
  if (!isLeading) {
    return true;
  }
  if (card.suit !== roundState.trumpSuit) {
    return true;
  }
  const playerState = state.playerStates[playerId];
  if (!playerState) {
    return false;
  }
  return playerState.hand.every((handCard) => handCard.suit === roundState.trumpSuit);
}

export function determineTrickLeader(roundState: RoundState, order: PlayerId[]): PlayerId | null {
  if (roundState.trickInProgress?.leaderPlayerId) {
    return roundState.trickInProgress.leaderPlayerId;
  }
  if (roundState.completedTricks.length > 0) {
    const last = roundState.completedTricks[roundState.completedTricks.length - 1];
    return last.winningPlayerId;
  }
  return roundState.startingPlayerId ?? order[0] ?? null;
}

export function ensureTrick(roundState: RoundState, leaderPlayerId: PlayerId | null): TrickState {
  if (roundState.trickInProgress) {
    return roundState.trickInProgress;
  }
  const trickIndex = roundState.completedTricks.length;
  const resolvedLeader =
    leaderPlayerId ?? roundState.startingPlayerId ?? roundState.completedTricks.at(-1)?.winningPlayerId;
  if (!resolvedLeader) {
    throw new EngineError('INVALID_PLAY', 'Unable to determine trick leader');
  }
  return {
    trickIndex,
    leaderPlayerId: resolvedLeader,
    ledSuit: null,
    plays: [],
    winningPlayerId: null,
    winningCardId: null,
    completed: false,
  };
}
