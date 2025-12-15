"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { setTimeout: setTimeoutPromise } = require("node:timers/promises");
const { v4: uuidv4 } = require("uuid");
const WebSocket = require("ws");
const { fetch: undiciFetch } = require("undici");

const personas = JSON.parse(
  fs.readFileSync(path.join(__dirname, "personas.json"), "utf8")
);

const HEARTBEAT_MS = 5_000;
const HANDSHAKE_TIMEOUT_MS = 15_000;
const ROOM_WAIT_TIMEOUT_MS = 30_000;
const BID_TIMEOUT_MS = 90_000;
const TURN_TIMEOUT_MS = 90_000;

const sharedState = {};

// Domain helpers loaded dynamically
let botStrategy;
let createBotContext;
let isPlayersTurnToBid;

function computePhaseAwareTimeout(context, baseMs, bufferMs = 5_000) {
  const configuredDuration = resolvePhaseDurationSeconds(context);
  if (configuredDuration <= 0) {
    return baseMs;
  }
  const derived = configuredDuration * 1_000 + bufferMs;
  return Math.max(baseMs, derived);
}

function resolvePhaseDurationSeconds(context) {
  const candidates = [
    Number(context.config?.variables?.phaseDuration),
    Number(process.env.ARTILLERY_PHASE_DURATION),
  ];
  for (const candidate of candidates) {
    if (Number.isFinite(candidate) && candidate > 0) {
      return candidate;
    }
  }
  const phases = Array.isArray(context.config?.phases)
    ? context.config.phases
    : [];
  const maxPhaseSeconds = phases.reduce((acc, phase) => {
    const duration = Number(phase?.duration);
    if (!Number.isFinite(duration) || duration <= 0) {
      return acc;
    }
    return Math.max(acc, duration);
  }, 0);
  return maxPhaseSeconds;
}

module.exports = {
  initializeDomain,
  assignPersona,
  createRoomOnce,
  joinRoom,
  connectWebSocket,
  startGame,
  playScriptedRound,
  performBidding,
  performCardPlay,
  closeSocket,
};

function getSharedState() {
  return sharedState;
}

// ... (setup, assignPersona, createRoomOnce, joinRoom, connectWebSocket, performBidding, performCardPlay, playScriptedRound, closeSocket, allocatePersona, waitForShared, fetchImpl, fetchJson, getApiBaseUrl, buildWsUrl, getNumericVariable, coerceNumber, waitForSocketOpen, handleSocketMessage, waitForCondition, flushWaiters, rejectWaiters, tryResolveWaiter, cleanup)

async function maybeSubmitBid(context) {
  const state = getLatestState(context);
  const playerId = context.vars.playerId;
  if (!state?.round || !playerId) {
    return;
  }

  const roundIndex = state.round.roundIndex;
  if (context.vars.lastBidRoundIndex === roundIndex) {
    return;
  }

  const current = state.round.bids[playerId];
  if (current !== null) {
    context.vars.lastBidRoundIndex = roundIndex;
    return;
  }

  if (!createBotContext || !botStrategy) {
    throw new Error("Domain logic not initialized");
  }

  const botContext = createBotContext(state, playerId);
  const bidValue = await botStrategy.bid(state.hand || [], botContext);

  await sendWsMessage(context, { type: "BID", value: bidValue });
  context.vars.bidSubmitted = true;
  context.vars.lastBidRoundIndex = roundIndex;
}



async function initializeDomain(context, events) {
  // Reset persona cursor for new test runs if this is the first VU
  if (context.vars.$uuid === context.scenario.name + "-0") {
    // This is tricky because VUs are independent. 
    // But sharedState is shared across VUs in the same process.
    // We might need a better way to reset this for repetitions.
    // Actually, for repetitions, the process restarts if we run artillery multiple times?
    // No, we are running artillery multiple times in the loop in bash script.
    // So the node process exits and restarts.
    // Wait, if the user sees 10 VUs when requesting 4, it means arrivalCount is 10.
  }

  if (botStrategy && createBotContext) {
    return;
  }
  try {
    console.log("Initializing domain...");
    // Load domain logic
    const domainPath = path.resolve(__dirname, '../packages/domain/dist/index.js');
    console.log(`Loading domain from ${domainPath}`);
    const domain = await import(domainPath);
    console.log("Domain loaded successfully");

    const { BaselineBotStrategy, createBotContextFromState, isPlayersTurnToBid: isTurnToBid } = domain;
    botStrategy = new BaselineBotStrategy();
    createBotContext = createBotContextFromState;
    isPlayersTurnToBid = isTurnToBid;

    // Process config variables (moved from old setup)
    // Note: We do NOT override context.config.phases here anymore because
    // arrivalCount is now handled by the sed replacement in the bash script
    // and injected directly into the YAML config before Artillery starts.
    // Overriding it here might be causing issues or confusion if vars.arrivalCount
    // is stale or incorrect.
  } catch (error) {
    console.error("Domain initialization failed:", error);
    events.emit("error", error);
    throw error;
  }
}

