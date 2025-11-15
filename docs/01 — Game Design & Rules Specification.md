# 01 — Game Design & Rules Specification
Version: 1.0  
Status: Final  
Owner: Engineering + Game Design  
Last Updated: YYYY-MM-DD  

---

# 1. Overview

This document defines the official rules, mechanics, scoring, round structure, and player lifecycle for **El Dorado**, the trick-taking card game implemented by this project. It serves as the game's authoritative rulebook and is used by engineering, QA, and designers to validate correctness across the engine, UI, bots, and replay system.

This document intentionally contains **no technology details**. All implementation aspects are covered in other specs (domain model, protocol, engine, etc.).

---

# 2. Session Structure

A full game session consists of **10 rounds**.

Each round deals a decreasing number of cards according to:

| Round | Cards Per Player (`tricksForRound(r)`) |
|-------|----------------------------------------|
| 1     | 10                                     |
| 2     | 9                                      |
| 3     | 8                                      |
| …     | …                                      |
| 10    | 1                                      |

All rounds must be played; there is **no early termination** and no “best of” variations.

---

# 3. Number of Players & Deck Usage

## 3.1 Player Count  
- Minimum: **2 players**  
- Maximum: **10 players**

## 3.2 Deck Rules  
- For **2–5 players** → Use **one 52-card deck**  
- For **6–10 players** → Use **two 52-card decks** (104 cards)

## 3.3 Reshuffling Rules  
- The deck is **reshuffled at the start of every round**.  
- Shuffle must be **deterministic** based on a per-round seed (defined in Event/Replay Spec).

## 3.4 Duplicate Cards  
When using two decks, duplicates are allowed. There is no special behavior for identical cards (e.g., two Ace of Spades). They are treated independently and tracked by unique card IDs.

---

# 4. Dealing Rules

## 4.1 Deal Order  
1. Shuffle deck deterministically.  
2. Deal cards clockwise starting from the **first seat (seatIndex=0)**.  
3. Deal `tricksForRound(r)` cards to each player.  
4. After dealing, **flip the next card** from the deck to reveal the **trump suit** for that round.

SeatIndex 0 is the dealer for the round. The first player to act (bidding and trick play) is always the seat immediately clockwise from the dealer.

## 4.2 Private Hands  
Hands are secret and visible only to the owning player.

## 4.3 Insufficient Cards  
If for any reason the deck cannot deal the required number of cards (malformed deck, error), the round is invalid and must restart (should never happen in practice due to seed-based determinism).

---

# 5. Trump Rules

## 5.1 Determining Trump  
- The trump suit for each round is determined by flipping the **next undealt card** immediately after dealing hands.
- If using ⬆ 2 decks, any card may determine trump (duplicates acceptable).

## 5.2 Trump Visibility  
- Trump suit is known to all players.

## 5.3 Leading Trump Restriction  
Trump **may not be led** until trump is considered **broken**.

Trump becomes **broken** when:
1. A player is void in the led suit **and**  
2. Plays a trump card instead (sloughing trump)

Once trump is broken:
- Trump may be led freely for the remainder of the round.

---

# 6. Turn Order & Trick Structure

## 6.1 Turn Order  
- Turn order is clockwise by seat index.
- The leader of each trick:
  - For trick 1 → **The player immediately clockwise from the dealer leads**  
  - For trick 2+ → **Winner of the previous trick leads**

## 6.2 Playing a Trick  

A trick consists of exactly one card played by each **active** player.

### Trick Steps:
1. Leader plays a card (subject to leading rules).
2. Each subsequent player, in order:
   - Must **follow the led suit** if possible.
   - May slough **any card** if void in the led suit.
   - May play trump when void.
3. After all players have played one card:
   - Determine trick winner (see section 7)
   - Award trick to that player
   - Next trick begins with winner as leader

---

# 7. Card Ranking & Trick Winner Determination

## 7.1 Rank Ordering  
Aces high:  
**A > K > Q > J > 10 > … > 2**

## 7.2 Winner Determination Rules  
The winner of a trick is:

1. The highest trump card played in the trick  
   **OR**, if no trump has been played:  
2. The highest card played of the **led suit**

This procedure must yield exactly one winner.

