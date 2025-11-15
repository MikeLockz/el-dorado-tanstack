import type { Card } from '@game/domain';
import { cn } from '@/lib/utils';
import { describeCard } from './gameUtils';

interface CardChipProps {
  card: Card;
  interactive?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  className?: string;
}

export function CardChip({ card, interactive = false, disabled = false, onClick, className }: CardChipProps) {
  const { suit, label, symbol } = describeCard(card);
  const commonClasses = cn(
    'rounded-xl border border-white/10 bg-background/50 px-2 py-1 text-sm font-semibold text-foreground shadow',
    (suit === 'hearts' || suit === 'diamonds') && 'text-rose-200',
    className,
  );

  if (interactive) {
    return (
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        aria-label={label}
        className={cn(
          commonClasses,
          'flex items-center justify-center gap-1 transition hover:-translate-y-1 hover:border-primary/60 disabled:cursor-not-allowed disabled:opacity-50',
        )}
      >
        <span>{card.rank}</span>
        <span className="text-xs text-muted-foreground">{symbol}</span>
      </button>
    );
  }

  return (
    <div className={cn(commonClasses, 'flex items-center justify-center gap-1')} aria-label={label}>
      <span>{card.rank}</span>
      <span className="text-xs text-muted-foreground">{symbol}</span>
    </div>
  );
}
