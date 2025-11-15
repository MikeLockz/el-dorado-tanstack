import type { FC } from 'react';
import { cn } from '@/lib/utils';

export interface ScoreRound {
  roundIndex: number;
  cardsPerPlayer: number;
  bids: Record<string, number | null>;
  tricksWon: Record<string, number>;
  deltas: Record<string, number>;
}

export interface ScorecardProps {
  rounds: ScoreRound[];
  totals: Record<string, number>;
  players: { id: string; name: string }[];
  currentRoundIndex: number;
}

const ScorecardRowState = {
  UPCOMING: 'upcoming',
  ACTIVE: 'active',
  COMPLETED: 'completed',
} as const;

type RoundState = (typeof ScorecardRowState)[keyof typeof ScorecardRowState];

export const Scorecard: FC<ScorecardProps> = ({ rounds, totals, players, currentRoundIndex }) => {
  const getRoundState = (roundIndex: number): RoundState => {
    if (currentRoundIndex > roundIndex) return ScorecardRowState.COMPLETED;
    if (currentRoundIndex === roundIndex) return ScorecardRowState.ACTIVE;
    return ScorecardRowState.UPCOMING;
  };

  const getPlayerCellContent = (round: ScoreRound, playerId: string, state: RoundState) => {
    if (state === ScorecardRowState.UPCOMING) {
      return null;
    }

    const bid = round.bids[playerId];
    const total = totals[playerId] ?? 0;

    if (state === ScorecardRowState.ACTIVE) {
      return {
        bid: bid !== null ? bid : '-',
        total: '-',
      };
    }

    if (state === ScorecardRowState.COMPLETED) {
      return {
        bid: bid !== null ? bid : '-',
        total,
      };
    }

    return null;
  };

  const getScoreColorClass = (score: number): string => {
    if (score > 0) return 'text-green-400';
    if (score < 0) return 'text-red-400';
    return 'text-foreground';
  };

  const renderPlayerCell = (round: ScoreRound, playerId: string, state: RoundState) => {
    const content = getPlayerCellContent(round, playerId, state);

    if (!content) {
      return <td className="p-3 text-center text-muted-foreground/50">–</td>;
    }

    if (state === ScorecardRowState.ACTIVE) {
      return (
        <td className="p-3 text-center">
          <div className="font-semibold">{content.bid}</div>
          <div className="text-xs text-muted-foreground">{content.total}</div>
        </td>
      );
    }

    if (state === ScorecardRowState.COMPLETED) {
      return (
        <td className="p-3 text-center">
          <div className="flex flex-col items-center">
            <span className="font-semibold">{content.bid}</span>
            <span className="text-xs">
              <span className="text-muted-foreground/60">–</span>
              <span className={cn("ml-1", getScoreColorClass(Number(content.total)))}>{content.total}</span>
            </span>
          </div>
        </td>
      );
    }

    return <td className="p-3 text-center">–</td>;
  };

  if (!rounds.length || !players.length) {
    return null;
  }

  return (
    <section className="rounded-3xl border border-white/10 bg-background/70 p-4 shadow-2xl shadow-black/40 backdrop-blur">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-foreground">Scorecard</h2>
        <div className="text-xs text-muted-foreground mt-1">
          Round {currentRoundIndex + 1} of {rounds.length}
        </div>
      </div>

      <div className="overflow-x-auto -mx-1">
        <table className="w-full min-w-[600px] text-sm" role="table" aria-label="Game scorecard">
          <caption className="sr-only">
            Scorecard showing bids and scores for each round of play.
            Current round is {currentRoundIndex + 1} of {rounds.length}.
            {players.map(p => `${p.name}: ${totals[p.id] ?? 0} total`).join('. ')}
          </caption>
          <thead>
            <tr className="border-b border-white/10">
              <th scope="col" className="p-3 text-left font-semibold text-foreground">
                Round
              </th>
              {players.map((player) => (
                <th
                  key={player.id}
                  scope="col"
                  className="p-3 text-center font-semibold text-foreground"
                >
                  {player.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rounds.map((round) => {
              const state = getRoundState(round.roundIndex);
              const isRowActive = state === ScorecardRowState.ACTIVE;
              const isRowCompleted = state === ScorecardRowState.COMPLETED;
              const isRowUpcoming = state === ScorecardRowState.UPCOMING;

              return (
                <tr
                  key={round.roundIndex}
                  className={cn(
                    'border-b border-white/5 transition-colors',
                    isRowActive && 'bg-primary/10 shadow-inner',
                    isRowCompleted && 'hover:bg-card/50',
                    isRowUpcoming && 'opacity-60'
                  )}
                >
                  <th
                    scope="row"
                    className={cn(
                      "p-3 text-left font-medium",
                      isRowActive ? 'text-primary' : 'text-foreground'
                    )}
                  >
                    <div className="flex flex-col">
                      <span className="font-semibold">{round.roundIndex + 1}</span>
                      <span className="text-xs text-muted-foreground">
                        {round.cardsPerPlayer} trick{round.cardsPerPlayer !== 1 ? 's' : ''}
                      </span>
                    </div>
                  </th>
                  {players.map((player) => renderPlayerCell(round, player.id, state))}
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-white/10 bg-card/30">
              <th scope="row" className="p-3 text-left font-semibold text-foreground">
                Total
              </th>
              {players.map((player) => {
                const total = totals[player.id] ?? 0;
                return (
                  <td
                    key={player.id}
                    className={cn(
                      "p-3 text-center font-semibold text-lg",
                      getScoreColorClass(total)
                    )}
                  >
                    {total}
                  </td>
                );
              })}
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
};