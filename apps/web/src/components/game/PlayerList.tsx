import type { PlayerId, PlayerInGame } from '@game/domain';
import type { FC } from 'react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface PlayerListProps {
  players: PlayerInGame[];
  currentPlayerId: PlayerId | null;
  dealerPlayerId: PlayerId | null;
  you: PlayerId | null;
  scores: Record<PlayerId, number>;
  bids?: Record<PlayerId, number | null>;
}

export const PlayerList: FC<PlayerListProps> = ({ players, currentPlayerId, dealerPlayerId, you, scores, bids = {} }) => {
  return (
    <section className="rounded-3xl border border-white/10 bg-background/70 p-4 shadow-2xl shadow-black/40 backdrop-blur">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-foreground">Players</h2>
        <Badge variant="outline" className="text-xs">
          {players.length} at table
        </Badge>
      </div>
      <ul className="mt-4 space-y-2">
        {players.map((player) => {
          const isCurrent = player.playerId === currentPlayerId;
          const isDealer = dealerPlayerId === player.playerId;
          const isYou = player.playerId === you;
          const score = scores[player.playerId] ?? 0;
          const bidValue = bids[player.playerId];
          return (
            <li
              key={player.playerId}
              className={cn(
                'rounded-2xl border border-white/5 bg-black/20 p-3 text-sm text-foreground transition hover:border-primary/40',
                isCurrent && 'border-primary/60 bg-primary/5 shadow-lg shadow-primary/20',
              )}
            >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{player.profile.displayName}</span>
                    {isYou && <Badge variant="success">You</Badge>}
                    {isDealer && <Badge variant="warning">Dealer</Badge>}
                    {player.isBot && <Badge variant="outline">Bot</Badge>}
                  {player.status !== 'active' && !player.isBot && <Badge variant="outline">{player.status}</Badge>}
                </div>
                <div className="text-right text-xs text-muted-foreground">
                  <div>Score: {score}</div>
                  {typeof bidValue === 'number' && <div>Bid: {bidValue}</div>}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
};
