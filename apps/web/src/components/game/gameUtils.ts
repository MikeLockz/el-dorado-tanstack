import type { Card, ClientGameView, PlayerId, PlayerInGame } from '@game/domain';
import { compareRank } from '@game/domain';

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
