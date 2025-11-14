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

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    if (!gameId || !token) {
      setConnection('idle');
      return;
    }

    let cancelled = false;

    const connect = () => {
      if (cancelled) return;
      setConnection('connecting');
      const socket = new WebSocket(buildWsUrl(gameId, token));
      socketRef.current = socket;

      socket.addEventListener('open', () => {
        if (cancelled) return;
        reconnectAttempts.current = 0;
        setConnection('open');
        flushPending(socket);
        socket.send(JSON.stringify({ type: 'REQUEST_STATE' } satisfies ClientMessage));
      });

      socket.addEventListener('message', (event) => {
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
          default:
            break;
        }
      });

      socket.addEventListener('close', () => {
        if (cancelled) return;
        setConnection('closed');
        scheduleReconnect();
      });

      socket.addEventListener('error', () => {
        pushError('WS_ERROR', 'WebSocket connection error');
      });
    };

    const scheduleReconnect = () => {
      if (cancelled) return;
      const attempt = reconnectAttempts.current;
      reconnectAttempts.current += 1;
      const delay = Math.min(1000 * 2 ** attempt, 10_000);
      retryTimeout.current = window.setTimeout(connect, delay);
    };

    const flushPending = (socket: WebSocket) => {
      const pending = drainPendingActions();
      pending.forEach((action) => socket.send(JSON.stringify(action)));
    };

    connect();

    return () => {
      cancelled = true;
      if (retryTimeout.current) {
        window.clearTimeout(retryTimeout.current);
        retryTimeout.current = null;
      }
      socketRef.current?.close();
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
