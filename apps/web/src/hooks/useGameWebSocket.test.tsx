import { render } from '@testing-library/react';
import type { ClientGameView } from '@game/domain';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useGameWebSocket } from './useGameWebSocket';
import { resetGameStore, gameStore } from '@/store/gameStore';
import type { ClientMessage } from '@/types/messages';
import { storePlayerToken, getStoredPlayerToken, clearPlayerToken } from '@/lib/playerTokens';

vi.mock('@/lib/playerTokens', () => {
  const store = new Map<string, string>();
  return {
    getStoredPlayerToken: vi.fn((gameId: string) => store.get(gameId) ?? null),
    storePlayerToken: vi.fn((gameId: string, token: string) => {
      store.set(gameId, token);
    }),
    clearPlayerToken: vi.fn((gameId: string) => {
      store.delete(gameId);
    }),
  };
});

class MockWebSocket {
  static instances: MockWebSocket[] = [];
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  public readyState = MockWebSocket.CONNECTING;
  public sent: string[] = [];
  private listeners = new Map<string, Set<(event: any) => void>>();

  constructor(public readonly url: string) {
    MockWebSocket.instances.push(this);
  }

  addEventListener(type: string, handler: (event: any) => void) {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }
    this.listeners.get(type)!.add(handler);
  }

  removeEventListener(type: string, handler: (event: any) => void) {
    this.listeners.get(type)?.delete(handler);
  }

  send(data: string) {
    this.sent.push(data);
  }

  close() {
    this.readyState = MockWebSocket.CLOSED;
    this.dispatch('close', {});
  }

  simulateOpen() {
    this.readyState = MockWebSocket.OPEN;
    this.dispatch('open', {});
  }

  simulateMessage(payload: unknown) {
    this.dispatch('message', { data: typeof payload === 'string' ? payload : JSON.stringify(payload) });
  }

  simulateError() {
    this.dispatch('error', new Event('error'));
  }

  private dispatch(type: string, event: any) {
    this.listeners.get(type)?.forEach((handler) => handler(event));
  }

  static reset() {
    MockWebSocket.instances = [];
  }
}

function TestSocket(props: { gameId?: string; token?: string | null; onSend?: (send: (msg: ClientMessage) => void) => void }) {
  const send = useGameWebSocket(props.gameId, props.token);
  props.onSend?.(send);
  return null;
}

function flushAsync() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe('useGameWebSocket', () => {
  beforeEach(() => {
    resetGameStore();
    MockWebSocket.reset();
    vi.stubGlobal('WebSocket', MockWebSocket as unknown as typeof WebSocket);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('connects and requests state updates', async () => {
    render(<TestSocket gameId="game-42" token="token-abc" />);
    await flushAsync();

    const socket = MockWebSocket.instances.at(-1);
    expect(socket).toBeDefined();

    socket!.simulateOpen();
    expect(gameStore.state.connection).toBe('open');
    expect(socket!.sent[0]).toContain('REQUEST_STATE');

    const state: ClientGameView = {
      gameId: 'game-42',
      phase: 'LOBBY',
      players: [],
      cumulativeScores: {},
      round: null,
    };

    socket!.simulateMessage({ type: 'STATE_FULL', state });
    expect(gameStore.state.game).toEqual(state);
  });

  it('queues actions when socket not ready', async () => {
    let capturedSend: ((msg: ClientMessage) => void) | undefined;
    render(<TestSocket gameId="game-42" token="token-abc" onSend={(send) => (capturedSend = send)} />);
    await flushAsync();

    expect(capturedSend).toBeDefined();
    const socket = MockWebSocket.instances.at(-1)!;

    capturedSend!({ type: 'PING', nonce: 'n1' });
    expect(socket.sent).toHaveLength(0);
    socket.simulateOpen();
    expect(gameStore.state.pendingActions).toHaveLength(0);
  });

  it('stores refreshed tokens from the server', async () => {
    render(<TestSocket gameId="game-42" token="token-abc" />);
    await flushAsync();
    const socket = MockWebSocket.instances.at(-1)!;
    socket.simulateOpen();
    socket.simulateMessage({ type: 'TOKEN_REFRESH', gameId: 'game-42', token: 'jwt-123' });

    expect(storePlayerToken).toHaveBeenCalledWith('game-42', 'jwt-123');
  });

  it('clears stored token after repeated connection failures', () => {
    vi.useFakeTimers();
    render(<TestSocket gameId="game-42" token="token-abc" />);
    vi.runOnlyPendingTimers();

    for (let attempt = 0; attempt < 6; attempt += 1) {
      const socket = MockWebSocket.instances.at(-1)!;
      socket.close();
      vi.runOnlyPendingTimers();
    }

    expect(clearPlayerToken).toHaveBeenCalledWith('game-42');
    expect(gameStore.state.connection).toBe('idle');
    expect(gameStore.state.errors.at(-1)?.code).toBe('WS_RETRY_EXHAUSTED');
  });

  it('ignores stale socket events when reconnecting', async () => {
    const utils = render(<TestSocket gameId="game-42" token="token-abc" />);
    await flushAsync();

    const first = MockWebSocket.instances.at(-1)!;

    utils.rerender(<TestSocket gameId="game-42" token="token-def" />);
    await flushAsync();

    const second = MockWebSocket.instances.at(-1)!;
    expect(second).not.toBe(first);

    first.simulateError();
    first.close();
    second.simulateOpen();

    expect(gameStore.state.connection).toBe('open');
    expect(gameStore.state.errors).toHaveLength(0);
  });
});
