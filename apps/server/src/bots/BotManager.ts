import type { Card, GameState, PlayerId } from "@game/domain";
import {
  createSeededRng,
  getActivePlayers,
  getTurnOrder,
  isPlayersTurn,
} from "@game/domain";
import {
  BaselineBotStrategy,
  type BotStrategy,
  type BotContext,
} from "@game/domain";
import { logger } from "../observability/logger.js";
import type { ServerRoom } from "../rooms/RoomRegistry.js";
import type { RoomRegistry } from "../rooms/RoomRegistry.js";

export interface BotActionExecutor {
  ensureRoundReady(room: ServerRoom): void;
  processBotBid(
    room: ServerRoom,
    playerId: PlayerId,
    bid: number
  ): Promise<void>;
  processBotPlay(
    room: ServerRoom,
    playerId: PlayerId,
    cardId: string
  ): Promise<void>;
}

interface BotManagerOptions {
  registry: RoomRegistry;
  strategy?: BotStrategy;
  matchmakingTargetSize?: number;
}

const DEFAULT_TARGET_SIZE = 4;

export class BotManager {
  private readonly registry: RoomRegistry;
  private readonly strategy: BotStrategy;
  private readonly targetSize: number;
  private executor?: BotActionExecutor;
  private readonly processing = new Set<string>();
  private botNumber = 1;

  constructor(options: BotManagerOptions) {
    this.registry = options.registry;
    this.strategy = options.strategy ?? new BaselineBotStrategy();
    this.targetSize = options.matchmakingTargetSize ?? DEFAULT_TARGET_SIZE;
  }

  bindExecutor(executor: BotActionExecutor) {
    this.executor = executor;
  }

  async fillForMatchmaking(room: ServerRoom) {
    const target = Math.min(this.targetSize, room.gameState.config.maxPlayers);
    while (this.countActivePlayers(room.gameState) < target) {
      const profile = this.createBotProfile();
      await this.registry.addBotToRoom(room, profile);
    }
    this.handleStateChange(room);
  }

  async addBots(room: ServerRoom, count: number) {
    const max = room.gameState.config.maxPlayers;
    const current = this.countActivePlayers(room.gameState);
    const available = max - current;
    const toAdd = Math.min(count, available);

    for (let i = 0; i < toAdd; i++) {
      const profile = this.createBotProfile();
      await this.registry.addBotToRoom(room, profile);
    }
    this.handleStateChange(room);
    return toAdd;
  }

  async handleStateChange(room: ServerRoom) {
    const bots = room.gameState.players.filter((p) => p.isBot);
    if (bots.length === 0) {
      logger.info("No bots found, skipping...");
      return;
    }
    if (!this.executor) {
      return;
    }
    if (this.processing.has(room.gameId)) {
      return;
    }
    this.processing.add(room.gameId);
    try {
      while (await this.advanceRoom(room)) {
        // continue processing until no immediate bot decisions remain
      }
    } finally {
      this.processing.delete(room.gameId);
    }
  }

  private async advanceRoom(room: ServerRoom): Promise<boolean> {
    if (!this.executor) {
      return false;
    }

    const state = room.gameState;
    if (!state.roundState) {
      if (this.shouldStartRound(room)) {
        this.executor.ensureRoundReady(room);
        return true;
      }
      return false;
    }

    if (!state.roundState.biddingComplete) {
      const bidderId = this.nextBidder(state);
      if (!bidderId) {
        return false;
      }
      const bidder = state.players.find(
        (player) => player.playerId === bidderId
      );
      if (!bidder?.isBot) {
        return false;
      }
      const hand = state.playerStates[bidderId]?.hand ?? [];
      const context = this.createContext(state, bidderId, "bid");
      const version = room.version;
      const bid = await this.strategy.bid(hand, context);

      if (room.version !== version) {
        logger.debug('Bot bid aborted due to state change', {
          gameId: room.gameId,
          playerId: bidderId,
          expectedVersion: version,
          actualVersion: room.version,
        });
        return false;
      }

      await this.executor.processBotBid(room, bidderId, bid);
      return true;
    }

    const playerId = this.nextPlayer(state);
    if (!playerId) {
      return false;
    }
    const player = state.players.find((entry) => entry.playerId === playerId);
    if (!player?.isBot) {
      return false;
    }
    const hand = state.playerStates[playerId]?.hand ?? [];
    if (hand.length === 0) {
      return false;
    }
    const context = this.createContext(state, playerId, "play");
    const version = room.version;
    const card = await this.strategy.playCard(hand, context);

    if (room.version !== version) {
      logger.debug('Bot play aborted due to state change', {
        gameId: room.gameId,
        playerId: playerId,
        expectedVersion: version,
        actualVersion: room.version,
      });
      return false;
    }

    await this.executor.processBotPlay(room, playerId, card.id);
    return true;
  }

