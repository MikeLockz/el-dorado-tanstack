import { useEffect, useState } from 'react';
import { getStoredPlayerToken } from '@/lib/playerTokens';

export function useStoredPlayerToken(gameId?: string) {
  const [token, setToken] = useState(() => (gameId ? getStoredPlayerToken(gameId) : null));

  useEffect(() => {
    if (!gameId) {
      setToken(null);
      return;
    }
    setToken(getStoredPlayerToken(gameId));
  }, [gameId]);

  return token;
}