async function assignPersona(context, events) {
  try {
    const shared = getSharedState();
    if (context.vars.player) {
      return;
    }
    const persona = allocatePersona(shared);
    context.vars.player = {
      displayName: persona.displayName,
      avatarSeed: persona.avatarSeed,
      color: persona.color,
      userId: persona.userId,
    };
    context.vars.personaRole = persona.role;
    context.vars.isHost = persona.role === "host";
    context.vars.personaIndex = persona.index;
    events.emit("log", `persona:${persona.displayName} (${persona.role})`);
  } catch (error) {
    events.emit("error", error);
    throw error;
  }
}

async function createRoomOnce(context, events) {
  try {
    const shared = getSharedState();
    if (shared.gameId) {
      context.vars.gameId = shared.gameId;
      return;
    }

    if (!context.vars.isHost || shared.creatingRoom) {
      await waitForShared("gameId", ROOM_WAIT_TIMEOUT_MS);
      context.vars.gameId = shared.gameId;
      return;
    }

    shared.creatingRoom = true;
    try {
      const apiBase = getApiBaseUrl(context);
      const minPlayers = getNumericVariable(context, "roomMinPlayers", 4);
      const roundCount = getNumericVariable(context, "roomRoundCount", 1);
      const payload = {
        ...context.vars.player,
        minPlayers,
        maxPlayers: minPlayers,
        roundCount,
        isPublic: false,
        botStrategy: process.env.BOT_STRATEGY
      };

      let endpoint = `${apiBase}/api/create-room`;
      if (process.env.ARTILLERY_MCTS_BOTS === "true") {
        endpoint += "?botMode=true";
      }

      const response = await fetchJson(endpoint, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      if (!response?.gameId || !response?.joinCode || !response?.playerToken) {
        throw new Error("create-room response missing required fields");
      }
      shared.gameId = response.gameId;
      shared.joinCode = response.joinCode;
      shared.hostToken = response.playerToken;
      context.vars.gameId = response.gameId;
      events.emit("log", `room:${response.gameId} code:${response.joinCode}`);
    } finally {
      shared.creatingRoom = false;
    }
  } catch (error) {
    events.emit("error", error);
    throw error;
  }
}

async function joinRoom(context, events) {
  try {
    const shared = getSharedState();
    await waitForShared("joinCode", ROOM_WAIT_TIMEOUT_MS);
    const joinCode = String(shared.joinCode ?? "").toUpperCase();
    if (!joinCode) {
      throw new Error("join code missing");
    }

    if (context.vars.isHost) {
      context.vars.gameId = shared.gameId;
      context.vars.playerToken = shared.hostToken;
      return;
    }

    const apiBase = getApiBaseUrl(context);
    const payload = {
      joinCode,
      displayName: context.vars.player.displayName,
      avatarSeed: context.vars.player.avatarSeed,
      color: context.vars.player.color,
      userId: context.vars.player.userId,
    };
    const response = await fetchJson(`${apiBase}/api/join-by-code`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
    if (!response?.playerToken || !response?.gameId) {
      throw new Error("join-by-code response missing fields");
    }
    context.vars.playerToken = response.playerToken;
    context.vars.gameId = response.gameId;
  } catch (error) {
    events.emit("error", error);
    throw error;
  }
}

async function connectWebSocket(context, events) {
  if (!context.vars.gameId || !context.vars.playerToken) {
    const error = new Error("missing credentials for websocket connection");
    events.emit("error", error);
    throw error;
  }

  const MAX_RETRIES = 5;
  let attempt = 0;
  let lastError;

  while (attempt < MAX_RETRIES) {
    attempt++;
    try {
      context.vars.waiters = [];
      context.vars.latestState = null;
      const wsUrl = buildWsUrl(context);

      // Create socket
      const socket = new WebSocket(wsUrl, { perMessageDeflate: false });
      context.vars.socket = socket;

      // Setup message listener immediately to avoid race condition where WELCOME
      // arrives before we await waitForSocketOpen resolution
      socket.on("message", (raw) => handleSocketMessage(context, events, raw));

      // Wait for open
      await waitForSocketOpen(socket);

      // Setup other permanent listeners
      socket.on("error", (error) => {
        // Only emit error if we are past the connection phase (which is handled by waitForSocketOpen)
        // But here we are connected.
        events.emit("error", error);
        rejectWaiters(context, error);
      });
      socket.on("close", (code) => {
        events.emit("log", `ws closed code=${code}`);
      });

      // Setup heartbeat
      const heartbeat = setInterval(() => {
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({ type: "PING", nonce: uuidv4() }));
        }
      }, HEARTBEAT_MS);
      context.vars.heartbeatTimer = heartbeat;

      // Wait for handshake
      await waitForCondition(
        context,
        () => Boolean(context.vars.playerId),
        HANDSHAKE_TIMEOUT_MS,
        "welcome handshake"
      );
      await waitForCondition(
        context,
        () => Boolean(getLatestState(context)),
        HANDSHAKE_TIMEOUT_MS,
        "state sync"
      );

      // Success
      return;

    } catch (error) {
      lastError = error;
      const is504 = error.message && error.message.includes("504");
      const isTimeout = error.message && error.message.includes("Timed out");

      // Log the failure
      events.emit("log", `WebSocket connection attempt ${attempt}/${MAX_RETRIES} failed: ${error.message}`);

      // Clean up failed socket if it exists
      if (context.vars.socket) {
        try {
          context.vars.socket.terminate();
        } catch (e) { /* ignore */ }
        context.vars.socket = null;
      }
      if (context.vars.heartbeatTimer) {
        clearInterval(context.vars.heartbeatTimer);
        context.vars.heartbeatTimer = null;
      }

      // If we have retries left, wait and retry
      if (attempt < MAX_RETRIES) {
        const backoffMs = 1000 * Math.pow(2, attempt - 1) + Math.random() * 1000;
        await setTimeoutPromise(backoffMs);
        continue;
      }
    }
  }

  // If we get here, all retries failed
  events.emit("error", lastError);
  throw lastError;
}

