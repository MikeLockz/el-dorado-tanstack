import type { Card } from '../types/cards';
import { RANKS, SUITS } from '../types/cards';
import type { GameState, RoundState, TrickState } from '../types/game';
import type { PlayerId, PlayerInGame, ServerPlayerState } from '../types/player';
import type { GameEvent } from '../types/events';
import { createGame } from './game';
import { EngineError } from './errors';
import { requireRoundState } from './validation';

export function replayGame(events: GameEvent[]): GameState {
  let state: GameState | null = null;
  for (const event of events) {
    state = applyEvent(state, event);
  }
  if (!state) {
    throw new Error('No events to replay');
  }
  return state;
}

export function applyEvent(current: GameState | null, gameEvent: GameEvent): GameState {
  switch (gameEvent.type) {
    case 'GAME_CREATED': {
      const config = { ...gameEvent.payload.config, gameId: gameEvent.gameId };
      const base = createGame(config);
      return {
        ...base,
        createdAt: gameEvent.timestamp,
        updatedAt: gameEvent.timestamp,
      };
    }
    case 'PLAYER_JOINED': {
      const state = requireState(current, gameEvent.type);
      const players = upsertPlayer(state.players, {
        playerId: gameEvent.payload.playerId,
        seatIndex: gameEvent.payload.seatIndex,
        profile: gameEvent.payload.profile,
        status: 'active',
        isBot: false,
        spectator: false,
      });
      const playerStates = { ...state.playerStates };
      playerStates[gameEvent.payload.playerId] = playerStates[gameEvent.payload.playerId] ?? createEmptyServerState(gameEvent.payload.playerId);
      const cumulativeScores = { ...state.cumulativeScores };
      cumulativeScores[gameEvent.payload.playerId] = cumulativeScores[gameEvent.payload.playerId] ?? 0;
      return {
        ...state,
        players,
        playerStates,
        cumulativeScores,
        updatedAt: gameEvent.timestamp,
      };
    }
    case 'ROUND_STARTED': {
      const state = requireState(current, gameEvent.type);
      const bids: Record<PlayerId, number | null> = {};
      for (const player of state.players.filter((p) => p.seatIndex !== null)) {
        bids[player.playerId] = null;
      }
      const startingSeat = state.config.startingSeatIndex ?? 0;
      const startingPlayer = state.players.find((p) => p.seatIndex === startingSeat)?.playerId ?? state.players[0]?.playerId ?? null;
      const roundState: RoundState = {
        roundIndex: gameEvent.payload.roundIndex,
        cardsPerPlayer: gameEvent.payload.cardsPerPlayer,
        roundSeed: gameEvent.payload.roundSeed,
        trumpCard: null,
        trumpSuit: null,
        trumpBroken: false,
        bids,
        biddingComplete: false,
        trickInProgress: null,
        completedTricks: [],
        startingPlayerId: startingPlayer,
        deck: [],
        remainingDeck: [],
      };
      return {
        ...state,
        phase: 'BIDDING',
        roundState,
        updatedAt: gameEvent.timestamp,
      };
    }
    case 'CARDS_DEALT': {
      const state = requireState(current, gameEvent.type);
      const roundState = requireRoundState(state);
      const playerStates = { ...state.playerStates };
      for (const [playerId, cardIds] of Object.entries(gameEvent.payload.hands)) {
        playerStates[playerId] = {
          ...(playerStates[playerId] ?? createEmptyServerState(playerId)),
          hand: cardIds.map(parseCardId),
          tricksWon: 0,
          roundScoreDelta: 0,
        };
      }
      return {
        ...state,
        playerStates,
        roundState: { ...roundState, deck: extractAllCards(gameEvent.payload.hands), remainingDeck: [] },
        updatedAt: gameEvent.timestamp,
      };
    }
    case 'TRUMP_REVEALED': {
      const state = requireState(current, gameEvent.type);
      const roundState = requireRoundState(state);
      const trumpCard = gameEvent.payload.card;
      return {
        ...state,
        roundState: { ...roundState, trumpCard, trumpSuit: trumpCard.suit },
        updatedAt: gameEvent.timestamp,
      };
    }
    case 'PLAYER_BID': {
      const state = requireState(current, gameEvent.type);
      const roundState = requireRoundState(state);
      if (!(gameEvent.payload.playerId in roundState.bids)) {
        throw new EngineError('INVALID_BID', 'Bid for unknown player');
      }
      const bids = { ...roundState.bids, [gameEvent.payload.playerId]: gameEvent.payload.bid };
      const playerStates = {
        ...state.playerStates,
        [gameEvent.payload.playerId]: {
          ...(state.playerStates[gameEvent.payload.playerId] ?? createEmptyServerState(gameEvent.payload.playerId)),
          bid: gameEvent.payload.bid,
        },
      };
      return {
        ...state,
        playerStates,
        roundState: { ...roundState, bids },
        updatedAt: gameEvent.timestamp,
      };
    }
    case 'BIDDING_COMPLETE': {
      const state = requireState(current, gameEvent.type);
      const roundState = requireRoundState(state);
      return {
        ...state,
        phase: 'PLAYING',
        roundState: { ...roundState, biddingComplete: true },
        updatedAt: gameEvent.timestamp,
      };
    }
    case 'TRICK_STARTED': {
      const state = requireState(current, gameEvent.type);
      const roundState = requireRoundState(state);
      const trick: TrickState = {
        trickIndex: gameEvent.payload.trickIndex,
        leaderPlayerId: gameEvent.payload.leaderPlayerId,
        ledSuit: null,
        plays: [],
        winningPlayerId: null,
        winningCardId: null,
        completed: false,
      };
      return {
        ...state,
        roundState: { ...roundState, trickInProgress: trick },
        updatedAt: gameEvent.timestamp,
      };
    }
    case 'CARD_PLAYED': {
      const state = requireState(current, gameEvent.type);
      const roundState = requireRoundState(state);
      const trick = roundState.trickInProgress;
      if (!trick) {
        throw new EngineError('INVALID_PLAY', 'Received CARD_PLAYED without an active trick');
      }
      const playerState = state.playerStates[gameEvent.payload.playerId];
      if (!playerState) {
        throw new EngineError('INVALID_PLAY', 'Unknown player for card play');
      }
      const { hand, removed } = removeCard(playerState.hand, gameEvent.payload.card.id);
      if (!removed) {
        throw new EngineError('INVALID_PLAY', 'Card not found in hand during replay');
      }
      const updatedTrick: TrickState = {
        ...trick,
        ledSuit: trick.ledSuit ?? removed.suit,
        plays: [...trick.plays, { playerId: gameEvent.payload.playerId, card: removed, order: trick.plays.length }],
      };
      const playerStates = {
        ...state.playerStates,
        [gameEvent.payload.playerId]: {
          ...playerState,
          hand,
        },
      };
      return {
        ...state,
        playerStates,
        roundState: { ...roundState, trickInProgress: updatedTrick },
        updatedAt: gameEvent.timestamp,
      };
    }
    case 'TRUMP_BROKEN': {
      const state = requireState(current, gameEvent.type);
      const roundState = requireRoundState(state);
      return {
        ...state,
        roundState: { ...roundState, trumpBroken: true },
        updatedAt: gameEvent.timestamp,
      };
    }
    case 'TRICK_COMPLETED': {
      const state = requireState(current, gameEvent.type);
      const roundState = requireRoundState(state);
      const trick = roundState.trickInProgress;
      if (!trick) {
        throw new EngineError('TRICK_INCOMPLETE', 'No trick to complete during replay');
      }
      const completedTrick: TrickState = {
        ...trick,
        completed: true,
        winningPlayerId: gameEvent.payload.winningPlayerId,
        winningCardId: gameEvent.payload.winningCardId,
      };
      const winnerState = state.playerStates[gameEvent.payload.winningPlayerId];
      const playerStates = {
        ...state.playerStates,
        [gameEvent.payload.winningPlayerId]: {
          ...(winnerState ?? createEmptyServerState(gameEvent.payload.winningPlayerId)),
          hand: winnerState?.hand ?? [],
          tricksWon: (winnerState?.tricksWon ?? 0) + 1,
        },
      };
      return {
        ...state,
        playerStates,
        roundState: {
          ...roundState,
          completedTricks: [...roundState.completedTricks, completedTrick],
          trickInProgress: null,
        },
        updatedAt: gameEvent.timestamp,
      };
    }
    case 'ROUND_SCORED': {
      const state = requireState(current, gameEvent.type);
      const roundState = requireRoundState(state);
      const playerStates = { ...state.playerStates };
      for (const [playerId, delta] of Object.entries(gameEvent.payload.deltas)) {
        playerStates[playerId] = {
          ...(playerStates[playerId] ?? createEmptyServerState(playerId)),
          roundScoreDelta: delta,
          hand: [],
        };
      }
      return {
        ...state,
        phase: 'SCORING',
        playerStates,
        cumulativeScores: { ...gameEvent.payload.cumulativeScores },
        roundSummaries: [
          ...state.roundSummaries,
          {
            roundIndex: roundState.roundIndex,
            cardsPerPlayer: roundState.cardsPerPlayer,
            trumpSuit: roundState.trumpSuit,
            bids: { ...roundState.bids },
            tricksWon: Object.fromEntries(
              Object.entries(playerStates).map(([playerId, ps]) => [playerId, ps.tricksWon]),
            ),
            deltas: { ...gameEvent.payload.deltas },
          },
        ],
        updatedAt: gameEvent.timestamp,
      };
    }
    case 'GAME_COMPLETED': {
      const state = requireState(current, gameEvent.type);
      return {
        ...state,
        phase: 'COMPLETED',
        updatedAt: gameEvent.timestamp,
      };
    }
    default: {
      const state = requireState(current, gameEvent.type);
      return { ...state, updatedAt: gameEvent.timestamp };
    }
  }
}

