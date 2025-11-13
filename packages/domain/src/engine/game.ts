import type { GameConfig, GameState } from '../types/game';

export function createGame(config: GameConfig): GameState {
  const now = Date.now();
  const normalizedConfig: GameConfig = {
    ...config,
    roundCount: config.roundCount ?? 10,
    startingSeatIndex: config.startingSeatIndex ?? 0,
  };

  return {
    gameId: normalizedConfig.gameId,
    config: normalizedConfig,
    phase: 'LOBBY',
    players: [],
    playerStates: {},
    roundState: null,
    roundSummaries: [],
    cumulativeScores: {},
    createdAt: normalizedConfig.createdAt ?? now,
    updatedAt: now,
  };
}
