# Game Configuration Settings Implementation Specifications

## Overview

Design a comprehensive per-game settings system for the El Dorado card game that allows hosts to customize gameplay, scoring, bot behavior, and UI preferences before and during games. This specification provides a complete roadmap for implementing configuration settings that will enhance player experience while maintaining the game's core mechanics.

## Codebase Context

Based on codebase analysis, El Dorado is a trick-taking card game with:
- **Three-tier architecture**: domain (TypeScript engine), server (Node.js/WebSocket), web (React/TanStack)
- **Strong existing patterns**: Environment config, game configuration, profile preferences
- **Clean separation**: Domain logic separate from UI, making settings integration straightforward
- **Reactive UI**: TanStack Store provides excellent foundation for dynamic settings updates
- **Bot intelligence**: Strategy pattern makes bot behavior highly configurable

## Core Requirements

### 1. Settings Categories & Options

#### A. Gameplay Rules Configuration
- **Round count**: 5-15 rounds (default: 10)
- **Starting card count**: 1-10 cards (default: 10, decreases by 1 each round)
- **Deck usage**: Single/double deck selection with player count auto-detection
- **Trump selection**: Random per round, fixed suit, host selection, no-trump rounds
- **Bid timing**: Synchronous/asynchronous bidding phases
- **Allow nil bids**: Yes/no with penalty/reward multipliers
- **Overtrick penalties**: Points deducted for exceeding bid

#### B. Scoring & Points Configuration
- **Base trick points**: 1-10 points per trick (default: 1)
- **Exact bid bonus**: Multiplier for hitting bid exactly (1x-5x)
- **Missed bid penalty**: Points deducted per missed trick (0-10)
- **Overtrick penalty**: Negative points per overtrick (0-5)
- **Nil bid reward**: Points for successful nil bid (10-50)
- **Nil bid penalty**: Points lost for failed nil bid (10-50)
- **Comeback bonus**: Extra points for last-place players

#### C. Bot Behavior Configuration
- **Difficulty levels**: Novice, Intermediate, Expert, Custom
- **Bidding aggression**: Conservative, Balanced, Aggressive (0-100 scale)
- **Bluff frequency**: How often bots bluff in bidding (0-100%)
- **Risk tolerance**: Bot willingness to take risky plays (0-100)
- **Learning enabled**: Allow bots to adapt to player patterns
- **Reaction time**: Artificial delay for bot moves (0-3000ms)
- **Team cooperation**: How bots coordinate in team variants

#### D. Game Flow & Timers
- **Turn timer**: 15-120 seconds per turn (0 for no timer)
- **Bid timer**: 30-180 seconds per bid phase
- **Auto-play delay**: Automatically play cards after timeout
- **Round summary duration**: 3-30 seconds between rounds
- **Game pause**: Allow hosts to pause/resume games
- **Spectator mode**: Allow/disallow spectators

#### E. UI & Visual Preferences
- **Card theme**: Classic, Modern, Minimal, Dark mode variants
- **Animation speed**: Slow, Normal, Fast, Disabled
- **Sound effects**: Volume 0-100%, specific sound toggles
- **Card size**: Small, Medium, Large, Auto-fit
- **Show player hands**: Always, Hover-only, Never for spectators
- **Bid history display**: Always visible, Toggleable, Summary only
- **Score display**: Real-time, Round-end only, Toggleable

### 2. Data Model Specifications

#### A. Settings Storage Schema

```typescript
interface GameSettings {
  // Core gameplay
  roundCount: number; // 5-15
  startingCards: number; // 1-10
  deckCount: 'auto' | 1 | 2; // auto based on player count
  trumpSelection: 'random' | 'fixed' | 'host' | 'none';
  allowNilBids: boolean;

  // Scoring
  scoring: {
    baseTrickPoints: number; // 1-10
    exactBidMultiplier: number; // 1x-5x
    missedBidPenalty: number; // 0-10 per trick
    overtrickPenalty: number; // 0-5 per overtrick
    nilBidReward: number; // 10-50
    nilBidPenalty: number; // 10-50
    comebackBonus: boolean;
  };

  // Bot behavior
  bots: {
    enabled: boolean;
    difficulty: 'novice' | 'intermediate' | 'expert' | 'custom';
    biddingAggression: number; // 0-100
    bluffFrequency: number; // 0-100
    riskTolerance: number; // 0-100
    reactionTime: number; // 0-3000ms
  };

  // Timers
  timers: {
    turnTimer: number; // 0-120 seconds (0 = disabled)
    bidTimer: number; // 30-180 seconds
    autoPlayDelay: number; // 0-30 seconds
    roundSummaryDuration: number; // 3-30 seconds
  };

  // Visual
  visual: {
    cardTheme: 'classic' | 'modern' | 'minimal' | 'dark';
    animationSpeed: 'slow' | 'normal' | 'fast' | 'disabled';
    soundVolume: number; // 0-100
    cardSize: 'small' | 'medium' | 'large' | 'auto';
    showSpectatorHands: 'always' | 'hover' | 'never';
  };

  // Game flow
  flow: {
    allowPause: boolean;
    allowSpectators: boolean;
    showBidHistory: boolean;
    realTimeScoring: boolean;
  };
}
```

