import { describe, expect, it } from 'vitest';
import type { Card } from './types/cards.js';
import {
  SUITS,
  type GameState,
  type PlayerInGame,
  type PlayerProfile,
  type RoundState,
  type ServerPlayerState,
} from './index.js';

const mockCard: Card = {
  id: 'd0:hearts:A',
  suit: 'hearts',
  rank: 'A',
  deckIndex: 0,
};

describe('domain type exports', () => {
  it('allows composing a minimal GameState with round context', () => {
    const profile: PlayerProfile = {
      displayName: 'Test Pilot',
      avatarSeed: 'seed',
      color: '#ff00ff',
    };

    const player: PlayerInGame = {
      playerId: 'player-1',
      seatIndex: 0,
      profile,
      status: 'active',
      isBot: false,
      spectator: false,
    };

    const serverState: ServerPlayerState = {
      playerId: 'player-1',
      hand: [mockCard],
      tricksWon: 0,
      bid: null,
      roundScoreDelta: 0,
    };

    const roundState: RoundState = {
      roundIndex: 0,
      cardsPerPlayer: 10,
      roundSeed: 'seed-0',
      trumpCard: mockCard,
      trumpSuit: 'hearts',
      trumpBroken: false,
      bids: { 'player-1': null },
      biddingComplete: false,
      trickInProgress: null,
      completedTricks: [],
      dealerPlayerId: 'player-1',
      startingPlayerId: 'player-1',
      deck: [mockCard],
      remainingDeck: [],
    };

    const gameState: GameState = {
      gameId: 'game-1',
      config: {
        gameId: 'game-1',
        sessionSeed: 'primary-seed',
        roundCount: 10,
        minPlayers: 2,
        maxPlayers: 4,
      },
      phase: 'LOBBY',
      players: [player],
      playerStates: { 'player-1': serverState },
      roundState,
      roundSummaries: [],
      cumulativeScores: { 'player-1': 0 },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    expect(gameState.players).toHaveLength(1);
    expect(gameState.roundState?.trumpSuit).toBe('hearts');
    expect(SUITS).toContain('diamonds');
  });
});
