# PlayerList Component Usage Guide

The `PlayerList` component displays all players in a game with their current status, scores, and bids. It provides visual cues for the current player, dealer, and game state.

## Basic Usage

```tsx
import { PlayerList } from '@/components/game/PlayerList';
import type { PlayerInGame, PlayerId } from '@game/domain';

function GameScreen() {
  const players: PlayerInGame[] = [
    {
      playerId: '1' as PlayerId,
      profile: { displayName: 'Alice' },
      isBot: false,
      status: 'active',
    },
    {
      playerId: '2' as PlayerId,
      profile: { displayName: 'Bob' },
      isBot: false,
      status: 'active',
    },
  ];

  const scores = {
    '1': 25,
    '2': 18,
  };

  return (
    <PlayerList
      players={players}
      currentPlayerId="2"
      dealerPlayerId="1"
      you="2"
      scores={scores}
      bids={{ '1': 3, '2': 2 }}
    />
  );
}
```

## Props Reference

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `players` | `PlayerInGame[]` | ✓ | Array of player objects with profile, status, and bot information |
| `currentPlayerId` | `PlayerId \| null` | ✓ | ID of the player whose turn it is. Use `null` when no current turn |
| `dealerPlayerId` | `PlayerId \| null` | ✓ | ID of the current dealer. Use `null` when no dealer |
| `you` | `PlayerId \| null` | ✓ | ID of the current user. Use `null` for spectator mode |
| `scores` | `Record<PlayerId, number>` | ✓ | Object mapping player IDs to their current scores |
| `bids` | `Record<PlayerId, number \| null>` | ✗ | Optional object mapping player IDs to their bids (use `null` if not bid yet) |

## Key Features

### 🎯 Current Player Highlight
The current player's card gets a special highlight with a primary border and shadow to clearly indicate whose turn it is:

```tsx
// Highlight player 2 as current turn
<PlayerList
  players={players}
  currentPlayerId="2"
  // ... other props
/>
```

### 🏆 Role Badges
The component automatically displays role badges based on the game state:

```tsx
// Alice sees "You" badge, Bob is highlighted as current turn
const players: PlayerInGame[] = [
  {
    playerId: '1' as PlayerId,
    profile: { displayName: 'Alice' },
    isBot: false,
    status: 'active',
  },
  {
    playerId: '2' as PlayerId,
    profile: { displayName: 'Bob' },
    isBot: false,
    status: 'active',
  },
];

<PlayerList
  players={players}
  currentPlayerId="2"  // Bob's turn
  dealerPlayerId="1"   // Alice is dealer
  you="1"              // Alice is viewing
  scores={{ '1': 25, '2': 18 }}
/>
```

**Badges displayed:**
- **You**: Shows when a player is the current user
- **Dealer**: Shows the current round's dealer
- **Bot**: Indicates AI players
- **Status**: Shows player status (waiting, ready, disconnected, etc.)

### 📊 Score Display
Scores are always visible in the top-right corner of each player card:

```tsx
// Scores will show as "Score: 25", "Score: 18", etc.
const scores = {
  '1': 25,
  '2': 18,
  '3': 32,
  '4': 21,
};
```

### 🃏 Bid Display
Bids are shown alongside scores when provided:

```tsx
// Will show score and bid for each player
<PlayerList
  players={players}
  scores={{ '1': 25, '2': 18 }}
  bids={{
    '1': 3,    // Alice bid 3
    '2': null  // Bob hasn't bid yet
  }}
/>
```