#### B. Settings Validation Rules

```typescript
const settingsValidation = {
  roundCount: { min: 5, max: 15 },
  startingCards: { min: 1, max: 10 },
  turnTimer: { min: 0, max: 120 },
  bidTimer: { min: 30, max: 180 },
  scoring: {
    baseTrickPoints: { min: 1, max: 10 },
    exactBidMultiplier: { min: 1, max: 5 },
    missedBidPenalty: { min: 0, max: 10 },
    overtrickPenalty: { min: 0, max: 5 }
  }
};
```

### 3. UI/UX Specifications

#### A. Settings Management Flow
1. Host clicks "Create Game" → Shows settings modal
2. Default settings loaded with tooltips for each option
3. Real-time validation with error messages
4. "Reset to Defaults" button for easy reversion
5. "Save as Template" for future games
6. Preview panel showing game summary with selected settings

#### B. Settings Interface Components
- **Tab-based navigation**: Gameplay, Scoring, Bots, Timers, Visual, Advanced
- **Slider controls**: For numeric ranges with input field alternatives
- **Toggle switches**: For boolean options
- **Radio button groups**: For categorical selections
- **Tooltips**: Contextual help for each setting
- **Preset buttons**: "Quick Game", "Tournament", "Beginner Friendly"

#### C. In-Game Settings Adjustment
- Host-only "Game Settings" button in game menu
- Grayed out options that can't be changed mid-game
- Real-time updates to bot behavior and visual settings
- Confirmation dialogs for scoring changes
- Player notification when settings change

### 4. Persistence & Synchronization

#### A. Storage Strategy

```typescript
interface SettingsStorage {
  // User-specific defaults
  userDefaults: GameSettings;

  // Saved templates
  templates: {
    [templateName: string]: GameSettings;
  };

  // Per-game settings (game_id indexed)
  gameSettings: {
    [gameId: string]: GameSettings;
  };

  // Analytics data
  settingsUsage: {
    settingKey: string;
    value: any;
    usageCount: number;
    lastUsed: Date;
  }[];
}
```

#### B. Synchronization Flow
1. Settings changed → Local validation → WebSocket broadcast
2. Server validates settings against game state
3. If valid: Updates game room settings → Notifies all players
4. If invalid: Rejection with error message → Client reverts
5. Settings changes logged for replay functionality

### 5. Backward Compatibility & Migration

#### A. Default Settings Schema

```typescript
export const DEFAULT_SETTINGS: GameSettings = {
  roundCount: 10,
  startingCards: 10,
  deckCount: 'auto',
  trumpSelection: 'random',
  allowNilBids: false,
  scoring: {
    baseTrickPoints: 1,
    exactBidMultiplier: 2,
    missedBidPenalty: 1,
    overtrickPenalty: 0,
    nilBidReward: 20,
    nilBidPenalty: 20,
    comebackBonus: false
  },
  bots: {
    enabled: true,
    difficulty: 'intermediate',
    biddingAggression: 50,
    bluffFrequency: 20,
    riskTolerance: 50,
    reactionTime: 1000
  },
  timers: {
    turnTimer: 30,
    bidTimer: 60,
    autoPlayDelay: 5,
    roundSummaryDuration: 5
  },
  visual: {
    cardTheme: 'classic',
    animationSpeed: 'normal',
    soundVolume: 70,
    cardSize: 'medium',
    showSpectatorHands: 'hover'
  },
  flow: {
    allowPause: true,
    allowSpectators: true,
    showBidHistory: true,
    realTimeScoring: true
  }
};
```

#### B. Migration Strategy
- Existing games use DEFAULT_SETTINGS
- New games require explicit settings selection
- Gradual rollout with feature flag system
- Analytics tracking for settings adoption

### 6. Performance & Technical Considerations

#### A. Performance Requirements
- Settings UI: <100ms response time
- Settings validation: <50ms
- Settings synchronization: <200ms latency
- Settings storage: <50ms read/write

#### B. Technical Implementation
- Use React Hook Form for settings management
- Implement debounced validation for real-time updates
- Cache settings in TanStack Store for quick access
- Use WebSocket rooms for efficient broadcasting
- Implement optimistic UI updates with rollback on failure

### 7. Accessibility & Internationalization

#### A. Accessibility Requirements
- Keyboard navigation for all settings controls
- Screen reader support with ARIA labels
- High contrast mode support
- Large text mode compliance
- Focus management and visual indicators

#### B. Internationalization
- Settings labels and descriptions in i18n files
- RTL language support
- Numeric formatting for different locales
- Date/time format localization

### 8. Testing Requirements

