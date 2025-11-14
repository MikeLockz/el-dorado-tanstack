import jwt from 'jsonwebtoken';
import type { TokenExpiredError as TokenExpiredErrorType } from 'jsonwebtoken';
import type { GameId, PlayerId } from '@game/domain';

const DEFAULT_SECRET = 'dev-player-token-secret';
const DEFAULT_TTL_SECONDS = 60 * 60; // 1 hour default
const TOKEN_ISSUER = 'el-dorado-server';
const TOKEN_AUDIENCE = 'el-dorado-clients';

function resolveSecret() {
  const value = process.env.PLAYER_TOKEN_SECRET;
  if (value && value.trim()) {
    return value.trim();
  }
  return DEFAULT_SECRET;
}

function resolveTtlSeconds() {
  const raw = process.env.PLAYER_TOKEN_TTL;
  if (!raw) return DEFAULT_TTL_SECONDS;
  const parsed = Number.parseInt(raw, 10);
  if (Number.isFinite(parsed) && parsed > 0) {
    return parsed;
  }
  return DEFAULT_TTL_SECONDS;
}

const TOKEN_SECRET = resolveSecret();
const TOKEN_TTL_SECONDS = resolveTtlSeconds();

export interface PlayerTokenClaims {
  playerId: PlayerId;
  gameId: GameId;
  seatIndex: number | null;
  isSpectator: boolean;
  exp: number;
  iat: number;
}

export function signPlayerToken(payload: Omit<PlayerTokenClaims, 'exp' | 'iat'>, ttlSeconds: number = TOKEN_TTL_SECONDS) {
  return jwt.sign(payload, TOKEN_SECRET, {
    issuer: TOKEN_ISSUER,
    audience: TOKEN_AUDIENCE,
    expiresIn: ttlSeconds,
    algorithm: 'HS256',
  });
}

export function verifyPlayerToken(token: string): PlayerTokenClaims {
  return jwt.verify(token, TOKEN_SECRET, {
    algorithms: ['HS256'],
    issuer: TOKEN_ISSUER,
    audience: TOKEN_AUDIENCE,
  }) as PlayerTokenClaims;
}

const { TokenExpiredError } = jwt;

export function isTokenExpired(error: unknown): error is TokenExpiredErrorType {
  return error instanceof TokenExpiredError;
}
