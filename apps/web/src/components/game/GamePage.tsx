import { RefreshCw } from 'lucide-react';
import { useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ConnectionStateBanner } from './ConnectionStateBanner';
import { ErrorToast } from './ErrorToast';
import { Hand } from './Hand';
import { PlayerList } from './PlayerList';
import { TrickArea } from './TrickArea';
import { BiddingModal } from './BiddingModal';
import { clearErrors, useGameStore } from '@/store/gameStore';
import type { ClientMessage } from '@/types/messages';
import { getCurrentTurnPlayerId, sortPlayersBySeat } from './gameUtils';
import { useToast } from '@/components/ui/use-toast';

interface GamePageProps {
  gameId: string;
  playerToken: string | null;
  sendMessage: (message: ClientMessage) => boolean;
}

export function GamePage({ gameId, playerToken, sendMessage }: GamePageProps) {
  const { toast } = useToast();
  const { game, connection, errors, spectator } = useGameStore((state) => ({
    game: state.game,
    connection: state.connection,
    errors: state.errors,
    spectator: state.spectator,
  }));

  const players = useMemo(() => (game ? sortPlayersBySeat(game.players) : []), [game]);
  const currentTurnId = useMemo(() => getCurrentTurnPlayerId(game ?? null), [game]);
  const selfId = game?.you ?? null;
  const hand = game?.hand ?? [];
  const round = game?.round;
  const bids = round?.bids ?? {};
  const cardsPerPlayer = round?.cardsPerPlayer ?? 0;
  const dealerPlayerId = round?.dealerPlayerId ?? null;
  const showBidding = game?.phase === 'BIDDING' && !spectator;

  useEffect(() => {
    if (!errors.length) {
      return;
    }
    errors.forEach((error) => {
      toast({
        variant: 'destructive',
        title: 'Action failed',
        description: error.message,
      });
    });
    clearErrors();
  }, [errors, toast]);

  const playDisabled =
    spectator ||
    !playerToken ||
    connection !== 'open' ||
    game?.phase !== 'PLAYING' ||
    !selfId ||
    (currentTurnId !== null && currentTurnId !== selfId);

  const handlePlayCard = (cardId: string) => {
    sendMessage({ type: 'PLAY_CARD', cardId });
  };

  const handleBid = (value: number) => {
    sendMessage({ type: 'BID', value });
  };

  const handleRequestState = () => {
    sendMessage({ type: 'REQUEST_STATE' });
  };

  return (
    <div className="space-y-4 pb-16">
      <ConnectionStateBanner connection={connection} />
      <ErrorToast errors={errors} onClear={clearErrors} />
      <div className="grid gap-4 lg:grid-cols-[320px,1fr]">
        <div className="order-2 space-y-4 lg:order-1">
          <PlayerList players={players} currentPlayerId={currentTurnId} dealerPlayerId={dealerPlayerId} you={selfId} scores={game?.cumulativeScores ?? {}} bids={bids} />
        </div>
        <div className="order-1 space-y-4 lg:order-2">
          <TrickArea
            trick={round?.trickInProgress ?? null}
            players={players}
            trumpSuit={round?.trumpSuit ?? null}
            trumpCard={round?.trumpCard ?? null}
            completedCount={round?.completedTricks.length ?? 0}
          />
          <Hand cards={hand} disabled={playDisabled} onPlay={handlePlayCard} />
          <div className="flex flex-wrap items-center gap-3 rounded-3xl border border-white/10 bg-background/60 p-4 text-sm text-muted-foreground shadow-lg shadow-black/30 backdrop-blur">
            <Button type="button" variant="outline" className="gap-2" onClick={handleRequestState}>
              <RefreshCw className="h-4 w-4" />
              Refresh state
            </Button>
            <Badge variant="outline" className="text-xs">
              Game: {gameId}
            </Badge>
            {!playerToken && <Badge variant="warning">No player token</Badge>}
            {spectator && <Badge>Spectator</Badge>}
          </div>
        </div>
      </div>
      <BiddingModal
        isOpen={showBidding}
        cardsPerPlayer={cardsPerPlayer}
        hand={hand}
        trumpCard={round?.trumpCard ?? null}
        trumpSuit={round?.trumpSuit ?? null}
        dealerPlayerId={dealerPlayerId}
        currentBid={selfId ? bids[selfId] ?? null : null}
        onBid={handleBid}
        players={players}
        bids={bids}
      />
    </div>
  );
}
