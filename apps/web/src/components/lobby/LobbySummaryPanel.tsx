import { Users } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

interface LobbySummaryPanelProps {
  minPlayers: number;
  maxPlayers: number;
  roundCount: number;
  playerCount: number;
  hostName?: string;
  isPublic: boolean;
}

export function LobbySummaryPanel({ minPlayers, maxPlayers, roundCount, playerCount, hostName, isPublic }: LobbySummaryPanelProps) {
  const needed = Math.max(0, minPlayers - playerCount);
  const waitingMessage = needed === 0 ? 'Waiting for host to start' : `Need ${needed} more player${needed === 1 ? '' : 's'} to begin`;

  return (
    <Card className="border-white/10 bg-background/70">
      <CardHeader className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Lobby summary</CardTitle>
            <CardDescription>Game settings locked in by the host.</CardDescription>
          </div>
          <Badge variant="outline">{isPublic ? 'Visible to everyone' : 'Invite only'}</Badge>
        </div>
        <p className="text-sm text-muted-foreground">Hosted by {hostName ?? 'the first seated player'}</p>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <div className="grid gap-4 sm:grid-cols-3">
          <Stat label="Players" value={`${playerCount}/${maxPlayers}`} description={`Minimum ${minPlayers}`} />
          <Stat label="Rounds" value={roundCount.toString()} description="Fixed length" />
          <Stat label="Status" value={needed === 0 ? 'Ready to start' : 'Waiting'} description={waitingMessage} />
        </div>
        <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-black/20 p-3 text-xs text-muted-foreground">
          <Users className="h-4 w-4 text-primary" />
          <span>
            {needed === 0
              ? 'You can remain in the lobby until everyone is ready. The host can start once all required seats are filled.'
              : 'The lobby auto-updates as friends join. Copy the invite link and keep this tab open once you take a seat.'}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

interface StatProps {
  label: string;
  value: string;
  description?: string;
}

function Stat({ label, value, description }: StatProps) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/10 p-3">
      <p className="text-xs uppercase text-muted-foreground">{label}</p>
      <p className="text-2xl font-semibold text-white">{value}</p>
      {description && <p className="text-xs text-muted-foreground">{description}</p>}
    </div>
  );
}
