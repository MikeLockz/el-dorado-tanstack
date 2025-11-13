# 08 — Bot / AI Behavior Specification  
Version: 1.0  
Status: Final  
Last Updated: YYYY-MM-DD  
Owner: Engineering  

---

# 1. Purpose

This document defines the behavior, architecture, and integration points of **Bots** (AI players). Bots serve two roles:

1. **Gameplay bots**  
   - Fill empty seats so games can start quickly  
   - Participate like real players with identical rules  
   - Deterministic behavior (seed-based)

2. **Testing bots**  
   - Simulate players for automated load tests  
   - Simulate players for replay regression testing  
   - Used by QA and CI environments

Bots must follow ALL rules with the same constraints as human players, using only information available to a player at their seat.

---

# 2. Bot Principles & Requirements

## 2.1 Bots must be deterministic  
Given:
- `sessionSeed`
- `roundSeed`
- `botIndex`
- Event history

Bots must always make the **same** decisions.

## 2.2 Bots cannot cheat  
Bots have access only to:
- Their own hand  
- Public information (tricks, scores, trump, bids)  
- Historical events  
- PRNG seeded for this bot  

Bots CANNOT access:
- Other players' hands  
- Future deck order  
- Full game state

## 2.3 Bot decisions must be fast  
Bots must respond within a few milliseconds to avoid impacting turn timers.

## 2.4 Bots are players  
- Represented in the same `players` table and `PlayerInGame`
- Join seats
- Included in event logs
- Bidding and playing generate the same events as human players

## 2.5 Bots automatically forfeit if server requires fallback  
Bot fallback rules match human fallback rules.

---

# 3. Bot Architecture

Three layers:

+------------------------+
| BotManager (server) | ← Creates bots, assigns seats
+------------------------+
|
v
+------------------------+
| BotController | ← Makes decisions when asked
+------------------------+
|
v
+------------------------+
| BotStrategy (pure) | ← deterministic decision logic
+------------------------+

yaml
Copy code

---

# 4. When Bots Are Created

Bots are inserted under these conditions:

1. **Matchmaking**  
   - Matchmaking autostarts when 4 players are present  
   - If fewer than 4 players exist, bots fill remaining seats  
   - Example: 2 humans join → 2 bots added → 4-player game begins  

2. **Testing & Load Mode**  
   - Engineers/CI can spawn rooms that are entirely bot-driven  
   - Controlled via env flag or admin command  

3. **Manual UI action (future)**  
   - “Add bot to table” button  

---

# 5. Bot Identity & Profile Rules

Bots get persistent entries in the `players` table:

display_name: "Bot <n>"
avatar_seed: "bot:<n>"
color: "#5566ff" // default accent
is_bot: true

yaml
Copy code

`userId` is optional or generated as `"bot:<uuid>"`.

---

# 6. Bot Decision Model

Bot actions include:

1. **Bidding**
2. **Playing a card**

Bot decisions must be purely functional and deterministic.

BotStrategy functions:

```ts
interface BotStrategy {
  bid(hand: Card[], context: BotContext): number;
  playCard(hand: Card[], context: BotContext): Card;
}
7. Bot Context Model
Bots receive only non-private information:

ts
Copy code
interface BotContext {
  roundIndex: number;
  cardsPerPlayer: number;

  trumpSuit: Suit | null;
  trumpBroken: boolean;

  trickIndex: number;
  currentTrick: TrickStateClient | null;

  playedCards: Card[];               // flat list of past trick cards
  bids: Record<PlayerId, number|null>;

  cumulativeScores: Record<PlayerId, number>;
  myPlayerId: PlayerId;

  rng: () => number;                 // seeded PRNG
}
Bots should not receive:

Other players’ hands

Future deck contents

8. Bot Bidding Strategy
Goal: simple, predictable, deterministic.

Step 1: Evaluate hand strength
Count:

Number of trump cards

Number of high cards in non-trump suits (A, K, Q)

Suit distribution

Step 2: Compute expected tricks
Example heuristic:

cpp
Copy code
expectedTricks =
    trumpCount
  + highCards/2
  + (voidable suits bonus)
  + rng() * 0.5  // small deterministic variation
Step 3: Clamp to legal bid range
ini
Copy code
bid = clamp(round(expectedTricks), 0, cardsPerPlayer)
Step 4: Anti-moonshot rule (optional)
If bid equals cardsPerPlayer (too risky), reduce by 1.

Step 5: Ensure deterministic output
No randomness outside rng().

9. Bot Trick-Playing Strategy
Goal: simple but legal, without cheating.

Rules:
Must follow suit
If bot has the led suit:

Play lowest card of led suit unless:

Bot can win trick cheaply using next-lowest of that suit

If void in led suit:

If high-value trump exists AND beneficial → play lowest trump

Otherwise slough lowest non-trump

Avoid wasting high trump
If trump unbroken:

Do NOT play trump unless forced
(unless rng decides a rare exception)

Avoid winning big tricks with unnecessary high cards
If trick is already likely unwinnable:

Play lowest-value card

If winning the trick is possible cheaply:

Play lowest card that wins the trick

Endgame tactics (future extension)
Strategy can be enhanced without changing signature.

Determinism Constraint
Any “random” branching must be:

scss
Copy code
rng() < threshold
Where rng is seeded deterministically.

10. Turn Timer for Bots
Bots respond instantly (<10ms).
However, they must obey global 60s turn timer.

Bot turn flow:

Engine notifies BotController when it’s a bot’s turn

BotController computes move synchronously

BotController sends WS-style internal message:

bash
Copy code
{ type: "PLAY_CARD", playerId, cardId }
Engine validates and applies

No actual WebSocket is needed inside process.

11. Bot Integration with Event Log
Bots generate the same events as real players:

PLAYER_JOINED

PLAYER_BID

CARD_PLAYED

TRICK_COMPLETED

Bot actions appear in replays identically.

12. Bot Seeding
Each bot receives a private PRNG:

ini
Copy code
botSeed = hash(sessionSeed + ":bot:" + seatIndex)
Or, if multiple bots share seatIndex over time:

ini
Copy code
botSeed = hash(sessionSeed + ":bot:" + playerId)
BotContext receives:

ini
Copy code
rng = seededRandom(botSeed + roundIndex + trickIndex)
This ensures:

Each bot has unique but deterministic personality

Replay matches original decisions exactly

13. Testing Bots
13.1 Load Testing Mode
CI can create 100% bot rooms via:

bash
Copy code
POST /api/create-room?botMode=true
Bots simulate all seats.

13.2 Speed Testing
Bots play:

All bids instantly

All plays instantly

No UI or timers

Entire game completes in <200ms

13.3 Replay Stability Testing
Tests must assert:

diff
Copy code
replayGame(eventLog) === finalGameState
Bot behavior must match original exactly.

14. Bot Failure Modes
Bots must never:

Play illegal cards

Bid illegally

Crash the engine

If a bot makes an illegal decision:

The engine rejects the move

BotController computes fallback decision

Record misplay? Optional.

15. Future Bot Enhancements
This spec supports future complexity:

Defensive play

Predictive bids

Opponent modeling

Neural net pluggability

Multiple difficulty tiers

Randomized personalities (deterministic categories)

Tournament-grade bots

Enhancements MUST remain deterministic.

16. Compliance Requirements
Bots must not have access to hidden information.

Bots must adhere strictly to deterministic seeded randomness.

Bots must emit the same events as humans.

Bot code must never mutate GameState directly; only engine may.

