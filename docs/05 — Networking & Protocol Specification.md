# 05 — Networking & Protocol Specification  
Version: 1.0  
Status: Final  
Last Updated: YYYY-MM-DD  
Owner: Engineering  

---

# 1. Purpose

This document defines the **public API contract** between client and server. It includes:

- HTTP endpoints (lobby, matchmaking, profiles, stats)
- WebSocket connection lifecycle
- WebSocket message types (client → server, server → client)
- Validation and error codes
- Rate limiting and spam protection
- Security requirements (JWT, auth flow)

This specification must be followed exactly by both backend and frontend.

---

# 2. Transport Overview

- **HTTP (REST-like)** using TanStack Start server functions:
  - Room creation
  - Join by code
  - Matchmaking
  - Profile updates
  - Stats retrieval

- **WebSocket (stateful)**:
  - Real-time game actions
  - Full state updates
  - Game events
  - Ping/pong connection monitoring

---

# 3. Authentication Model

## 3.1 Player Token (JWT)

Every player connecting to a room is issued a **JWT** that encodes:

{
playerId: string,
gameId: string,
seatIndex?: number, // null for spectators
isSpectator: boolean,
exp: number
}

markdown
Copy code

Signed with server secret (HS256).

## 3.2 Storage

- Client stores token in **localStorage** as:
localStorage.setItem("playerToken:<gameId>", token)

csharp
Copy code

## 3.3 Token Use

- Sent as a query parameter when initiating WS connection:
/ws?gameId=...&token=...

yaml
Copy code
- Also sent in HTTP calls where needed.

## 3.4 Token Expiration & Renewal

- Token may expire mid-game
- Server issues a new token via:
- `SERVER_MESSAGE: TOKEN_REFRESH { token }`
- Client replaces stored version silently

---

# 4. HTTP API

All HTTP endpoints are JSON.

**Base URL:** `/api/*`

---

## 4.1 POST /api/create-room

### Request
{
"displayName": "string",
"avatarSeed": "string",
"color": "string",
"maxPlayers": number, // optional
"minPlayers": number, // optional
"isPublic": boolean // default true
}

shell
Copy code

### Response
{
"gameId": "uuid",
"joinCode": "6char",
"playerToken": "jwt"
}

yaml
Copy code

---

## 4.2 POST /api/join-by-code

### Request
{
"joinCode": "6char",
"displayName": "string",
"avatarSeed": "string",
"color": "string"
}

shell
Copy code

### Response
{
"gameId": "uuid",
"playerToken": "jwt"
}

yaml
Copy code

### Errors
- `ROOM_NOT_FOUND`
- `ROOM_FULL`
- `INVALID_JOIN_CODE`

---

## 4.3 POST /api/matchmake

### Request
{
"displayName": "string",
"avatarSeed": "string",
"color": "string"
}

shell
Copy code

### Response
{
"gameId": "uuid",
"playerToken": "jwt"
}

yaml
Copy code

### Behavior
- Fills existing public room until seat count hits **4**
- If none available → creates new room

---

## 4.4 POST /api/update-profile

### Request
{
"displayName"?: string,
"avatarSeed"?: string,
"color"?: string
}

shell
Copy code

### Response
{ "ok": true }

yaml
Copy code

Broadcasts `PROFILE_UPDATED` WS event.

---

## 4.5 GET /api/player-stats?userId=...

### Response
{
"profile": { ... },
"lifetime": {
"gamesPlayed": number,
"gamesWon": number,
"highestScore": number,
"lowestScore": number,
...
}
}

yaml
Copy code

---

# 5. WebSocket Protocol

**URL:**  
`wss://<host>/ws?gameId=<id>&token=<jwt>`

---

# 6. WebSocket Connection Lifecycle

1. Client connects with gameId + token
2. Server authenticates JWT
3. Server attaches connection to player entry
4. Server sends initial:
{ "type": "WELCOME", "playerId": "...", "gameId": "..." }

arduino
Copy code
5. Server sends:
{ "type": "STATE_FULL", "state": ClientGameView }

yaml
Copy code
6. Connection stays open until:
- Player quits
- Network fails
- Server restart
7. Ping/Pong periodically (client sends PING)

---

# 7. Client → Server Messages

All client messages have the form:

{
"type": "SOME_TYPE",
...payload
}

