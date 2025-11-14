import type { Card } from '@game/domain';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { describeCard } from './gameUtils';

interface HandProps {
  cards: Card[];
  disabled: boolean;
  onPlay: (cardId: string) => void;
}

export function Hand({ cards, disabled, onPlay }: HandProps) {
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
      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
        {cards.map((card) => {
          const { label, suit } = describeCard(card);
          return (
            <Button
              type="button"
              key={card.id}
              variant="outline"
              className={cn(
                'h-20 flex-col gap-1 rounded-2xl border-white/20 bg-card/60 font-semibold text-lg shadow-inner transition hover:-translate-y-1 hover:border-primary/60 animate-card-pop',
                (suit === 'hearts' || suit === 'diamonds') && 'text-rose-200',
              )}
              disabled={disabled}
              onClick={() => onPlay(card.id)}
            >
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{suit}</span>
              {label}
            </Button>
          );
        })}
      </div>
    </section>
  );
}
