import { describe, expect, it } from 'vitest';
import { createGame } from './game';
import { startRound, tricksForRound } from './round';
import type { GameConfig, GameState } from '../types/game';
import type { PlayerInGame, ServerPlayerState } from '../types/player';

function buildGameState(playerCount: number): GameState {
  const config: GameConfig = {
    gameId: 'game-1',
    sessionSeed: 'session-seed',
    roundCount: 10,
    minPlayers: 2,
    maxPlayers: 10,
  };

  const base = createGame(config);
  const players: PlayerInGame[] = Array.from({ length: playerCount }, (_, index) => ({
    playerId: `player-${index + 1}`,
    seatIndex: index,
    profile: {
      displayName: `Player ${index + 1}`,
      avatarSeed: `seed-${index + 1}`,
      color: '#abcdef',
    },
    status: 'active',
    isBot: false,
    spectator: false,
  }));

  const playerStates: Record<string, ServerPlayerState> = {};
  const cumulativeScores: Record<string, number> = {};
  for (const player of players) {
    playerStates[player.playerId] = {
      playerId: player.playerId,
      hand: [],
      tricksWon: 0,
      bid: null,
      roundScoreDelta: 0,
    };
    cumulativeScores[player.playerId] = 0;
  }

  return {
    ...base,
    players,
    playerStates,
    cumulativeScores,
  };
}

describe('tricksForRound', () => {
  it('follows the 10..1 progression', () => {
    expect(tricksForRound(0)).toBe(10);
    expect(tricksForRound(5)).toBe(5);
    expect(tricksForRound(9)).toBe(1);
  });
});

describe('startRound', () => {
  it('deals the correct number of cards in round one', () => {
    const initialState = buildGameState(4);
    const nextState = startRound(initialState, 0, 'seed:round:0');
    for (const player of nextState.players) {
      expect(nextState.playerStates[player.playerId].hand).toHaveLength(10);
    }
    expect(nextState.roundState?.cardsPerPlayer).toBe(10);
    expect(nextState.roundState?.deck.length).toBe(52);
  });

  it('deals a single card per player in round ten', () => {
    const initialState = buildGameState(3);
    const nextState = startRound(initialState, 9, 'seed:round:9');
    for (const player of nextState.players) {
      expect(nextState.playerStates[player.playerId].hand).toHaveLength(1);
    }
    expect(nextState.roundState?.cardsPerPlayer).toBe(1);
  });

  it('uses two decks when at least six players are seated', () => {
    const initialState = buildGameState(6);
    const nextState = startRound(initialState, 0, 'seed:round:big');
    expect(nextState.roundState?.deck.length).toBe(104);
  });

  it('tracks the trump card for the round', () => {
    const initialState = buildGameState(4);
    const nextState = startRound(initialState, 2, 'seed:round:trump');
    expect(nextState.roundState?.trumpCard).toBeDefined();
    expect(nextState.roundState?.trumpSuit).toBe(nextState.roundState?.trumpCard?.suit ?? null);
    expect(nextState.roundState?.remainingDeck.length).toBeGreaterThan(0);
  });
});
