import type { ClientGameView, PlayerInGame } from '@game/domain';
import { describe, expect, it } from 'vitest';
import { describeCard, getCurrentTurnPlayerId, sortPlayersBySeat } from './gameUtils';

const players: PlayerInGame[] = [
  { playerId: 'p1', seatIndex: 0, profile: { displayName: 'A', avatarSeed: 'a', color: '#fff' }, status: 'active', isBot: false, spectator: false },
  { playerId: 'p2', seatIndex: 1, profile: { displayName: 'B', avatarSeed: 'b', color: '#fff' }, status: 'active', isBot: false, spectator: false },
  { playerId: 'p3', seatIndex: 2, profile: { displayName: 'C', avatarSeed: 'c', color: '#fff' }, status: 'active', isBot: false, spectator: false },
];

describe('gameUtils', () => {
  it('sorts players by seat', () => {
    const shuffled = [players[2], players[0], players[1]];
    expect(sortPlayersBySeat(shuffled).map((p) => p.playerId)).toEqual(['p1', 'p2', 'p3']);
  });

  it('derives current turn player from trick data', () => {
    const game: ClientGameView = {
      gameId: 'game',
      phase: 'PLAYING',
      players,
      cumulativeScores: {},
      round: {
        roundIndex: 0,
        cardsPerPlayer: 3,
        trumpSuit: 'hearts',
        trumpCard: null,
        trumpBroken: false,
        trickInProgress: {
          trickIndex: 0,
          leaderPlayerId: 'p2',
          ledSuit: null,
          plays: [],
          winningPlayerId: null,
          winningCardId: null,
          completed: false,
        },
        completedTricks: [],
        bids: {},
      },
    };

    expect(getCurrentTurnPlayerId(game)).toBe('p2');
    game.round!.trickInProgress!.plays.push({ playerId: 'p2', card: { id: 'c1', suit: 'clubs', rank: '2', deckIndex: 0 }, order: 0 });
    expect(getCurrentTurnPlayerId(game)).toBe('p3');
  });

  it('formats cards with suit symbols', () => {
    expect(describeCard({ id: 'c', suit: 'spades', rank: 'A', deckIndex: 0 })).toEqual({ label: 'A♠', suit: 'spades' });
  });
});
