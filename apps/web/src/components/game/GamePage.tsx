import { RefreshCw } from 'lucide-react';
import { useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ConnectionStateBanner } from './ConnectionStateBanner';
import { ErrorToast } from './ErrorToast';
import { Hand } from './Hand';
import { PlayerList } from './PlayerList';
import { TrickArea } from './TrickArea';
import { RoundDetails } from './RoundDetails';
import { BiddingModal } from './BiddingModal';
import { clearErrors, useGameStore } from '@/store/gameStore';
import type { ClientMessage } from '@/types/messages';
import type { PlayerInGame } from '@game/domain';
import { getCurrentTurnPlayerId, sortPlayersBySeat, createScoreRoundsFromSummaries, createUpcomingRounds } from './gameUtils';
import { useToast } from '@/components/ui/use-toast';
import { Scorecard } from './Scorecard';
import { LobbyView } from '@/components/lobby/LobbyView';
import { useLobbyMetadata } from '@/hooks/useLobbyMetadata';


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
  const { joinCode, setJoinCode } = useLobbyMetadata(gameId);

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

  const handleToggleReady = (ready: boolean) => {
    sendMessage({ type: 'SET_READY', ready });
  };

  const handleStartGame = () => {
    sendMessage({ type: 'START_GAME' });
  };

  const handleReadyOverride = (enabled: boolean) => {
    sendMessage({ type: 'SET_READY_OVERRIDE', enabled });
  };

  const handleKickPlayer = async (playerId: string) => {
    if (!playerToken) return;
    try {
      const response = await fetch(`/api/games/${gameId}/players/${playerId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${playerToken}`,
        },
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || 'Failed to kick player');
      }

      toast({ title: 'Player kicked', description: 'The player has been removed from the lobby.' });
    } catch (error) {
      console.error('kick failed', error);
      toast({
        variant: 'destructive',
        title: 'Kick failed',
        description: error instanceof Error ? error.message : 'Unable to kick player.',
      });
    }
  };

  const handleRequestSeat = () => {
    sendMessage({ type: 'REQUEST_SEAT' });
  };

  const scorecardPlayers = players.map((player) => ({
    id: player.playerId,
    name: player.profile.displayName,
  }));

  useEffect(() => {
    if (game?.joinCode) {
      setJoinCode(game.joinCode);
    }
  }, [game?.joinCode, setJoinCode]);

  // Build scorecard data from real game state
  const scorecardRounds = useMemo(() => {
    const roundSummaries = game?.roundSummaries ?? [];

    // Calculate total rounds: use max round index from summaries/current round, or default to 10
    const maxCompletedRound = roundSummaries.length > 0
      ? Math.max(...roundSummaries.map(r => r.roundIndex))
      : -1;
    const currentRoundIndex = round?.roundIndex ?? -1;
    const maxRoundIndex = Math.max(maxCompletedRound, currentRoundIndex);
    // Total rounds is typically maxRoundIndex + 1, but we'll use a default of 10 if we can't determine
    const totalRounds = maxRoundIndex >= 0 ? maxRoundIndex + 1 : 10;

    // Convert completed rounds from summaries
    const completedRounds = createScoreRoundsFromSummaries(roundSummaries);

    // Add current round if it exists and hasn't been completed yet
    const currentRound = round && round.roundIndex !== undefined &&
      !completedRounds.some(r => r.roundIndex === round.roundIndex) ? {
      roundIndex: round.roundIndex,
      cardsPerPlayer: round.cardsPerPlayer,
      bids: bids,
      tricksWon: {}, // Will be populated when round completes
      deltas: {}, // Will be populated when round completes
    } : null;

    // Create upcoming rounds
    const upcomingRounds = createUpcomingRounds(roundSummaries, totalRounds);

    // Combine all rounds
    const allRounds = [...completedRounds];
    if (currentRound) {
      allRounds.push(currentRound);
    }
    allRounds.push(...upcomingRounds);

    // Sort by roundIndex and ensure we have exactly totalRounds
    return allRounds
      .sort((a, b) => a.roundIndex - b.roundIndex)
      .slice(0, totalRounds);
  }, [game?.roundSummaries, round, bids]);

  const currentRoundIndex = game?.round?.roundIndex ?? 0;

  const shouldShowScorecard = game?.gameId && scorecardRounds.length > 0 && players.length > 0;
  const showLobbyView = Boolean(game && game.phase === 'LOBBY');

  if (showLobbyView && game) {
    return (
      <div className="space-y-4 pb-16">
        <ConnectionStateBanner connection={connection} />
        <ErrorToast errors={errors} onClear={clearErrors} />
        <LobbyView
          game={game}
          joinCode={joinCode}
          connection={connection}
          spectator={spectator}
          onRequestState={handleRequestState}
          onToggleReady={handleToggleReady}
          onStartGame={handleStartGame}
          onToggleReadyOverride={handleReadyOverride}
          onKick={handleKickPlayer}
          onRequestSeat={handleRequestSeat}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-16">
      <ConnectionStateBanner connection={connection} />
      <ErrorToast errors={errors} onClear={clearErrors} />
      <div className="grid gap-4 lg:grid-cols-[320px,1fr]">
        <div className="order-2 space-y-4 lg:order-1">
          <PlayerList players={players} currentPlayerId={currentTurnId} dealerPlayerId={dealerPlayerId} you={selfId} scores={game?.cumulativeScores ?? {}} bids={bids} />
          {shouldShowScorecard && (
            <Scorecard
              rounds={scorecardRounds}
              totals={game?.cumulativeScores ?? {}}
              players={scorecardPlayers}
              currentRoundIndex={currentRoundIndex}
            />
          )}
        </div>
        <div className="order-1 space-y-4 lg:order-2">
          <TrickArea
            trick={round?.trickInProgress ?? null}
            players={players}
            trumpSuit={round?.trumpSuit ?? null}
            trumpCard={round?.trumpCard ?? null}
            completedCount={round?.completedTricks?.length ?? 0}
          />
          {round && (
            <RoundDetails
              tricks={round.completedTricks ?? []}
              players={players}
              trumpSuit={round.trumpSuit ?? null}
              currentRoundIndex={currentRoundIndex}
              currentTrick={round.trickInProgress ?? null}
            />
          )}
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
