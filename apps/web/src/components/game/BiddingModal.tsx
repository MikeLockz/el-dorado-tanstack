import { useEffect } from 'react';
import type { Card, PlayerId, PlayerInGame } from '@game/domain';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { CardChip } from './CardChip';
import { describeCard, groupCardsBySuit, SUIT_ORDER } from './gameUtils';

interface BiddingModalProps {
  isOpen: boolean;
  cardsPerPlayer: number;
  hand: Card[];
  trumpCard: Card | null;
  trumpSuit: Card['suit'] | null;
  dealerPlayerId: PlayerId | null;
  currentBid: number | null;
  onBid: (value: number) => void;
  players: PlayerInGame[];
  bids: Record<PlayerId, number | null>;
}

export function BiddingModal({ isOpen, cardsPerPlayer, hand, trumpCard, trumpSuit, dealerPlayerId, currentBid, onBid, players, bids }: BiddingModalProps) {
  const options = Array.from({ length: cardsPerPlayer + 1 }, (_, index) => index);
  const groupedHand = groupCardsBySuit(hand);
  const trumpLabel = trumpCard ? describeCard(trumpCard).label : null;
  const visibleTrumpSuit = trumpSuit ?? trumpCard?.suit ?? null;
  const dealerName = dealerPlayerId ? players.find((player) => player.playerId === dealerPlayerId)?.profile.displayName ?? 'Unknown dealer' : null;
  const totalBids = Object.values(bids).reduce((sum, value) => (typeof value === 'number' ? sum + value : sum), 0);

  useEffect(() => {
    console.log('BiddingModal props', {
      isOpen,
      cardsPerPlayer,
      hand,
      trumpCard,
      trumpSuit,
      dealerPlayerId,
      currentBid,
      players,
      bids,
    });
  }, [isOpen, cardsPerPlayer, hand, trumpCard, trumpSuit, dealerPlayerId, currentBid, players, bids]);

  return (
    <Dialog open={isOpen} onOpenChange={() => undefined}>
      <DialogContent className="backdrop-blur">
        <DialogHeader>
          <DialogTitle>Place your bid</DialogTitle>
          <DialogDescription>Select how many tricks you plan to win this round.</DialogDescription>
        </DialogHeader>
        <div className="rounded-2xl border border-white/10 bg-secondary/30 p-3 space-y-1">
          <div className="flex flex-wrap items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
            <span className="text-muted-foreground">Trump for this round</span>
            {dealerName && <Badge variant="warning" className="text-[10px] font-semibold uppercase tracking-widest">Dealer: {dealerName}</Badge>}
          </div>
          {visibleTrumpSuit ? (
            <div className="mt-2 flex items-center justify-between text-foreground">
              <span className="text-sm font-semibold capitalize">{visibleTrumpSuit}</span>
              {trumpLabel && (
                <span
                  className={cn(
                    'rounded-xl border border-white/20 bg-background/60 px-3 py-1 text-base font-semibold',
                    (visibleTrumpSuit === 'hearts' || visibleTrumpSuit === 'diamonds') && 'text-rose-200',
                  )}
                >
                  {trumpLabel}
                </span>
              )}
            </div>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">Waiting for dealer to reveal trump…</p>
          )}
        </div>
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
        {hand.length > 0 && (
          <div className="rounded-2xl border border-white/10 bg-secondary/30 p-3 shadow-inner">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Your cards</p>
            <div className="mt-3 space-y-2">
              {SUIT_ORDER.filter((suit) => groupedHand[suit].length > 0).map((suit) => (
                <div key={suit} className="flex flex-wrap gap-1">
                  {groupedHand[suit].map((card) => (
                    <CardChip key={card.id} card={card} />
                  ))}
                </div>
              ))}
            </div>
          </div>
        )}
        <div className="rounded-2xl border border-white/10 bg-secondary/30 p-3">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Table bids</p>
          <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
            {players.map((player) => {
              const isDealer = dealerPlayerId === player.playerId;
              return (
                <li key={player.playerId} className="flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    {player.profile.displayName}
                    {isDealer && <Badge variant="warning">Dealer</Badge>}
                  </span>
                  <Badge variant={typeof bids[player.playerId] === 'number' ? 'default' : 'outline'}>
                    {typeof bids[player.playerId] === 'number' ? bids[player.playerId] : '—'}
                  </Badge>
                </li>
              );
            })}
          </ul>
          <div className="mt-3 flex items-center justify-between text-xs uppercase tracking-wide text-muted-foreground">
            <span>Total bids</span>
            <Badge variant="outline" className="text-sm font-semibold text-foreground">
              {totalBids}
            </Badge>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
