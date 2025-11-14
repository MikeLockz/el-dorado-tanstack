import type { Card, ClientGameView, PlayerId, PlayerInGame } from '@game/domain';

const SUIT_SYMBOL: Record<Card['suit'], string> = {
  clubs: '♣',
  diamonds: '♦',
  hearts: '♥',
  spades: '♠',
};

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

export function describeCard(card: Card): { label: string; suit: string } {
  return {
    label: `${card.rank}${SUIT_SYMBOL[card.suit]}`,
    suit: card.suit,
  };
}