function requireState(state: GameState | null, eventType: string): GameState {
  if (!state) {
    throw new Error(`Cannot apply ${eventType} before GAME_CREATED`);
  }
  return state;
}

function upsertPlayer(players: PlayerInGame[], player: PlayerInGame): PlayerInGame[] {
  const next = players.filter((p) => p.playerId !== player.playerId);
  next.push(player);
  return next.sort((a, b) => (a.seatIndex ?? 0) - (b.seatIndex ?? 0));
}

function createEmptyServerState(playerId: PlayerId): ServerPlayerState {
  return {
    playerId,
    hand: [],
    tricksWon: 0,
    bid: null,
    roundScoreDelta: 0,
  };
}

function parseCardId(cardId: string): Card {
  const [deckPart, suit, rank] = cardId.split(':');
  if (!deckPart || suit === undefined || rank === undefined) {
    throw new Error(`Invalid card id: ${cardId}`);
  }
  const deckIndex = Number(deckPart.replace('d', ''));
  if (!Number.isFinite(deckIndex)) {
    throw new Error(`Invalid deck index in card id: ${cardId}`);
  }
  if (!SUITS.includes(suit as Card['suit']) || !RANKS.includes(rank as Card['rank'])) {
    throw new Error(`Invalid card components for id: ${cardId}`);
  }
  return {
    id: cardId,
    deckIndex,
    suit: suit as Card['suit'],
    rank: rank as Card['rank'],
  };
}

function extractAllCards(hands: Record<PlayerId, string[]>): Card[] {
  return Object.values(hands)
    .flat()
    .map(parseCardId);
}

function removeCard(hand: Card[], cardId: string): { hand: Card[]; removed?: Card } {
  const index = hand.findIndex((card) => card.id === cardId);
  if (index === -1) {
    return { hand };
  }
  const removed = hand[index];
  return {
    hand: [...hand.slice(0, index), ...hand.slice(index + 1)],
    removed,
  };
}
