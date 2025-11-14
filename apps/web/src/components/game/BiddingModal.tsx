import type { PlayerId, PlayerInGame } from '@game/domain';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface BiddingModalProps {
  isOpen: boolean;
  cardsPerPlayer: number;
  currentBid: number | null;
  onBid: (value: number) => void;
  players: PlayerInGame[];
  bids: Record<PlayerId, number | null>;
}

export function BiddingModal({ isOpen, cardsPerPlayer, currentBid, onBid, players, bids }: BiddingModalProps) {
  const options = Array.from({ length: cardsPerPlayer + 1 }, (_, index) => index);

  return (
    <Dialog open={isOpen} onOpenChange={() => undefined}>
      <DialogContent className="backdrop-blur">
        <DialogHeader>
          <DialogTitle>Place your bid</DialogTitle>
          <DialogDescription>Select how many tricks you plan to win this round.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap gap-2">
          {options.map((value) => (
            <Button
              key={value}
              variant={currentBid === value ? 'default' : 'outline'}
              className={cn('w-16 justify-center', currentBid === value && 'shadow-lg')}
              onClick={() => onBid(value)}
            >
              {value}
            </Button>
          ))}
        </div>
        <div className="rounded-2xl border border-white/10 bg-secondary/30 p-3">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Table bids</p>
          <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
            {players.map((player) => (
              <li key={player.playerId} className="flex items-center justify-between">
                <span>{player.profile.displayName}</span>
                <Badge variant={typeof bids[player.playerId] === 'number' ? 'default' : 'outline'}>
                  {typeof bids[player.playerId] === 'number' ? bids[player.playerId] : '—'}
                </Badge>
              </li>
            ))}
          </ul>
        </div>
      </DialogContent>
    </Dialog>
  );
}
