import type { Card } from '@game/domain';
import { CardChip } from './CardChip';
import { groupCardsBySuit, SUIT_ORDER } from './gameUtils';

interface HandProps {
  cards: Card[];
  disabled: boolean;
  onPlay: (cardId: string) => void;
}

export function Hand({ cards, disabled, onPlay }: HandProps) {
  const groupedHand = groupCardsBySuit(cards);
  if (!cards.length) {
    return (
      <section className="rounded-3xl border border-white/10 bg-background/60 p-4 text-sm text-muted-foreground shadow-lg shadow-black/30 backdrop-blur">
        <h2 className="text-lg font-semibold text-foreground">Your Hand</h2>
        <p className="mt-2">No cards to play.</p>
      </section>
    );
  }

  return (
    <section className="rounded-3xl border border-white/10 bg-background/70 p-4 shadow-xl shadow-black/30 backdrop-blur lg:sticky lg:top-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Your Hand</h2>
          {disabled && <p className="text-xs text-muted-foreground">Waiting for your turn…</p>}
        </div>
        <span className="text-xs text-muted-foreground">{cards.length} cards</span>
      </div>
      <div className="mt-4 space-y-3">
        {SUIT_ORDER.filter((suit) => groupedHand[suit].length > 0).map((suit) => (
          <div key={suit} className="flex flex-wrap gap-2">
            {groupedHand[suit].map((card) => (
              <CardChip key={card.id} card={card} interactive disabled={disabled} onClick={() => onPlay(card.id)} className="animate-card-pop" />
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}
