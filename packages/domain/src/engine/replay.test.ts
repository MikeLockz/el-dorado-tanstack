import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
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

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../../..');
const regressionDir = path.join(repoRoot, 'fixtures', 'regressions');

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

describe('regression fixtures', () => {
  const regressionFiles = existsSync(regressionDir)
    ? readdirSync(regressionDir).filter((file) => file.endsWith('.json'))
    : [];

  it('has regression fixtures available', () => {
    expect(regressionFiles.length).toBeGreaterThan(0);
  });

  for (const file of regressionFiles) {
    it(`replays ${file} without divergence`, () => {
      const fullPath = path.join(regressionDir, file);
      const payload = readFileSync(fullPath, 'utf8');
      const events = JSON.parse(payload) as GameEvent[];
      const state = replayGame(events);

      expect(state.phase).toBe('COMPLETED');
      expect(state.roundSummaries.length).toBeGreaterThan(0);
      for (const summary of state.roundSummaries) {
        expect(Object.values(summary.deltas).length).toBeGreaterThan(0);
      }
    });
  }
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
