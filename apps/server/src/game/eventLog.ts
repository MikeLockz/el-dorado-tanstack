import type { EngineEvent, GameEvent } from '@game/domain';
import type { ServerRoom } from '../rooms/RoomRegistry.js';
import { logger } from '../observability/logger.js';
import { trackCardPlayed, trackGameCompleted } from '../observability/metrics.js';

const eventLogger = logger.child({ context: { component: 'event-log' } });

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

    if (event.type === 'CARD_PLAYED') {
      trackCardPlayed({ gameId: event.gameId, playerId: event.payload.playerId });
      eventLogger.info('card played', {
        gameId: event.gameId,
        playerId: event.payload.playerId,
        eventIndex: event.eventIndex,
        context: { cardId: event.payload.card.id },
      });
    } else if (event.type === 'GAME_COMPLETED') {
      trackGameCompleted({ isPublic: room.isPublic });
    }
  }

  if (room.persistence) {
    void room.persistence.adapter.appendEvents(room, recorded).catch((error) => {
      eventLogger.error('failed to append events', {
        gameId: room.gameId,
        error,
      });
    });
  }

  return recorded;
}
