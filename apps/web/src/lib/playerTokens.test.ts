import { describe, expect, it, beforeEach } from 'vitest';
import {
  clearLobbyJoinCode,
  clearPlayerToken,
  getLobbyJoinCode,
  getStoredPlayerToken,
  storeLobbyJoinCode,
  storePlayerToken,
} from './playerTokens';

describe('player token storage helpers', () => {
  const gameId = 'game-test';

  beforeEach(() => {
    clearPlayerToken(gameId);
    clearLobbyJoinCode(gameId);
  });

  it('returns null when nothing stored', () => {
    expect(getStoredPlayerToken(gameId)).toBeNull();
  });

  it('stores and retrieves tokens consistently', () => {
    storePlayerToken(gameId, 'secret-token');
    expect(getStoredPlayerToken(gameId)).toBe('secret-token');
  });

  it('clears tokens explicitly', () => {
    storePlayerToken(gameId, 'secret-token');
    clearPlayerToken(gameId);
    expect(getStoredPlayerToken(gameId)).toBeNull();
  });

  it('stores lobby join codes consistently', () => {
    expect(getLobbyJoinCode(gameId)).toBeNull();
    storeLobbyJoinCode(gameId, 'abc123');
    expect(getLobbyJoinCode(gameId)).toBe('ABC123');
  });

  it('clears stored lobby codes', () => {
    storeLobbyJoinCode(gameId, 'xyz789');
    clearLobbyJoinCode(gameId);
    expect(getLobbyJoinCode(gameId)).toBeNull();
  });
});
