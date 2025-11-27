import { useParams, useNavigate } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { GamePage } from '@/components/game/GamePage';
import { useGameWebSocket } from '@/hooks/useGameWebSocket';
import { useStoredPlayerToken } from '@/hooks/usePlayerToken';
import { getGameJoinInfo } from '@/api/client';

export function GameRoute() {
  const { gameId } = useParams({ from: '/game/$gameId' });
  const playerToken = useStoredPlayerToken(gameId);
  const send = useGameWebSocket(gameId, playerToken);
  const navigate = useNavigate();
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    if (!playerToken && !checking) {
      setChecking(true);
      getGameJoinInfo(gameId)
        .then((info) => {
          navigate({ to: '/join', search: { code: info.joinCode } });
        })
        .catch(() => {
          setChecking(false);
        });
    }
  }, [gameId, playerToken, navigate, checking]);

  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-emerald-500 border-t-transparent" />
      </div>
    );
  }

  return <GamePage gameId={gameId} playerToken={playerToken} sendMessage={send} />;
}
