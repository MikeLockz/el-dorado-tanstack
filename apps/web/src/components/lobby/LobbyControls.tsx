import { RefreshCw, Users } from 'lucide-react';
import { useEffect, useId, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { ConnectionStatus } from '@/store/gameStore';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import { ApiError, fillBots } from '@/api/client';
import { recordUiEvent } from '@/lib/telemetry';

interface LobbyControlsProps {
  gameId: string;
  connection: ConnectionStatus;
  playerCount: number;
  minPlayers: number;
  maxPlayers: number;
  availableSeats: number;
  botCount: number;
  role: 'host' | 'guest' | 'spectator';
  onRequestState: () => void;
  readyCount: number;
  readyTarget: number;
  waitingForReady: number;
  hasMinPlayers: boolean;
  overrideReadyRequirement: boolean;
  canStart: boolean;
  startDisabledReason?: string;
  readyPending?: boolean;
  startPending?: boolean;
  overridePending?: boolean;
  selfReady: boolean;
  actionsDisabled?: boolean;
  onToggleReady?: () => void;
  onStartGame?: () => void;
  onToggleOverride?: () => void;
  onRequestSeat?: () => void;
  playerId?: string | null;
  seatIndex?: number;
}
function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export function LobbyControls({
  gameId,
  connection,
  playerCount,
  minPlayers,
  maxPlayers,
  availableSeats,
  botCount,
  role,
  onRequestState,
  readyCount,
  readyTarget,
  waitingForReady,
  hasMinPlayers,
  overrideReadyRequirement,
  canStart,
  startDisabledReason,
  readyPending = false,
  startPending = false,
  overridePending = false,
  selfReady,
  actionsDisabled = false,
  onToggleReady,
  onStartGame,
  onToggleOverride,
  onRequestSeat,
  playerId,
  seatIndex,
}: LobbyControlsProps) {
  const { toast } = useToast();
  const remainingSeatsToMin = Math.max(minPlayers - playerCount, 0);
  const canStartSoon = remainingSeatsToMin === 0;
  const showHostTools = role === 'host';
  const [botFillCount, setBotFillCount] = useState(() => (availableSeats > 0 ? availableSeats : 1));
  const [filling, setFilling] = useState(false);
  const botCountInputId = useId();
  const readySummaryLabel = readyTarget === 0 ? 'Waiting for host' : `${readyCount}/${readyTarget} ready`;
  const readySummaryCopy = readyTarget === 0
    ? 'Only bots are seated right now — start when the host is back.'
    : waitingForReady === 0
      ? 'Everyone is ready to play.'
      : `Waiting for ${waitingForReady} player${waitingForReady === 1 ? '' : 's'} to ready up.`;
  const readyButtonLabel = selfReady ? 'Mark as not ready' : 'Ready up';
  const readyButtonDisabled = actionsDisabled || readyPending || !onToggleReady;
  const startButtonDisabled = actionsDisabled || startPending || !canStart || !onStartGame;
  const overrideDisabled = actionsDisabled || overridePending || !onToggleOverride || !hasMinPlayers;

  useEffect(() => {
    if (availableSeats <= 0) {
      setBotFillCount(1);
      return;
    }
    setBotFillCount((current) => clamp(current, 1, availableSeats));
  }, [availableSeats]);

  const handleBotFill = async () => {
    if (availableSeats <= 0 || filling) {
      return;
    }
    setFilling(true);
    try {
      await fillBots(gameId, botFillCount);
      recordUiEvent('lobby.botfill.requested', {
        gameId,
        playerId: playerId ?? undefined,
        seatIndex,
        count: botFillCount,
        currentPlayers: playerCount,
      });
      toast({
        title: 'Bot seats requested',
        description: botFillCount === 1 ? 'Added 1 bot to the table.' : `Added ${botFillCount} bots to the table.`,
      });
    } catch (error) {
      const message = error instanceof ApiError ? error.message : 'Unable to fill seats with bots right now.';
      toast({
        variant: 'destructive',
        title: 'Bot fill failed',
        description: message,
      });
    } finally {
      setFilling(false);
    }
  };

  return (
    <Card className="border-white/10 bg-background/80">
      <CardHeader>
        <CardTitle>Lobby controls</CardTitle>
        <CardDescription>Everyone stays here until the first round begins.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1 text-sm text-muted-foreground">
            <p className="font-medium text-foreground">{canStartSoon ? 'Minimum seats filled' : 'Waiting for more players'}</p>
            <p>
              {canStartSoon
                ? readySummaryCopy
                : `Need ${remainingSeatsToMin} more player${remainingSeatsToMin === 1 ? '' : 's'} before the first deal.`}
            </p>
            <p className="text-xs uppercase text-muted-foreground">Connection: {connection}</p>
          </div>
          <Button type="button" variant="outline" onClick={onRequestState} className="w-full sm:w-auto">
            <RefreshCw className="mr-2 h-4 w-4" /> Refresh state
          </Button>
        </div>

        {role !== 'spectator' && (
          <div className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-muted-foreground">
            <div className="flex items-center justify-between gap-2 text-foreground">
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Your readiness</p>
                <p className="text-base font-semibold">{readySummaryLabel}</p>
                <p className="text-xs text-muted-foreground">{readySummaryCopy}</p>
              </div>
              <Button type="button" className="w-full sm:w-auto" disabled={readyButtonDisabled} onClick={onToggleReady}>
                {readyPending ? 'Updating…' : readyButtonLabel}
              </Button>
            </div>
          </div>
        )}

        {role === 'spectator' && (
          <div className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-muted-foreground">
            <div className="flex items-center justify-between gap-2 text-foreground">
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Spectating</p>
                <p className="text-base font-semibold">You are watching</p>
                <p className="text-xs text-muted-foreground">
                  {availableSeats > 0 ? 'Request a seat to play.' : 'No seats available.'}
                </p>
              </div>
              <Button
                type="button"
                className="w-full sm:w-auto"
                disabled={availableSeats <= 0}
                onClick={onRequestSeat}
              >
                Request seat
              </Button>
            </div>
          </div>
        )}

        {showHostTools && (
          <div className="space-y-3 rounded-lg border border-dashed border-white/15 bg-background/70 p-4">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
              <Users className="h-4 w-4" aria-hidden="true" />
              Bot seat management
            </div>
            <p className="text-sm text-muted-foreground">
              {botCount === 0 ? 'No bots seated yet.' : `${botCount} bot${botCount === 1 ? '' : 's'} currently seated.`}{' '}
              {availableSeats > 0
                ? `You can add up to ${availableSeats} more bot${availableSeats === 1 ? '' : 's'} before reaching the ${maxPlayers}-player limit.`
                : 'All seats are filled right now.'}
            </p>
            {availableSeats > 0 ? (
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                <div className="flex-1 space-y-2">
                  <Label htmlFor={botCountInputId}>Bots to add</Label>
                  <Input
                    id={botCountInputId}
                    type="number"
                    min={1}
                    max={availableSeats}
                    value={botFillCount}
                    onChange={(event) => {
                      const nextValue = Number.parseInt(event.target.value, 10);
                      if (Number.isNaN(nextValue)) {
                        setBotFillCount(1);
                        return;
                      }
                      setBotFillCount(clamp(nextValue, 1, availableSeats));
                    }}
                    className="w-full"
                  />
                  <p className="text-xs text-muted-foreground">Select how many seats to fill with bots in one action.</p>
                </div>
                <Button type="button" className="w-full sm:w-auto" onClick={handleBotFill} disabled={filling}>
                  {filling ? 'Adding bots…' : 'Fill seats with bots'}
                </Button>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                Remove a player or bot to free up seats before adding more bots.
              </p>
            )}
          </div>
        )}

        {role === 'host' && (
          <div className="space-y-3 rounded-2xl border border-white/10 bg-black/20 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-semibold text-foreground">Start game</p>
                <p className="text-xs text-muted-foreground">
                  {canStart ? 'All conditions satisfied — launch the first round when ready.' : startDisabledReason ?? 'Waiting for lobby conditions to be met.'}
                </p>
              </div>
              <Button type="button" onClick={onStartGame} className="w-full sm:w-auto" disabled={startButtonDisabled}>
                {startPending ? 'Starting…' : 'Start game'}
              </Button>
            </div>
            <label className="flex items-center gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                checked={overrideReadyRequirement}
                onChange={onToggleOverride}
                disabled={overrideDisabled}
                className="h-4 w-4 rounded border border-white/30 bg-transparent"
              />
              <span>Override ready check</span>
            </label>
            <p className="text-xs text-muted-foreground">
              Use override sparingly. It becomes available once the minimum number of seats are filled.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
