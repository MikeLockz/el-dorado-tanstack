import { randomUUID } from "node:crypto";
import type { IncomingMessage, Server as HttpServer } from "node:http";
import type { Duplex } from "node:stream";
import { URL } from "node:url";
import { WebSocketServer, WebSocket } from "ws";
import type { RawData } from "ws";
import {
  context as otelContext,
  SpanStatusCode,
  trace,
} from "@opentelemetry/api";
import {
  type EngineEvent,
  type GameEvent,
  type GameState,
  type PlayerId,
  type PlayerInGame,
  applyBid,
  completeTrick,
  getActivePlayers,
  isPlayersTurn,
  playCard,
  scoreRound,
  startRound,
} from "@game/domain";
import { EngineError } from "@game/domain";
import {
  RoomRegistry,
  RoomRegistryError,
  type RoomSocket,
  type ServerRoom,
} from "../rooms/RoomRegistry.js";
import { recordEngineEvents, recordSystemEvent } from "../game/eventLog.js";
import { buildClientGameView } from "./state.js";
import {
  parseClientMessage,
  type ClientMessage,
  type ServerMessage,
} from "./messages.js";
import { selectFallbackCard } from "./fallback.js";
import type { BotActionExecutor } from "../bots/BotManager.js";
import type { BotManager } from "../bots/BotManager.js";
import { getTracer } from "../observability/telemetry.js";
import { logger } from "../observability/logger.js";
import {
  trackWsConnection,
  trackWsDisconnection,
  trackWsMessage,
} from "../observability/metrics.js";

interface GatewayOptions {
  registry: RoomRegistry;
  turnTimeoutMs?: number;
  botManager?: BotManager;
}

interface ConnectionContext extends RoomSocket {
  room: ServerRoom;
  token: string;
  disconnectMeta?: Record<string, unknown>;
}

interface UpgradeContext {
  room: ServerRoom;
  playerId: PlayerId;
  token: string;
}

const DEFAULT_TURN_TIMEOUT_MS = 60_000;
const tracer = getTracer();
const wsLogger = logger.child({ context: { component: "ws-gateway" } });

export class WebSocketGateway implements BotActionExecutor {
  private readonly registry: RoomRegistry;
  private readonly turnTimeoutMs: number;
  private readonly wss: WebSocketServer;
  private readonly connections = new Map<string, ConnectionContext>();
  private readonly timers = new Map<string, NodeJS.Timeout>();
  private readonly botManager?: BotManager;

  constructor(server: HttpServer, options: GatewayOptions) {
    this.registry = options.registry;
    this.turnTimeoutMs = options.turnTimeoutMs ?? DEFAULT_TURN_TIMEOUT_MS;
    this.wss = new WebSocketServer({ noServer: true });
    this.botManager = options.botManager;

    server.on("upgrade", (req, socket, head) => {
      this.handleUpgrade(req, socket, head);
    });

    this.wss.on(
      "connection",
      (socket: WebSocket, _request: IncomingMessage, auth: UpgradeContext) => {
        this.handleConnection(socket, auth);
      }
    );

    this.registry.on('playerRemoved', (event) => {
      this.handlePlayerRemoved(event);
    });

    this.registry.on('botAdded', (event) => {
      this.handleBotAdded(event);
    });
  }

  ensureRoundReady(room: ServerRoom): void {
    const wasLobby = room.gameState.phase === 'LOBBY';
    this.ensureRound(room);
    if (wasLobby && room.gameState.phase !== 'LOBBY') {
      this.broadcastState(room);
    }
  }

  async processBotBid(
    room: ServerRoom,
    playerId: PlayerId,
    bid: number
  ): Promise<void> {
    try {
      this.ensureRound(room);
      await this.performBid(room, playerId, bid);
    } catch (error) {
      this.handleAutomationError(room, playerId, error);
    }
  }

  async processBotPlay(
    room: ServerRoom,
    playerId: PlayerId,
    cardId: string
  ): Promise<void> {
    try {
      this.ensureRound(room);
      await this.performPlay(room, playerId, cardId);
    } catch (error) {
      this.handleAutomationError(room, playerId, error);
    }
  }

