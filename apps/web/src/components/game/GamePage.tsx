import { useMemo } from 'react';
import { ConnectionStateBanner } from './ConnectionStateBanner';
import { ErrorToast } from './ErrorToast';
import { Hand } from './Hand';
import { PlayerList } from './PlayerList';
import { TrickArea } from './TrickArea';
import { BiddingModal } from './BiddingModal';
import { clearErrors, useGameStore } from '@/store/gameStore';
import type { ClientMessage } from '@/types/messages';
import { getCurrentTurnPlayerId, sortPlayersBySeat } from './gameUtils';

interface GamePageProps {
  gameId: string;
  playerToken: string | null;
  sendMessage: (message: ClientMessage) => boolean;
}

export function GamePage({ gameId, playerToken, sendMessage }: GamePageProps) {
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
  const showBidding = game?.phase === 'BIDDING' && !spectator;

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
    <div className="game-page">
      <ConnectionStateBanner connection={connection} />
      <ErrorToast errors={errors} onClear={clearErrors} />
      <div className="game-grid">
        <PlayerList players={players} currentPlayerId={currentTurnId} you={selfId} scores={game?.cumulativeScores ?? {}} bids={bids} />
        <TrickArea
          trick={round?.trickInProgress ?? null}
          players={players}
          trumpSuit={round?.trumpSuit ?? null}
          trumpCard={round?.trumpCard ?? null}
          completedCount={round?.completedTricks.length ?? 0}
        />
        <Hand cards={hand} disabled={playDisabled} onPlay={handlePlayCard} />
      </div>
      <div className="game-actions">
        <button className="secondary" onClick={handleRequestState}>
          Refresh State
        </button>
        <span>Game: {gameId}</span>
        {!playerToken && <span className="badge muted">No token</span>}
        {spectator && <span className="badge">Spectator</span>}
      </div>
      <BiddingModal
        isOpen={showBidding}
        cardsPerPlayer={cardsPerPlayer}
        currentBid={selfId ? bids[selfId] ?? null : null}
        onBid={handleBid}
        players={players}
        bids={bids}
      />
    </div>
  );
}
