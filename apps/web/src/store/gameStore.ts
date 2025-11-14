import type { ClientGameView, GameEvent, PlayerId } from '@game/domain';
import { Store } from '@tanstack/store';
import { useStore } from '@tanstack/react-store';
import type { ClientMessage } from '@/types/messages';

export type ConnectionStatus = 'idle' | 'connecting' | 'open' | 'closed';

export interface GameStoreError {
  code: string;
  message: string;
  timestamp: number;
}

export interface GameStoreState {
  connection: ConnectionStatus;
  game: ClientGameView | null;
  playerId: PlayerId | null;
  seatIndex: number | null;
  spectator: boolean;
  lastEvent: GameEvent | null;
  pendingActions: ClientMessage[];
  errors: GameStoreError[];
}

export const initialGameStoreState: GameStoreState = {
  connection: 'idle',
  game: null,
  playerId: null,
  seatIndex: null,
  spectator: false,
  lastEvent: null,
  pendingActions: [],
  errors: [],
};

export const gameStore = new Store<GameStoreState>({ ...initialGameStoreState });

export function resetGameStore() {
  gameStore.setState({ ...initialGameStoreState });
}

export function useGameStore<T>(selector: (state: GameStoreState) => T) {
  return useStore(gameStore, selector);
}

export function setConnection(status: ConnectionStatus) {
  gameStore.setState((state) => ({ ...state, connection: status }));
}

export function updateGameState(game: ClientGameView) {
  gameStore.setState((state) => ({ ...state, game }));
}

export function setWelcome(payload: { playerId: PlayerId; seatIndex: number | null; spectator: boolean }) {
  gameStore.setState((state) => ({
    ...state,
    playerId: payload.playerId,
    seatIndex: payload.seatIndex,
    spectator: payload.spectator,
  }));
}

export function recordGameEvent(event: GameEvent) {
  gameStore.setState((state) => ({ ...state, lastEvent: event }));
}

export function pushError(code: string, message: string) {
  gameStore.setState((state) => ({
    ...state,
    errors: [...state.errors, { code, message, timestamp: Date.now() }],
  }));
}

export function clearErrors() {
  gameStore.setState((state) => ({ ...state, errors: [] }));
}

export function queuePendingAction(action: ClientMessage) {
  gameStore.setState((state) => ({
    ...state,
    pendingActions: [...state.pendingActions, action],
  }));
}

export function drainPendingActions(): ClientMessage[] {
  const actions = [...gameStore.state.pendingActions];
  gameStore.setState((state) => ({ ...state, pendingActions: [] }));
  return actions;
}