  private handleUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer) {
    const parsedUrl = this.parseRequestUrl(req);
    wsLogger.info("Handling upgrade request", {
      url: req.url,
      host: req.headers.host,
      pathname: parsedUrl.pathname
    });

    if (parsedUrl.pathname !== "/ws") {
      wsLogger.warn("Invalid upgrade path", { path: parsedUrl.pathname });
      this.rejectUpgrade(socket, 404, "Not Found");
      return;
    }

    const token = parsedUrl.searchParams.get("token");
    const gameId = parsedUrl.searchParams.get("gameId");
    if (!token || !gameId) {
      wsLogger.warn("Missing upgrade credentials", { gameId, hasToken: !!token });
      this.rejectUpgrade(socket, 400, "Missing credentials");
      return;
    }

    let auth: UpgradeContext | null = null;
    try {
      const resolved = this.registry.resolvePlayerToken(token, gameId);
      auth = { room: resolved.room, playerId: resolved.playerId, token };
    } catch (error) {
      wsLogger.error("Upgrade authentication failed", { gameId, error });
      if (error instanceof RoomRegistryError) {
        this.rejectUpgrade(socket, error.status ?? 401, error.message);
        return;
      }
      this.rejectUpgrade(socket, 500, "Internal error");
      return;
    }

    this.wss.handleUpgrade(req, socket, head, (ws) => {
      this.wss.emit("connection", ws, req, auth as UpgradeContext);
    });
  }

  protected handleConnection(socket: WebSocket, auth: UpgradeContext) {
    const socketId = randomUUID();
    const { room, playerId, token } = auth;

    this.disconnectExistingConnections(room, playerId);

    const connection: ConnectionContext = {
      socketId,
      playerId,
      socket,
      connectedAt: Date.now(),
      room,
      token,
    };

    room.sockets.set(socketId, connection);
    this.connections.set(socketId, connection);
    this.setPlayerStatus(room, playerId, "active");
    this.cancelTimer(room, playerId);
    trackWsConnection({ gameId: room.gameId });
    const seatIndex =
      room.gameState.players.find((player) => player.playerId === playerId)
        ?.seatIndex ?? null;
    wsLogger.info("ws connected", {
      gameId: room.gameId,
      playerId,
      context: { socketId, seatIndex },
    });

    socket.on("message", (data) => this.handleMessage(connection, data));
    socket.on("close", (code, reason) =>
      this.handleDisconnect(connection, code, reason)
    );
    socket.on("error", (error) => {
      wsLogger.error("ws socket error", {
        gameId: room.gameId,
        playerId,
        error,
      });
    });

    this.send(socket, this.buildWelcome(room, playerId));
    this.sendState(connection);
    this.broadcastState(room);
    this.pushTokenRefresh(connection);
    this.maybeAutoStart(room);
  }

  private handleMessage(connection: ConnectionContext, raw: RawData) {
    const span = tracer.startSpan("ws.message", {
      attributes: {
        "game.id": connection.room.gameId,
        "player.id": connection.playerId,
      },
    });
    const ctx = trace.setSpan(otelContext.active(), span);
    otelContext.with(ctx, async () => {
      let messageType = "UNKNOWN";
      let thrown: unknown;
      try {
        const message = parseClientMessage(raw);
        messageType = message?.type ?? "INVALID";
        span.setAttribute("ws.message.type", messageType);
        trackWsMessage({ gameId: connection.room.gameId, type: messageType });
        if (!message) {
          this.emitInvalidAction(
            connection.room,
            connection.playerId,
            "INVALID_MESSAGE",
            "Unable to parse message"
          );
          return;
        }

        switch (message.type) {
          case "PLAY_CARD":
            await this.handlePlayCard(connection, message.cardId);
            break;
          case "BID":
            await this.handleBid(connection, message.value);
            break;
          case "REQUEST_STATE":
            this.sendState(connection);
            break;
          case "UPDATE_PROFILE":
            await this.handleProfileUpdate(connection, message);
            break;
          case "SET_READY":
            this.handleReadyState(connection, message.ready);
            break;
          case "START_GAME":
            this.handleStartGame(connection);
            break;
          case "SET_READY_OVERRIDE":
            this.handleReadyOverride(connection, message.enabled);
            break;
          case "PING":
            this.send(connection.socket, {
              type: "PONG",
              nonce: message.nonce,
              ts: Date.now(),
            });
            break;
          case "REQUEST_SEAT":
            await this.handleRequestSeat(connection);
            break;
        }
      } catch (error) {
        thrown = error;
        this.handleActionError(connection, error);
      } finally {
        if (thrown instanceof Error) {
          span.setStatus({
            code: SpanStatusCode.ERROR,
            message: thrown.message,
          });
          span.recordException(thrown);
        }
        span.end();
      }
    });
  }

  private async handlePlayCard(connection: ConnectionContext, cardId: string) {
    const { room, playerId } = connection;
    this.ensureRound(room);

    await this.performPlay(room, playerId, cardId);
  }

  private async handleBid(connection: ConnectionContext, value: number) {
    const { room, playerId } = connection;
    this.ensureRound(room);

    await this.performBid(room, playerId, value);
  }

  private async handleProfileUpdate(
    connection: ConnectionContext,
    message: Extract<ClientMessage, { type: "UPDATE_PROFILE" }>
  ) {
    const { room, playerId } = connection;
    const updates: Record<string, string> = {};
    if (message.displayName) updates.displayName = message.displayName;
    if (message.avatarSeed) updates.avatarSeed = message.avatarSeed;
    if (message.color) updates.color = message.color;

    if (Object.keys(updates).length === 0) {
      this.emitInvalidAction(
        room,
        playerId,
        "INVALID_PROFILE",
        "No profile fields provided"
      );
      return;
    }

    const playerIndex = room.gameState.players.findIndex(
      (player) => player.playerId === playerId
    );
    if (playerIndex === -1) {
      this.emitInvalidAction(
        room,
        playerId,
        "PLAYER_NOT_FOUND",
        "Unable to update profile"
      );
      return;
    }

    const existing = room.gameState.players[playerIndex];
    const updatedProfile = { ...existing.profile, ...updates };

    room.gameState.players[playerIndex] = {
      ...existing,
      profile: updatedProfile,
    };
    room.gameState.updatedAt = Date.now();

    const events = recordEngineEvents(room, [
      {
        type: "PROFILE_UPDATED",
        payload: { playerId, profile: updatedProfile },
      } as EngineEvent,
    ]);
    await this.persistEvents(room, events);
    this.broadcastEvents(room, events);
    this.broadcastState(room);
  }

  private handleReadyState(connection: ConnectionContext, ready: boolean) {
    const { room, playerId } = connection;
    if (room.gameState.phase !== "LOBBY") {
      this.emitInvalidAction(
        room,
        playerId,
        "READY_INVALID",
        "Ready state can only be changed in the lobby"
      );
      return;
    }
    const player = room.gameState.players.find(
      (entry) => entry.playerId === playerId
    );
    if (!player || player.isBot || player.spectator) {
      this.emitInvalidAction(
        room,
        playerId,
        "READY_INVALID",
        "Only seated human players can ready up"
      );
      return;
    }

    const current = room.lobby.readyState[playerId]?.ready ?? false;
    if (current === ready) {
      return;
    }

    room.lobby.readyState[playerId] = {
      ready,
      updatedAt: Date.now(),
    };

    const event = recordSystemEvent(room, {
      type: ready ? "PLAYER_READY" : "PLAYER_UNREADY",
      payload: { playerId },
    });
    this.broadcastEvents(room, [event]);
    this.broadcastState(room);
  }

  private handleReadyOverride(
    connection: ConnectionContext,
    enabled: boolean
  ) {
    const { room, playerId } = connection;
    if (room.gameState.phase !== "LOBBY") {
      this.emitInvalidAction(
        room,
        playerId,
        "READY_OVERRIDE_INVALID",
        "Override can only be changed in the lobby"
      );
      return;
    }
    if (!this.isHost(room, playerId)) {
      this.emitInvalidAction(
        room,
        playerId,
        "NOT_HOST",
        "Only the host can override readiness"
      );
      return;
    }

    if (room.lobby.overrideReadyRequirement === enabled) {
      return;
    }

    room.lobby.overrideReadyRequirement = enabled;
    this.broadcastState(room);
  }

  private handleStartGame(connection: ConnectionContext) {
    const { room, playerId } = connection;
    wsLogger.info("handleStartGame called", { gameId: room.gameId, playerId });

    if (!this.isHost(room, playerId)) {
      this.emitInvalidAction(
        room,
        playerId,
        "NOT_HOST",
        "Only the host can start the game"
      );
      return;
    }

    if (room.gameState.phase !== "LOBBY") {
      this.emitInvalidAction(
        room,
        playerId,
        "GAME_ALREADY_STARTED",
        "Game has already begun"
      );
      return;
    }

    const readiness = this.validateLobbyStart(room);
    wsLogger.info("validateLobbyStart result", { gameId: room.gameId, context: { readiness } });

    if (!readiness.ok) {
      this.emitInvalidAction(
        room,
        playerId,
        "START_BLOCKED",
        readiness.reason ?? "Unable to start"
      );
      return;
    }

    try {
      this.ensureRound(room);
      this.broadcastState(room);
    } catch (error) {
      wsLogger.error("handleStartGame failed during ensureRound", { gameId: room.gameId, error });
      this.handleActionError(connection, error);
    }
  }

  private async handleRequestSeat(connection: ConnectionContext) {
    const { room, playerId } = connection;
    try {
      await this.registry.assignSeat(room, playerId);
      this.pushTokenRefresh(connection);
      this.broadcastState(room);

      const player = room.gameState.players.find((p) => p.playerId === playerId);
      if (player && typeof player.seatIndex === 'number') {
        recordSystemEvent(room, {
          type: 'PLAYER_JOINED',
          payload: {
            playerId,
            seatIndex: player.seatIndex,
            profile: player.profile,
          },
        });
      }
    } catch (error) {
      this.handleActionError(connection, error);
    }
  }

  private async performBid(room: ServerRoom, playerId: PlayerId, value: number) {
    const result = applyBid(room.gameState, playerId, value);
    this.commitState(room, result.state);
    const recorded = recordEngineEvents(room, result.events);
    await this.persistEvents(room, recorded);
    this.broadcastEvents(room, recorded);
    this.broadcastState(room);
    this.notifyBots(room);
  }

  private async performPlay(
    room: ServerRoom,
    playerId: PlayerId,
    cardId: string
  ) {
    const playResult = playCard(room.gameState, playerId, cardId);
    let nextState = playResult.state;
    let events = [...playResult.events];

    const roundState = nextState.roundState;
    const activeCount = getActivePlayers(nextState).length;
    if (
      roundState?.trickInProgress &&
      roundState.trickInProgress.plays.length === activeCount
    ) {
      const completed = completeTrick(nextState);
      nextState = completed.state;
      events = [...events, ...completed.events];

      if (
        nextState.roundState &&
        nextState.roundState.completedTricks.length ===
        nextState.roundState.cardsPerPlayer
      ) {
        const scored = scoreRound(nextState);
        nextState = { ...scored.state, roundState: null };
        events = [...events, ...scored.events];
        const completionEvent = this.maybeBuildCompletionEvent(nextState);
        if (completionEvent) {
          events.push(completionEvent);
          nextState = { ...nextState, phase: "COMPLETED" };
        }
      }
    }

    this.commitState(room, nextState);
    const recorded = recordEngineEvents(room, events);
    await this.persistEvents(room, recorded);
    this.broadcastEvents(room, recorded);
    this.broadcastState(room);
    this.notifyBots(room);
  }

  private maybeBuildCompletionEvent(state: GameState): EngineEvent | null {
    if (state.roundSummaries.length < state.config.roundCount) {
      return null;
    }
    return {
      type: "GAME_COMPLETED",
      payload: { finalScores: { ...state.cumulativeScores } },
    } as EngineEvent;
  }

  private handleDisconnect(
    connection: ConnectionContext,
    code?: number,
    reason?: Buffer
  ) {
    const { room, socketId, playerId } = connection;
    room.sockets.delete(socketId);
    this.connections.delete(socketId);
    this.setPlayerStatus(room, playerId, "disconnected");
    this.broadcastState(room);
    this.scheduleTimer(room, playerId);
    const reasonText =
      reason && reason.length > 0 ? reason.toString("utf8") : undefined;
    trackWsDisconnection({ gameId: room.gameId });
    const meta = connection.disconnectMeta ?? {};
    connection.disconnectMeta = undefined;
    wsLogger.info("ws disconnected", {
      gameId: room.gameId,
      playerId,
      context: {
        socketId,
        code,
        reason: reasonText,
        ...meta,
      },
    });
  }

  private ensureRound(room: ServerRoom) {
    wsLogger.info("ensureRound called", { gameId: room.gameId });
    if (room.gameState.roundState) {
      wsLogger.info("ensureRound: round already exists", { gameId: room.gameId });
      return;
    }

    const roundIndex = room.gameState.roundSummaries.length;
    if (roundIndex >= room.gameState.config.roundCount) {
      throw new EngineError("GAME_COMPLETED", "All rounds have been played");
    }

    try {
      wsLogger.info("calling startRound", { gameId: room.gameId, context: { roundIndex } });
      const nextState = startRound(
        room.gameState,
        roundIndex,
        `${room.gameState.config.sessionSeed}:${roundIndex}`
      );
      this.commitState(room, nextState);
      this.notifyBots(room);
      wsLogger.info("startRound success, state committed", { gameId: room.gameId });
    } catch (error) {
      wsLogger.error("startRound failed", { gameId: room.gameId, error });
      if (error instanceof EngineError) {
        throw error;
      }
      const message =
        error instanceof Error ? error.message : "Unable to start round";
      throw new EngineError("ROUND_NOT_READY", message);
    }
  }

  private commitState(room: ServerRoom, nextState: GameState) {
    room.gameState = nextState;
    room.playerStates = nextState.playerStates;
    room.updatedAt = Date.now();
    room.version += 1;
  }

  private broadcastState(room: ServerRoom) {
    for (const socket of room.sockets.values()) {
      this.send(socket.socket, {
        type: "STATE_FULL",
        state: buildClientGameView(room, socket.playerId),
      });
    }
  }

  private maybeAutoStart(room: ServerRoom) {
    if (room.gameState.roundState) {
      return;
    }
    if (room.gameState.phase === "LOBBY" && !room.lobby.autoStartEnabled) {
      return;
    }
    const playerCount = getActivePlayers(room.gameState).length;
    if (playerCount < room.gameState.config.minPlayers) {
      return;
    }
    const before = room.gameState.roundState;
    try {
      this.ensureRound(room);
    } catch {
      return;
    }
    if (room.gameState.roundState !== before) {
      this.broadcastState(room);
    }
  }

  private pushTokenRefresh(connection: ConnectionContext) {
    try {
      const token = this.registry.refreshPlayerToken(
        connection.room,
        connection.playerId
      );
      connection.token = token;
      this.send(connection.socket, {
        type: "TOKEN_REFRESH",
        gameId: connection.room.gameId,
        token,
      });
    } catch (error) {
      if (error instanceof RoomRegistryError) {
        wsLogger.warn("unable to refresh token", {
          gameId: connection.room.gameId,
          playerId: connection.playerId,
          error,
        });
        return;
      }
      wsLogger.error("unexpected token refresh error", {
        gameId: connection.room.gameId,
        playerId: connection.playerId,
        error,
      });
    }
  }

  private sendState(connection: ConnectionContext) {
    this.send(connection.socket, {
      type: "STATE_FULL",
      state: buildClientGameView(connection.room, connection.playerId),
    });
  }

  private validateLobbyStart(
    room: ServerRoom
  ): { ok: boolean; reason?: string } {
    const activePlayers = getActivePlayers(room.gameState);
    wsLogger.info("validateLobbyStart check", {
      gameId: room.gameId,
      context: {
        activePlayers: activePlayers.length,
        minPlayers: room.gameState.config.minPlayers,
        override: room.lobby.overrideReadyRequirement
      }
    });

    if (activePlayers.length < room.gameState.config.minPlayers) {
      return {
        ok: false,
        reason: `Need ${room.gameState.config.minPlayers} players to start`,
      };
    }

    if (room.lobby.overrideReadyRequirement) {
      return { ok: true };
    }

    const humanPlayers = activePlayers.filter((player) => !player.isBot);
    if (humanPlayers.length === 0) {
      return { ok: true };
    }

    const readyHumans = humanPlayers.filter((player) => {
      const entry = room.lobby.readyState[player.playerId];
      return entry?.ready;
    });

    if (readyHumans.length === humanPlayers.length) {
      return { ok: true };
    }

    return {
      ok: false,
      reason: `Waiting for ${humanPlayers.length - readyHumans.length} player(s) to ready up`,
    };
  }

  private isHost(room: ServerRoom, playerId: PlayerId): boolean {
    const host = room.gameState.players.find(
      (player) => player.seatIndex === 0 && !player.spectator
    );
    return host?.playerId === playerId;
  }

  private async persistEvents(room: ServerRoom, events: GameEvent[]) {
    if (!room.persistence || events.length === 0) return;
    try {
      await room.persistence.adapter.appendEvents(room, events);
    } catch (error) {
      wsLogger.error("failed to persist events", {
        gameId: room.gameId,
        error,
      });
    }
  }

  private broadcastEvents(room: ServerRoom, events: GameEvent[]) {
    if (events.length === 0) {
      return;
    }

    for (const event of events) {
      for (const socket of room.sockets.values()) {
        this.send(socket.socket, { type: "GAME_EVENT", event });
      }
    }
  }

  private async emitInvalidAction(
    room: ServerRoom,
    playerId: PlayerId,
    action: string,
    reason: string
  ) {
    const events = recordEngineEvents(room, [
      {
        type: "INVALID_ACTION",
        payload: { playerId, action, reason },
      } as EngineEvent,
    ]);
    await this.persistEvents(room, events);
    this.broadcastEvents(room, events);
  }

  private notifyBots(room: ServerRoom) {
    this.botManager?.handleStateChange(room);
  }

  private handleActionError(connection: ConnectionContext, error: unknown) {
    if (error instanceof EngineError) {
      this.emitInvalidAction(
        connection.room,
        connection.playerId,
        error.code,
        error.message
      );
      return;
    }
    wsLogger.error("unhandled action error", {
      gameId: connection.room.gameId,
      playerId: connection.playerId,
      error,
    });
    // Ensure client receives feedback even for unexpected errors
    this.emitInvalidAction(
      connection.room,
      connection.playerId,
      "ACTION_FAILED",
      "Internal server error processing action"
    );
  }

  private handleAutomationError(
    room: ServerRoom,
    playerId: PlayerId,
    error: unknown
  ) {
    if (error instanceof EngineError) {
      this.emitInvalidAction(room, playerId, error.code, error.message);
      return;
    }
    wsLogger.error("bot action failure", {
      gameId: room.gameId,
      playerId,
      error,
    });
  }

  private handleTurnTimeout(room: ServerRoom, playerId: PlayerId) {
    if (this.getPlayerStatus(room, playerId) !== "disconnected") {
      return;
    }
    if (!room.gameState.roundState) {
      this.scheduleTimer(room, playerId);
      return;
    }

    if (!isPlayersTurn(room.gameState, playerId)) {
      this.scheduleTimer(room, playerId);
      return;
    }

    if (!room.gameState.roundState.biddingComplete) {
      this.scheduleTimer(room, playerId);
      return;
    }

    const fallbackCard = selectFallbackCard(room.gameState, playerId);
    if (!fallbackCard) {
      return;
    }

    try {
      this.performPlay(room, playerId, fallbackCard.id);
    } catch (error) {
      this.handleTimerError(room, playerId, error);
    } finally {
      this.scheduleTimer(room, playerId);
    }
  }

  private handlePlayerRemoved(event: {
    room: ServerRoom;
    playerId: PlayerId;
    kicked: boolean;
  }) {
    const { room, playerId, kicked } = event;

    const socketIdsToRemove: string[] = [];
    for (const [socketId, connection] of room.sockets) {
      if (connection.playerId === playerId) {
        socketIdsToRemove.push(socketId);
        if (kicked) {
          connection.socket.close(4000, "Kicked by host");
        } else {
          connection.socket.close(1000, "Player left");
        }
      }
    }

    for (const socketId of socketIdsToRemove) {
      room.sockets.delete(socketId);
      this.connections.delete(socketId);
    }

    const recordedEvent = recordSystemEvent(room, {
      type: kicked ? "PLAYER_KICKED" : "PLAYER_LEFT",
      payload: { playerId },
    });

    this.broadcastEvents(room, [recordedEvent]);
    this.broadcastState(room);
  }

  private handleBotAdded(event: { room: ServerRoom; player: PlayerInGame }) {
    const { room, player } = event;
    const recordedEvent = recordSystemEvent(room, {
      type: "BOT_ADDED",
      payload: { playerId: player.playerId, seatIndex: player.seatIndex },
    });
    this.broadcastEvents(room, [recordedEvent]);
    this.broadcastState(room);
  }

  private handleTimerError(
    room: ServerRoom,
    playerId: PlayerId,
    error: unknown
  ) {
    if (error instanceof EngineError) {
      this.emitInvalidAction(room, playerId, error.code, error.message);
      return;
    }
    wsLogger.error("turn fallback failed", {
      gameId: room.gameId,
      playerId,
      error,
    });
  }

  private scheduleTimer(room: ServerRoom, playerId: PlayerId) {
    const key = this.timerKey(room, playerId);
    this.cancelTimer(room, playerId);
    const timer = setTimeout(() => {
      this.timers.delete(key);
      this.handleTurnTimeout(room, playerId);
    }, this.turnTimeoutMs);
    this.timers.set(key, timer);
  }

  private cancelTimer(room: ServerRoom, playerId: PlayerId) {
    const key = this.timerKey(room, playerId);
    const timer = this.timers.get(key);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(key);
    }
  }

  private timerKey(room: ServerRoom, playerId: PlayerId) {
    return `${room.gameId}:${playerId}`;
  }

  shutdown() {
    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }
    this.timers.clear();
    for (const connection of this.connections.values()) {
      try {
        connection.socket.terminate();
      } catch (error) {
        wsLogger.warn("error terminating socket during shutdown", {
          gameId: connection.room.gameId,
          playerId: connection.playerId,
          error,
        });
      }
    }
    this.connections.clear();
    this.wss.clients.forEach((client) => {
      try {
        client.terminate();
      } catch {
        // ignore
      }
    });
    this.wss.close();
  }

  private disconnectExistingConnections(room: ServerRoom, playerId: PlayerId) {
    for (const [socketId, socket] of [...room.sockets.entries()]) {
      if (socket.playerId === playerId) {
        socket.disconnectMeta = {
          cause: "duplicate_connection",
          replacedAt: Date.now(),
        };
        socket.socket.terminate();
        room.sockets.delete(socketId);
        this.connections.delete(socketId);
      }
    }
  }

  private setPlayerStatus(
    room: ServerRoom,
    playerId: PlayerId,
    status: "active" | "disconnected"
  ) {
    const index = room.gameState.players.findIndex(
      (player) => player.playerId === playerId
    );
    if (index === -1) return;
    const player = room.gameState.players[index];
    if (player.status === status) return;
    room.gameState.players[index] = { ...player, status };
    room.gameState.updatedAt = Date.now();
  }

  private getPlayerStatus(room: ServerRoom, playerId: PlayerId) {
    return (
      room.gameState.players.find((player) => player.playerId === playerId)
        ?.status ?? "active"
    );
  }

  private buildWelcome(room: ServerRoom, playerId: PlayerId): ServerMessage {
    const player = room.gameState.players.find((p) => p.playerId === playerId);
    return {
      type: "WELCOME",
      playerId,
      gameId: room.gameId,
      seatIndex: player?.seatIndex ?? null,
      isSpectator: player?.spectator ?? false,
    };
  }

  private send(socket: WebSocket, payload: ServerMessage) {
    if (socket.readyState !== WebSocket.OPEN) {
      return;
    }
    socket.send(JSON.stringify(payload));
  }

  private parseRequestUrl(req: IncomingMessage) {
    const origin = `http://${req.headers.host ?? "localhost"}`;
    return new URL(req.url ?? "/", origin);
  }

  private rejectUpgrade(socket: Duplex, status: number, message: string) {
    socket.write(
      `HTTP/1.1 ${status} ${status >= 400 && status < 500 ? "Bad Request" : "Error"
      }\r\nConnection: close\r\n\r\n${message}`
    );
    socket.destroy();
  }
}
