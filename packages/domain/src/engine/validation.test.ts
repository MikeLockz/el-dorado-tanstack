import { describe, expect, it } from 'vitest';
import type { Card } from '../types/cards.js';
import type { GameConfig, GameState, RoundState, TrickState } from '../types/game.js';
import type { PlayerInGame, ServerPlayerState } from '../types/player.js';
import { canLeadTrump, determineTrickLeader, isPlayersTurn, mustFollowSuit } from './validation.js';
import { createGame } from './game.js';

const config: GameConfig = {
  gameId: 'validation-game',
  sessionSeed: 'validation-seed',
  roundCount: 10,
  minPlayers: 2,
  maxPlayers: 4,
};

const ranks: Card['rank'][] = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

function makeCard(suit: Card['suit'], rank: Card['rank'], deckIndex = 0): Card {
  return {
    id: `d${deckIndex}:${suit}:${rank}`,
    suit,
    rank,
    deckIndex,
  };
}

function buildState(hands: Record<string, Card[]>, overrides: Partial<RoundState> = {}): GameState {
  const base = createGame(config);
  const players: PlayerInGame[] = Object.keys(hands).map((playerId, index) => ({
    playerId,
    seatIndex: index,
    profile: {
      displayName: `Player ${index + 1}`,
      avatarSeed: `seed-${playerId}`,
      color: '#334455',
    },
    status: 'active',
    isBot: false,
    spectator: false,
  }));

  const playerStates: Record<string, ServerPlayerState> = {};
  for (const [playerId, cards] of Object.entries(hands)) {
    playerStates[playerId] = {
      playerId,
      hand: cards,
      tricksWon: 0,
      bid: 0,
      roundScoreDelta: 0,
    };
  }

  const bids: Record<string, number | null> = Object.fromEntries(players.map((p) => [p.playerId, 0]));

  const dealerPlayerId = overrides.dealerPlayerId ?? players[0]?.playerId ?? null;
  const startingPlayerId =
    overrides.startingPlayerId ?? (players.length > 1 ? players[1]?.playerId ?? dealerPlayerId : dealerPlayerId);

  const roundState: RoundState = {
    roundIndex: overrides.roundIndex ?? 0,
    cardsPerPlayer: overrides.cardsPerPlayer ?? Math.max(...Object.values(hands).map((list) => list.length)),
    roundSeed: overrides.roundSeed ?? 'validation-round',
    trumpCard: overrides.trumpCard ?? makeCard('spades', 'A'),
    trumpSuit: overrides.trumpSuit ?? 'spades',
    trumpBroken: overrides.trumpBroken ?? false,
    bids,
    biddingComplete: true,
    trickInProgress: overrides.trickInProgress ?? null,
    completedTricks: overrides.completedTricks ?? [],
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
    cumulativeScores: Object.fromEntries(players.map((p) => [p.playerId, 0])),
    roundSummaries: [],
  };
}

function rotateRanks(index: number): Card['rank'] {
  return ranks[index % ranks.length]!;
}

describe('validation helpers', () => {
  it('identifies the active player as turns rotate', () => {
    const state = buildState({
      'player-1': [makeCard('hearts', rotateRanks(0))],
      'player-2': [makeCard('clubs', rotateRanks(1))],
      'player-3': [makeCard('diamonds', rotateRanks(2))],
    }, {
      trickInProgress: {
        trickIndex: 0,
        leaderPlayerId: 'player-2',
        ledSuit: 'clubs',
        plays: [
          { playerId: 'player-2', card: makeCard('clubs', '3'), order: 0 },
        ],
        winningPlayerId: null,
        winningCardId: null,
        completed: false,
      },
    });

    expect(isPlayersTurn(state, 'player-3')).toBe(true);
    expect(isPlayersTurn(state, 'player-1')).toBe(false);
  });

  it('falls back to last trick winner when determining the leader', () => {
    const completed: TrickState = {
      trickIndex: 0,
      leaderPlayerId: 'player-1',
      ledSuit: 'hearts',
      plays: [],
      winningPlayerId: 'player-3',
      winningCardId: 'd0:hearts:Q',
      completed: true,
    };
    const state = buildState(
      {
        'player-1': [makeCard('clubs', '2')],
        'player-2': [makeCard('spades', '2')],
        'player-3': [makeCard('diamonds', '3')],
      },
      { trickInProgress: null, completedTricks: [completed] },
    );

    const roundState = state.roundState!;
    const order = state.players.map((p) => p.playerId);
    expect(determineTrickLeader(roundState, order)).toBe('player-3');
  });

  it('requires players to follow suit when the led suit is in hand', () => {
    const state = buildState({
      'player-1': [makeCard('hearts', 'A'), makeCard('clubs', '4')],
      'player-2': [makeCard('hearts', '5'), makeCard('spades', '9')],
    }, {
      trickInProgress: {
        trickIndex: 0,
        leaderPlayerId: 'player-2',
        ledSuit: 'hearts',
        plays: [
          { playerId: 'player-2', card: makeCard('hearts', '5'), order: 0 },
        ],
        winningPlayerId: null,
        winningCardId: null,
        completed: false,
      },
    });

    const offSuitCard = makeCard('clubs', '4');
    expect(mustFollowSuit(state, 'player-1', offSuitCard)).toBe(true);
  });

  it('allows leading trump once all non-trump cards are exhausted', () => {
    const state = buildState({
      'player-1': [makeCard('spades', 'K')],
    });

    expect(canLeadTrump(state, 'player-1', makeCard('spades', 'K'))).toBe(true);
  });

  it('blocks leading trump when other suits remain before trump is broken', () => {
    const state = buildState({
      'player-1': [makeCard('spades', 'K'), makeCard('clubs', '2')],
    });

    expect(canLeadTrump(state, 'player-1', makeCard('spades', 'K'))).toBe(false);
  });
});
