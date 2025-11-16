import type { Card, ClientGameView, PlayerId, PlayerInGame, RoundSummary } from '@game/domain';
import { compareRank } from '@game/domain';
import type { ScoreRound } from './Scorecard';

export const SUIT_SYMBOL: Record<Card['suit'], string> = {
  clubs: '♣',
  diamonds: '♦',
  hearts: '♥',
  spades: '♠',
};

export const SUIT_ORDER: Card['suit'][] = ['spades', 'hearts', 'diamonds', 'clubs'];

export function sortPlayersBySeat(players: PlayerInGame[]): PlayerInGame[] {
  return [...players].sort((a, b) => {
    if (a.seatIndex === null && b.seatIndex === null) return a.playerId.localeCompare(b.playerId);
    if (a.seatIndex === null) return 1;
    if (b.seatIndex === null) return -1;
    return a.seatIndex - b.seatIndex;
  });
}

export function getCurrentTurnPlayerId(game: ClientGameView | null): PlayerId | null {
  if (!game?.round || !game.round.trickInProgress) {
    return null;
  }

  const trick = game.round.trickInProgress;
  if (trick.completed) {
    return null;
  }

  const orderedPlayers = sortPlayersBySeat(game.players);
  const leaderIndex = orderedPlayers.findIndex((player) => player.playerId === trick.leaderPlayerId);
  if (leaderIndex === -1) {
    return null;
  }

  const nextIndex = (leaderIndex + trick.plays.length) % orderedPlayers.length;
  return orderedPlayers[nextIndex]?.playerId ?? null;
}

export function describeCard(card: Card): { label: string; suit: Card['suit']; symbol: string; rank: Card['rank'] } {
  const symbol = SUIT_SYMBOL[card.suit];
  return {
    label: `${card.rank}${symbol}`,
    suit: card.suit,
    symbol,
    rank: card.rank,
  };
}

export function groupCardsBySuit(cards: Card[]): Record<Card['suit'], Card[]> {
  const grouped: Record<Card['suit'], Card[]> = { clubs: [], diamonds: [], hearts: [], spades: [] };
  for (const card of cards) {
    grouped[card.suit].push(card);
  }
  SUIT_ORDER.forEach((suit) => {
    grouped[suit].sort((a, b) => compareRank(a.rank, b.rank));
  });
  return grouped;
}

export function createScoreRoundsFromSummaries(roundSummaries: RoundSummary[]): ScoreRound[] {
  return roundSummaries.map(summary => ({
    roundIndex: summary.roundIndex,
    cardsPerPlayer: summary.cardsPerPlayer,
    bids: summary.bids,
    tricksWon: summary.tricksWon,
    deltas: summary.deltas,
  }));
}

export function sortPlayersForBidDisplay(players: PlayerInGame[], dealerPlayerId: PlayerId | null): PlayerInGame[] {
  if (!dealerPlayerId) return players;

  const sortedPlayers = sortPlayersBySeat(players);
  const dealerIndex = sortedPlayers.findIndex((player) => player.playerId === dealerPlayerId);

  if (dealerIndex === -1) return sortedPlayers;

  // Reorder so that player after dealer (clockwise) comes first, dealer comes last
  const reordered = [];
  const playerCount = sortedPlayers.length;

  // Start with player immediately after dealer (clockwise)
  for (let i = 1; i < playerCount; i++) {
    const index = (dealerIndex + i) % playerCount;
    reordered.push(sortedPlayers[index]);
  }

  // Add dealer last
  reordered.push(sortedPlayers[dealerIndex]);

  return reordered;
}

export function createUpcomingRounds(roundSummaries: RoundSummary[], totalRounds: number): ScoreRound[] {
  const completedRoundCount = roundSummaries.length;
  const currentRound = completedRoundCount;
  const remainingRounds = Math.max(0, totalRounds - completedRoundCount);

  return Array.from({ length: remainingRounds }, (_, index) => {
    const roundIndex = currentRound + index;
    const cardsPerPlayer = totalRounds - roundIndex;

    return {
      roundIndex,
      cardsPerPlayer,
      bids: {},
      tricksWon: {},
      deltas: {},
    };
  });
}
