import { useParams } from '@tanstack/react-router';
import { GamePage } from '@/components/game/GamePage';
import { useGameWebSocket } from '@/hooks/useGameWebSocket';
import { useStoredPlayerToken } from '@/hooks/usePlayerToken';

export function GameRoute() {
  const { gameId } = useParams({ from: '/game/$gameId' });
  const playerToken = useStoredPlayerToken(gameId);
  const send = useGameWebSocket(gameId, playerToken);

  return <GamePage gameId={gameId} playerToken={playerToken} sendMessage={send} />;
}
