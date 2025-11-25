import type { ClientGameView, GameEvent } from '@game/domain';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  drainPendingActions,
  initialGameStoreState,
  queuePendingAction,
  recordGameEvent,
  resetGameStore,
  setConnection,
  setWelcome,
  updateGameState,
  gameStore,
} from './gameStore';

const mockGame: ClientGameView = {
  gameId: 'game-123',
  phase: 'LOBBY',
  players: [],
  cumulativeScores: {},
  round: null,
  roundSummaries: [],
  config: {
    minPlayers: 2,
    maxPlayers: 4,
    roundCount: 10,
  },
  isPublic: false,
};

describe('gameStore', () => {
  beforeEach(() => {
    resetGameStore();
  });

  it('updates connection state', () => {
    setConnection('connecting');
    expect(gameStore.state.connection).toBe('connecting');
  });

  it('stores welcome payload', () => {
    setWelcome({ playerId: 'p1', seatIndex: 0, spectator: false });
    expect(gameStore.state.playerId).toBe('p1');
    expect(gameStore.state.seatIndex).toBe(0);
  });

  it('tracks latest game state', () => {
    updateGameState(mockGame);
    expect(gameStore.state.game).toEqual(mockGame);
  });

  it('queues and drains pending actions', () => {
    queuePendingAction({ type: 'REQUEST_STATE' });
    queuePendingAction({ type: 'PING', nonce: '123' });
    const drained = drainPendingActions();
    expect(drained).toHaveLength(2);
    expect(gameStore.state.pendingActions).toHaveLength(0);
  });

  it('records events', () => {
    const event: GameEvent = {
      type: 'ROUND_STARTED',
      payload: { roundIndex: 0, cardsPerPlayer: 10, roundSeed: 'seed' },
      eventIndex: 0,
      timestamp: Date.now(),
      gameId: 'game-123',
    };
    recordGameEvent(event);
    expect(gameStore.state.lastEvent?.type).toBe('ROUND_STARTED');
  });

  it('resets fully', () => {
    setConnection('open');
    updateGameState(mockGame);
    resetGameStore();
    expect(gameStore.state).toEqual(initialGameStoreState);
  });
});
