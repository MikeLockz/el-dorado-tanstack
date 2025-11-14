import type { RawData } from 'ws';
import type { ClientGameView, GameEvent, GameId, PlayerId } from '@game/domain';

export type ClientMessage =
  | { type: 'PLAY_CARD'; cardId: string }
  | { type: 'BID'; value: number }
  | { type: 'REQUEST_STATE' }
  | { type: 'UPDATE_PROFILE'; displayName?: string; avatarSeed?: string; color?: string }
  | { type: 'PING'; nonce?: string };

export type ServerMessage =
  | { type: 'WELCOME'; playerId: PlayerId; gameId: GameId; seatIndex: number | null; isSpectator: boolean }
  | { type: 'STATE_FULL'; state: ClientGameView }
  | { type: 'GAME_EVENT'; event: GameEvent }
  | { type: 'PONG'; nonce?: string; ts: number };

export function parseClientMessage(raw: RawData): ClientMessage | null {
  let data: unknown;

  try {
    data = typeof raw === 'string' ? JSON.parse(raw) : JSON.parse(raw.toString());
  } catch {
    return null;
  }

  if (!isRecord(data)) {
    return null;
  }

  const type = typeof data.type === 'string' ? data.type : undefined;
  if (!type) {
    return null;
  }

  switch (type) {
    case 'PLAY_CARD':
      if (typeof data.cardId !== 'string') return null;
      return { type, cardId: data.cardId };
    case 'BID':
      if (typeof data.value !== 'number') return null;
      return { type, value: data.value };
    case 'REQUEST_STATE':
      return { type };
    case 'UPDATE_PROFILE':
      return {
        type,
        displayName: optionalString(data.displayName),
        avatarSeed: optionalString(data.avatarSeed),
        color: optionalString(data.color),
      };
    case 'PING':
      return { type, nonce: optionalString(data.nonce) ?? undefined };
    default:
      return null;
  }
}

function optionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object';
}
