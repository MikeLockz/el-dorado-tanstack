import { describe, expect, it } from 'vitest';
import type { Card, GameState, PlayerId, PlayerInGame, PlayerProfile, RoundState } from '@game/domain';
import { selectFallbackCard } from './fallback.js';

const baseProfile: PlayerProfile = {
  displayName: 'Fallback Tester',
  avatarSeed: 'seed',
  color: '#abcdef',
};

function buildState(hand: Card[], overrides: Partial<RoundState> = {}): GameState {
  const playerId: PlayerId = 'player-1';
  const roundState: RoundState = {
    roundIndex: 0,
    cardsPerPlayer: 1,
    roundSeed: 'seed',
    trumpCard: null,
    trumpSuit: 'spades',
    trumpBroken: false,
    bids: { [playerId]: 0 },
    biddingComplete: true,
    trickInProgress: null,
    completedTricks: [],
    dealerPlayerId: playerId,
    startingPlayerId: playerId,
    deck: [],
    remainingDeck: [],
    ...overrides,
  };

  const player: PlayerInGame = {
    playerId,
    seatIndex: 0,
    profile: baseProfile,
    status: 'active',
    isBot: false,
    spectator: false,
  };

  return {
    gameId: 'game',
    config: {
      gameId: 'game',
      sessionSeed: 'seed',
      roundCount: 10,
      minPlayers: 2,
      maxPlayers: 4,
    },
    phase: 'PLAYING',
    players: [player],
    playerStates: {
      [playerId]: {
        playerId,
        hand,
        tricksWon: 0,
        bid: 0,
        roundScoreDelta: 0,
      },
    },
    roundState,
    roundSummaries: [],
    cumulativeScores: { [playerId]: 0 },
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

const card = (suit: Card['suit'], rank: Card['rank']): Card => ({
  id: `${suit}:${rank}`,
  suit,
  rank,
  deckIndex: 0,
});

describe('selectFallbackCard', () => {
  it('prefers the led suit when available', () => {
    const state = buildState(
      [card('hearts', 'A'), card('hearts', '5'), card('clubs', '2')],
      {
        trickInProgress: {
          trickIndex: 0,
          leaderPlayerId: 'player-2',
          ledSuit: 'hearts',
          plays: [{ playerId: 'player-2', card: card('hearts', 'K'), order: 0 }],
          winningPlayerId: null,
          winningCardId: null,
          completed: false,
        },
      },
    );

    const selected = selectFallbackCard(state, 'player-1');
    expect(selected?.id).toBe('hearts:A');
  });

  it('falls back to lowest non-trump when void', () => {
    const state = buildState([card('spades', '3'), card('clubs', '4'), card('diamonds', '2')], {
      trickInProgress: {
        trickIndex: 0,
        leaderPlayerId: 'player-2',
        ledSuit: 'clubs',
        plays: [{ playerId: 'player-2', card: card('clubs', '5'), order: 0 }],
        winningPlayerId: null,
        winningCardId: null,
        completed: false,
      },
    });

    const selected = selectFallbackCard(state, 'player-1');
    expect(selected?.id).toBe('clubs:4');
  });
});
