import type { PlayerProfile } from '@game/domain';
import { resolveApiBaseUrl } from '@/lib/env';

const API_BASE = resolveApiBaseUrl();

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

interface RequestOptions extends Omit<RequestInit, 'body'> {
  body?: Record<string, unknown>;
}

async function request<T>(path: string, options: RequestOptions): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers ?? {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const contentType = res.headers.get('Content-Type');
  const isJson = contentType?.includes('application/json');
  const payload = isJson ? await res.json().catch(() => ({})) : {};

  if (!res.ok) {
    throw new ApiError(res.status, (payload.error as string) ?? 'UNKNOWN', (payload.message as string) ?? 'Request failed');
  }

  return payload as T;
}

export interface CreateRoomPayload {
  profile: PlayerProfile;
  minPlayers?: number;
  maxPlayers?: number;
  roundCount?: number;
  isPublic?: boolean;
}

export interface CreateRoomResponse {
  gameId: string;
  joinCode: string;
  playerToken: string;
}

export function createRoom(payload: CreateRoomPayload) {
  return request<CreateRoomResponse>('/api/create-room', {
    method: 'POST',
    body: {
      displayName: payload.profile.displayName,
      avatarSeed: payload.profile.avatarSeed,
      color: payload.profile.color,
      minPlayers: payload.minPlayers,
      maxPlayers: payload.maxPlayers,
      roundCount: payload.roundCount,
      isPublic: payload.isPublic,
    },
  });
}

export interface JoinByCodePayload {
  joinCode: string;
  profile: PlayerProfile;
}

export interface JoinByCodeResponse {
  gameId: string;
  playerToken: string;
}

export function joinByCode(payload: JoinByCodePayload) {
  return request<JoinByCodeResponse>('/api/join-by-code', {
    method: 'POST',
    body: {
      joinCode: payload.joinCode,
      displayName: payload.profile.displayName,
      avatarSeed: payload.profile.avatarSeed,
      color: payload.profile.color,
    },
  });
}

export interface MatchmakeResponse {
  gameId: string;
  playerToken: string;
}

export function matchmake(profile: PlayerProfile) {
  return request<MatchmakeResponse>('/api/matchmake', {
    method: 'POST',
    body: {
      displayName: profile.displayName,
      avatarSeed: profile.avatarSeed,
      color: profile.color,
    },
  });
}

export interface PlayerStatsProfile {
  userId?: string;
  displayName: string;
  avatarSeed: string;
  color: string;
  isBot?: boolean;
}

export interface PlayerLifetimeStats {
  gamesPlayed: number;
  gamesWon: number;
  highestScore: number | null;
  lowestScore: number | null;
  totalPoints: number;
  totalTricksWon: number;
  mostConsecutiveWins: number;
  mostConsecutiveLosses: number;
  lastGameAt: string | null;
}

export interface PlayerStatsResponse {
  profile: PlayerStatsProfile;
  lifetime: PlayerLifetimeStats;
}

export function getPlayerStats(userId: string) {
  const encoded = encodeURIComponent(userId);
  return request<PlayerStatsResponse>(`/api/player-stats?userId=${encoded}`, {
    method: 'GET',
  });
}
