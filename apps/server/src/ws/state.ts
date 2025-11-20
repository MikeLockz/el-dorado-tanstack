import type { ClientGameView, ClientRoundState, PlayerId } from '@game/domain';
import type { ServerRoom } from '../rooms/RoomRegistry.js';

export function buildClientGameView(room: ServerRoom, playerId?: PlayerId): ClientGameView {
  const { gameState } = room;
  const round = gameState.roundState;

  const clientRound: ClientRoundState | null = round
    ? {
        roundIndex: round.roundIndex,
        cardsPerPlayer: round.cardsPerPlayer,
        trumpSuit: round.trumpSuit,
        trumpCard: round.trumpCard,
        trumpBroken: round.trumpBroken,
        trickInProgress: round.trickInProgress,
        completedTricks: round.completedTricks,
        bids: round.bids,
        dealerPlayerId: round.dealerPlayerId,
        startingPlayerId: round.startingPlayerId,
      }
    : null;

  return {
    gameId: gameState.gameId,
    phase: gameState.phase,
    players: gameState.players,
    cumulativeScores: gameState.cumulativeScores,
    roundSummaries: gameState.roundSummaries,
    you: playerId,
    hand: playerId ? gameState.playerStates[playerId]?.hand ?? [] : undefined,
    round: clientRound,
  };
}
