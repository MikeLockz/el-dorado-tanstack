# 2A — Lobby View Specification
Version: 1.0
Status: Final
Owner: Frontend Engineering
Last Updated: 2025-11-24

---

## 1. Purpose & Success Criteria

Define the end-to-end product and technical requirements for the lobby view that appears immediately after a room is created or joined but before the first round begins. Success is measured by:
- Host sees a valid join code and invite controls within 500 ms of first `STATE_FULL` hydration.
- No host can advance to BIDDING until the minimum seat count and readiness guardrails are satisfied.
- Guests can signal readiness in <200 ms UI latency and recover seamlessly after refresh/reconnect.
- Telemetry proves at least 90% of players copy/share from the lobby when playing private games within two weeks of launch.

## 2. Scope & Non-Goals

### In Scope
- Host, guest, and spectator UX inside `/game/$gameId` while `game.phase === 'LOBBY'`.
- Storage/rendering of join codes + immutable snapshot of the chosen game settings (see `1A - Game settings.md`).
- Ready-up workflow, spectator seat requests, host-only bot fill triggers, and start button gating.
- Accessibility, localization, performance, telemetry, testing, rollout, and operational expectations.

### Out of Scope
- Visual design tokens, typography, or iconography (inherit from shadcn/ui system tokens).
- Mid-game settings changes (covered elsewhere) or server-side state machine constraints (see `03 — Domain Model & State Machine Specification.md`).
- Matchmaking queue UI, social overlays, or profile editing flows.

## 3. Personas & Roles

| Persona | Capabilities | Constraints |
| --- | --- | --- |
| Host | Can invite, kick, fill bots, override readiness once minPlayers reached, start game. | Only one host per room; must remain connected for start control. |
| Guest (seat) | Can ready/unready, view invite code, leave room. | Cannot start game or add bots. |
| Spectator | Can view lobby, request seat, copy join link. | No ready toggle or start permissions until seat assigned. |
| Bot placeholder | Occupies seat, flagged `player.type === 'BOT'`. | Controlled server-side; host can remove. |

## 4. Entry & Exit Paths

| Path | Trigger | Data Required | Notes |
| --- | --- | --- | --- |
| Host create | `POST /api/create-room` | `{ gameId, playerToken, joinCode }` | Redirect to `/game/$gameId`; store token + join code locally. |
| Join by code | `POST /api/join-by-code` | `joinCode` | Server returns `{ gameId, playerToken }`; same redirect flow. |
| Deep link | `/game/$gameId` with stored `playerToken` | localStorage entry | Rehydrate using stored join code + request `STATE_FULL`. |

Exit conditions:
- Transition to `game.phase === 'BIDDING'` after successful `START_GAME` acknowledgement.
- Player leaves via AppLayout menu → clears token & join code for that game.
- Host disbands room (future) → lobby emits destructive toast, then navigator redirects home.

## 5. Functional Requirements

| Requirement | Details | Acceptance |
| --- | --- | --- |
| Lobby gating | Route shows Lobby shell until `game.phase !== 'LOBBY'`. | Route swap occurs within one render after phase change. |
| Invite surfacing | Show join code (monospace), copy/share buttons, external invite link, QR placeholder. | Copy button shows success toast + telemetry event. |
| Player readiness | Each seat displays ready pill + timestamp; host sees aggregate message “Waiting for N players”. | Ready toggle optimistically updates UI while awaiting WS echo. |
| Seat management | Empty seats render placeholders; host sees kick menu per occupied seat; spectators see “Request seat”. | Kick action asks confirmation modal. |
| Bot fill | Host can add/remove bots until `maxPlayers`. | Mutation disabled while pending; success updates store via `GAME_EVENT`. |
| Start gating | “Start game” enabled only when `currentPlayers >= minPlayers` AND (all ready OR host override toggle). | On click, button enters loading state until server ack. |
| Persistence | Join code + ready states survive refresh & tab restore. | `useLobbyMetadata` hydrates state from storage before first WS message. |

## 6. UX & Layout Requirements

### 6.1 Desktop Layout

```
+-----------------------------------------------------------+
| Header (AppLayout)                                        |
+----------------+---------------------------+--------------+
| Player List    | Lobby Summary             | Invite Card  |
| (shared comp)  | - Game settings badges    | - Join code  |
|                | - Readiness banner        | - Share link |
+----------------+---------------------------+--------------+
| Bot Controls (host only)  | Ready/Start Button Row        |
+-----------------------------------------------------------+
```

Mobile order: Invite Card → Summary → Player List → Controls, each in its own `Stack` with 16px gaps.

### 6.2 Panels & Microcopy
- **Invite Card**: `Copy join code`, `Copy link`, optional `Show QR` placeholder (wired later). Use sentence case microcopy such as “Copied join code”.
- **Lobby Summary**: Show min/max players, round count, scoring variant, privacy badge, host name, and timer info. Differences from defaults receive pill badges.
- **Player List**: Extend shared component with readiness dots (`green` ready, `amber` connecting) and spectator badge chips.
- **Controls Row**:
  - Host: `Start game`, `Fill with bots`, `Override ready check` checkbox, `Disband room` (future, disabled).
  - Guest: `Ready up` switch + `Leave lobby` text button.
  - Spectator: `Request seat` button disabled when no seats.

