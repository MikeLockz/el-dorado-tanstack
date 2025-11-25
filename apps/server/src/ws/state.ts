import type { ClientGameView, ClientRoundState, PlayerId } from '@game/domain';
import type { ServerRoom } from '../rooms/RoomRegistry.js';

export function buildClientGameView(room: ServerRoom, playerId?: PlayerId): ClientGameView {
  const { gameState } = room;
  const round = gameState.roundState;
  const { minPlayers, maxPlayers, roundCount } = gameState.config;

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

  const lobby = room.lobby
    ? {
        readyState: Object.fromEntries(
          Object.entries(room.lobby.readyState).map(([playerId, state]) => [playerId, { ...state }]),
        ),
        overrideReadyRequirement: room.lobby.overrideReadyRequirement,
      }
    : undefined;

  return {
    gameId: gameState.gameId,
    phase: gameState.phase,
    players: gameState.players,
    cumulativeScores: gameState.cumulativeScores,
    roundSummaries: gameState.roundSummaries,
    you: playerId,
    hand: playerId ? gameState.playerStates[playerId]?.hand ?? [] : undefined,
    round: clientRound,
    config: {
      minPlayers,
      maxPlayers,
      roundCount,
    },
    joinCode: room.joinCode,
    isPublic: room.isPublic,
    lobby,
  };
}
