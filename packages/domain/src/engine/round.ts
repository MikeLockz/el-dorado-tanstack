import type { Card } from '../types/cards.js';
import type { GameState, RoundState } from '../types/game.js';
import type { PlayerId, PlayerInGame, ServerPlayerState } from '../types/player.js';
import { createDeck, getDeckCountForPlayers } from './deck.js';
import { shuffleDeck } from './shuffle.js';

const TOTAL_ROUNDS = 10;

export function tricksForRound(roundIndex: number): number {
  if (!Number.isInteger(roundIndex)) {
    throw new Error('roundIndex must be an integer');
  }
  if (roundIndex < 0 || roundIndex >= TOTAL_ROUNDS) {
    throw new Error('roundIndex must be between 0 and 9');
  }
  return TOTAL_ROUNDS - roundIndex;
}

interface DealResult {
  deck: Card[];
  hands: Record<PlayerId, Card[]>;
  remainingDeck: Card[];
}

export function dealCards(
  state: GameState,
  roundSeed: string,
  cardsPerPlayer?: number,
): DealResult {
  const players = getSeatedPlayers(state);
  if (players.length === 0) {
    throw new Error('Cannot deal cards without players');
  }

  const resolvedCardsPerPlayer = cardsPerPlayer ?? state.roundState?.cardsPerPlayer;
  if (!resolvedCardsPerPlayer) {
    throw new Error('cardsPerPlayer must be provided or exist in round state');
  }

  const deckCount = getDeckCountForPlayers(players.length);
  const deck = shuffleDeck(createDeck(deckCount), roundSeed);

  const hands: Record<PlayerId, Card[]> = {};
  let cursor = 0;
  for (let iteration = 0; iteration < resolvedCardsPerPlayer; iteration += 1) {
    for (const player of players) {
      const card = deck[cursor];
      if (!card) {
        throw new Error('Deck exhausted before deal completed');
      }
      (hands[player.playerId] ??= []).push(card);
      cursor += 1;
    }
  }

  const remainingDeck = deck.slice(cursor);
  return { deck, hands, remainingDeck };
}

export function revealTrump(deckRemainder: Card[]): { trumpCard: Card; remainingDeck: Card[] } {
  if (deckRemainder.length === 0) {
    throw new Error('Cannot reveal trump without remaining cards');
  }
  const [trumpCard, ...rest] = deckRemainder;
  return {
    trumpCard,
    remainingDeck: rest,
  };
}

export function startRound(state: GameState, roundIndex: number, roundSeed: string): GameState {
  const players = getSeatedPlayers(state);
  if (players.length < state.config.minPlayers) {
    throw new Error('Not enough players to start the round');
  }

  if (roundIndex >= state.config.roundCount) {
    throw new Error('Round index exceeds configured rounds');
  }

  const cardsPerPlayer = tricksForRound(roundIndex);
  const dealResult = dealCards(state, roundSeed, cardsPerPlayer);
  const trumpResult = revealTrump(dealResult.remainingDeck);

  const bids: Record<PlayerId, number | null> = {};
  const playerStates: Record<PlayerId, ServerPlayerState> = { ...state.playerStates };
  const cumulativeScores = { ...state.cumulativeScores };

  for (const player of players) {
    bids[player.playerId] = null;
    cumulativeScores[player.playerId] = cumulativeScores[player.playerId] ?? 0;
    playerStates[player.playerId] = {
      playerId: player.playerId,
      hand: dealResult.hands[player.playerId] ?? [],
      tricksWon: 0,
      bid: null,
      roundScoreDelta: 0,
    };
  }

  const startingSeatIndex = state.config.startingSeatIndex ?? 0;
  const baseDealerIndex = players.findIndex((p) => p.seatIndex === startingSeatIndex);
  // If the starting seat player is not found, default to the first player
  const effectiveBaseIndex = baseDealerIndex === -1 ? 0 : baseDealerIndex;

  const dealerIndex = (effectiveBaseIndex + roundIndex) % players.length;
  const dealerPlayer = players[dealerIndex];
  const startingPlayer = players[(dealerIndex + 1) % players.length];

  const roundState: RoundState = {
    roundIndex,
    cardsPerPlayer,
    roundSeed,
    trumpCard: trumpResult.trumpCard,
    trumpSuit: trumpResult.trumpCard.suit,
    trumpBroken: false,
    bids,
    biddingComplete: false,
    trickInProgress: null,
    completedTricks: [],
    dealerPlayerId: dealerPlayer?.playerId ?? null,
    startingPlayerId: startingPlayer?.playerId ?? null,
    deck: dealResult.deck,
    remainingDeck: trumpResult.remainingDeck,
  };

  return {
    ...state,
    phase: 'BIDDING',
    playerStates,
    cumulativeScores,
    roundState,
    updatedAt: Date.now(),
  };
}

function getSeatedPlayers(state: GameState): PlayerInGame[] {
  return state.players
    .filter((player) => player.seatIndex !== null && !player.spectator)
    .sort((a, b) => (a.seatIndex ?? 0) - (b.seatIndex ?? 0));
}
