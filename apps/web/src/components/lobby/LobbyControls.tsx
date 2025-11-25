import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { ConnectionStatus } from '@/store/gameStore';

interface LobbyControlsProps {
  connection: ConnectionStatus;
  playerCount: number;
  minPlayers: number;
  onRequestState: () => void;
}

export function LobbyControls({ connection, playerCount, minPlayers, onRequestState }: LobbyControlsProps) {
  const remaining = Math.max(minPlayers - playerCount, 0);
  const canStartSoon = remaining === 0;

  return (
    <Card className="border-white/10 bg-background/80">
      <CardHeader>
        <CardTitle>Lobby controls</CardTitle>
        <CardDescription>Everyone stays here until the first round begins.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1 text-sm text-muted-foreground">
          <p className="font-medium text-foreground">{canStartSoon ? 'Minimum seats filled' : 'Waiting for more players'}</p>
          <p>
            {canStartSoon
              ? 'The host will start automatically when the game engine spins up the first round.'
              : `Need ${remaining} more player${remaining === 1 ? '' : 's'} before the first deal.`}
          </p>
          <p className="text-xs uppercase text-muted-foreground">Connection: {connection}</p>
        </div>
        <Button type="button" variant="outline" onClick={onRequestState} className="w-full sm:w-auto">
          <RefreshCw className="mr-2 h-4 w-4" /> Refresh state
        </Button>
      </CardContent>
    </Card>
  );
}
