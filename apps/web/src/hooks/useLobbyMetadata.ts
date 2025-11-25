import { useCallback, useEffect, useState } from 'react';
import { clearLobbyJoinCode, getLobbyJoinCode, storeLobbyJoinCode } from '@/lib/playerTokens';

interface LobbyMetadata {
  joinCode: string | null;
  setJoinCode: (value: string | null | undefined) => void;
}

export function useLobbyMetadata(gameId?: string): LobbyMetadata {
  const [joinCode, setJoinCodeState] = useState<string | null>(() => {
    if (!gameId) {
      return null;
    }
    return getLobbyJoinCode(gameId);
  });

  useEffect(() => {
    if (!gameId) {
      setJoinCodeState(null);
      return;
    }
    setJoinCodeState(getLobbyJoinCode(gameId));
  }, [gameId]);

  const setJoinCode = useCallback(
    (value: string | null | undefined) => {
      if (!gameId) {
        return;
      }
      if (value && value.trim()) {
        const normalized = value.trim().toUpperCase();
        storeLobbyJoinCode(gameId, normalized);
        setJoinCodeState(normalized);
      } else {
        clearLobbyJoinCode(gameId);
        setJoinCodeState(null);
      }
    },
    [gameId],
  );

  return { joinCode, setJoinCode };
}