async function performBidding(context, events) {
  try {
    const biddingTimeout = computePhaseAwareTimeout(context, BID_TIMEOUT_MS);
    await waitForCondition(
      context,
      () => {
        const state = getLatestState(context);
        // Allow COMPLETED state to pass through (handle fast games)
        if (state?.phase === "COMPLETED") return true;
        return Boolean(state && (state.phase === "BIDDING" || state.phase === "PLAYING") && state.round);
      },
      biddingTimeout,
      `bidding phase (current: ${getLatestState(context)?.phase})`
    );

    if (getLatestState(context)?.phase === "COMPLETED") {
      events.emit("log", "Game completed before bidding phase (skipping bid)");
      return;
    }

    if (process.env.ARTILLERY_MCTS_BOTS === "true") {
      await waitForCondition(
        context,
        () => getLatestState(context)?.phase === "PLAYING",
        biddingTimeout,
        "bidding complete (phase change)"
      );
      return;
    }

    await waitForCondition(
      context,
      () => {
        const state = getLatestState(context);
        const playerId = context.vars.playerId;
        if (!state?.round || !playerId) {
          return false;
        }
        // Proceed if we have already bid
        if (state.round.bids[playerId] !== null) {
          return true;
        }
        // Proceed if it is our turn
        if (isPlayersTurnToBid) {
          const domainState = { ...state, roundState: state.round };
          if (isPlayersTurnToBid(domainState, playerId)) {
            return true;
          }
        }
        return false;
      },
      biddingTimeout,
      "turn to bid"
    );

    await maybeSubmitBid(context);

    await waitForCondition(
      context,
      () => {
        const state = getLatestState(context);
        const playerId = context.vars.playerId;
        if (!state?.round || !playerId) {
          return false;
        }
        return state.round.bids[playerId] !== null;
      },
      biddingTimeout,
      "bid acknowledgement"
    );

    await waitForCondition(
      context,
      () => getLatestState(context)?.phase === "PLAYING",
      biddingTimeout,
      "bidding complete (phase change)"
    );
  } catch (error) {
    events.emit("error", error);
    throw error;
  }
}

