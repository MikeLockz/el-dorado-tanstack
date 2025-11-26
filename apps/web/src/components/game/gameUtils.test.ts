import type { ClientGameView, PlayerInGame } from '@game/domain';
import { describe, expect, it } from 'vitest';
import { describeCard, getCurrentTurnPlayerId, groupCardsBySuit, sortPlayersBySeat, sortPlayersForBidDisplay } from './gameUtils';

const players: PlayerInGame[] = [
  { playerId: 'p1', seatIndex: 0, profile: { displayName: 'A', avatarSeed: 'a', color: '#fff' }, status: 'active', isBot: false, spectator: false },
  { playerId: 'p2', seatIndex: 1, profile: { displayName: 'B', avatarSeed: 'b', color: '#fff' }, status: 'active', isBot: false, spectator: false },
  { playerId: 'p3', seatIndex: 2, profile: { displayName: 'C', avatarSeed: 'c', color: '#fff' }, status: 'active', isBot: false, spectator: false },
];

const fourPlayers: PlayerInGame[] = [
  { playerId: 'p1', seatIndex: 0, profile: { displayName: 'Alice', avatarSeed: 'a', color: '#fff' }, status: 'active', isBot: false, spectator: false },
  { playerId: 'p2', seatIndex: 1, profile: { displayName: 'Bob', avatarSeed: 'b', color: '#fff' }, status: 'active', isBot: false, spectator: false },
  { playerId: 'p3', seatIndex: 2, profile: { displayName: 'Charlie', avatarSeed: 'c', color: '#fff' }, status: 'active', isBot: false, spectator: false },
  { playerId: 'p4', seatIndex: 3, profile: { displayName: 'Diana', avatarSeed: 'd', color: '#fff' }, status: 'active', isBot: false, spectator: false },
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
      roundSummaries: [],
      config: {
        minPlayers: 2,
        maxPlayers: 4,
        roundCount: 10,
      },
      isPublic: true,
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

  describe('sortPlayersForBidDisplay', () => {
    it('returns players in original order when dealerPlayerId is null', () => {
      const result = sortPlayersForBidDisplay(fourPlayers, null);
      expect(result.map((p) => p.playerId)).toEqual(['p1', 'p2', 'p3', 'p4']);
    });

    it('returns players in seat order when dealer is not found', () => {
      const result = sortPlayersForBidDisplay(fourPlayers, 'unknown-dealer');
      expect(result.map((p) => p.playerId)).toEqual(['p1', 'p2', 'p3', 'p4']);
    });

    it('orders players correctly with dealer at position 0', () => {
      const result = sortPlayersForBidDisplay(fourPlayers, 'p1');
      expect(result.map((p) => p.playerId)).toEqual(['p2', 'p3', 'p4', 'p1']);
    });

    it('orders players correctly with dealer at position 1', () => {
      const result = sortPlayersForBidDisplay(fourPlayers, 'p2');
      expect(result.map((p) => p.playerId)).toEqual(['p3', 'p4', 'p1', 'p2']);
    });

    it('orders players correctly with dealer at position 2', () => {
      const result = sortPlayersForBidDisplay(fourPlayers, 'p3');
      expect(result.map((p) => p.playerId)).toEqual(['p4', 'p1', 'p2', 'p3']);
    });

    it('orders players correctly with dealer at position 3', () => {
      const result = sortPlayersForBidDisplay(fourPlayers, 'p4');
      expect(result.map((p) => p.playerId)).toEqual(['p1', 'p2', 'p3', 'p4']);
    });

    it('handles unsorted input players array', () => {
      const shuffled = [fourPlayers[3], fourPlayers[1], fourPlayers[0], fourPlayers[2]];
      const result = sortPlayersForBidDisplay(shuffled, 'p4');
      expect(result.map((p) => p.playerId)).toEqual(['p1', 'p2', 'p3', 'p4']);
    });
  });
});
