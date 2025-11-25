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

    const newEvent = {
      type: entry.type,
      payload: entry.payload,
      ...common,
    };

    room.eventIndex += 1;
    room.eventLog.push(newEvent as GameEvent);
    recorded.push(newEvent as GameEvent);

    switch (entry.type) {
      case "CARD_PLAYED":
        const cardPlayedEntry = entry as EngineEvent<"CARD_PLAYED">;
        trackCardPlayed({
          gameId: common.gameId,
          playerId: cardPlayedEntry.payload.playerId,
        });
        eventLogger.info("card played", {
          gameId: common.gameId,
          playerId: cardPlayedEntry.payload.playerId,
          eventIndex: common.eventIndex,
          context: { cardId: cardPlayedEntry.payload.card.id },
        });
        break;
      case "PLAYER_BID":
        const playerBidEntry = entry as EngineEvent<"PLAYER_BID">;
        eventLogger.info("bid placed", {
          gameId: common.gameId,
          playerId: playerBidEntry.payload.playerId,
          eventIndex: common.eventIndex,
          context: { bid: playerBidEntry.payload.bid },
        });
        break;
      case "ROUND_SCORED":
        const roundScoredEntry = entry as EngineEvent<"ROUND_SCORED">;
        eventLogger.info("round scored", {
          gameId: common.gameId,
          eventIndex: common.eventIndex,
          context: {
            deltas: roundScoredEntry.payload.deltas,
            cumulativeScores: roundScoredEntry.payload.cumulativeScores,
          },
        });
        break;
      case "GAME_COMPLETED":
        const gameCompletedEntry = entry as EngineEvent<"GAME_COMPLETED">;
        trackGameCompleted({ isPublic: room.isPublic });
        eventLogger.info("game completed", {
          gameId: common.gameId,
          eventIndex: common.eventIndex,
          context: { finalScores: gameCompletedEntry.payload.finalScores },
        });
        break;
      default:
        // No specific logging for other event types, but they are still recorded.
        break;
    }
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
