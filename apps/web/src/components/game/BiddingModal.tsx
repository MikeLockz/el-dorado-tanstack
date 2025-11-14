import type { PlayerId, PlayerInGame } from '@game/domain';

interface BiddingModalProps {
  isOpen: boolean;
  cardsPerPlayer: number;
  currentBid: number | null;
  onBid: (value: number) => void;
  players: PlayerInGame[];
  bids: Record<PlayerId, number | null>;
}

export function BiddingModal({ isOpen, cardsPerPlayer, currentBid, onBid, players, bids }: BiddingModalProps) {
  if (!isOpen) {
    return null;
  }

  const options = Array.from({ length: cardsPerPlayer + 1 }, (_, index) => index);

  return (
    <div className="modal-overlay">
      <div className="modal">
        <h2>Place your bid</h2>
        <div className="bid-grid">
          {options.map((value) => (
            <button key={value} className="card-button" type="button" data-active={currentBid === value} onClick={() => onBid(value)}>
              {value}
            </button>
          ))}
        </div>
        <div className="bid-list">
          <h3>Table bids</h3>
          <ul>
            {players.map((player) => (
              <li key={player.playerId}>
                <strong>{player.profile.displayName}</strong> — {bids[player.playerId] ?? '—'}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
