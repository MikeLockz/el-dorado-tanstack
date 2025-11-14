import { useParams } from '@tanstack/react-router';
import { useGameWebSocket } from '@/hooks/useGameWebSocket';
import { useStoredPlayerToken } from '@/hooks/usePlayerToken';
import { useGameStore } from '@/store/gameStore';

export function GameRoute() {
  const { gameId } = useParams({ from: '/game/$gameId' });
  const playerToken = useStoredPlayerToken(gameId);
  const send = useGameWebSocket(gameId, playerToken);
  const connection = useGameStore((state) => state.connection);
  const game = useGameStore((state) => state.game);

  return (
    <section className="panel" style={{ maxWidth: 720, margin: '0 auto' }}>
      <h1>Game Session</h1>
      <p style={{ opacity: 0.75 }}>Game ID: {gameId}</p>
      <p style={{ opacity: 0.75 }}>Connection: {connection}</p>
      {!playerToken && <p style={{ color: '#ff6b6b' }}>Missing player token. Join or create a room first.</p>}
      {game ? (
        <div>
          <p>
            Phase: <strong>{game.phase}</strong>
          </p>
          <p>Players: {game.players.length}</p>
        </div>
      ) : (
        <p>Waiting for server state…</p>
      )}
      <div style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem' }}>
        <button className="secondary" onClick={() => send({ type: 'REQUEST_STATE' })}>
          Request State
        </button>
      </div>
    </section>
  );
}
