# TrickArea Component Usage Guide

The `TrickArea` component displays the current state of a trick in a card game, showing information about the trick number, trump suit, cards played, and the winning card.

## Installation

```tsx
import { TrickArea } from '@/components/game/TrickArea';
```

## Basic Usage

```tsx
import { TrickArea } from '@/components/game/TrickArea';
import type { TrickState, PlayerInGame, Card } from '@game/domain';

function GameBoard() {
  const trick: TrickState | null = {
    trickIndex: 0,
    leaderPlayerId: 'player1',
    ledSuit: 'hearts',
    plays: [
      {
        playerId: 'player1',
        card: { id: 'card1', rank: 'ace', suit: 'hearts' },
        order: 0,
      },
      {
        playerId: 'player2',
        card: { id: 'card2', rank: 'king', suit: 'hearts' },
        order: 1,
      },
    ],
    winningPlayerId: 'player1',
    winningCardId: 'card1',
    completed: false,
  };

  const players: PlayerInGame[] = [
    {
      playerId: 'player1',
      profile: { displayName: 'Alice' },
      isBot: false,
      status: 'active',
    },
    {
      playerId: 'player2',
      profile: { displayName: 'Bob' },
      isBot: false,
      status: 'active',
    },
  ];

  return (
    <TrickArea
      trick={trick}
      players={players}
      trumpSuit="hearts"
      trumpCard={{ id: 'trump', rank: 'jack', suit: 'hearts' }}
      completedCount={3}
    />
  );
}
```

## Props

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `trick` | `TrickState \| null` | Yes | Current trick state with plays and winner information. Pass `null` when no trick is active. |
| `players` | `PlayerInGame[]` | Yes | Array of players in the game. Used to display player names. |
| `trumpSuit` | `Suit \| null` | Yes | Trump suit for the current round (clubs, diamonds, hearts, spades). Pass `null` for games without trump. |
| `trumpCard` | `Card \| null` | Yes | The card that determines the trump suit. Pass `null` if no specific trump card. |
| `completedCount` | `number` | Yes | Number of completed tricks in the current round. |

## Trick State Structure

The `TrickState` interface contains:

```tsx
interface TrickState {
  trickIndex: number;           // Zero-based index of the trick
  leaderPlayerId: PlayerId;     // ID of the player who led the trick
  ledSuit: Suit | null;         // Suit that was led (determines what others must follow)
  plays: TrickPlay[];           // Array of card plays in order
  winningPlayerId: PlayerId | null;  // ID of the player currently winning
  winningCardId: string | null; // ID of the winning card
  completed: boolean;           // Whether the trick is complete
}

interface TrickPlay {
  playerId: PlayerId;           // Player who played the card
  card: Card;                   // The card that was played
  order: number;                // Order in which the card was played
}

interface Card {
  id: string;                   // Unique identifier for the card
  rank: Rank;                   // Card rank (2-10, jack, queen, king, ace)
  suit: Suit;                   // Card suit (clubs, diamonds, hearts, spades)
}
```

## Common Usage Patterns

### 1. No Active Trick

When no trick is currently in progress:

```tsx
<TrickArea
  trick={null}
  players={players}
  trumpSuit="spades"
  trumpCard={trumpCard}
  completedCount={0}
/>
```

### 2. Trick in Progress

When players are still playing cards:

```tsx
const currentTrick = {
  trickIndex: 2,
  leaderPlayerId: 'player1',
  ledSuit: 'diamonds',
  plays: [
    { playerId: 'player1', card: card1, order: 0 },
    { playerId: 'player2', card: card2, order: 1 },
  ],
  winningPlayerId: 'player2', // Current leader
  winningCardId: 'card2',
  completed: false,
};

<TrickArea
  trick={currentTrick}
  players={players}
  trumpSuit="hearts"
  trumpCard={trumpCard}
  completedCount={5}
/>
```

### 3. Completed Trick

When all players have played and the trick is complete:

```tsx
const completedTrick = {
  trickIndex: 3,
  leaderPlayerId: 'player3',
  ledSuit: 'clubs',
  plays: [
    { playerId: 'player3', card: card1, order: 0 },
    { playerId: 'player4', card: card2, order: 1 },
    { playerId: 'player1', card: card3, order: 2 },
    { playerId: 'player2', card: card4, order: 3 },
  ],
  winningPlayerId: 'player1', // Trick winner
  winningCardId: 'card3',
  completed: true,
};

<TrickArea
  trick={completedTrick}
  players={players}
  trumpSuit="clubs"
  trumpCard={trumpCard}
  completedCount={6}
/>
```

### 4. Game Without Trump

For games that don't use a trump suit:

```tsx
<TrickArea
  trick={trick}
  players={players}
  trumpSuit={null}
  trumpCard={null}
  completedCount={2}
/>
```

## Key Features

### 🎯 Visual Indicators
- **Trick Number**: Shows current trick number (#1, #2, etc.)
- **Trump Information**: Displays current trump suit and trump card
- **Completed Count**: Shows how many tricks have been completed
- **Card Display**: Each played card shows the player name and card notation

### ⚡ Animations
- **Card Pop**: New cards animate in with a bounce effect
- **Winning Glow**: The winning card is highlighted with a glow effect
- **Border Highlight**: Winning card has enhanced border styling

### 🏆 Win Logic Display
- Shows the current winning player and card
- Cards are color-coded when there's a winner
- Border and background styling indicates the winning card

## Styling and Layout

The component uses a glass-morphism design with:
- Rounded corners (`rounded-3xl`)
- Semi-transparent background (`bg-card/70`)
- Subtle border (`border-white/10`)
- Blur backdrop (`backdrop-blur`)
- Shadow effects (`shadow-2xl shadow-black/40`)

### Responsive Design
- Adapts to different screen sizes
- Cards stack vertically on smaller screens
- Maintains readability on mobile devices

## Integration with Game Logic

The TrickArea component accepts the current trick state from your game engine and displays it visually. It doesn't handle game logic itself - it only renders the state it's given.

### Integration Pattern:
```tsx
// Get current trick from game state
const currentTrick = gameState.round?.trickInProgress;
const completedTricks = gameState.round?.completedTricks ?? [];

// Pass to component
<TrickArea
  trick={currentTrick}
  players={gameState.players}
  trumpSuit={gameState.round?.trumpSuit}
  trumpCard={gameState.round?.trumpCard}
  completedCount={completedTricks.length}
/>
```

## Storybook Variants

The component includes comprehensive Storybook stories demonstrating:
- **No Trick Started**: Initial game state
- **Trick in Progress**: Various stages of card play
- **Complete Tricks**: Finished tricks with winners
- **Different Trump Suits**: All four suit variations
- **Mobile Views**: Responsive behavior
- **Animation Effects**: Visual showcase
- **Edge Cases**: No trump, different player counts

Refer to the Storybook stories for interactive examples of all these scenarios.