### 6.3 Copy & Feedback
- Plain-language sentences, no ALL CAPS.
- Toasts reuse existing `useToast`. Success copy: “Copied join code”. Error: “Room is full — try another code”.
- Inline alerts follow shadcn `Alert` component with `variant="destructive"` for blocking issues.

## 7. Data, State & Persistence Contracts

| Source | Field | Usage |
| --- | --- | --- |
| HTTP `createRoom` | `joinCode` | Persist via `storeJoinCode(gameId, joinCode)` helper (new). |
| `GameStore.game.phase` | string | Gate lobby UI. |
| `GameStore.game.settings` | `GameSettings` | Render summary + diff badges referencing doc 1A. |
| `GameStore.game.players` | `ClientPlayer[]` | Seats + readiness, includes bot flag + spectator roles. |
| WebSocket `GAME_EVENT` | `PLAYER_READY`, `PLAYER_UNREADY`, `BOT_ADDED`, `BOT_REMOVED`, `PLAYER_KICKED` | Update `lobby.readyState` + `players`. |

### 7.1 Store Extensions

```ts
type PlayerReadyState = Record<PlayerId, { ready: boolean; updatedAt: number }>;

interface LobbySlice {
  joinCode?: string;
  readyState: PlayerReadyState;
  overrideReadyRequirement: boolean;
}

interface GameStore {
  lobby: LobbySlice;
  setLobbyJoinCode: (gameId: string, joinCode: string) => void;
  setPlayerReadyState: (playerId: PlayerId, ready: boolean) => void;
}
```

Persist join code in `localStorage` under `lobbyJoinCode:${gameId}` and hydrate through `useLobbyMetadata(gameId)` before opening the WebSocket.

## 8. Network & API Contracts

### 8.1 HTTP
- `POST /api/create-room` → `{ gameId, playerToken, joinCode, settings }` (existing; ensure join code forwarded to client).
- `POST /api/join-by-code` → `{ gameId, playerToken }`; lobby fetch requests join code from server if not cached.
- `POST /api/games/:gameId/bots` → body `{ count?: number }` (default fill single seat). Response returns updated `ClientGameView` subset.
- `DELETE /api/games/:gameId/players/:playerId` for host kicks.

### 8.2 WebSocket Events
- `STATE_FULL`: includes `phase`, `gameConfig`, `players`, `joinCode?`. Client reconciles join code fallback here.
- `GAME_EVENT` payloads:
  - `PLAYER_READY` `{ playerId }`
  - `PLAYER_UNREADY` `{ playerId }`
  - `PLAYER_JOINED/LEFT`
  - `BOT_ADDED/BOT_REMOVED`
  - `LOBBY_MESSAGE` for informational toasts (kicks, approvals).
- `SERVER_ERROR` codes: `ROOM_FULL`, `TOKEN_EXPIRED`, `BOT_LIMIT_REACHED`, `REQUEST_INVALID`.

## 9. Interaction Flows

### 9.1 Host Flow
1. After redirect, `useLobbyMetadata` hydrates stored join code and sets `loading=true` placeholders.
2. First `STATE_FULL` merges seats + join code, enabling copy buttons.
3. Host can optionally press `Fill with bots` (calls HTTP mutation, disabled until promise settles).
4. When `currentPlayers >= minPlayers`, start button label changes to “Waiting for players ready”.
5. Once all players ready OR override toggled, button becomes primary; click sends `{ type: 'START_GAME' }` WS command.
6. On ack, lobby transitions to BIDDING route section.

### 9.2 Guest Flow
1. `Ready up` switch toggles optimistic state + logs `lobby.ready.toggle`.
2. WS echo reconciles final state; mismatch triggers warning toast.
3. Kick event triggers modal with `Leave lobby` CTA that clears tokens and returns home.

### 9.3 Spectator Flow
- Spectators display badge + disable ready toggle; `Request seat` sends `{ type: 'REQUEST_SEAT' }` event, expecting host approval event.

### 9.4 Error Flow
- Missing join code triggers inline skeleton + “Re-request invite” button that replays `REQUEST_STATE` command.
- Token mismatch opens modal instructing rejoin; confirm clears `playerToken:${gameId}` and navigates `/join` prefilled with `joinCode` if available.

## 10. Component Specifications

| Component | Responsibility | Props / Notes |
| --- | --- | --- |
| `LobbyInviteCard` | Join code + share actions. | Props `{ gameId, joinCode, isPublic, onCopyCode, onCopyLink }`. Emits telemetry on copy. |
| `LobbySummaryPanel` | Render settings summary & readiness banner. | Accepts `GameSettings`, `readyCount`, `minPlayers`, `maxPlayers`. Memoize derived badges. |
| `PlayerList` | Seat grid with ready indicators. | Extend with `renderSeatFooter` and `showSpectatorBadge`. |
| `LobbyControls` | Buttons + toggles per role. | Props include `role`, `canStart`, `isStarting`, `isReady`, callbacks. |
| `BotFillButton` | Host quick-fill action. | TanStack Query mutation with optimistic concurrency guard. |
| `ReadyToggle` | Shared switch for guests. | `aria-role="switch"`, optional `cooldownMs` to debounce toggles. |

