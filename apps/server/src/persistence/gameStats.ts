import type { PlayerId } from '@game/domain';
import type { RoundSummaryEntry, SummaryFinalScores, SummaryPlayerEntry } from '../db/schema.js';
import type { ServerRoom } from '../rooms/RoomRegistry.js';

interface PlayerSnapshot {
  playerId: PlayerId;
  finalScore: number;
  totalTricks: number;
  highestBid: number;
  misplays: number;
  longestWinStreak: number;
  longestLossStreak: number;
  isWinner: boolean;
}

export interface ComputedGameStats {
  summary: {
    players: SummaryPlayerEntry[];
    rounds: RoundSummaryEntry[];
    finalScores: SummaryFinalScores;
    highestBid: number | null;
    highestScore: number | null;
    lowestScore: number | null;
    mostConsecutiveWins: number | null;
    mostConsecutiveLosses: number | null;
    highestMisplay: number | null;
  };
  perPlayer: Record<PlayerId, PlayerSnapshot>;
}

export function computeGameStats(room: ServerRoom): ComputedGameStats {
  const finalScores: SummaryFinalScores = {};
  const snapshots = new Map<PlayerId, PlayerSnapshot & { currentWins: number; currentLosses: number }>();

  for (const player of room.gameState.players) {
    const score = room.gameState.cumulativeScores[player.playerId] ?? 0;
    finalScores[player.playerId] = score;
    snapshots.set(player.playerId, {
      playerId: player.playerId,
      finalScore: score,
      totalTricks: 0,
      highestBid: 0,
      misplays: 0,
      longestWinStreak: 0,
      longestLossStreak: 0,
      currentWins: 0,
      currentLosses: 0,
      isWinner: false,
    });
  }

  const rounds: RoundSummaryEntry[] = room.gameState.roundSummaries.map((round) => ({
    roundIndex: round.roundIndex,
    bids: round.bids,
    tricksWon: round.tricksWon,
    scoreDelta: round.deltas,
  }));

  for (const round of room.gameState.roundSummaries) {
    for (const [playerId, snapshot] of snapshots.entries()) {
      const bid = round.bids[playerId];
      if (typeof bid === 'number') {
        snapshot.highestBid = Math.max(snapshot.highestBid, bid);
      }

      const delta = round.deltas[playerId] ?? 0;
      if (delta > 0) {
        snapshot.currentWins += 1;
        snapshot.currentLosses = 0;
        snapshot.longestWinStreak = Math.max(snapshot.longestWinStreak, snapshot.currentWins);
      } else if (delta < 0) {
        snapshot.currentLosses += 1;
        snapshot.currentWins = 0;
        snapshot.longestLossStreak = Math.max(snapshot.longestLossStreak, snapshot.currentLosses);
      } else {
        snapshot.currentWins = 0;
        snapshot.currentLosses = 0;
      }

      snapshot.totalTricks += round.tricksWon[playerId] ?? 0;
    }
  }

  for (const event of room.eventLog) {
    if (event.type === 'INVALID_ACTION') {
      const snapshot = snapshots.get(event.payload.playerId);
      if (snapshot) {
        snapshot.misplays += 1;
      }
    }
  }

  const maxScore = Math.max(...Object.values(finalScores), 0);
  for (const snapshot of snapshots.values()) {
    snapshot.isWinner = snapshot.finalScore === maxScore;
  }

    const summaryPlayers: SummaryPlayerEntry[] = room.gameState.players.map((player) => {
    const snapshot = snapshots.get(player.playerId)!;
    return {
      playerId: player.playerId,
      displayName: player.profile.displayName,
      seatIndex: null,
      score: snapshot.finalScore,
      totalTricksWon: snapshot.totalTricks,
      highestBid: snapshot.highestBid,
      misplays: snapshot.misplays,
      longestWinStreak: snapshot.longestWinStreak,
      longestLossStreak: snapshot.longestLossStreak,
      isWinner: snapshot.isWinner,
      isBot: player.isBot ?? false,
    };
  });

  const highestBid =
    snapshots.size > 0 ? Math.max(...Array.from(snapshots.values()).map((entry) => entry.highestBid)) : null;
  const highestScore =
    summaryPlayers.length > 0 ? Math.max(...summaryPlayers.map((entry) => entry.score)) : null;
  const lowestScore =
    summaryPlayers.length > 0 ? Math.min(...summaryPlayers.map((entry) => entry.score)) : null;
  const mostConsecutiveWins =
    snapshots.size > 0 ? Math.max(...Array.from(snapshots.values()).map((entry) => entry.longestWinStreak)) : null;
  const mostConsecutiveLosses =
    snapshots.size > 0 ? Math.max(...Array.from(snapshots.values()).map((entry) => entry.longestLossStreak)) : null;
  const highestMisplay =
    snapshots.size > 0 ? Math.max(...Array.from(snapshots.values()).map((entry) => entry.misplays)) : null;

  const perPlayer: Record<PlayerId, PlayerSnapshot> = {};
  for (const [playerId, snapshot] of snapshots.entries()) {
    perPlayer[playerId] = {
      playerId,
      finalScore: snapshot.finalScore,
      totalTricks: snapshot.totalTricks,
      highestBid: snapshot.highestBid,
      misplays: snapshot.misplays,
      longestWinStreak: snapshot.longestWinStreak,
      longestLossStreak: snapshot.longestLossStreak,
      isWinner: snapshot.isWinner,
    };
  }

  return {
    summary: {
      players: summaryPlayers,
      rounds,
      finalScores,
      highestBid,
      highestScore,
      lowestScore,
      mostConsecutiveWins,
      mostConsecutiveLosses,
      highestMisplay,
    },
    perPlayer,
  };
}
