import type { EngineEvent, GameEvent } from "@game/domain";
import type { ServerRoom } from "../rooms/RoomRegistry.js";
import { logger } from "../observability/logger.js";
import {
  trackCardPlayed,
  trackGameCompleted,
} from "../observability/metrics.js";

const eventLogger = logger.child({ context: { component: "event-log" } });

export function recordEngineEvents(
  room: ServerRoom,
  events: EngineEvent[]
): GameEvent[] {
  if (events.length === 0) {
    return [];
  }

  const recorded: GameEvent[] = [];

  for (const entry of events) {
    const common = {
      eventIndex: room.eventIndex,
      timestamp: Date.now(),
      gameId: room.gameId,
    };

    let event: GameEvent;

    switch (entry.type) {
      case "CARD_PLAYED":
        event = { ...common, ...entry };
        trackCardPlayed({
          gameId: event.gameId,
          playerId: event.payload.playerId,
        });
        eventLogger.info("card played", {
          gameId: event.gameId,
          playerId: event.payload.playerId,
          eventIndex: event.eventIndex,
          context: { cardId: event.payload.card.id },
        });
        break;
      case "PLAYER_BID":
        event = { ...common, ...entry };
        eventLogger.info("bid placed", {
          gameId: event.gameId,
          playerId: event.payload.playerId,
          eventIndex: event.eventIndex,
          context: { bid: event.payload.bid },
        });
        break;
      case "ROUND_SCORED":
        event = { ...common, ...entry };
        eventLogger.info("round scored", {
          gameId: event.gameId,
          eventIndex: event.eventIndex,
          context: {
            deltas: event.payload.deltas,
            cumulativeScores: event.payload.cumulativeScores,
          },
        });
        break;
      case "GAME_COMPLETED":
        event = { ...common, ...entry };
        trackGameCompleted({ isPublic: room.isPublic });
        eventLogger.info("game completed", {
          gameId: event.gameId,
          eventIndex: event.eventIndex,
          context: { finalScores: event.payload.finalScores },
        });
        break;
      default:
        event = { ...common, ...entry };
        break;
    }

    room.eventIndex += 1;
    room.eventLog.push(event);
    recorded.push(event);
  }

  if (room.persistence) {
    void room.persistence.adapter
      .appendEvents(room, recorded)
      .catch((error) => {
        eventLogger.error("failed to append events", {
          gameId: room.gameId,
          error,
        });
      });
  }

  return recorded;
}

export function recordSystemEvent(
  room: ServerRoom,
  entry: Pick<GameEvent, "type" | "payload">
): GameEvent {
  const event: GameEvent = {
    type: entry.type,
    payload: entry.payload,
    eventIndex: room.eventIndex,
    timestamp: Date.now(),
    gameId: room.gameId,
  } as GameEvent;

  room.eventIndex += 1;
  room.eventLog.push(event);

  if (room.persistence) {
    void room.persistence.adapter.appendEvents(room, [event]).catch((error) => {
      eventLogger.error("failed to append events", {
        gameId: room.gameId,
        error,
      });
    });
  }

  return event;
}
