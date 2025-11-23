import { describe, it, expect } from "vitest";
import { computeGameStats } from "./gameStats.js";
import type { ServerRoom } from "../rooms/RoomRegistry.js";
import type { GameState, PlayerId } from "@game/domain";

describe("computeGameStats", () => {
  it("calculates total tricks won across all rounds", () => {
    const mockRoom = createMockRoom({
      roundSummaries: [
        {
          roundIndex: 0,
          bids: { p1: 3 },
          tricksWon: { p1: 3 },
          deltas: { p1: 10 },
          cardsPerPlayer: 10,
          dealerPlayerId: "p2",
          startingPlayerId: "p1",
          trumpSuit: "spades",
          completedAt: new Date(),
        },
        {
          roundIndex: 1,
          bids: { p1: 5 },
          tricksWon: { p1: 5 },
          deltas: { p1: 10 },
          cardsPerPlayer: 9,
          dealerPlayerId: "p1",
          startingPlayerId: "p2",
          trumpSuit: "hearts",
          completedAt: new Date(),
        },
      ],
      cumulativeScores: { p1: 20 },
    });

    const stats = computeGameStats(mockRoom);
    const p1Stats = stats.summary.players.find((p) => p.playerId === "p1");
    expect(p1Stats?.totalTricksWon).toBe(8);
  });

  it("tracks consecutive win streaks correctly", () => {
    const mockRoom = createMockRoom({
      roundSummaries: [
        {
          roundIndex: 0,
          bids: { p1: 1 },
          tricksWon: { p1: 1 },
          deltas: { p1: 10 }, // win
          cardsPerPlayer: 10,
          dealerPlayerId: "p2",
          startingPlayerId: "p1",
          trumpSuit: "spades",
          completedAt: new Date(),
        },
        {
          roundIndex: 1,
          bids: { p1: 1 },
          tricksWon: { p1: 1 },
          deltas: { p1: 5 }, // win
          cardsPerPlayer: 9,
          dealerPlayerId: "p1",
          startingPlayerId: "p2",
          trumpSuit: "hearts",
          completedAt: new Date(),
        },
        {
          roundIndex: 2,
          bids: { p1: 1 },
          tricksWon: { p1: 0 },
          deltas: { p1: -5 }, // loss
          cardsPerPlayer: 8,
          dealerPlayerId: "p2",
          startingPlayerId: "p1",
          trumpSuit: "clubs",
          completedAt: new Date(),
        },
        {
          roundIndex: 3,
          bids: { p1: 1 },
          tricksWon: { p1: 1 },
          deltas: { p1: 10 }, // win
          cardsPerPlayer: 7,
          dealerPlayerId: "p1",
          startingPlayerId: "p2",
          trumpSuit: "diamonds",
          completedAt: new Date(),
        },
      ],
      cumulativeScores: { p1: 20 },
    });

    const stats = computeGameStats(mockRoom);
    const p1Stats = stats.summary.players.find((p) => p.playerId === "p1");
    expect(p1Stats?.longestWinStreak).toBe(2);
    expect(p1Stats?.longestLossStreak).toBe(1);
  });

  it("counts misplays from event log", () => {
    const mockRoom = createMockRoom({
      eventLog: [
        {
          type: "INVALID_ACTION",
          payload: { playerId: "p1", action: "PLAY", reason: "bad" },
          eventIndex: 0,
          createdAt: new Date(),
        },
        {
          type: "INVALID_ACTION",
          payload: { playerId: "p1", action: "BID", reason: "bad" },
          eventIndex: 1,
          createdAt: new Date(),
        },
        {
          type: "GAME_STARTED",
          payload: {},
          eventIndex: 2,
          createdAt: new Date(),
        },
      ],
    });

    const stats = computeGameStats(mockRoom);
    const p1Stats = stats.summary.players.find((p) => p.playerId === "p1");
    expect(p1Stats?.misplays).toBe(2);
  });
});

function createMockRoom(overrides: Partial<any> = {}): ServerRoom {
  const players = [
    { playerId: "p1", profile: { displayName: "Player 1" } },
    { playerId: "p2", profile: { displayName: "Player 2" } },
  ];

  return {
    gameId: "test-game",
    gameState: {
      players,
      cumulativeScores: { p1: 0, p2: 0 },
      roundSummaries: [],
      config: { sessionSeed: "seed" },
      ...overrides,
    },
    eventLog: [],
    ...overrides,
  } as any;
}
