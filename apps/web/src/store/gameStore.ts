import type { ClientGameView, GameEvent, PlayerId, PlayerInGame } from '@game/domain';
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
  gameStore.setState((state) => {
    const nextGame = applyClientEvent(state.game, event);
    return { ...state, game: nextGame, lastEvent: event };
  });
}

function applyClientEvent(game: ClientGameView | null, event: GameEvent): ClientGameView | null {
  if (!game) return null;

  switch (event.type) {
    case 'PLAYER_JOINED': {
      const { playerId, seatIndex, profile } = event.payload;
      if (game.players.some((p) => p.playerId === playerId)) {
        return game;
      }
      const newPlayer: PlayerInGame = {
        playerId,
        seatIndex,
        profile,
        status: 'active',
        isBot: false,
        spectator: false,
      };
      return {
        ...game,
        players: [...game.players, newPlayer],
      };
    }
    case 'PLAYER_LEFT': {
      return {
        ...game,
        players: game.players.filter((p) => p.playerId !== event.payload.playerId),
      };
    }
    case 'PLAYER_KICKED': {
      return {
        ...game,
        players: game.players.filter((p) => p.playerId !== event.payload.playerId),
      };
    }
    case 'PLAYER_DISCONNECTED': {
      return {
        ...game,
        players: game.players.map((p) => (p.playerId === event.payload.playerId ? { ...p, status: 'disconnected' } : p)),
      };
    }
    case 'PLAYER_RECONNECTED': {
      return {
        ...game,
        players: game.players.map((p) => (p.playerId === event.payload.playerId ? { ...p, status: 'active' } : p)),
      };
    }
    case 'PLAYER_READY': {
      if (!game.lobby) return game;
      return {
        ...game,
        lobby: {
          ...game.lobby,
          readyState: {
            ...game.lobby.readyState,
            [event.payload.playerId]: { ready: true, updatedAt: event.timestamp },
          },
        },
      };
    }
    case 'PLAYER_UNREADY': {
      if (!game.lobby) return game;
      return {
        ...game,
        lobby: {
          ...game.lobby,
          readyState: {
            ...game.lobby.readyState,
            [event.payload.playerId]: { ready: false, updatedAt: event.timestamp },
          },
        },
      };
    }
    case 'BOT_ADDED': {
      // Mark existing player as bot if found
      const playerExists = game.players.some((p) => p.playerId === event.payload.playerId);
      if (playerExists) {
        return {
          ...game,
          players: game.players.map((p) => (p.playerId === event.payload.playerId ? { ...p, isBot: true } : p)),
          lobby: game.lobby
            ? {
              ...game.lobby,
              readyState: {
                ...game.lobby.readyState,
                [event.payload.playerId]: { ready: true, updatedAt: event.timestamp },
              },
            }
            : undefined,
        };
      }
      return game;
    }
    case 'BOT_REMOVED': {
      return {
        ...game,
        players: game.players.filter((p) => p.playerId !== event.payload.playerId),
      };
    }
    case 'PLAYER_BECAME_SPECTATOR': {
      return {
        ...game,
        players: game.players.map((p) => (p.playerId === event.payload.playerId ? { ...p, spectator: true, seatIndex: null } : p)),
      };
    }
    default:
      return game;
  }
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
