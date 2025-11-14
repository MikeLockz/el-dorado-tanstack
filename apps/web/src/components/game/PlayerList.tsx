import type { PlayerId, PlayerInGame } from '@game/domain';
import type { FC } from 'react';

interface PlayerListProps {
  players: PlayerInGame[];
  currentPlayerId: PlayerId | null;
  you: PlayerId | null;
  scores: Record<PlayerId, number>;
  bids?: Record<PlayerId, number | null>;
}

export const PlayerList: FC<PlayerListProps> = ({ players, currentPlayerId, you, scores, bids = {} }) => {
  return (
    <section className="panel player-list">
      <h2>Players</h2>
      <ul>
        {players.map((player) => {
          const isCurrent = player.playerId === currentPlayerId;
          const isYou = player.playerId === you;
          const score = scores[player.playerId] ?? 0;
          const bidValue = bids[player.playerId];
          return (
            <li key={player.playerId} data-current={isCurrent} data-you={isYou}>
              <div>
                <span className="name">{player.profile.displayName}</span>
                {isYou && <span className="badge">You</span>}
                {player.status !== 'active' && <span className="badge muted">{player.status}</span>}
              </div>
              <div className="meta">
                <span>Score: {score}</span>
                {typeof bidValue === 'number' && <span>Bid: {bidValue}</span>}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
};