## 11. Loading & Skeleton States

- Before first `STATE_FULL`, render shimmering placeholders for Invite and Summary cards; `PlayerList` shows 4 skeleton rows.
- Join code skeleton uses `XXXXXX` characters with 40% opacity pulsing.
- Ready button row shows ghost buttons disabled; copy actions suppressed until join code resolves.

## 12. Error & Guardrail Handling

| Error | Trigger | UX Response |
| --- | --- | --- |
| `ROOM_FULL` | Guest tries to join full room. | Destructive toast + redirect to `/join` with code prefilled. |
| `TOKEN_EXPIRED` | Stored token rejected. | Modal describing expiration + “Rejoin” button clearing storage. |
| `BOT_LIMIT_REACHED` | Host tries to exceed `maxPlayers`. | Inline error under Bot button + disable for 3s. |
| `REQUEST_DENIED` | Seat request denied. | Informational toast “Host declined your seat request”. |
| Network drop | WS closed unexpectedly. | Banner “Reconnecting…” with spinner; disable start/ready controls. |

## 13. Telemetry & Observability

Use `recordUiEvent` helper (extend if needed) with schema `{ event: string; metadata: Record<string, string | number | boolean>; }`.
- `lobby.invite.copied`
- `lobby.link.copied`
- `lobby.ready.toggle`
- `lobby.start.clicked`
- `lobby.botfill.requested`
- `lobby.request-seat`

Attach `{ gameId, playerId, seatIndex, readyState, currentPlayers }` where available. Log feature flag state to correlate adoption.

## 14. Accessibility & Internationalization

- Focus order: Invite → Summary → Player List → Controls; enforce via DOM order on mobile.
- Join code uses `<code>` block + copy button reachable via keyboard; includes aria-label “Copy join code”.
- Ready toggle uses `role="switch"` and `aria-checked` binding; Provide `aria-live="polite"` message for gating banner.
- Ensure color-coded readiness also has icon + text for WCAG contrast.
- Strings reside in `i18n/lobby.json` namespace: `lobby.copyCode`, `lobby.ready`, `lobby.waitingForPlayers`, etc. Default locale English.

## 15. Performance & Resilience

- Target <16 ms re-render for lobby components; memoize derived badges and readiness counts.
- Debounce ready toggles by 200 ms to avoid WS spam; queue final state if user toggles rapidly.
- Use TanStack Store selectors to scope re-renders to `lobby` slice; `LobbyInviteCard` only rerenders when join code changes.
- Handle reconnection by replaying `REQUEST_STATE` and rehydrating join code from storage.

## 16. Testing Strategy

| Layer | Coverage | Notes |
| --- | --- | --- |
| Unit | `LobbyInviteCard.test.tsx` verifying copy + skeleton fallback. | Mock Clipboard + toast. |
| Unit | `useLobbyMetadata.test.ts` ensures hydration + storage write-through. | Use `vi.useFakeTimers()` for TTL logic. |
| Unit | `LobbyControls.test.tsx` verifying gating logic for host/guest roles. | Snapshot button states. |
| Integration | `GameStore.lobby.test.ts` ensures ready-state reducer merges WS events. | Feed sample `GAME_EVENT`s. |
| Integration | `PlayerList` renders ready dots + spectator badges. | Visual regression via Storybook screenshot diff. |
| E2E | `lobby-host-flow.spec.ts` ensures host copies code + cannot start early. | Playwright multi-tab. |
| E2E | `lobby-ready-gate.spec.ts` ensures readiness gating works across reconnect. | Force refresh mid-test. |

## 17. Rollout Plan

1. Behind feature flag `VITE_SHOW_LOBBY_VIEW` (build-time env + runtime guard in router).
2. QA internally (feature flag true for dev/staging). Validate telemetry + error flows.
3. Gradual enablement: 10% → 50% → 100% of production users; monitor drop-off + `SERVER_ERROR` counts.
4. Remove legacy auto-start behavior once >95% of flagged traffic completes games without lobby errors for 7 days.

## 18. Acceptance Criteria & Open Questions

### Acceptance Checklist
- [ ] Join code + invite actions functional for host + guests.
- [ ] Ready toggles persisted + reflected after reconnect.
- [ ] Host start gating prevents premature bidding.
- [ ] Bot fill limited to `maxPlayers` and minPlayers guard maintained.
- [ ] Telemetry + feature flag wiring complete.

### Open Questions (Resolved)
1. Should join code appear in AppLayout header? → No; lobby-only to limit clutter.
2. Can host start without unanimous readiness once `minPlayers` met? → Yes, host override toggle default-off but available once minimum seats filled.
3. Bot fill granularity? → Host can add or remove any number of bots up to 10 players; game still requires `minPlayers` humans/bots to start.
