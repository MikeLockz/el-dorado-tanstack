import type { Card } from './cards';

export type PlayerId = string;
export type UserId = string;

export interface PlayerProfile {
  userId?: UserId;
  displayName: string;
  avatarSeed: string;
  color: string;
}

export type PlayerConnectionState = 'active' | 'disconnected' | 'left';

export interface PlayerInGame {
  playerId: PlayerId;
  seatIndex: number | null;
  profile: PlayerProfile;
  status: PlayerConnectionState;
  isBot: boolean;
  spectator: boolean;
}

export interface ServerPlayerState {
  playerId: PlayerId;
  hand: Card[];
  tricksWon: number;
  bid: number | null;
  roundScoreDelta: number;
}
