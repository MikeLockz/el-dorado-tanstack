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
  setup,
  assignPersona,
  createRoomOnce,
  joinRoom,
  connectWebSocket,
  playScriptedRound,
  closeSocket,
};

function getSharedState() {
  return sharedState;
}

async function setup(context, events) {
  try {
    const vars = context.config?.variables ?? {};
    const duration = coerceNumber(vars.phaseDuration, 60);
    const arrivalCount = coerceNumber(vars.arrivalCount, 4);
    if (Array.isArray(context.config?.phases)) {
      context.config.phases = context.config.phases.map((phase) => ({
        ...phase,
        duration,
        arrivalCount,
      }));
    }
  } catch (error) {
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
      };
      const response = await fetchJson(`${apiBase}/api/create-room`, {
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

  try {
    context.vars.waiters = [];
    context.vars.latestState = null;
    const wsUrl = buildWsUrl(context);
    const socket = new WebSocket(wsUrl, { perMessageDeflate: false });
    context.vars.socket = socket;

    await waitForSocketOpen(socket);

    socket.on("message", (raw) => handleSocketMessage(context, events, raw));
    socket.on("error", (error) => {
      events.emit("error", error);
      rejectWaiters(context, error);
    });
    socket.on("close", (code) => {
      events.emit("log", `ws closed code=${code}`);
    });

    const heartbeat = setInterval(() => {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: "PING", nonce: uuidv4() }));
      }
    }, HEARTBEAT_MS);
    context.vars.heartbeatTimer = heartbeat;

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
  } catch (error) {
    events.emit("error", error);
    throw error;
  }
}

async function playScriptedRound(context, events) {
  try {
    const biddingTimeout = computePhaseAwareTimeout(context, BID_TIMEOUT_MS);
    await waitForCondition(
      context,
      () => {
        const state = getLatestState(context);
        return Boolean(state && state.phase === "BIDDING" && state.round);
      },
      biddingTimeout,
      "bidding phase"
    );

    await maybeSubmitBid(context, events);

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
      () => Boolean(getLatestState(context)?.round?.biddingComplete),
      biddingTimeout,
      "bidding complete"
    );

    await waitForCondition(
      context,
      () => getLatestState(context)?.phase === "PLAYING",
      biddingTimeout,
      "playing phase"
    );

    await playHand(context, events);
  } catch (error) {
    events.emit("error", error);
    throw error;
  }
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
  const persona = personas[index % personas.length];
  shared.personaCursor = index + 1;
  return { ...persona, index };
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
  const response = await fetchImpl(url, {
    headers: { "content-type": "application/json", ...(options.headers ?? {}) },
    ...options,
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
  const value = context.config?.variables?.[key];
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

    function cleanup() {
      clearTimeout(timer);
      socket.off("open", handleOpen);
      socket.off("error", handleError);
    }

    socket.once("open", handleOpen);
    socket.once("error", handleError);
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
  return new Promise((resolve, reject) => {
    const waiters = context.vars.waiters ?? [];
    context.vars.waiters = waiters;
    const entry = {
      predicate,
      resolve,
      reject,
      description,
      timer: setTimeout(() => {
        cleanup(entry, false);
        reject(new Error(`Timed out waiting for ${description}`));
      }, timeoutMs),
    };
    waiters.push(entry);
    tryResolveWaiter(context, entry);
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

async function maybeSubmitBid(context) {
  if (context.vars.bidSubmitted) {
    return;
  }
  const state = getLatestState(context);
  const playerId = context.vars.playerId;
  if (!state?.round || !playerId) {
    return;
  }
  const current = state.round.bids[playerId];
  if (current !== null) {
    context.vars.bidSubmitted = true;
    return;
  }
  const bidValue = selectBidValue(state, context.vars.seatIndex);
  await sendWsMessage(context, { type: "BID", value: bidValue });
  context.vars.bidSubmitted = true;
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
    const card = selectPlayableCard(state);
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

function selectBidValue(state, seatIndex) {
  const cardsPerPlayer = state.round?.cardsPerPlayer ?? 1;
  const safeCap = Math.max(cardsPerPlayer - 1, 0);
  const base = Number.isFinite(seatIndex) ? Math.max(0, seatIndex + 1) : 1;
  return Math.min(safeCap, base);
}

function isPlayersTurnNow(state, playerId) {
  if (!state?.round || !playerId) {
    return false;
  }
  const order = getTurnOrder(state);
  if (order.length === 0) {
    return false;
  }
  const round = state.round;
  const trick = round.trickInProgress;
  const leaderId = determineLeader(round, order);
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

function determineLeader(round, order) {
  if (round.trickInProgress?.leaderPlayerId) {
    return round.trickInProgress.leaderPlayerId;
  }
  const last = round.completedTricks?.[round.completedTricks.length - 1];
  if (last?.winningPlayerId) {
    return last.winningPlayerId;
  }
  if (round.startingPlayerId) {
    return round.startingPlayerId;
  }
  return order[0] ?? null;
}

function getTurnOrder(state) {
  return (state.players ?? [])
    .filter((player) => player.seatIndex !== null && !player.spectator)
    .sort((a, b) => (a.seatIndex ?? 0) - (b.seatIndex ?? 0))
    .map((player) => player.playerId);
}

function selectPlayableCard(state) {
  const hand = state?.hand ?? [];
  if (hand.length === 0) {
    throw new Error("hand is empty");
  }
  const round = state.round;
  if (!round) {
    throw new Error("round data missing");
  }
  const trick = round.trickInProgress;
  if (!trick || trick.plays.length === 0 || !trick.ledSuit) {
    if (!round.trumpSuit || round.trumpBroken) {
      return hand[0];
    }
    const nonTrump = hand.find((card) => card.suit !== round.trumpSuit);
    return nonTrump ?? hand[0];
  }

  const ledSuit = trick.ledSuit;
  const follow = hand.find((card) => card.suit === ledSuit);
  if (follow) {
    return follow;
  }

  if (!round.trumpSuit || round.trumpBroken) {
    return hand[0];
  }

  const nonTrump = hand.find((card) => card.suit !== round.trumpSuit);
  return nonTrump ?? hand[0];
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
