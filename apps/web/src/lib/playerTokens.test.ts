import { describe, expect, it, beforeEach } from 'vitest';
import { clearPlayerToken, getStoredPlayerToken, storePlayerToken } from './playerTokens';

describe('player token storage helpers', () => {
  const gameId = 'game-test';

  beforeEach(() => {
    clearPlayerToken(gameId);
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
});