async function performCardPlay(context, events) {
  try {
    const biddingTimeout = computePhaseAwareTimeout(context, BID_TIMEOUT_MS);
    await waitForCondition(
      context,
      () => {
        const state = getLatestState(context);
        return state && (state.phase === "PLAYING" || state.phase === "COMPLETED");
      },
      biddingTimeout,
      "playing phase"
    );

    if (process.env.ARTILLERY_MCTS_BOTS === "true") {
      const timeout = computePhaseAwareTimeout(context, TURN_TIMEOUT_MS * 4);
      await waitForCondition(
        context,
        () => getLatestState(context)?.phase !== "PLAYING",
        timeout,
        "round completion (bot mode)"
      );
    } else {
      await playHand(context, events);
    }
  } catch (error) {
    events.emit("error", error);
    throw error;
  }
}

async function startGame(context, events) {
  if (!context.vars.isHost) {
    return;
  }

  try {
    const minPlayers = getNumericVariable(context, "roomMinPlayers", 4);
    await waitForCondition(
      context,
      () => {
        const state = getLatestState(context);
        const active = state?.players?.filter(p => !p.spectator) ?? [];
        return active.length >= minPlayers;
      },
      ROOM_WAIT_TIMEOUT_MS,
      "all players joined"
    );

    // Check if already started
    const state = getLatestState(context);
    if (state?.phase !== "LOBBY") {
      events.emit("log", "Game already started, skipping START_GAME");
      return;
    }

    if (process.env.ARTILLERY_MCTS_BOTS === "true") {
      // In bot mode, the server might auto-start when bots join.
      // We'll wait a moment to see if it starts, otherwise we force it.
      await setTimeoutPromise(1000);
      const updatedState = getLatestState(context);
      if (updatedState?.phase !== "LOBBY") {
        return;
      }
    }

    // Override ready requirement so we don't have to send SET_READY for everyone
    await sendWsMessage(context, { type: "SET_READY_OVERRIDE", enabled: true });

    // Give a small buffer for the override to propagate
    await setTimeoutPromise(500);

    // Double check phase before sending start
    if (getLatestState(context)?.phase === "LOBBY") {
      await sendWsMessage(context, { type: "START_GAME" });
    }
  } catch (error) {
    events.emit("error", error);
    throw error;
  }
}

async function playScriptedRound(context, events) {
  await performBidding(context, events);
  await performCardPlay(context, events);
}

async function closeSocket(context, events) {
  clearInterval(context.vars.heartbeatTimer);
  const socket = context.vars.socket;
  if (!socket) {
    return;
  }

  await new Promise((resolve) => {
    const finalize = () => {
      socket.removeAllListeners();
      context.vars.socket = null;
      resolve();
    };

    if (socket.readyState === WebSocket.CLOSED) {
      finalize();
      return;
    }

    socket.once("close", finalize);
    socket.once("error", finalize);
    try {
      socket.close(1000, "artillery-run-complete");
    } catch (error) {
      events.emit("error", error);
      finalize();
    }
  });
}

function allocatePersona(shared) {
  const index = shared.personaCursor ?? 0;
  shared.personaCursor = index + 1;

  if (index < personas.length) {
    return { ...personas[index], index };
  }

  return {
    id: `player-${index}`,
    role: "guest",
    displayName: `Player ${index + 1}`,
    avatarSeed: `seed-${index}`,
    color: "#000000",
    userId: `artillery-user-${index}`,
    index,
  };
}

async function waitForShared(key, timeoutMs) {
  const shared = getSharedState();
  const deadline = Date.now() + timeoutMs;
  while (typeof shared[key] === "undefined") {
    if (Date.now() > deadline) {
      throw new Error(`Timed out waiting for shared ${key}`);
    }
    await setTimeoutPromise(25);
  }
  return shared[key];
}

const fetchImpl =
  typeof fetch === "function" ? fetch.bind(globalThis) : undiciFetch;

