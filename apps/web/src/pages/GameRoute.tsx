import { useParams } from '@tanstack/react-router';

export function GameRoute() {
  const { gameId } = useParams({ from: '/game/$gameId' });

  return (
    <section className="panel" style={{ maxWidth: 720, margin: '0 auto' }}>
      <h1>Game Session</h1>
      <p style={{ opacity: 0.75 }}>Game ID: {gameId}</p>
      <p>This is the skeleton game view. Upcoming steps will hydrate the live state, cards, bidding UI, and WS loop.</p>
    </section>
  );
}
