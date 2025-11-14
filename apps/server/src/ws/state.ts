import type {
  ClientGameView,
  ClientRoundState,
  EngineEvent,
  GameEvent,
  PlayerId,
} from '@game/domain';
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
      }
    : null;

  return {
    gameId: gameState.gameId,
    phase: gameState.phase,
    players: gameState.players,
    cumulativeScores: gameState.cumulativeScores,
    you: playerId,
    hand: playerId ? gameState.playerStates[playerId]?.hand ?? [] : undefined,
    round: clientRound,
  };
}

export function recordEngineEvents(room: ServerRoom, events: EngineEvent[]): GameEvent[] {
  if (events.length === 0) {
    return [];
  }

  const recorded: GameEvent[] = [];
  for (const entry of events) {
    const event: GameEvent = {
      type: entry.type,
      payload: entry.payload,
      eventIndex: room.eventIndex,
      timestamp: Date.now(),
      gameId: room.gameId,
    } as GameEvent;

    room.eventIndex += 1;
    room.eventLog.push(event);
    recorded.push(event);
  }

  return recorded;
}
