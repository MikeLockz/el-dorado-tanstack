import type { FC } from 'react';
import { useEffect, useRef, useState, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { CardChip } from './CardChip';
import { describeCard } from './gameUtils';
import type { PlayerInGame, TrickState, Card, PlayerId, Suit } from '@game/domain';

export interface RoundDetailsProps {
  tricks: TrickState[];
  players: PlayerInGame[];
  trumpSuit: Suit | null;
  currentRoundIndex: number;
  currentTrick?: TrickState | null;
}

interface TrickDisplayData {
  trickIndex: number;
  plays: Array<{
    playerId: PlayerId;
    playerName: string;
    card: Card;
    isWinner: boolean;
    isLeader: boolean;
    isTrumpBreaker: boolean;
    order: number;
  }>;
  winningPlayerName: string | null;
}

export const RoundDetails: FC<RoundDetailsProps> = ({
  tricks,
  players,
  trumpSuit,
  currentRoundIndex,
  currentTrick,
}) => {
  // Add responsive scaling logic
  const [scale, setScale] = useState(1);
  const containerRef = useRef<HTMLDivElement>(null);
  const scaleRef = useRef(1);

  useEffect(() => {
    let rafId: number | null = null;
    let timeoutId: number;

    const checkWidth = () => {
      if (rafId !== null) return;
      
      rafId = requestAnimationFrame(() => {
        if (containerRef.current) {
          // Get the available width (screen width or parent container)
          const parent = containerRef.current.parentElement;
          const availableWidth = parent ? parent.clientWidth : window.innerWidth;
          
          // Measure the table's natural width using scrollWidth
          const table = containerRef.current.querySelector('table');
          if (table) {
            // scrollWidth gives us the full content width regardless of current scale
            const naturalWidth = table.scrollWidth;
            
            // Calculate scale to fit within available width
            let newScale = 1;
            if (naturalWidth > availableWidth) {
              newScale = availableWidth / naturalWidth;
              // Ensure minimum scale
              newScale = Math.max(0.3, newScale);
            }
            
            // Only update if scale actually changed
            if (Math.abs(scaleRef.current - newScale) > 0.001) {
              scaleRef.current = newScale;
              setScale(newScale);
            }
          }
        }
        rafId = null;
      });
    };

    // Initial check after DOM is ready
    timeoutId = setTimeout(() => {
      checkWidth();
    }, 100);

    // Debounce resize events
    let resizeTimeout: number;
    const handleResize = () => {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(checkWidth, 50);
    };

    window.addEventListener("resize", handleResize);
    
    return () => {
      window.removeEventListener("resize", handleResize);
      clearTimeout(timeoutId);
      clearTimeout(resizeTimeout);
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
    };
  }, [tricks.length, players.length]);

  // Calculate total tricks won by each player
  const playerTrickTotals = tricks.reduce((totals, trick) => {
    if (trick.winningPlayerId) {
      totals[trick.winningPlayerId] = (totals[trick.winningPlayerId] || 0) + 1;
    }
    return totals;
  }, {} as Record<PlayerId, number>);

  // Create sorted display data for tricks
  const sortedPlayers = [...players].sort((a, b) => {
    if (a.seatIndex === null && b.seatIndex === null) return a.playerId.localeCompare(b.playerId);
    if (a.seatIndex === null) return 1;
    if (b.seatIndex === null) return -1;
    return a.seatIndex - b.seatIndex;
  });

  // Determine which player broke trump by checking tricks in order
  // Trump is broken when a non-leader plays a trump card when:
  // 1. Trump hasn't been broken yet
  // 2. The led suit is not trump
  // 3. The card played is trump
  // 4. The player is void in the led suit (we can't verify this from completed tricks,
  //    but we assume the first non-leader to play trump when led suit wasn't trump broke it)
  let trumpBroken = false;
  const trumpBreakerByTrick = new Map<number, PlayerId>();

  if (trumpSuit) {
    for (const trick of tricks) {
      if (trumpBroken) break;
      
      // Check if this trick broke trump
      // The leader cannot break trump by leading it
      if (trick.ledSuit && trick.ledSuit !== trumpSuit && trick.leaderPlayerId) {
        // Find the first non-leader who played a trump card
        for (const play of trick.plays) {
          if (play.playerId !== trick.leaderPlayerId && play.card.suit === trumpSuit) {
            // This player broke trump
            trumpBreakerByTrick.set(trick.trickIndex, play.playerId);
            trumpBroken = true;
            break;
          }
        }
      }
    }
  }

  // Process completed tricks
  const trickDisplayData: TrickDisplayData[] = tricks.map(trick => {
    const playerMap = new Map(players.map(p => [p.playerId, p.profile.displayName]));
    const trumpBreakerId = trumpBreakerByTrick.get(trick.trickIndex);

    const plays = sortedPlayers.map(player => {
      const play = trick.plays.find(p => p.playerId === player.playerId);
      return {
        playerId: player.playerId,
        playerName: player.profile.displayName,
        card: play?.card || null,
        isWinner: trick.winningPlayerId === player.playerId,
        isLeader: trick.leaderPlayerId === player.playerId,
        isTrumpBreaker: play ? trumpBreakerId === player.playerId : false,
        order: play?.order || -1,
      };
    }).filter(play => play.card !== null);

    return {
      trickIndex: trick.trickIndex,
      plays: plays as TrickDisplayData['plays'],
      winningPlayerName: trick.winningPlayerId ? playerMap.get(trick.winningPlayerId) || null : null,
    };
  });

  // Add current trick in progress if it exists
  if (currentTrick && !currentTrick.completed) {
    const playerMap = new Map(players.map(p => [p.playerId, p.profile.displayName]));
    const currentTrickDisplay: TrickDisplayData = {
      trickIndex: currentTrick.trickIndex,
      plays: sortedPlayers.map(player => {
        const play = currentTrick.plays.find(p => p.playerId === player.playerId);
        return {
          playerId: player.playerId,
          playerName: player.profile.displayName,
          card: play?.card || null,
          isWinner: currentTrick.winningPlayerId === player.playerId,
          isLeader: currentTrick.leaderPlayerId === player.playerId,
          isTrumpBreaker: false, // Current trick can't have trump breaker yet
          order: play?.order || -1,
        };
      }).filter(play => play.card !== null) as TrickDisplayData['plays'],
      winningPlayerName: currentTrick.winningPlayerId ? playerMap.get(currentTrick.winningPlayerId) || null : null,
    };
    trickDisplayData.push(currentTrickDisplay);
  }

  const hasAnyTricks = tricks.length > 0 || (currentTrick && !currentTrick.completed);

  if (!hasAnyTricks) {
    return (
      <section
        ref={containerRef}
        className="rounded-3xl border border-white/10 bg-background/70 p-6 shadow-2xl shadow-black/40 backdrop-blur"
        style={{
          transform: `scale(${scale})`,
          transformOrigin: "top left",
          width: scale < 1 ? `${100 / scale}%` : "100%",
          maxWidth: "100vw",
        }}
      >
        <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="flex-1">
            <h2 className="text-xl font-bold text-foreground">Round Details</h2>
            <div className="mt-1 text-sm text-muted-foreground">
              No tricks have been played yet in this round.
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs">
              Round {currentRoundIndex + 1}
            </Badge>
            <Badge variant="outline" className="text-xs">
              {players.length} player{players.length !== 1 ? "s" : ""}
            </Badge>
          </div>
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
          maxWidth: "100vw",
        }}
      >
      {/* Header section */}
      <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="flex-1">
          <h2 className="text-xl font-bold text-foreground">Round Details</h2>
          <div className="mt-1 text-sm text-muted-foreground">
            View all tricks played in this round.
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-xs">
            Round {currentRoundIndex + 1}
          </Badge>
          <Badge variant="outline" className="text-xs">
            {tricks.length + (currentTrick && !currentTrick.completed ? 1 : 0)} trick{(tricks.length + (currentTrick && !currentTrick.completed ? 1 : 0)) !== 1 ? "s" : ""}
          </Badge>
          {trumpSuit && (
            <Badge variant="outline" className="text-xs capitalize">
              {trumpSuit} trump
            </Badge>
          )}
        </div>
      </div>

      <div className="overflow-x-auto -mx-2">
        <table className="w-full text-sm" role="table" aria-label="Round details">
          <caption className="sr-only">
            Detailed view of all tricks played in round {currentRoundIndex + 1}.
            {trickDisplayData.map(trick =>
              `Trick ${trick.trickIndex + 1} won by ${trick.winningPlayerName || 'unknown'}`
            ).join('. ')}
          </caption>
          <thead>
            <tr className="border-b border-white/10">
              <th
                scope="col"
                className="p-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider"
              >
                Trick
              </th>
              {sortedPlayers.map((player) => (
                <th
                  key={player.playerId}
                  scope="col"
                  className="p-3 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wider"
                >
                  {player.profile.displayName}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {trickDisplayData.map((trick) => {
              const isCurrentTrick = currentTrick && !currentTrick.completed && trick.trickIndex === currentTrick.trickIndex;
              return (
              <tr
                key={trick.trickIndex}
                className={cn(
                  "border-b border-white/5 hover:bg-card/30 transition-colors",
                  isCurrentTrick && "bg-primary/5"
                )}
              >
                <th
                  scope="row"
                  className="p-3 align-top text-left font-medium text-foreground"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm">Trick {trick.trickIndex + 1}</span>
                    {isCurrentTrick && (
                      <Badge variant="outline" className="text-xs bg-blue-400/20 text-blue-400 border border-blue-400/30">
                        In Progress
                      </Badge>
                    )}
                  </div>
                </th>
                {sortedPlayers.map((player) => {
                  const play = trick.plays.find(p => p.playerId === player.playerId);

                  if (!play) {
                    return (
                      <td key={player.playerId} className="p-3 align-top text-center text-muted-foreground/50">
                        –
                      </td>
                    );
                  }

                  return (
                    <td key={player.playerId} className="p-3 align-top">
                      <div className="flex flex-col items-center gap-1">
                        <div className={cn(
                          "inline-flex items-center justify-center",
                          play.isWinner && "animate-pulse"
                        )}>
                          <CardChip card={play.card} />
                        </div>
                        <div className="flex items-center gap-1 flex-wrap justify-center">
                          {play.isWinner && (
                            <Badge
                              variant="default"
                              className="text-xs bg-green-400/20 text-green-400 border border-green-400/30"
                              title="Won"
                            >
                              🏆
                            </Badge>
                          )}
                          {play.isLeader && (
                            <Badge variant="outline" className="text-xs" title="Lead">
                              ▶️
                            </Badge>
                          )}
                          {play.isTrumpBreaker && (
                            <Badge
                              variant="warning"
                              className="text-xs"
                              title="Broke Trump"
                            >
                              💥
                            </Badge>
                          )}
                        </div>
                      </div>
                    </td>
                  );
                })}
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
                Total Won
              </th>
              {sortedPlayers.map((player) => {
                const total = playerTrickTotals[player.playerId] || 0;
                return (
                  <td key={player.playerId} className="p-3 text-center">
                    <Badge
                      variant="outline"
                      className={cn(
                        "font-bold text-lg",
                        total > 0 && "bg-primary/10 border-primary/30 text-primary"
                      )}
                    >
                      {total}
                    </Badge>
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