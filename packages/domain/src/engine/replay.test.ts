import { describe, expect, it } from 'vitest';
import type { GameEvent } from '../types/events.js';
import type { GameConfig } from '../types/game.js';
import { replayGame } from './replay.js';

const config: GameConfig = {
  gameId: 'replay-game',
  sessionSeed: 'session-seed',
  roundCount: 10,
  minPlayers: 2,
  maxPlayers: 4,
};

const heartsAce = { id: 'd0:hearts:A', suit: 'hearts', rank: 'A', deckIndex: 0 } as const;
const clubsKing = { id: 'd0:clubs:K', suit: 'clubs', rank: 'K', deckIndex: 0 } as const;
const diamondsFive = { id: 'd0:diamonds:5', suit: 'diamonds', rank: '5', deckIndex: 0 } as const;

describe('replayGame', () => {
  it('reconstructs game state from a golden path event log', () => {
    const events: GameEvent[] = [
      makeEvent(0, 'GAME_CREATED', { sessionSeed: 'session-seed', config, creatorPlayerId: 'player-1' }),
      makeEvent(1, 'PLAYER_JOINED', { playerId: 'player-1', seatIndex: 0, profile: profile('Alice') }),
      makeEvent(2, 'PLAYER_JOINED', { playerId: 'player-2', seatIndex: 1, profile: profile('Bob') }),
      makeEvent(3, 'ROUND_STARTED', { roundIndex: 9, cardsPerPlayer: 1, roundSeed: 'session-seed:9' }),
      makeEvent(4, 'CARDS_DEALT', { hands: { 'player-1': [heartsAce.id], 'player-2': [clubsKing.id] }, deckStateHash: 'hash' }),
      makeEvent(5, 'TRUMP_REVEALED', { card: diamondsFive }),
      makeEvent(6, 'PLAYER_BID', { playerId: 'player-1', bid: 1 }),
      makeEvent(7, 'PLAYER_BID', { playerId: 'player-2', bid: 0 }),
      makeEvent(8, 'BIDDING_COMPLETE', {}),
      makeEvent(9, 'TRICK_STARTED', { trickIndex: 0, leaderPlayerId: 'player-1' }),
      makeEvent(10, 'CARD_PLAYED', { playerId: 'player-1', card: heartsAce }),
      makeEvent(11, 'CARD_PLAYED', { playerId: 'player-2', card: clubsKing }),
      makeEvent(12, 'TRICK_COMPLETED', { trickIndex: 0, winningPlayerId: 'player-1', winningCardId: heartsAce.id }),
      makeEvent(13, 'ROUND_SCORED', {
        deltas: { 'player-1': 6, 'player-2': 5 },
        cumulativeScores: { 'player-1': 6, 'player-2': 5 },
      }),
    ];

    const state = replayGame(events);

    expect(state.phase).toBe('SCORING');
    expect(state.cumulativeScores['player-1']).toBe(6);
    expect(state.playerStates['player-1'].tricksWon).toBe(1);
    expect(state.roundState?.completedTricks).toHaveLength(1);
  });

  it('fails fast on corrupt logs', () => {
    const events: GameEvent[] = [
      makeEvent(0, 'GAME_CREATED', { sessionSeed: 'session-seed', config, creatorPlayerId: 'player-1' }),
      makeEvent(1, 'PLAYER_JOINED', { playerId: 'player-1', seatIndex: 0, profile: profile('Alice') }),
      makeEvent(2, 'ROUND_STARTED', { roundIndex: 9, cardsPerPlayer: 1, roundSeed: 'session-seed:9' }),
      makeEvent(3, 'TRICK_STARTED', { trickIndex: 0, leaderPlayerId: 'player-1' }),
      makeEvent(4, 'CARD_PLAYED', { playerId: 'player-1', card: heartsAce }),
    ];

    expect(() => replayGame(events)).toThrow();
  });
});

function makeEvent<T extends GameEvent['type']>(
  eventIndex: number,
  type: T,
  payload: Extract<GameEvent, { type: T }>['payload'],
): GameEvent {
  return {
    eventIndex,
    gameId: config.gameId,
    timestamp: eventIndex,
    type,
    payload,
  } as GameEvent;
}

function profile(name: string) {
  return {
    displayName: name,
    avatarSeed: name.toLowerCase(),
    color: '#112233',
  };
}
