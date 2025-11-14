import type { Card, GameState, PlayerId } from '@game/domain';
import { compareRank } from '@game/domain';

export function selectFallbackCard(state: GameState, playerId: PlayerId): Card | null {
  const roundState = state.roundState;
  if (!roundState) {
    return null;
  }

  const playerState = state.playerStates[playerId];
  if (!playerState || playerState.hand.length === 0) {
    return null;
  }

  const ledSuit = roundState.trickInProgress?.ledSuit;
  const trumpSuit = roundState.trumpSuit;
  const hand = [...playerState.hand];

  if (ledSuit) {
    const ledSuitCards = hand.filter((card) => card.suit === ledSuit);
    if (ledSuitCards.length > 0) {
      return ledSuitCards.sort((a, b) => compareRank(b.rank, a.rank))[0];
    }
  }

  const nonTrumpCards = typeof trumpSuit === 'string' ? hand.filter((card) => card.suit !== trumpSuit) : hand;
  if (nonTrumpCards.length > 0) {
    return nonTrumpCards.sort((a, b) => compareRank(a.rank, b.rank))[0];
  }

  const fallback = hand.sort((a, b) => compareRank(a.rank, b.rank))[0];
  return fallback ?? null;
}
