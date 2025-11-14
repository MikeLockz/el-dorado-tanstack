import type { Card } from './cards.js';
import type { GameConfig, GameId } from './game.js';
import type { PlayerId, PlayerProfile } from './player.js';

export type GameEventType =
  | 'GAME_CREATED'
  | 'PLAYER_JOINED'
  | 'PLAYER_LEFT'
  | 'PLAYER_RECONNECTED'
  | 'PLAYER_DISCONNECTED'
  | 'PLAYER_BECAME_SPECTATOR'
  | 'ROUND_STARTED'
  | 'CARDS_DEALT'
  | 'TRUMP_REVEALED'
  | 'PLAYER_BID'
  | 'BIDDING_COMPLETE'
  | 'TRICK_STARTED'
  | 'CARD_PLAYED'
  | 'TRUMP_BROKEN'
  | 'TRICK_COMPLETED'
  | 'ROUND_SCORED'
  | 'GAME_COMPLETED'
  | 'PROFILE_UPDATED'
  | 'PLAYER_MARKED_ABSENT'
  | 'INVALID_ACTION';

export interface GameEventBase {
  eventIndex: number;
  gameId: GameId;
  timestamp: number;
}

export interface GameCreatedEvent extends GameEventBase {
  type: 'GAME_CREATED';
  payload: {
    sessionSeed: string;
    config: GameConfig;
    creatorPlayerId: PlayerId;
  };
}

export interface PlayerJoinedEvent extends GameEventBase {
  type: 'PLAYER_JOINED';
  payload: {
    playerId: PlayerId;
    seatIndex: number;
    profile: PlayerProfile;
  };
}

export interface PlayerLeftEvent extends GameEventBase {
  type: 'PLAYER_LEFT';
  payload: {
    playerId: PlayerId;
  };
}

export interface PlayerReconnectedEvent extends GameEventBase {
  type: 'PLAYER_RECONNECTED';
  payload: {
    playerId: PlayerId;
  };
}

export interface PlayerDisconnectedEvent extends GameEventBase {
  type: 'PLAYER_DISCONNECTED';
  payload: {
    playerId: PlayerId;
  };
}

export interface PlayerBecameSpectatorEvent extends GameEventBase {
  type: 'PLAYER_BECAME_SPECTATOR';
  payload: {
    playerId: PlayerId;
  };
}

export interface RoundStartedEvent extends GameEventBase {
  type: 'ROUND_STARTED';
  payload: {
    roundIndex: number;
    cardsPerPlayer: number;
    roundSeed: string;
  };
}

export interface CardsDealtEvent extends GameEventBase {
  type: 'CARDS_DEALT';
  payload: {
    hands: Record<PlayerId, string[]>;
    deckStateHash: string;
  };
}

export interface TrumpRevealedEvent extends GameEventBase {
  type: 'TRUMP_REVEALED';
  payload: {
    card: Card;
  };
}

export interface PlayerBidEvent extends GameEventBase {
  type: 'PLAYER_BID';
  payload: {
    playerId: PlayerId;
    bid: number;
  };
}

export interface BiddingCompleteEvent extends GameEventBase {
  type: 'BIDDING_COMPLETE';
  payload: Record<string, never>;
}

export interface TrickStartedEvent extends GameEventBase {
  type: 'TRICK_STARTED';
  payload: {
    trickIndex: number;
    leaderPlayerId: PlayerId;
  };
}

export interface CardPlayedEvent extends GameEventBase {
  type: 'CARD_PLAYED';
  payload: {
    playerId: PlayerId;
    card: Card;
  };
}

export interface TrumpBrokenEvent extends GameEventBase {
  type: 'TRUMP_BROKEN';
  payload: Record<string, never>;
}

export interface TrickCompletedEvent extends GameEventBase {
  type: 'TRICK_COMPLETED';
  payload: {
    trickIndex: number;
    winningPlayerId: PlayerId;
    winningCardId: string;
  };
}

export interface RoundScoredEvent extends GameEventBase {
  type: 'ROUND_SCORED';
  payload: {
    deltas: Record<PlayerId, number>;
    cumulativeScores: Record<PlayerId, number>;
  };
}

export interface GameCompletedEvent extends GameEventBase {
  type: 'GAME_COMPLETED';
  payload: {
    finalScores: Record<PlayerId, number>;
  };
}

export interface ProfileUpdatedEvent extends GameEventBase {
  type: 'PROFILE_UPDATED';
  payload: {
    playerId: PlayerId;
    profile: PlayerProfile;
  };
}

export interface PlayerMarkedAbsentEvent extends GameEventBase {
  type: 'PLAYER_MARKED_ABSENT';
  payload: {
    playerId: PlayerId;
  };
}

export interface InvalidActionEvent extends GameEventBase {
  type: 'INVALID_ACTION';
  payload: {
    playerId: PlayerId;
    action: string;
    reason: string;
  };
}

export type GameEvent =
  | GameCreatedEvent
  | PlayerJoinedEvent
  | PlayerLeftEvent
  | PlayerReconnectedEvent
  | PlayerDisconnectedEvent
  | PlayerBecameSpectatorEvent
  | RoundStartedEvent
  | CardsDealtEvent
  | TrumpRevealedEvent
  | PlayerBidEvent
  | BiddingCompleteEvent
  | TrickStartedEvent
  | CardPlayedEvent
  | TrumpBrokenEvent
  | TrickCompletedEvent
  | RoundScoredEvent
  | GameCompletedEvent
  | ProfileUpdatedEvent
  | PlayerMarkedAbsentEvent
  | InvalidActionEvent;