  private countActivePlayers(state: GameState): number {
    return getActivePlayers(state).length;
  }

  private shouldStartRound(room: ServerRoom): boolean {
    const state = room.gameState;
    if (state.phase === "COMPLETED") {
      return false;
    }
    if (state.phase === "LOBBY" && !room.lobby.autoStartEnabled) {
      return false;
    }
    const roundIndex = state.roundSummaries.length;
    if (roundIndex >= state.config.roundCount) {
      return false;
    }
    return this.countActivePlayers(state) >= state.config.minPlayers;
  }

  private nextBidder(state: GameState): PlayerId | null {
    const round = state.roundState;
    if (!round) {
      return null;
    }
    const turnOrder = getTurnOrder(state);
    const startIndex = round.startingPlayerId
      ? turnOrder.indexOf(round.startingPlayerId)
      : 0;
    const resolvedStart = startIndex >= 0 ? startIndex : 0;
    for (let offset = 0; offset < turnOrder.length; offset += 1) {
      const playerId = turnOrder[(resolvedStart + offset) % turnOrder.length];
      if (round.bids[playerId] === null) {
        return playerId;
      }
    }
    return null;
  }

  private nextPlayer(state: GameState): PlayerId | null {
    const round = state.roundState;
    if (!round) {
      return null;
    }
    const order = getTurnOrder(state);
    for (const playerId of order) {
      if (isPlayersTurn(state, playerId)) {
        return playerId;
      }
    }
    return null;
  }

  private createContext(
    state: GameState,
    playerId: PlayerId,
    phase: "bid" | "play"
  ): BotContext {
    const round = state.roundState;
    if (!round) {
      throw new Error("Missing round state for bot context");
    }
    const trickIndex =
      phase === "bid"
        ? -1
        : round.trickInProgress?.trickIndex ?? round.completedTricks.length;
    const plays: Card[] = [
      ...round.completedTricks.flatMap((trick) =>
        trick.plays.map((play) => play.card)
      ),
      ...(round.trickInProgress
        ? round.trickInProgress.plays.map((play) => play.card)
        : []),
    ];
    return {
      roundIndex: round.roundIndex,
      cardsPerPlayer: round.cardsPerPlayer,
      trumpSuit: round.trumpSuit,
      trumpBroken: round.trumpBroken,
      trickIndex,
      currentTrick: round.trickInProgress,
      playedCards: plays,
      bids: round.bids,
      cumulativeScores: state.cumulativeScores,
      myPlayerId: playerId,
      rng: this.createRng(state, playerId, phase, trickIndex),
      config: {
        maxPlayers: state.config.maxPlayers,
        roundCount: state.config.roundCount,
      },
    };
  }

  private createRng(
    state: GameState,
    playerId: PlayerId,
    phase: "bid" | "play",
    trickIndex: number
  ) {
    const base = `${state.config.sessionSeed}:bot:${playerId}`;
    return createSeededRng(
      `${base}:r${state.roundState?.roundIndex ?? 0}:${phase}:${trickIndex}`
    );
  }

  private createBotProfile() {
    const index = this.botNumber++;
    return {
      displayName: `Bot ${index}`,
      avatarSeed: `bot:${index}`,
      color: "#5566ff",
    };
  }
}
