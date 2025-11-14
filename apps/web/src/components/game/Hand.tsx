import type { Card } from '@game/domain';
import { describeCard } from './gameUtils';

interface HandProps {
  cards: Card[];
  disabled: boolean;
  onPlay: (cardId: string) => void;
}

export function Hand({ cards, disabled, onPlay }: HandProps) {
  if (!cards.length) {
    return (
      <section className="panel hand">
        <h2>Your Hand</h2>
        <p>No cards to play.</p>
      </section>
    );
  }

  return (
    <section className="panel hand">
      <h2>Your Hand</h2>
      <div className="hand-grid">
        {cards.map((card) => {
          const { label, suit } = describeCard(card);
          return (
            <button
              key={card.id}
              className="card-button"
              data-suit={suit}
              disabled={disabled}
              onClick={() => onPlay(card.id)}
            >
              {label}
            </button>
          );
        })}
      </div>
      {disabled && <p style={{ opacity: 0.7 }}>Waiting for your turn…</p>}
    </section>
  );
}