**Display behavior:**
- Shows "Bid: X" when a bid exists
- Shows nothing when bid is `null` (player hasn't bid)
- Shows nothing when no bids object is provided

## Game State Scenarios

### 🚀 Game Setup - Waiting for Players
```tsx
const players: PlayerInGame[] = [
  {
    playerId: '1',
    profile: { displayName: 'Alice' },
    isBot: false,
    status: 'active',    // Player is ready and active
  },
  {
    playerId: '2',
    profile: { displayName: 'Bob' },
    isBot: false,
    status: 'waiting',   // Player is waiting to join
  },
  {
    playerId: '3',
    profile: { displayName: 'Charlie' },
    isBot: false,
    status: 'disconnected',
  },
];

<PlayerList
  players={players}
  currentPlayerId={null}  // No current turn during setup
  dealerPlayerId={null}   // No dealer assigned yet
  you="1"
  scores={players.reduce((acc, p) => ({ ...acc, [p.playerId]: 0 }), {})}
/>
```

### 🤖 Bot Games
```tsx
const players: PlayerInGame[] = [
  {
    playerId: '1',
    profile: { displayName: 'You' },
    isBot: false,
    status: 'active',
  },
  {
    playerId: '2',
    profile: { displayName: 'BotAlice' },
    isBot: true,  // AI player
    status: 'active',
  },
];
```

### 🎲 Your Turn - Interactive State
```tsx
// Current player is you - show your turn
<PlayerList
  players={players}
  currentPlayerId="2"  // "You" player's ID
  dealerPlayerId="1"
  you="2"              // Your player ID
  scores={{ '1': 18, '2': 25 }}
  bids={{
    '1': 3,
    '2': null  // You haven't bid yet - emphasizes your turn
  }}
/>
```

## Responsive Design

The component is fully responsive and works well on all screen sizes:

- **Desktop**: Full layout with badges and detailed information
- **Tablet**: Maintains full functionality with slight layout adjustments
- **Mobile**: Condensed layout that stacks well within game interfaces

## Error Handling

The component gracefully handles edge cases:

```tsx
// Missing players
<PlayerList
  players={[]}
  currentPlayerId={null}
  dealerPlayerId={null}
  you={null}
  scores={{}}
/>

// Player not found in scores/bids (defaults to 0)
<PlayerList
  players={players}
  scores={{ '1': 25 }}  // Player 2 will show Score: 0
  bids={{ '1': 3 }}     // Player 2 will have no bid display
/>

// Null/undefined values for game state
<PlayerList
  players={players}
  currentPlayerId={null}  // No current turn highlight
  dealerPlayerId={null}   // No dealer badge
  you={null}              // No "You" badges
  scores={scores}
/>
```

## Best Practices

### 1. Always Include Scores
```tsx
// ✅ Good - Always provides scores
<PlayerList
  players={players}
  scores={players.reduce((acc, p) => ({ ...acc, [p.playerId]: getPlayerScore(p.playerId) }), {})}
  // ... other props
/>
```

### 2. Use Null for Missing Game State
```tsx
// ✅ Good - Uses null for unknown states
<PlayerList
  players={players}
  currentPlayerId={gameState.currentPlayerId} // Can be null
  dealerPlayerId={gameState.dealerPlayerId}   // Can be null
  you={currentUser?.playerId || null}         // Can be null
  scores={scores}
/>
```

### 3. Dynamic Bids Based on Game Phase
```tsx
// ✅ Good - Show bids only during bidding phase
const showBids = gameState.phase === 'bidding' || gameState.phase === 'playing';

<PlayerList
  players={players}
  currentPlayerId={currentPlayerId}
  dealerPlayerId={dealerPlayerId}
  you={currentUserId}
  scores={scores}
  bids={showBids ? currentBids : undefined}
/>
```

### 4. Keep Player Names Concise
```tsx
// ✅ Good - Reasonable display names
const players = [
  { playerId: '1', profile: { displayName: 'Alice' } },
  { playerId: '2', profile: { displayName: 'Bob' } },
];

// 🚫 Avoid very long names
createMockPlayer('1', 'Sir Alexander Wellington III, Duke of Nottinghamshire');
```

## Integration Example

Here's a complete integration example showing how to use PlayerList in a game context:

```tsx
function GameTable() {
  const { gameState, currentUser } = useGame();

  // Transform game data for PlayerList
  const players = gameState.players.map((player, index) => ({
    playerId: player.id,
    profile: { displayName: player.name },
    isBot: player.isBot,
    status: player.status,
  }));

  const scores = gameState.players.reduce((acc, player) => {
    acc[player.id] = player.score;
    return acc;
  }, {} as Record<PlayerId, number>);

  const isBiddingPhase = gameState.phase === 'bidding' || gameState.phase === 'playing';

  return (
    <div className="game-layout">
      <PlayerList
        players={players}
        currentPlayerId={gameState.currentPlayerId}
        dealerPlayerId={gameState.dealerPlayerId}
        you={currentUser?.id || null}
        scores={scores}
        bids={isBiddingPhase ? gameState.currentBids : undefined}
      />
      <!-- Other game components -->
      <Scorecard
        players={players.map(p => ({ id: p.playerId, name: p.profile.displayName }))}
        currentRoundIndex={gameState.currentRoundIndex}
        rounds={gameState.rounds}
        totals={scores}
      />
    </div>
  );
}
```

## Common Use Cases

| Scenario | currentPlayerId | dealerPlayerId | you | bids |
|----------|----------------|----------------|-----|------|
| **Setup Phase** | `null` | `null` | Current user ID | `{}` or `undefined` |
| **Your Turn** | Your player ID | Any player ID | Your player ID | Current round bids |
| **Spectator Mode** | Current player | Current dealer | `null` | Current round bids |
| **Betting Phase** | Current player | Current dealer | Current user ID | `{ [playerId]: number \| null }` |
| **Results Viewing** | `null` | Current dealer | Current user ID | Final round bids |
| **Bot Game** | Current bot player | Current dealer | `null` | Current round bids |