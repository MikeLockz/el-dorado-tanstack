import type { Card, Suit } from './cards';
import type { PlayerId, PlayerInGame, ServerPlayerState } from './player';

export type GameId = string;

export type GamePhase =
  | 'LOBBY'
  | 'BIDDING'
  | 'PLAYING'
  | 'SCORING'
  | 'COMPLETED';

export interface GameConfig {
  gameId: GameId;
  sessionSeed: string;
  roundCount: number;
  minPlayers: number;
  maxPlayers: number;
  createdAt?: number;
  startingSeatIndex?: number;
}

export interface TrickPlay {
  playerId: PlayerId;
  card: Card;
  order: number;
}

export interface TrickState {
  trickIndex: number;
  leaderPlayerId: PlayerId;
  ledSuit: Suit | null;
  plays: TrickPlay[];
  winningPlayerId: PlayerId | null;
  winningCardId: string | null;
  completed: boolean;
}

export interface RoundState {
  roundIndex: number;
  cardsPerPlayer: number;
  roundSeed: string;
  trumpCard: Card | null;
  trumpSuit: Suit | null;
  trumpBroken: boolean;
  bids: Record<PlayerId, number | null>;
  biddingComplete: boolean;
  trickInProgress: TrickState | null;
  completedTricks: TrickState[];
  startingPlayerId: PlayerId | null;
  deck: Card[];
  remainingDeck: Card[];
}

export interface RoundSummary {
  roundIndex: number;
  cardsPerPlayer: number;
  trumpSuit: Suit | null;
  bids: Record<PlayerId, number | null>;
  tricksWon: Record<PlayerId, number>;
  deltas: Record<PlayerId, number>;
}

export interface GameState {
  gameId: GameId;
  config: GameConfig;
  phase: GamePhase;
  players: PlayerInGame[];
  playerStates: Record<PlayerId, ServerPlayerState>;
  roundState: RoundState | null;
  roundSummaries: RoundSummary[];
  cumulativeScores: Record<PlayerId, number>;
  createdAt: number;
  updatedAt: number;
}

export interface ClientRoundState {
  roundIndex: number;
  cardsPerPlayer: number;
  trumpSuit: Suit | null;
  trumpCard: Card | null;
  trumpBroken: boolean;
  trickInProgress: TrickState | null;
  completedTricks: TrickState[];
  bids: Record<PlayerId, number | null>;
}

export interface ClientGameView {
  gameId: GameId;
  phase: GamePhase;
  players: PlayerInGame[];
  you?: PlayerId;
  hand?: Card[];
  cumulativeScores: Record<PlayerId, number>;
  round: ClientRoundState | null;
}