#### A. Unit Tests
- Settings validation functions
- Settings serialization/deserialization
- Settings merge and diff algorithms
- Individual setting component behavior

#### B. Integration Tests
- Settings persistence across sessions
- Settings synchronization in multiplayer
- Settings rollback on validation failure
- Settings impact on game mechanics

#### C. E2E Tests
- Complete settings creation and modification flow
- Settings impact on game outcomes
- Settings migration from old to new system
- Cross-browser settings consistency

### 9. Analytics & Telemetry

#### A. Settings Usage Tracking

```typescript
interface SettingsAnalytics {
  settingName: string;
  value: any;
  timestamp: Date;
  gameId: string;
  playerId: string;
  context: 'creation' | 'modification' | 'template';
}
```

#### B. Key Metrics
- Most popular settings combinations
- Settings change frequency
- Settings impact on game duration
- User satisfaction with settings options
- Settings discovery patterns

### 10. Future Extensibility

#### A. Plugin Architecture
- Custom setting validators
- Third-party setting providers
- Settings marketplace for community presets
- Tournament-specific settings packs

#### B. Advanced Features
- Dynamic settings based on player skill levels
- AI-recommended settings based on gameplay patterns
- Seasonal settings variations
- Cross-game settings sharing

## Implementation Priority

### Phase 1 (Core Functionality)
1. Basic settings data model and validation
2. Settings UI for game creation
3. Settings persistence and synchronization
4. Core gameplay settings (rounds, timing, scoring)

### Phase 2 (Enhanced Features)
1. Bot behavior configuration
2. Visual and audio settings
3. Settings templates and presets
4. In-game settings modification

### Phase 3 (Advanced Features)
1. Advanced scoring rules
2. Analytics and telemetry
3. Accessibility features
4. Plugin architecture

## File Location Strategy

### New Files to Create
- `packages/domain/src/types/settings.ts` - Core settings interfaces
- `packages/domain/src/validation/settings.ts` - Validation rules
- `packages/domain/src/settings/defaults.ts` - Default settings
- `apps/web/src/components/settings/` - Settings UI components
- `apps/web/src/store/settingsStore.ts` - Settings state management
- `apps/server/src/services/settingsService.ts` - Settings persistence

### Existing Files to Modify
- `packages/domain/src/types/game.ts` - Add settings to GameConfig
- `apps/web/src/routes/create-game.tsx` - Integrate settings modal
- `apps/server/src/rooms/gameRoom.ts` - Handle settings synchronization
- `apps/web/src/store/gameStore.ts` - Add settings to game state

## Code Examples

### React Hook Form Integration
```typescript
const SettingsForm = () => {
  const { register, handleSubmit, watch, formState: { errors } } = useForm<GameSettings>({
    resolver: zodResolver(settingsSchema),
    defaultValues: DEFAULT_SETTINGS
  });

  const onSubmit = (data: GameSettings) => {
    saveSettings(data);
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <FormField>
        <Label htmlFor="roundCount">Round Count</Label>
        <Input
          type="range"
          id="roundCount"
          {...register('roundCount', { valueAsNumber: true })}
          min="5"
          max="15"
        />
        {errors.roundCount && <ErrorMessage>{errors.roundCount.message}</ErrorMessage>}
      </FormField>
    </form>
  );
};
```

### WebSocket Settings Synchronization
```typescript
// Server-side
socket.on('updateSettings', (settings: GameSettings) => {
  const validation = validateSettings(settings, gameState);
  if (validation.isValid) {
    gameRoom.updateSettings(settings);
    socket.to(gameId).emit('settingsUpdated', settings);
  } else {
    socket.emit('settingsError', validation.error);
  }
});

// Client-side
const updateSettings = (settings: GameSettings) => {
  socket.emit('updateSettings', settings);
  // Optimistic update
  setGameSettings(settings);
};
```

### Settings Validation with Zod
```typescript
import { z } from 'zod';

const scoringSchema = z.object({
  baseTrickPoints: z.number().min(1).max(10),
  exactBidMultiplier: z.number().min(1).max(5),
  missedBidPenalty: z.number().min(0).max(10),
  overtrickPenalty: z.number().min(0).max(5),
  nilBidReward: z.number().min(10).max(50),
  nilBidPenalty: z.number().min(10).max(50),
  comebackBonus: z.boolean()
});

const settingsSchema = z.object({
  roundCount: z.number().min(5).max(15),
  startingCards: z.number().min(1).max(10),
  deckCount: z.union([z.literal('auto'), z.literal(1), z.literal(2)]),
  trumpSelection: z.enum(['random', 'fixed', 'host', 'none']),
  allowNilBids: z.boolean(),
  scoring: scoringSchema,
  // ... other settings
});
```

This comprehensive specification provides a complete roadmap for implementing per-game settings that will dramatically enhance player experience while maintaining the game's core mechanics and performance standards. The modular architecture and clear separation of concerns make this implementation straightforward to integrate with the existing codebase.