import type { FC } from "react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

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
  UPCOMING: "upcoming",
  ACTIVE: "active",
  COMPLETED: "completed",
} as const;

type RoundState = (typeof ScorecardRowState)[keyof typeof ScorecardRowState];

export const Scorecard: FC<ScorecardProps> = ({
  rounds,
  totals,
  players,
  currentRoundIndex,
}) => {
  // Add responsive scaling logic
  const [scale, setScale] = useState(1);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const checkWidth = () => {
      if (containerRef.current) {
        const width = containerRef.current.offsetWidth;
        if (width < 500) {
          const newScale = width / 500;
          setScale(newScale);
        } else {
          setScale(1);
        }
      }
    };

    // Use requestAnimationFrame to ensure DOM is ready
    const timeoutId = setTimeout(() => {
      checkWidth();
    }, 100);

    window.addEventListener("resize", checkWidth);
    return () => {
      window.removeEventListener("resize", checkWidth);
      clearTimeout(timeoutId);
    };
  }, []);
  const getRoundState = (roundIndex: number): RoundState => {
    if (currentRoundIndex > roundIndex) return ScorecardRowState.COMPLETED;
    if (currentRoundIndex === roundIndex) return ScorecardRowState.ACTIVE;
    return ScorecardRowState.UPCOMING;
  };

  // Calculate cumulative score at the end of each round
  const getCumulativeScoreAtRound = (playerId: string, targetRoundIndex: number): number => {
    let cumulative = 0;
    for (const round of rounds) {
      if (round.roundIndex <= targetRoundIndex && round.deltas[playerId] !== undefined) {
        cumulative += round.deltas[playerId] ?? 0;
      }
    }
    return cumulative;
  };

  const getPlayerCellContent = (
    round: ScoreRound,
    playerId: string,
    state: RoundState
  ) => {
    if (state === ScorecardRowState.UPCOMING) {
      return null;
    }

    const bid = round.bids[playerId];

    if (state === ScorecardRowState.ACTIVE) {
      return {
        bid: bid !== null ? bid : "-",
        total: "-",
      };
    }

    if (state === ScorecardRowState.COMPLETED) {
      // For completed rounds, calculate cumulative score at the end of this round
      const cumulativeAtRound = getCumulativeScoreAtRound(playerId, round.roundIndex);
      return {
        bid: bid !== null ? bid : "-",
        total: cumulativeAtRound,
      };
    }

    return null;
  };

  const getScoreColorClass = (score: number): string => {
    if (score > 0) return "text-green-400";
    if (score < 0) return "text-red-400";
    return "text-foreground";
  };

  // Calculate total bids for the round metadata
  const getRoundMetadata = (round: ScoreRound) => {
    const totalBids = Object.values(round.bids).reduce(
      (sum: number, bid) => sum + (bid ?? 0),
      0
    );
    return { totalBids };
  };

  // Check if a player's total score is negative for circling
  const isNegativeScore = (playerId: string): boolean => {
    return (totals[playerId] ?? 0) < 0;
  };

  const renderPlayerCell = (
    round: ScoreRound,
    playerId: string,
    state: RoundState
  ) => {
    const content = getPlayerCellContent(round, playerId, state);

    if (!content) {
      return <td key={playerId} className="p-3 text-center text-muted-foreground/50">–</td>;
    }

    // Handle bid/score display based on temp scorecard patterns - flex-row aligned
    // Apply circle border for negative scores if it's a completed round display
    const isNegative =
      state === ScorecardRowState.COMPLETED && Number(content.total) < 0;

    return (
      <td key={playerId} className="p-3 text-center">
        <div className="flex flex-row items-center justify-center gap-1">
          {state === ScorecardRowState.ACTIVE ? (
            <>
              <span className="text-lg font-semibold text-foreground">
                {content.bid}
              </span>
              <span className="text-lg text-muted-foreground">
                {content.total !== "-" ? content.total : ""}
              </span>
            </>
          ) : state === ScorecardRowState.COMPLETED ? (
            content.total !== "-" ? (
              <>
                <span className="text-lg font-semibold text-foreground">
                  {content.bid}
                </span>
                <span className="text-lg text-muted-foreground opacity-60">
                  –
                </span>
                <span
                  className={cn(
                    "text-lg font-medium rounded-full py-0.5",
                    isNegative
                      ? "text-base px-2 bg-red-400/20 border border-red-400/30 text-red-400"
                      : getScoreColorClass(Number(content.total))
                  )}
                >
                  {content.total}
                </span>
              </>
            ) : null
          ) : null}
        </div>
      </td>
    );
  };

  // Render skeleton loading state for empty data
  const renderSkeletonRow = (roundIndex: number, cardsPerPlayer: number) => (
    <tr key={roundIndex} className="border-b border-white/5 opacity-60">
      <th scope="row" className="p-3 text-left font-medium text-foreground">
        <div className="flex flex-col gap-1">
          <Skeleton className="h-3 w-12" />
          <Skeleton className="h-2 w-16" />
        </div>
      </th>
      {players.map((player) => (
        <td key={player.id} className="p-3 text-center">
          <Skeleton className="h-6 w-16 mx-auto" />
        </td>
      ))}
    </tr>
  );

  // Show skeleton for empty players case
  if (players.length === 0) {
    return (
      <section
        ref={containerRef}
        className="rounded-3xl border border-white/10 bg-background/70 p-6 shadow-2xl shadow-black/40 backdrop-blur"
        style={{
          transform: `scale(${scale})`,
          transformOrigin: "top left",
          width: scale < 1 ? `${100 / scale}%` : "100%",
        }}
      >
        <div className="flex flex-col items-center justify-center text-center py-12">
          <div className="mb-4">
            <Skeleton className="h-8 w-48 mx-auto" />
          </div>
          <div className="mb-6">
            <Skeleton className="h-4 w-64 mx-auto" />
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs">
              Round 1 of 10
            </Badge>
            <Badge variant="outline" className="text-xs">
              0 players
            </Badge>
          </div>
        </div>
      </section>
    );
  }

  if (!rounds.length) {
    // Show skeleton with 10 rounds when players exist but no round data
    const skeletonRounds = Array.from({ length: 10 }, (_, i) => ({
      roundIndex: i,
      cardsPerPlayer: 10 - i,
    }));

    return (
      <section
        ref={containerRef}
        className="rounded-3xl border border-white/10 bg-background/70 p-6 shadow-2xl shadow-black/40 backdrop-blur"
        style={{
          transform: `scale(${scale})`,
          transformOrigin: "top left",
          width: scale < 1 ? `${100 / scale}%` : "100%",
        }}
      >
        {/* Header section */}
        <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="flex-1">
            <h2 className="text-xl font-bold text-foreground">Scorecard</h2>
            <div className="mt-1 text-sm text-muted-foreground">
              Rounds will appear when game starts.
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs">
              Round 1 of 10
            </Badge>
            <Badge variant="outline" className="text-xs">
              {players.length} player{players.length !== 1 ? "s" : ""}
            </Badge>
          </div>
        </div>

        <div className="overflow-x-auto -mx-2">
          <table
            className="w-full text-sm"
            role="table"
            aria-label="Game scorecard skeleton"
          >
            <caption className="sr-only">
              Scorecard skeleton showing 10 rounds ready for game data.
            </caption>
            <thead>
              <tr className="border-b border-white/10">
                <th
                  scope="col"
                  className="p-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider"
                >
                  Round
                </th>
                {players.map((player) => (
                  <th
                    key={player.id}
                    scope="col"
                    className="p-3 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wider"
                  >
                    {player.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {skeletonRounds.map((round) =>
                renderSkeletonRow(round.roundIndex, round.cardsPerPlayer)
              )}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-white/10 bg-card/30">
                <th
                  scope="row"
                  className="p-3 text-left font-bold text-foreground"
                >
                  Total
                </th>
                {players.map((player) => (
                  <td key={player.id} className="p-3 text-center">
                    <Skeleton className="h-8 w-20 mx-auto" />
                  </td>
                ))}
              </tr>
            </tfoot>
          </table>
        </div>
      </section>
    );
  }

  return (
    <section
      ref={containerRef}
      className="rounded-3xl border border-white/10 bg-background/70 p-6 shadow-2xl shadow-black/40 backdrop-blur"
      style={{
        transform: `scale(${scale})`,
        transformOrigin: "top left",
        width: scale < 1 ? `${100 / scale}%` : "100%",
      }}
    >
      {/* Header section with title, description and actions */}
      <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="flex-1">
          <h2 className="text-xl font-bold text-foreground">Scorecard</h2>
          <div className="mt-1 text-sm text-muted-foreground">
            {players.length > 0
              ? "Track bids and scores across all rounds."
              : "Add players to start tracking scores."}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-xs">
            Round {Math.min(currentRoundIndex + 1, rounds.length)} of{" "}
            {rounds.length}
          </Badge>
          <Badge variant="outline" className="text-xs">
            {players.length} player{players.length !== 1 ? "s" : ""}
          </Badge>
        </div>
      </div>

      <div className="overflow-x-auto -mx-2">
        <table
          className="w-full text-sm"
          role="table"
          aria-label="Game scorecard"
        >
          <caption className="sr-only">
            Scorecard showing bids and scores for each round of play. Current
            round is {currentRoundIndex + 1} of {rounds.length}.
            {players
              .map((p) => `${p.name}: ${totals[p.id] ?? 0} total`)
              .join(". ")}
          </caption>
          <thead>
            <tr className="border-b border-white/10">
              <th
                scope="col"
                className="p-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider"
              >
                Round
              </th>
              {players.map((player) => (
                <th
                  key={player.id}
                  scope="col"
                  className="p-3 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wider"
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
              const roundMetadata = getRoundMetadata(round);

              return (
                <tr
                  key={round.roundIndex}
                  className={cn(
                    "border-b border-white/5 transition-all",
                    isRowActive && "bg-primary/10 shadow-inner",
                    isRowCompleted && "hover:bg-card/50 hover:border-white/10",
                    isRowUpcoming && "opacity-60"
                  )}
                >
                  <th
                    scope="row"
                    className={cn(
                      "p-3 text-left font-medium",
                      isRowActive
                        ? "text-primary font-semibold"
                        : "text-foreground"
                    )}
                  >
                    <div className="flex flex-col">
                      <span className="text-xs text-muted-foreground opacity-70">
                        {roundMetadata.totalBids} bid
                      </span>
                    </div>
                  </th>
                  {players.map((player) =>
                    renderPlayerCell(round, player.id, state)
                  )}
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-white/10 bg-card/30">
              <th
                scope="row"
                className="p-3 text-left font-bold text-foreground"
              >
                Total
              </th>
              {players.map((player) => {
                const total = totals[player.id] ?? 0;
                const isNegative = total < 0;

                return (
                  <td key={player.id} className="p-3 text-center">
                    <span
                      className={cn(
                        "font-bold text-xl rounded-full px-3 py-1.5 border",
                        isNegative
                          ? "bg-red-400/20 border-red-400/30 text-red-400"
                          : null,
                        !isNegative ? getScoreColorClass(total) : null
                      )}
                    >
                      {total}
                    </span>
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