yaml
Copy code

Validate `type` and full schema server-side.

---

## 7.1 PLAY_CARD

{
"type": "PLAY_CARD",
"cardId": "CardId"
}

yaml
Copy code

Validation:
- Must be player's turn
- Must own card
- Must satisfy follow-suit
- Must not lead trump unless broken

---

## 7.2 BID

{
"type": "BID",
"value": number
}

yaml
Copy code

Validation:
- Only valid during bidding phase
- Value within allowed range

---

## 7.3 UPDATE_PROFILE

{
"type": "UPDATE_PROFILE",
"displayName"?: string,
"avatarSeed"?: string,
"color"?: string
}

yaml
Copy code

---

## 7.4 REQUEST_STATE

{ "type": "REQUEST_STATE" }

yaml
Copy code

Server sends `STATE_FULL`.

---

## 7.5 PING

{
"type": "PING",
"nonce": string
}

arduino
Copy code

Server replies with:
{ "type": "PONG", "nonce": "...", "ts": <serverTime> }

yaml
Copy code

---

# 8. Server → Client Messages

All server messages have:

{
"type": "SOME_TYPE",
...payload
}

yaml
Copy code

---

## 8.1 WELCOME

{
"type": "WELCOME",
"playerId": "...",
"gameId": "...",
"seatIndex": 0 | null,
"isSpectator": boolean
}

yaml
Copy code

---

## 8.2 STATE_FULL

Main sync message.

{
"type": "STATE_FULL",
"state": ClientGameView
}

yaml
Copy code

Sent on:
- Connect
- Trick update
- Card played
- Bidding update
- Round transitions
- Score updates

---

## 8.3 GAME_EVENT

Mirrors event log, but filtered as needed.

Example:
{
"type": "GAME_EVENT",
"event": {
"type": "CARD_PLAYED",
"payload": { ... }
}
}

yaml
Copy code

---

## 8.4 TOKEN_REFRESH

{
"type": "TOKEN_REFRESH",
"token": "jwt"
}

yaml
Copy code

---

## 8.5 ERROR

{
"type": "ERROR",
"code": "INVALID_CARD",
"message": "You cannot play that card."
}

yaml
Copy code

Codes defined in section 10.

---

## 8.6 PONG

{
"type": "PONG",
"nonce": "...",
"ts": number
}

yaml
Copy code

---

# 9. Rate Limiting & Spam Protection

### 9.1 Per-Message Validation
Every message must validate schema; invalid → disconnect.

### 9.2 Action Rate Limits
- Max 5 actionable messages per 5 seconds.
- Excess → temporary mute or disconnect.

### 9.3 Invalid Move Strike System
- 3 invalid actions → kick from game.

### 9.4 Spectators  
- Allowed: `REQUEST_STATE`, `PING`  
- Disallowed: `PLAY_CARD`, `BID`, `UPDATE_PROFILE`

---

# 10. Error Codes

| Code                           | Meaning                                       |
|-------------------------------|-----------------------------------------------|
| INVALID_CARD                 | Card not owned or invalid                    |
| NOT_YOUR_TURN                | Action rejected                               |
| MUST_FOLLOW_SUIT             | Follow-suit violation                         |
| CANNOT_LEAD_TRUMP            | Trump not broken                              |
| INVALID_BID                  | Bid outside range                             |
| INVALID_PHASE                | Action not allowed in current phase          |
| ROOM_FULL                    | Room has max players                          |
| ROOM_NOT_FOUND               | No room for joinCode                          |
| INVALID_TOKEN                | JWT invalid                                   |
| RATE_LIMIT                   | Too many actions                              |
| INTERNAL_ERROR               | Unexpected server error                       |

---

# 11. Connection Recovery

If the client refreshes:

1. Uses localStorage token
2. Calls `/api/validate-token`
3. If valid → reconnects directly to WS
4. Server sends `STATE_FULL`

If invalid:
- Client joins as spectator with default profile until reidentified

---

# 12. TLS Requirements

- All WS and HTTP must be served over TLS
- No mixed content allowed
- Fly.io auto-manages certificates

---

# 13. Compliance

This protocol ties directly to:
- 03-domain-model.md  
- 04-event-replay.md  
- 09-client-architecture.md  
- 12-roadmap.md  

Any updates require synchronized changes.
