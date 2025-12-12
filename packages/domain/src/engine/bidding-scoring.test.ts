import { describe, expect, it } from 'vitest';
import { createGame } from './game.js';
import { startRound } from './round.js';
import { applyBid } from './bidding.js';
import { scoreRound } from './scoring.js';
import type { GameConfig, GameState, TrickState } from '../types/game.js';
import type { PlayerInGame, ServerPlayerState } from '../types/player.js';
import { EngineError } from './errors.js';

const config: GameConfig = {
  gameId: 'bid-test',
  sessionSeed: 'seed',
  roundCount: 10,
  minPlayers: 2,
  maxPlayers: 4,
};

function buildGameState(playerCount: number): GameState {
  const base = createGame(config);
  const players: PlayerInGame[] = Array.from({ length: playerCount }, (_, index) => ({
    playerId: `player-${index + 1}`,
    seatIndex: index,
    profile: {
      displayName: `Player ${index + 1}`,
      avatarSeed: `seed-${index + 1}`,
      color: '#654321',
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

function finalizeRound(state: GameState, tricks: Record<string, number>): GameState {
  const roundState = state.roundState!;
  const completedTricks: TrickState[] = Array.from({ length: roundState.cardsPerPlayer }, (_, index) => ({
    trickIndex: index,
    leaderPlayerId: roundState.startingPlayerId,
    ledSuit: 'clubs',
    plays: [],
    winningPlayerId: state.players[0].playerId,
    winningCardId: `card-${index}`,
    completed: true,
  }));
  const playerStates = { ...state.playerStates };
  for (const [playerId, count] of Object.entries(tricks)) {
    playerStates[playerId] = {
      ...playerStates[playerId],
      tricksWon: count,
    };
  }
  return {
    ...state,
    playerStates,
    roundState: {
      ...roundState,
      completedTricks,
      trickInProgress: null,
    },
  };
}

describe('applyBid', () => {
  it('records bids and marks completion when all players act', () => {
    const withPlayers = buildGameState(3);
    const started = startRound(withPlayers, 7, 'seed:round');

    const afterFirst = applyBid(started, 'player-3', 0).state;
    const afterSecond = applyBid(afterFirst, 'player-1', 3).state;
    const afterThird = applyBid(afterSecond, 'player-2', 1).state;

    expect(afterThird.roundState?.biddingComplete).toBe(true);
    expect(afterThird.phase).toBe('PLAYING');
    expect(afterThird.playerStates['player-1'].bid).toBe(3);
  });

  it('rejects illegal bids outside the allowed range', () => {
    const withPlayers = buildGameState(2);
    const started = startRound(withPlayers, 7, 'seed:round');
    expect(() => applyBid(started, 'player-1', 5)).toThrowError(EngineError);
  });
});

describe('scoreRound', () => {
  it('awards positive points when bid matches tricks won', () => {
    const started = startRound(buildGameState(2), 7, 'seed:round');
    const biddingComplete = applyBid(applyBid(started, 'player-1', 3).state, 'player-2', 0).state;
    const ready = finalizeRound(biddingComplete, { 'player-1': 3, 'player-2': 0 });
    const result = scoreRound(ready);

    expect(result.state.cumulativeScores['player-1']).toBe(8);
    expect(result.state.playerStates['player-1'].roundScoreDelta).toBe(8);
  });

  it('applies penalties when bids are missed', () => {
    const started = startRound(buildGameState(2), 7, 'seed:round');
    const biddingComplete = applyBid(applyBid(started, 'player-1', 3).state, 'player-2', 0).state;
    const ready = finalizeRound(biddingComplete, { 'player-1': 2, 'player-2': 1 });
    const result = scoreRound(ready);

    expect(result.state.cumulativeScores['player-1']).toBe(-8);
    expect(result.state.playerStates['player-1'].roundScoreDelta).toBe(-8);
  });

  it('updates cumulative scores over multiple rounds', () => {
    const started = startRound(buildGameState(2), 7, 'seed:round');
    const biddingComplete = applyBid(applyBid(started, 'player-1', 1).state, 'player-2', 1).state;
    const ready = finalizeRound(biddingComplete, { 'player-1': 1, 'player-2': 0 });
    ready.cumulativeScores['player-1'] = 10;
    const result = scoreRound(ready);

    expect(result.state.cumulativeScores['player-1']).toBe(16);
    expect(result.state.roundSummaries).toHaveLength(1);
    expect(result.state.roundSummaries[0].deltas['player-1']).toBe(6);
  });
});
