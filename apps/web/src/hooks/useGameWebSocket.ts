import { useCallback, useEffect, useRef } from 'react';
import { resolveWebSocketBase } from '@/lib/env';
import {
  drainPendingActions,
  pushError,
  queuePendingAction,
  recordGameEvent,
  setConnection,
  setWelcome,
  updateGameState,
} from '@/store/gameStore';
import type { ClientMessage } from '@/types/messages';
import { parseServerMessage } from '@/types/messages';
import { clearPlayerToken, getStoredPlayerToken, storePlayerToken } from '@/lib/playerTokens';

const MAX_RECONNECT_ATTEMPTS = 5;

function buildWsUrl(gameId: string, token: string) {
  const base = resolveWebSocketBase();
  const url = new URL(base);
  url.searchParams.set('gameId', gameId);
  url.searchParams.set('token', token);
  return url.toString();
}

export function useGameWebSocket(gameId?: string, token?: string | null) {
  const socketRef = useRef<WebSocket | null>(null);
  const retryTimeout = useRef<number | null>(null);
  const reconnectAttempts = useRef(0);
  const socketVersionRef = useRef(0);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    if (!gameId) {
      setConnection('idle');
      return;
    }

    const resolveToken = () => {
      if (!gameId) return null;
      return getStoredPlayerToken(gameId) ?? token ?? null;
    };

    if (!resolveToken()) {
      setConnection('idle');
      return;
    }

    let cancelled = false;
    let initialConnectTimeout: number | null = null;

    const connect = () => {
      if (cancelled) return;
      const activeToken = resolveToken();
      if (!activeToken) {
        setConnection('idle');
        return;
      }

      setConnection('connecting');
      const socket = new WebSocket(buildWsUrl(gameId, activeToken));
      const socketVersion = socketVersionRef.current + 1;
      socketVersionRef.current = socketVersion;
      socketRef.current = socket;

      const isStale = () => socketVersionRef.current !== socketVersion;

      socket.addEventListener('open', () => {
        if (cancelled || isStale()) return;
        reconnectAttempts.current = 0;
        setConnection('open');
        flushPending(socket);
        socket.send(JSON.stringify({ type: 'REQUEST_STATE' } satisfies ClientMessage));
      });

      socket.addEventListener('message', (event) => {
        if (cancelled || isStale()) return;
        const payload = parseIncomingPayload(event.data);
        if (!payload) {
          pushError('INVALID_MESSAGE', 'Server sent malformed payload');
          return;
        }

        switch (payload.type) {
          case 'WELCOME':
            setWelcome({ playerId: payload.playerId, seatIndex: payload.seatIndex, spectator: payload.isSpectator });
            break;
          case 'STATE_FULL':
            updateGameState(payload.state);
            break;
          case 'GAME_EVENT':
            recordGameEvent(payload.event);
            break;
          case 'PONG':
            break;
          case 'TOKEN_REFRESH':
            storePlayerToken(payload.gameId, payload.token);
            break;
          default:
            break;
        }
      });

      socket.addEventListener('close', () => {
        if (cancelled || isStale()) return;
        setConnection('closed');
        scheduleReconnect();
      });

      socket.addEventListener('error', () => {
        if (cancelled || isStale()) return;
        pushError('WS_ERROR', 'WebSocket connection error');
      });
    };

    const scheduleReconnect = () => {
      if (cancelled) return;
      const attempt = reconnectAttempts.current;
      if (attempt >= MAX_RECONNECT_ATTEMPTS) {
        clearPlayerToken(gameId);
        setConnection('idle');
        pushError('WS_RETRY_EXHAUSTED', 'Unable to connect to the game. Please rejoin or create a new room.');
        return;
      }
      reconnectAttempts.current += 1;
      const delay = Math.min(1000 * 2 ** attempt, 10_000);
      retryTimeout.current = window.setTimeout(connect, delay);
    };

    const flushPending = (socket: WebSocket) => {
      const pending = drainPendingActions();
      pending.forEach((action) => socket.send(JSON.stringify(action)));
    };

    initialConnectTimeout = window.setTimeout(connect, 0);

    return () => {
      cancelled = true;
      if (retryTimeout.current) {
        window.clearTimeout(retryTimeout.current);
        retryTimeout.current = null;
      }
      if (initialConnectTimeout) {
        window.clearTimeout(initialConnectTimeout);
        initialConnectTimeout = null;
      }
      socketRef.current?.close();
      socketRef.current = null;
      setConnection('idle');
    };
  }, [gameId, token]);

  return useCallback(
    (message: ClientMessage) => {
      const socket = socketRef.current;
      if (!socket || socket.readyState !== WebSocket.OPEN) {
        queuePendingAction(message);
        return false;
      }

      try {
        socket.send(JSON.stringify(message));
        return true;
      } catch (error) {
        console.error('ws send error', error);
        queuePendingAction(message);
        return false;
      }
    },
    [],
  );
}

function parseIncomingPayload(data: unknown) {
  if (typeof data === 'string') {
    try {
      return parseServerMessage(JSON.parse(data));
    } catch {
      return null;
    }
  }

  if (data instanceof ArrayBuffer) {
    const text = new TextDecoder().decode(data);
    try {
      return parseServerMessage(JSON.parse(text));
    } catch {
      return null;
    }
  }

  if (typeof Blob !== 'undefined' && data instanceof Blob) {
    return null;
  }

  return parseServerMessage(data);
}
