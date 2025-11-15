import { describe, expect, it } from 'vitest';
import type { Card } from '../types/cards.js';
import { createGame } from './game.js';
import { completeTrick, playCard } from './trick.js';
import type { GameConfig, GameState, RoundState } from '../types/game.js';
import type { PlayerInGame, ServerPlayerState } from '../types/player.js';
import { EngineError } from './errors.js';

type Suit = Card['suit'];

type Rank = Card['rank'];

const config: GameConfig = {
  gameId: 'test-game',
  sessionSeed: 'seed',
  roundCount: 10,
  minPlayers: 2,
  maxPlayers: 4,
};

const baseProfiles = ['Alice', 'Bob', 'Cara', 'Duke'];

function card(suit: Suit, rank: Rank, deckIndex = 0): Card {
  return {
    id: `d${deckIndex}:${suit}:${rank}`,
    suit,
    rank,
    deckIndex,
  };
}

function setupPlayingState(
  hands: Record<string, Card[]>,
  trumpSuit: Suit = 'spades',
  options: { dealerPlayerId?: string; startingPlayerId?: string } = {},
): GameState {
  const base = createGame(config);
  const playerIds = Object.keys(hands);
  const players: PlayerInGame[] = playerIds.map((playerId, index) => ({
    playerId,
    seatIndex: index,
    profile: {
      displayName: baseProfiles[index] ?? playerId,
      avatarSeed: `seed-${playerId}`,
      color: '#123456',
    },
    status: 'active',
    isBot: false,
    spectator: false,
  }));

  const playerStates: Record<string, ServerPlayerState> = {};
  const bids: Record<string, number | null> = {};
  const cumulativeScores: Record<string, number> = {};
  for (const playerId of playerIds) {
    playerStates[playerId] = {
      playerId,
      hand: [...hands[playerId]],
      tricksWon: 0,
      bid: 0,
      roundScoreDelta: 0,
    };
    bids[playerId] = 0;
    cumulativeScores[playerId] = 0;
  }

  const dealerPlayerId = options.dealerPlayerId ?? playerIds[0];
  const startingPlayerId = options.startingPlayerId ?? playerIds[0];
  const roundState: RoundState = {
    roundIndex: 0,
    cardsPerPlayer: Math.max(...playerIds.map((pid) => hands[pid].length)),
    roundSeed: 'round-seed',
    trumpCard: card(trumpSuit, 'A'),
    trumpSuit,
    trumpBroken: false,
    bids,
    biddingComplete: true,
    trickInProgress: null,
    completedTricks: [],
    dealerPlayerId,
    startingPlayerId,
    deck: [],
    remainingDeck: [],
  };

  return {
    ...base,
    phase: 'PLAYING',
    players,
    playerStates,
    roundState,
    cumulativeScores,
    roundSummaries: [],
  };
}

describe('playCard validation', () => {
  it('requires players to follow suit when possible', () => {
    const state = setupPlayingState({
      'player-1': [card('hearts', 'A'), card('clubs', '2')],
      'player-2': [card('hearts', 'K'), card('clubs', '3')],
      'player-3': [card('spades', '2'), card('diamonds', '4')],
    });

    const afterFirst = playCard(state, 'player-1', 'd0:hearts:A').state;
    expect(() => playCard(afterFirst, 'player-2', 'd0:clubs:3')).toThrowError(EngineError);
    try {
      playCard(afterFirst, 'player-2', 'd0:clubs:3');
    } catch (error) {
      const err = error as EngineError;
      expect(err.code).toBe('MUST_FOLLOW_SUIT');
    }
  });

  it('prevents leading trump until it is broken unless only trump remains', () => {
    const state = setupPlayingState({
      'player-1': [card('spades', 'K'), card('hearts', '2')],
      'player-2': [card('clubs', '5')],
    });

    expect(() => playCard(state, 'player-1', 'd0:spades:K')).toThrowError(EngineError);
    try {
      playCard(state, 'player-1', 'd0:spades:K');
    } catch (error) {
      const err = error as EngineError;
      expect(err.code).toBe('CANNOT_LEAD_TRUMP');
    }
  });

  it('allows leading trump when only trump cards remain', () => {
    const state = setupPlayingState({
      'player-1': [card('spades', '3')],
      'player-2': [card('clubs', '4')],
      'player-3': [card('diamonds', '5')],
    });

    const next = playCard(state, 'player-1', 'd0:spades:3').state;
    expect(next.roundState?.trickInProgress?.ledSuit).toBe('spades');
  });

  it('rejects plays that occur out of turn', () => {
    const state = setupPlayingState({
      'player-1': [card('hearts', '4')],
      'player-2': [card('clubs', '4')],
    });
    expect(() => playCard(state, 'player-2', 'd0:clubs:4')).toThrowError(EngineError);
    try {
      playCard(state, 'player-2', 'd0:clubs:4');
    } catch (error) {
      expect((error as EngineError).code).toBe('NOT_PLAYERS_TURN');
    }
  });

  it('rejects attempts to play cards the player does not own', () => {
    const state = setupPlayingState({
      'player-1': [card('hearts', '4')],
      'player-2': [card('clubs', '4')],
    });
    expect(() => playCard(state, 'player-1', 'd0:spades:9')).toThrowError(EngineError);
    try {
      playCard(state, 'player-1', 'd0:spades:9');
    } catch (error) {
      expect((error as EngineError).code).toBe('CARD_NOT_IN_HAND');
    }
  });
});

describe('trump logic', () => {
  it('marks trump as broken when a void player sloughs trump', () => {
    const state = setupPlayingState({
      'player-1': [card('hearts', '10')],
      'player-2': [card('spades', '4')],
      'player-3': [card('diamonds', '6')],
    });

    const afterLeader = playCard(state, 'player-1', 'd0:hearts:10').state;
    const afterSecond = playCard(afterLeader, 'player-2', 'd0:spades:4').state;
    expect(afterSecond.roundState?.trumpBroken).toBe(true);
  });
});

describe('completeTrick', () => {
  it('awards the trick to the highest trump card', () => {
    const state = setupPlayingState({
      'player-1': [card('hearts', '10')],
      'player-2': [card('hearts', 'K')],
      'player-3': [card('spades', '3')],
    });

    const s1 = playCard(state, 'player-1', 'd0:hearts:10').state;
    const s2 = playCard(s1, 'player-2', 'd0:hearts:K').state;
    const s3Result = playCard(s2, 'player-3', 'd0:spades:3');
    const completed = completeTrick(s3Result.state);

    expect(completed.state.roundState?.completedTricks).toHaveLength(1);
    expect(completed.state.roundState?.completedTricks[0].winningPlayerId).toBe('player-3');
    expect(completed.state.playerStates['player-3'].tricksWon).toBe(1);
  });

  it('breaks ties between duplicate cards by later play order', () => {
    const state = setupPlayingState({
      'player-1': [card('spades', '3')],
      'player-2': [card('spades', 'A', 0)],
      'player-3': [card('spades', 'A', 1)],
    });

    const s1 = playCard(state, 'player-1', 'd0:spades:3').state;
    const s2 = playCard(s1, 'player-2', 'd0:spades:A').state;
    const s3Result = playCard(s2, 'player-3', 'd1:spades:A');
    const completed = completeTrick(s3Result.state);

    expect(completed.state.roundState?.completedTricks[0].winningPlayerId).toBe('player-3');
  });
});