async function fetchJson(url, options = {}) {
  const headers = { "content-type": "application/json", ...(options.headers ?? {}) };
  if (process.env.IS_LOAD_TEST === "true") {
    headers["X-Test-Traffic"] = "true";
  }
  const response = await fetchImpl(url, {
    ...options,
    headers,
  });
  const text = await response.text();
  const payload = text ? JSON.parse(text) : {};
  if (response.status < 200 || response.status >= 300) {
    throw new Error(
      `Request failed (${response.status}): ${JSON.stringify(payload)}`
    );
  }
  return payload;
}

function getApiBaseUrl(context) {
  return (
    context.config?.variables?.apiBaseUrl ||
    process.env.API_BASE_URL ||
    "http://localhost:4000"
  );
}

function buildWsUrl(context) {
  const base =
    context.config?.variables?.wsUrl ||
    process.env.WS_URL ||
    "ws://localhost:4000/ws";
  const url = new URL(base);
  url.searchParams.set("gameId", context.vars.gameId);
  url.searchParams.set("token", context.vars.playerToken);
  return url.toString();
}

function getNumericVariable(context, key, fallback) {
  const value = context.vars?.[key] ?? context.config?.variables?.[key];
  const parsed = Number(value);
  if (Number.isFinite(parsed)) {
    return parsed;
  }
  return fallback;
}

function coerceNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function waitForSocketOpen(socket) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error("Timed out opening websocket connection"));
    }, HANDSHAKE_TIMEOUT_MS);

    const handleOpen = () => {
      cleanup();
      resolve();
    };

    const handleError = (error) => {
      cleanup();
      reject(error);
    };

    const handleUnexpectedResponse = (req, res) => {
      cleanup();
      reject(new Error(`Unexpected server response: ${res.statusCode}`));
    };

    function cleanup() {
      clearTimeout(timer);
      socket.off("open", handleOpen);
      socket.off("error", handleError);
      socket.off("unexpected-response", handleUnexpectedResponse);
    }

    socket.once("open", handleOpen);
    socket.once("error", handleError);
    socket.once("unexpected-response", handleUnexpectedResponse);
  });
}

function handleSocketMessage(context, events, raw) {
  let payload;
  try {
    payload = JSON.parse(raw.toString());
  } catch (error) {
    events.emit("error", error);
    return;
  }

  switch (payload.type) {
    case "WELCOME":
      context.vars.playerId = payload.playerId;
      context.vars.seatIndex = payload.seatIndex;
      break;
    case "STATE_FULL":
      context.vars.latestState = payload.state;
      break;
    case "GAME_EVENT":
      if (payload.event?.type === "INVALID_ACTION") {
        events.emit(
          "error",
          new Error(`invalid action: ${payload.event.payload?.reason}`)
        );
      }
      break;
    case "TOKEN_REFRESH":
      context.vars.playerToken = payload.token;
      break;
    default:
      break;
  }

  flushWaiters(context);
}

function waitForCondition(context, predicate, timeoutMs, description) {
  const start = Date.now();
  console.log(`[${context.vars.playerId}] Waiting for: ${description} (limit ${timeoutMs}ms)`);

  return new Promise((resolve, reject) => {
    const waiters = context.vars.waiters ?? [];
    context.vars.waiters = waiters;

    // Create interval for progress logging
    const logInterval = setInterval(() => {
      const elapsed = Date.now() - start;
      const state = getLatestState(context);
      console.log(`[${context.vars.playerId}] Still waiting for: ${description} (${elapsed}ms elapsed). Phase: ${state?.phase}`);
    }, 5000);

    const entry = {
      predicate,
      resolve: (val) => {
        clearInterval(logInterval);
        resolve(val);
      },
      reject: (err) => {
        clearInterval(logInterval);
        reject(err);
      },
      description,
      timer: setTimeout(() => {
        cleanup(entry, false);
        clearInterval(logInterval);

        // Detailed debug logging on timeout
        const state = getLatestState(context);
        const debugInfo = {
          phase: state?.phase,
          roundIndex: state?.round?.roundIndex,
          trickIndex: state?.round?.trickInProgress?.trickIndex ?? state?.round?.completedTricks?.length,
          myTurn: isPlayersTurnNow(state, context.vars.playerId),
          activePlayers: state?.players?.length,
          lastEvent: context.vars.lastEvent?.type
        };
        console.error(`[${context.vars.playerId}] Timeout waiting for: ${description}. State dump:`, JSON.stringify(debugInfo));

        reject(new Error(`Timed out waiting for ${description}`));
      }, timeoutMs),
    };
    waiters.push(entry);

    // Try immediately
    if (tryResolveWaiter(context, entry)) {
      clearInterval(logInterval);
    }
  });
}

