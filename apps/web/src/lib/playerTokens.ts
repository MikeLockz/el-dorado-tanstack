const TOKEN_PREFIX = 'playerToken:';
const JOIN_CODE_PREFIX = 'lobbyJoinCode:';
const memoryTokens = new Map<string, string>();
const memoryJoinCodes = new Map<string, string>();

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function getStorage(): StorageLike | null {
  if (typeof window !== 'undefined' && window.localStorage) {
    return window.localStorage;
  }
  return null;
}

function buildKey(gameId: string) {
  return `${TOKEN_PREFIX}${gameId}`;
}

function buildJoinCodeKey(gameId: string) {
  return `${JOIN_CODE_PREFIX}${gameId}`;
}

export function storePlayerToken(gameId: string, token: string) {
  const key = buildKey(gameId);
  const storage = getStorage();
  if (storage) {
    storage.setItem(key, token);
  } else {
    memoryTokens.set(key, token);
  }
}

export function getStoredPlayerToken(gameId: string): string | null {
  const key = buildKey(gameId);
  const storage = getStorage();
  if (storage) {
    return storage.getItem(key);
  }
  return memoryTokens.get(key) ?? null;
}

export function clearPlayerToken(gameId: string) {
  const key = buildKey(gameId);
  const storage = getStorage();
  if (storage) {
    storage.removeItem(key);
  }
  memoryTokens.delete(key);
  clearLobbyJoinCode(gameId);
}

export function storeLobbyJoinCode(gameId: string, joinCode: string) {
  const key = buildJoinCodeKey(gameId);
  const normalized = joinCode.trim().toUpperCase();
  const storage = getStorage();
  if (storage) {
    storage.setItem(key, normalized);
  } else {
    memoryJoinCodes.set(key, normalized);
  }
}

export function getLobbyJoinCode(gameId: string): string | null {
  const key = buildJoinCodeKey(gameId);
  const storage = getStorage();
  if (storage) {
    return storage.getItem(key);
  }
  return memoryJoinCodes.get(key) ?? null;
}

export function clearLobbyJoinCode(gameId: string) {
  const key = buildJoinCodeKey(gameId);
  const storage = getStorage();
  if (storage) {
    storage.removeItem(key);
  }
  memoryJoinCodes.delete(key);
}
