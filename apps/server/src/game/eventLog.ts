import type { EngineEvent, GameEvent } from '@game/domain';
import type { ServerRoom } from '../rooms/RoomRegistry.js';

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

  if (room.persistence) {
    void room.persistence.adapter.appendEvents(room, recorded).catch((error) => {
      console.error('[persistence] failed to append events', error);
    });
  }

  return recorded;
}
