# 09 — Client Architecture & UI Wiring Specification  
Version: 1.0  
Status: Final  
Last Updated: YYYY-MM-DD  
Owner: Frontend Engineering  

---

# 1. Purpose

This document defines the complete **frontend architecture**, including:

- Tech stack choices (React + TanStack)
- Routing structure
- Global state management model
- WebSocket integration
- Player token persistence
- UI wiring for game state, bidding, card play, and score views
- Handling reconnect, offline events, and error states
- Component organization and rendering flow

It does *not* define visuals or styling—only architecture and behavior.

---

# 2. High-Level Architecture



+-----------------------------------------------+

React App
TanStack Router
-----------------------------------------------
Local Game Store (TanStack Store)
-----------------------------------------------
WebSocketService
+-----------------------------------------------+

---

# 3. Technology Requirements

- **React** (functional components, hooks)
- **TanStack Router** (SSR-aware, file-based routing)
- **TanStack Query** (for all HTTP)
- **TanStack Store** (local state)
- **Vite** (bundling)
- **TypeScript** (strict mode)
- **WebSocket API** (native browser)
- **localStorage** (token persistence)

Optional:
- shadcn/ui for UI components
- SVG card components for cards
- Framer Motion for animations

---

# 4. Routing Structure

Directory example:



/app
/routes
/index.tsx (home)
/new.tsx (create room)
/join.tsx (join by code)
/matchmake.tsx (auto match)
/game.$gameId.tsx (main game view)
/profile.tsx (view/update profile)
/stats.$userId.tsx (player stats)


### Route Behaviors

#### `/`
Shows landing page:  
- Join by code  
- Create game  
- Matchmake  

#### `/new`
Creates a room and navigates to /game/:id.

#### `/join`
Allows entering a join code → navigates after join.

#### `/matchmake`
Auto joins room → navigates.

#### `/game/:gameId`
Main gameplay view.  
This route:
1. Loads playerToken from localStorage  
2. Establishes WebSocket connection  
3. Uses game store to keep in sync  
4. Renders board UI

#### `/profile`
Update displayName / color / avatarSeed.

#### `/stats/:userId`
Queries lifetime stats via HTTP.

---

# 5. Local Game Store

Implemented with **@tanstack/store**.

### Store Shape

```ts
interface GameStore {
  connection: "connecting" | "open" | "closed";
  game: ClientGameView | null;

  setConnection: (state) => void;
  updateGame: (game: ClientGameView) => void;

  pendingActions: ClientAction[];   // optional
  errors: ClientError[];
}

Game Store Rules

Store holds only client-facing data.

Game store is overwritten by each STATE_FULL message.

Incremental events (GAME_EVENT) can be applied incrementally for smoother UI.

6. WebSocket Service

A dedicated hook:

function useGameWebSocket(gameId: string, playerToken: string)


Internally:

Creates new WebSocket(url)

Listens for:

STATE_FULL

GAME_EVENT

TOKEN_REFRESH

ERROR

PONG

Updates store

Reconnects automatically on drop

Reconnect Rules

If WS drops:

Set connection = "closed"

Retry with exponential backoff (max 10s)

If token expired → HTTP refresh then reconnect

On reconnect → send REQUEST_STATE

7. HTTP Service

Wrapper around TanStack Query:

useQuery(['stats', userId], fetchStats)
useMutation(createRoom)
useMutation(joinRoom)
useMutation(updateProfile)


Provides:

Automatic caching

Retry logic

Error boundary integration

8. Token Persistence Model
On room creation / joining:

Store token:

localStorage.setItem(`playerToken:${gameId}`, token)

On loading /game/:id:

Steps:

Retrieve token

If missing → join as spectator

Pass token to WS constructor

On token refresh:

Server sends:

{ type: "TOKEN_REFRESH", token }


Client replaces stored value.

9. UI Data Flow

Server → WS → GameStore → React Components

Rendering Flow Example
WebSocket → STATE_FULL
           ↓
GameStore.update()
           ↓
<GamePage> re-renders →
  <Hand />
  <PlayerList />
  <TrickArea />
  <Scoreboard />
  <BiddingUI />


All components receive minimal slices of store through selectors:

const hand = useGameStore(s => s.game?.self.hand);

10. Game UI Structure
10.1 Game Layout (Phone Portrait)
+---------------------------------------+
|  Opponents Panel (players list)       |
+---------------------------------------+
|  Trick View (center)                  |
+---------------------------------------+
|  Trump Indicator + Round Info         |
+---------------------------------------+
|  Your Hand (scroll or grid)           |
+---------------------------------------+

11. Component Breakdown
/components
  GamePage.tsx
  Hand.tsx
  Card.tsx
  TrickArea.tsx
  TrumpBadge.tsx
  PlayerList.tsx
  Scoreboard.tsx
  BiddingModal.tsx
  ConnectionStateBanner.tsx
  ErrorToast.tsx

11.1 Hand.tsx

Displays interactive cards

Calls send({ type: 'PLAY_CARD', cardId }) on click

Disabled UI if:

Not your turn

Illegal move obvious client-side

11.2 BiddingModal.tsx

Displays when:

game.phase === "BIDDING"


Allows selecting a bid from 0 to cardsPerPlayer.

Sends:

{ type: 'BID', value }

11.3 TrickArea.tsx

Shows:

Current trick’s cards played so far

Past trick ghost animations (optional)

11.4 PlayerList.tsx

Shows:

All players

Connected/disconnected icons

Score

Trick wins

Highlight for current player

12. Client Validation (Optional)

Client may perform soft validation:

Ensure user owns card before sending

Ensure phase is PLAYING before playing card

Ensure legal bid range

Client NEVER enforces rules; server remains authoritative.

13. Error Handling

Display toast for:

{ type: "ERROR", code, message }


Client should:

Not crash

Highlight misplays

Optionally vibrate device on invalid move (mobile)

14. Performance Considerations

Prefer SVG icons for cards

Minimize re-renders using store selectors

Avoid large diffing: STATE_FULL replaces all state

Offload animations to CSS or requestAnimationFrame

Smooth transitions for trick completion

15. Offline & Reconnection

If network drops:

Show banner (“Disconnected — retrying…”)

Disable hand buttons

Attempt reconnect automatically

On success:

Fetch fresh state via REQUEST_STATE

Resume game seamlessly

16. Spectator Mode

When spectator:

Hand view hidden

No clickable components

Trick view & scoreboard visible

“Spectator” badge displayed

Spectator → Player transitions allowed if seat opens (future).

17. QA & Developer Tools

Client should include optional tools:

Event Log Console (devtools only)

Connection Diagnostics Overlay

Ping/Pong latency display

Replay Viewer (future)

Bot test mode UI

Toggle by localStorage flag:

localStorage.debugGameUI = "true"

18. Security & Abuse Prevention

Do not trust client actions

Validate actions server-side

Sanitize profile fields before display

Prevent excessive localStorage writes

Secure WebSocket URL

19. Compliance With Other Docs

This document integrates with:

03-domain-model.md

05-protocol-spec.md

08-bots.md

10-observability.md

Any changes must update this spec accordingly.

