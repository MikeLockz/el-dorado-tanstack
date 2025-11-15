import type { ClientGameView, PlayerInGame } from '@game/domain';
import { describe, expect, it } from 'vitest';
import { describeCard, getCurrentTurnPlayerId, groupCardsBySuit, sortPlayersBySeat } from './gameUtils';

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
        dealerPlayerId: 'p1',
        startingPlayerId: 'p2',
      },
    };

    expect(getCurrentTurnPlayerId(game)).toBe('p2');
    game.round!.trickInProgress!.plays.push({ playerId: 'p2', card: { id: 'c1', suit: 'clubs', rank: '2', deckIndex: 0 }, order: 0 });
    expect(getCurrentTurnPlayerId(game)).toBe('p3');
  });

  it('formats cards with suit symbols', () => {
    expect(describeCard({ id: 'c', suit: 'spades', rank: 'A', deckIndex: 0 })).toEqual({ label: 'A♠', suit: 'spades', symbol: '♠', rank: 'A' });
  });

  it('groups cards by suit and sorts ranks ascending', () => {
    const grouped = groupCardsBySuit([
      { id: '1', suit: 'hearts', rank: 'K', deckIndex: 0 },
      { id: '2', suit: 'hearts', rank: '3', deckIndex: 0 },
      { id: '3', suit: 'clubs', rank: 'A', deckIndex: 0 },
      { id: '4', suit: 'clubs', rank: '2', deckIndex: 0 },
    ]);
    expect(grouped.hearts.map((card) => card.rank)).toEqual(['3', 'K']);
    expect(grouped.clubs.map((card) => card.rank)).toEqual(['2', 'A']);
  });
});
