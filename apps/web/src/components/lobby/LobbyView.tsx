import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ClientGameView } from '@game/domain';
import { PlayerList } from '@/components/game/PlayerList';
import { sortPlayersBySeat } from '@/components/game/gameUtils';
import { LobbyInviteCard } from './LobbyInviteCard';
import { LobbySummaryPanel } from './LobbySummaryPanel';
import { LobbyControls } from './LobbyControls';
import type { ConnectionStatus } from '@/store/gameStore';
import { useToast } from '@/components/ui/use-toast';

interface LobbyViewProps {
  game: ClientGameView;
  joinCode?: string | null;
  connection: ConnectionStatus;
  spectator: boolean;
  onRequestState: () => void;
  onToggleReady?: (ready: boolean) => void;
  onStartGame?: () => void;
  onToggleReadyOverride?: (enabled: boolean) => void;
}

type LobbyRole = 'host' | 'guest' | 'spectator';

export function LobbyView({
  game,
  joinCode,
  connection,
  spectator,
  onRequestState,
  onToggleReady,
  onStartGame,
  onToggleReadyOverride,
}: LobbyViewProps) {
  const { toast } = useToast();
  const players = useMemo(() => sortPlayersBySeat(game.players), [game.players]);
  const activePlayerCount = useMemo(() => players.filter((player) => !player.spectator).length, [players]);
  const host = players.find((player) => player.seatIndex === 0) ?? players[0];
  const seatedPlayers = useMemo(() => players.filter((player) => player.seatIndex !== null && !player.spectator), [players]);
  const availableSeats = Math.max(game.config.maxPlayers - seatedPlayers.length, 0);
  const botCount = useMemo(() => seatedPlayers.filter((player) => player.isBot).length, [seatedPlayers]);
  const hostPlayerId = host?.playerId ?? null;
  const role: LobbyRole = spectator ? 'spectator' : game.you && hostPlayerId && game.you === hostPlayerId ? 'host' : 'guest';
  const readyState = game.lobby?.readyState ?? {};
  const overrideReadyRequirement = Boolean(game.lobby?.overrideReadyRequirement);
  const humanSeats = useMemo(() => seatedPlayers.filter((player) => !player.isBot), [seatedPlayers]);
  const readyHumans = useMemo(
    () => humanSeats.filter((player) => readyState[player.playerId]?.ready),
    [humanSeats, readyState],
  );
  const readyTarget = humanSeats.length;
  const readyCount = readyHumans.length;
  const waitingForReady = Math.max(0, readyTarget - readyCount);
  const hasMinPlayers = activePlayerCount >= game.config.minPlayers;
  const seatsNeededForMin = Math.max(game.config.minPlayers - activePlayerCount, 0);
  const canStart = hasMinPlayers && (overrideReadyRequirement || waitingForReady === 0);
  const selfId = game.you ?? null;
  const selfReady = selfId ? Boolean(readyState[selfId]?.ready) : false;
  const [readyPending, setReadyPending] = useState(false);
  const [startPending, setStartPending] = useState(false);
  const [overridePending, setOverridePending] = useState(false);
  const actionsDisabled = connection !== 'open';
  const startDisabledReason = !hasMinPlayers
    ? `Need ${seatsNeededForMin} more player${seatsNeededForMin === 1 ? '' : 's'} to take a seat`
    : !overrideReadyRequirement && waitingForReady > 0
      ? `Waiting for ${waitingForReady} player${waitingForReady === 1 ? '' : 's'} to ready up`
      : actionsDisabled
        ? 'Reconnect before starting the game'
        : undefined;

  useEffect(() => {
    setReadyPending(false);
  }, [selfReady, selfId, connection]);

  useEffect(() => {
    setStartPending(false);
  }, [game.phase]);

  useEffect(() => {
    setOverridePending(false);
  }, [overrideReadyRequirement]);

  const handleToggleReady = useCallback(() => {
    if (!onToggleReady || !selfId || actionsDisabled) {
      return;
    }
    setReadyPending(true);
    onToggleReady(!selfReady);
  }, [actionsDisabled, onToggleReady, selfId, selfReady]);

  const handleStartGame = useCallback(() => {
    if (!onStartGame || !canStart || actionsDisabled) {
      return;
    }
    setStartPending(true);
    onStartGame();
  }, [actionsDisabled, canStart, onStartGame]);

  const handleOverrideToggle = useCallback(() => {
    if (!onToggleReadyOverride || !hasMinPlayers || actionsDisabled) {
      return;
    }
    setOverridePending(true);
    onToggleReadyOverride(!overrideReadyRequirement);
  }, [actionsDisabled, hasMinPlayers, onToggleReadyOverride, overrideReadyRequirement]);

  const shareUrl = useMemo(() => {
    if (typeof window === 'undefined') {
      return '';
    }
    const origin = window.location.origin;
    const pathname = window.location.pathname;
    const basePath = origin.includes('mikelockz.github.io') && pathname.startsWith('/el-dorado-tanstack') ? '/el-dorado-tanstack' : '';
    return `${origin}${basePath}/game/${game.gameId}`;
  }, [game.gameId]);

  const copyToClipboard = useCallback(async (value: string) => {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return;
    }
    if (typeof document !== 'undefined') {
      const textarea = document.createElement('textarea');
      textarea.value = value;
      textarea.style.position = 'fixed';
      textarea.style.top = '-1000px';
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
    }
  }, []);

  const handleCopyCode = useCallback(async () => {
    if (!joinCode) {
      toast({ variant: 'destructive', title: 'Join code unavailable', description: 'Reconnect to fetch the invite code again.' });
      return;
    }
    try {
      await copyToClipboard(joinCode);
      toast({ title: 'Copied join code', description: 'Share it with anyone you want at the table.' });
    } catch (error) {
      console.error('copy join code failed', error);
      toast({ variant: 'destructive', title: 'Unable to copy code', description: 'Select the code manually and copy it.' });
    }
  }, [copyToClipboard, joinCode, toast]);

  const handleCopyLink = useCallback(async () => {
    if (!shareUrl) {
      toast({ variant: 'destructive', title: 'Link unavailable', description: 'Open this page in your browser to generate a link.' });
      return;
    }
    try {
      await copyToClipboard(shareUrl);
      toast({ title: 'Copied share link', description: 'The link opens this lobby directly.' });
    } catch (error) {
      console.error('copy share link failed', error);
      toast({ variant: 'destructive', title: 'Unable to copy link', description: 'Copy the link text manually.' });
    }
  }, [copyToClipboard, shareUrl, toast]);

  return (
    <div className="grid gap-4 lg:grid-cols-[320px,1fr,320px]">
      <div className="space-y-4">
        <PlayerList
          players={players}
          currentPlayerId={null}
          dealerPlayerId={null}
          you={game.you ?? null}
          scores={game.cumulativeScores}
          readyState={readyState}
        />
        {spectator && <p className="text-xs text-muted-foreground">You are currently spectating this lobby.</p>}
      </div>
      <div className="space-y-4">
        <LobbySummaryPanel
          minPlayers={game.config.minPlayers}
          maxPlayers={game.config.maxPlayers}
          roundCount={game.config.roundCount}
          playerCount={activePlayerCount}
          hostName={host?.profile.displayName}
          isPublic={game.isPublic}
          readyCount={readyCount}
          readyTarget={readyTarget}
          waitingForReady={waitingForReady}
          overrideReadyRequirement={overrideReadyRequirement}
          hasMinPlayers={hasMinPlayers}
        />
        <LobbyControls
          gameId={game.gameId}
          connection={connection}
          playerCount={activePlayerCount}
          minPlayers={game.config.minPlayers}
          maxPlayers={game.config.maxPlayers}
          availableSeats={availableSeats}
          botCount={botCount}
          role={role}
          onRequestState={onRequestState}
          readyCount={readyCount}
          readyTarget={readyTarget}
          waitingForReady={waitingForReady}
          hasMinPlayers={hasMinPlayers}
          overrideReadyRequirement={overrideReadyRequirement}
          canStart={canStart}
          startDisabledReason={startDisabledReason}
          readyPending={readyPending}
          startPending={startPending}
          overridePending={overridePending}
          selfReady={selfReady}
          actionsDisabled={actionsDisabled}
          onToggleReady={role !== 'spectator' ? handleToggleReady : undefined}
          onStartGame={role === 'host' ? handleStartGame : undefined}
          onToggleOverride={role === 'host' ? handleOverrideToggle : undefined}
        />
      </div>
      <div>
        <LobbyInviteCard joinCode={joinCode} shareUrl={shareUrl} isPublic={game.isPublic} onCopyCode={handleCopyCode} onCopyLink={handleCopyLink} />
      </div>
    </div>
  );
}