## 7.3 Duplicate Cards (Two Deck Mode)  
When identical cards appear:
- They remain distinct via internal identifiers
- If two players play “Ace of Spades”, the card played **earlier in turn order** does **not** win over a later identical card;
- **All cards of equal trick rank are tied**, but ties can only occur between non-trump equal ranks **or** equal trumps of the same rank.
- Tie-breaking rule:  
  The **first played among equals** is considered lower;  
  the **last played among equals** is considered highest.  
(This mirrors common duplicate-handling logic.)

---

# 8. Scoring Rules

## 8.1 Bidding  
The base scoring formula requires players to **bid** how many tricks they expect to win.

Bid UI/flow is defined in the client architecture doc.

Bidding order always starts with the player to the **dealer's left** (clockwise) and continues around the table.

## 8.2 Scoring Formula  
After each round:

scoreDelta = ±(5 + bid)

yaml
Copy code

- If player wins **exactly** their bid → `+(5 + bid)`
- If player **misses** their bid → `-(5 + bid)`  
  (regardless of whether they won more or fewer tricks)

## 8.3 Cumulative Game Score  
Game score is the cumulative total across all 10 rounds.

Multiple players may end tied.

---

# 9. Player Lifecycle, Disconnects, and Spectators

## 9.1 Player Disconnects  
If a player disconnects:
- Their turn timer starts (60 seconds)
- If time expires:
  - They **automatically forfeit their turn**  
  - For trick-taking: the engine plays a **forced-legal card**:
    - Highest valid card of the led suit if possible
    - Otherwise lowest non-trump
    - If only trump remains, lowest trump  
    (Exact fallback sequence defined in the Engine Spec)
- Player remains in game as **inactive**
- They may reconnect later using the same player token

## 9.2 Player Leaves Entirely  
When a player leaves:
- All past rounds and scores remain intact
- Future rounds mark the player as **Absent (“–”)**
- They earn **0** delta for that round
- They remain on the scoreboard
- They may rejoin at any time during the session

## 9.3 Spectators  
- Spectators do not hold cards  
- They may join any public room  
- They see:
  - Trump suit
  - Played cards
  - Scores
  - Trick history
- They **never** see player hands

Spectator actions: none.

---

# 10. Illegal Moves & Rule Violations

Illegal actions must be rejected with an error.

Examples:

- Trying to play out of turn  
- Playing a card not in hand  
- Failing to follow suit when the player has cards of the led suit  
- Leading trump before trump is broken  
- Bidding outside allowed range  
- Attempting to undo moves  
- Using invalid card identifiers  

All illegal moves must return a **structured error code**.

---

# 11. Round End

A round ends when:
- All tricks for that round are completed
- Scores are calculated
- Results are broadcast
- Next round starts automatically unless this was round 10

---

# 12. Game End

After round 10:
- Game enters **Completed** state
- Final scoreboard is displayed
- Game summary is written to storage
- Players may:
  - View scoreboard
  - Replay game via event log
  - Leave room

No new rounds may begin.

---

# 13. Examples & Edge Cases

## 13.1 Example: Leading trump illegally  
- Trump = Hearts  
- No one has played Hearts yet (not broken)  
- Player tries to lead ♥7  
→ **Illegal: “LEADING_TRUMP_BEFORE_BROKEN”**

## 13.2 Example: Duplicate cards  
Two players play Ace of Clubs:
- One from deck A, one from deck B  
→ Higher rank tie → later-played card wins.

## 13.3 Example: Player leaves mid-round  
- Player disconnects after playing their card → trick continues normally  
- Next round: they are marked Absent  
- If they reconnect before bidding, they resume normal play

---

# 14. Glossary

**Trick** — one sequence of card plays where each player plays one card.  
**Sloughing** — discarding a card of a non-led suit when void.  
**Void** — having no cards of the led suit.  
**Trump** — suit that outranks all non-trump cards.  
**Broken** — when trump has been played off-suit.  
**Absent** — player not active in a round but still part of the session.  

---

# 15. Compliance With Other Specs

This document is synchronized with:

- `03-domain-model.md` (data structures)
- `04-event-replay.md` (event sequencing, deterministic behavior)
- `05-protocol-spec.md` (error codes, WS message formats)
- `07-profiles-and-stats.md` (stat definitions)
- `09-client-architecture.md` (UI flow for bidding, play, scoring)

Any future rule changes must be reflected across corresponding specs.

---

# End of Document
