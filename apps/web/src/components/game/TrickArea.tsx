import type { Card, PlayerId, PlayerInGame, TrickState } from '@game/domain';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
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
    <section className="rounded-3xl border border-white/10 bg-card/70 p-5 text-sm shadow-2xl shadow-black/40 backdrop-blur">
      <header className="flex flex-wrap justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Trick</p>
          <h2 className="text-xl font-semibold text-foreground">{trick ? `#${trick.trickIndex + 1}` : 'Not started'}</h2>
          <p className="text-xs text-muted-foreground">{completedCount} completed</p>
        </div>
        <div className="flex flex-col items-end gap-1 text-right text-xs text-muted-foreground">
          <span>Trump suit</span>
          <Badge variant="outline">{trumpLabel}</Badge>
          {trumpCard && <span className="text-sm text-foreground">{describeCard(trumpCard).label}</span>}
        </div>
      </header>
      <div className="mt-4 space-y-2">
        {plays.length === 0 && <p className="text-muted-foreground">No cards played yet.</p>}
        {plays.map((play) => {
          const { label } = describeCard(play.card);
          const isWinner = trick?.winningCardId === play.card.id;
          return (
            <div
              key={`${play.playerId}-${play.order}`}
              className={cn(
                'flex items-center justify-between rounded-2xl border border-white/5 bg-background/50 px-4 py-2 text-base font-semibold shadow-inner animate-card-pop',
                isWinner && 'border-primary/70 bg-primary/10 text-primary-foreground animate-trick-glow',
              )}
            >
              <span>{playerName(play.playerId)}</span>
              <span>{label}</span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
