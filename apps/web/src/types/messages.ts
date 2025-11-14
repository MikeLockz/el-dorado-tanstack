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
  | { type: 'PONG'; nonce?: string; ts: number }
  | { type: 'TOKEN_REFRESH'; gameId: GameId; token: string };

export function parseServerMessage(data: unknown): ServerMessage | null {
  if (!data || typeof data !== 'object') {
    return null;
  }

  const record = data as Record<string, unknown>;
  const type = typeof record.type === 'string' ? record.type : null;
  if (!type) {
    return null;
  }

  switch (type) {
    case 'WELCOME':
      if (typeof record.playerId !== 'string' || typeof record.gameId !== 'string' || typeof record.isSpectator !== 'boolean') {
        return null;
      }
      if (record.seatIndex !== null && typeof record.seatIndex !== 'number') {
        return null;
      }
      return {
        type,
        playerId: record.playerId,
        gameId: record.gameId,
        seatIndex: record.seatIndex as number | null,
        isSpectator: record.isSpectator,
      };
    case 'STATE_FULL':
      if (!record.state || typeof record.state !== 'object') {
        return null;
      }
      return { type, state: record.state as ClientGameView };
    case 'GAME_EVENT':
      if (!record.event || typeof record.event !== 'object') {
        return null;
      }
      return { type, event: record.event as GameEvent };
    case 'PONG':
      return {
        type,
        nonce: typeof record.nonce === 'string' ? record.nonce : undefined,
        ts: typeof record.ts === 'number' ? record.ts : Date.now(),
      };
    case 'TOKEN_REFRESH':
      if (typeof record.gameId !== 'string' || typeof record.token !== 'string') {
        return null;
      }
      return { type, gameId: record.gameId, token: record.token };
    default:
      return null;
  }
}