function flushWaiters(context) {
  const waiters = context.vars.waiters ?? [];
  context.vars.waiters = waiters.filter(
    (entry) => !tryResolveWaiter(context, entry)
  );
}

function rejectWaiters(context, error) {
  const waiters = context.vars.waiters ?? [];
  context.vars.waiters = [];
  for (const entry of waiters) {
    cleanup(entry, false);
    entry.reject(error);
  }
}

function tryResolveWaiter(context, entry) {
  try {
    if (entry.predicate()) {
      cleanup(entry, true);
      entry.resolve(getLatestState(context));
      return true;
    }
  } catch (error) {
    cleanup(entry, false);
    entry.reject(error);
    return true;
  }
  return false;
}

function cleanup(entry, resolved) {
  clearTimeout(entry.timer);
  if (!resolved) {
    entry.resolved = true;
  }
}



async function playHand(context, events) {
  let safety = 0;
  const turnTimeout = computePhaseAwareTimeout(
    context,
    TURN_TIMEOUT_MS,
    10_000
  );
  while ((getLatestState(context)?.hand?.length ?? 0) > 0) {
    safety += 1;
    if (safety > 20) {
      throw new Error("Exceeded expected trick count");
    }

    await waitForCondition(
      context,
      () => isPlayersTurnNow(getLatestState(context), context.vars.playerId),
      turnTimeout,
      "turn to play"
    );

    const state = getLatestState(context);

    if (!createBotContext || !botStrategy) {
      throw new Error("Domain logic not initialized");
    }

    const botContext = createBotContext(state, context.vars.playerId);
    const card = await botStrategy.playCard(state.hand || [], botContext);

    const beforeSize = state.hand?.length ?? 0;
    await sendWsMessage(context, { type: "PLAY_CARD", cardId: card.id });
    await waitForCondition(
      context,
      () => {
        const latest = getLatestState(context);
        const hand = latest?.hand ?? [];
        const stillHasCard = hand.some((c) => c.id === card.id);
        return hand.length === beforeSize - 1 && !stillHasCard;
      },
      turnTimeout,
      `card ${card.id} resolution`
    );
    events.emit("log", `played:${card.id}`);
  }
}

function getLatestState(context) {
  return context.vars.latestState ?? null;
}

function isPlayersTurnNow(state, playerId) {
  if (!state?.round || !playerId) {
    return false;
  }
  // We can't use domain.getTurnOrder because we don't have it imported as a helper
  // But we can just use the simple logic here or import it too.
  // Let's import it in setup if we want to be strict, or just keep the logic if it matches.
  // The logic here seems to match the domain logic.

  const order = (state.players ?? [])
    .filter((player) => player.seatIndex !== null && !player.spectator)
    .sort((a, b) => (a.seatIndex ?? 0) - (b.seatIndex ?? 0))
    .map((player) => player.playerId);

  if (order.length === 0) {
    return false;
  }
  const round = state.round;
  const trick = round.trickInProgress;

  // Determine leader
  let leaderId = null;
  if (round.trickInProgress?.leaderPlayerId) {
    leaderId = round.trickInProgress.leaderPlayerId;
  } else {
    const last = round.completedTricks?.[round.completedTricks.length - 1];
    if (last?.winningPlayerId) {
      leaderId = last.winningPlayerId;
    } else if (round.startingPlayerId) {
      leaderId = round.startingPlayerId;
    } else {
      leaderId = order[0] ?? null;
    }
  }

  if (!trick || trick.plays.length === 0) {
    return leaderId === playerId;
  }
  const currentLeader = trick.leaderPlayerId ?? leaderId;
  const leaderIndex = order.indexOf(currentLeader);
  if (leaderIndex === -1) {
    return false;
  }
  const expectedIndex = (leaderIndex + trick.plays.length) % order.length;
  return order[expectedIndex] === playerId;
}

function sendWsMessage(context, payload) {
  return new Promise((resolve, reject) => {
    const socket = context.vars.socket;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      reject(new Error("socket is not open"));
      return;
    }
    socket.send(JSON.stringify(payload), (error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}
