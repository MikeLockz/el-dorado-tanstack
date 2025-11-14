import type { Card, PlayerId, PlayerInGame, TrickState } from '@game/domain';
import { describeCard } from './gameUtils';

interface TrickAreaProps {
  trick: TrickState | null;
  players: PlayerInGame[];
  trumpSuit: Card['suit'] | null;
  trumpCard: Card | null;
  completedCount: number;
}

export function TrickArea({ trick, players, trumpSuit, trumpCard, completedCount }: TrickAreaProps) {
  const plays = trick?.plays ?? [];
  const trumpLabel = trumpSuit ? trumpSuit.toUpperCase() : 'Unknown';

  const playerName = (playerId: PlayerId) => players.find((p) => p.playerId === playerId)?.profile.displayName ?? playerId;

  return (
    <section className="panel trick-area">
      <header>
        <div>
          <h2>Trick {trick ? trick.trickIndex + 1 : '—'}</h2>
          <p>{completedCount} completed</p>
        </div>
        <div>
          <p>Trump: {trumpLabel}</p>
          {trumpCard && <p>Card: {describeCard(trumpCard).label}</p>}
        </div>
      </header>
      <div className="trick-cards">
        {plays.length === 0 && <p>No cards played yet.</p>}
        {plays.map((play) => {
          const { label } = describeCard(play.card);
          return (
            <div key={`${play.playerId}-${play.order}`} className="trick-card" data-winning={trick?.winningCardId === play.card.id}>
              <span>{playerName(play.playerId)}</span>
              <strong>{label}</strong>
            </div>
          );
        })}
      </div>
    </section>
  );
}
