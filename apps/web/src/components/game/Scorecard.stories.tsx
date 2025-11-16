import type { Meta, StoryObj } from '@storybook/react';
import { Scorecard } from './Scorecard';
import type { ScoreRound } from './Scorecard';

const meta: Meta<typeof Scorecard> = {
  title: 'Game/Scorecard',
  component: Scorecard,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component: 'A comprehensive scorecard component for tracking game rounds, bids, and scores across all players.',
      },
    },
    a11y: {
      element: 'table',
    },
  },
  argTypes: {
    rounds: {
      description: 'Array of round data including bids, tricks won, and score deltas',
      control: 'object',
    },
    totals: {
      description: 'Cumulative scores for each player',
      control: 'object',
    },
    players: {
      description: 'Array of player objects with id and name',
      control: 'object',
    },
    currentRoundIndex: {
      description: 'The current active round index (0-based)',
      control: 'number',
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

// Mock player data
const mockPlayers = [
  { id: '1', name: 'Alice' },
  { id: '2', name: 'Bob' },
  { id: '3', name: 'Charlie' },
  { id: '4', name: 'Diana' },
];

// Helper to create consistent round data
const createRound = (index: number, cardsPerPlayer: number, completed: boolean): ScoreRound => ({
  roundIndex: index,
  cardsPerPlayer,
  bids: {
    '1': completed ? Math.floor(Math.random() * (cardsPerPlayer + 1)) : null,
    '2': completed ? Math.floor(Math.random() * (cardsPerPlayer + 1)) : null,
    '3': completed ? Math.floor(Math.random() * (cardsPerPlayer + 1)) : null,
    '4': completed ? Math.floor(Math.random() * (cardsPerPlayer + 1)) : null,
  },
  tricksWon: completed ? {
    '1': Math.floor(Math.random() * (cardsPerPlayer + 1)),
    '2': Math.floor(Math.random() * (cardsPerPlayer + 1)),
    '3': Math.floor(Math.random() * (cardsPerPlayer + 1)),
    '4': Math.floor(Math.random() * (cardsPerPlayer + 1)),
  } : {},
  deltas: completed ? {
    '1': Math.floor(Math.random() * 15) - 7,
    '2': Math.floor(Math.random() * 15) - 7,
    '3': Math.floor(Math.random() * 15) - 7,
    '4': Math.floor(Math.random() * 15) - 7,
  } : {},
});

// Story: Game in Progress - Multiple States
export const GameInProgress: Story = {
  name: 'Game in Progress with Multiple States',
  args: {
    players: mockPlayers,
    currentRoundIndex: 4, // Round 5 is active (0-based index 4)
    totals: {
      '1': 28,
      '2': -15,
      '3': 30,
      '4': 12,
    },
    rounds: [
      createRound(0, 10, true),  // Round 10 - completed
      createRound(1, 9, true),   // Round 9 - completed
      createRound(2, 8, true),   // Round 8 - completed
      createRound(3, 7, true),   // Round 7 - completed
      createRound(4, 6, false),  // Round 6 - active (no delta yet, only bids)
      createRound(5, 5, false),  // Round 5 - upcoming
      createRound(6, 4, false),  // Round 4 - upcoming
      createRound(7, 3, false),  // Round 3 - upcoming
      createRound(8, 2, false),  // Round 2 - upcoming
      createRound(9, 1, false),  // Round 1 - upcoming
    ],
  },
};

// Story: Early Game - First Round Active
export const EarlyGame: Story = {
  name: 'Early Game - First Round Active',
  args: {
    players: mockPlayers,
    currentRoundIndex: 0, // Round 1 (10 cards) active (0-based index 0)
    totals: {
      '1': 0,
      '2': 0,
      '3': 0,
      '4': 0,
    },
    rounds: [
      {
        roundIndex: 0,
        cardsPerPlayer: 10,
        bids: {
          '1': Math.floor(Math.random() * 11),
          '2': Math.floor(Math.random() * 11),
          '3': Math.floor(Math.random() * 11),
          '4': Math.floor(Math.random() * 11),
        },
        tricksWon: {}, // Not known yet
        deltas: {},   // Not known yet
      },
      createRound(1, 9, false),  // Round 9 - upcoming
      createRound(2, 8, false),  // Round 8 - upcoming
      createRound(3, 7, false),  // Round 7 - upcoming
      createRound(4, 6, false),  // Round 6 - upcoming
      createRound(5, 5, false),  // Round 5 - upcoming
      createRound(6, 4, false),  // Round 4 - upcoming
      createRound(7, 3, false),  // Round 3 - upcoming
      createRound(8, 2, false),  // Round 2 - upcoming
      createRound(9, 1, false),  // Round 1 - upcoming
    ],
  },
};

// Story: Late Game - Highest Bids
export const LateGame: Story = {
  name: 'Late Game - Highest Card Count',
  args: {
    players: mockPlayers,
    currentRoundIndex: 1, // Round 9 active (0-based index 1)
    totals: {
      '1': 45,
      '2': 32,
      '3': -8,
      '4': 21,
    },
    rounds: [
      createRound(0, 10, true),   // Round 10 - completed
      {
        roundIndex: 1,
        cardsPerPlayer: 9,
        bids: {
          '1': Math.floor(Math.random() * 10),
          '2': Math.floor(Math.random() * 10),
          '3': Math.floor(Math.random() * 10),
          '4': Math.floor(Math.random() * 10),
        },
        tricksWon: {}, // In progress
        deltas: {},   // In progress
      },
      createRound(2, 8, false),  // Round 8 - upcoming
      createRound(3, 7, false),  // Round 7 - upcoming
      createRound(4, 6, false),  // Round 6 - upcoming
      createRound(5, 5, false),  // Round 5 - upcoming
      createRound(6, 4, false),  // Round 4 - upcoming
      createRound(7, 3, false),  // Round 3 - upcoming
      createRound(8, 2, false),  // Round 2 - upcoming
      createRound(9, 1, false),  // Round 1 - upcoming
    ],
  },
};

// Story: Completed Game - All Rounds Done
export const CompletedGame: Story = {
  name: 'Completed Game - All Rounds Finished',
  args: {
    players: mockPlayers,
    currentRoundIndex: 10, // All rounds completed
    totals: {
      '1': 78,
      '2': 65,
      '3': -22,
      '4': 39,
    },
    rounds: Array.from({ length: 10 }, (_, i) => createRound(i, 10 - i, true)).sort((a, b) => a.roundIndex - b.roundIndex),
  },
};

// Story: Two Players - Minimal Layout
export const TwoPlayers: Story = {
  name: 'Two Players - Simple Layout',
  args: {
    players: [
      { id: '1', name: 'Alice' },
      { id: '2', name: 'Bob' },
    ],
    currentRoundIndex: 5, // Round 5 active
    totals: {
      '1': 15,
      '2': -12,
    },
    rounds: [
      createRound(0, 10, true),  // Round 10 - completed
      createRound(1, 9, true),   // Round 9 - completed
      createRound(2, 8, true),   // Round 8 - completed
      createRound(3, 7, true),   // Round 7 - completed
      createRound(4, 6, true),   // Round 6 - completed
      createRound(5, 5, false),  // Round 5 - active
      createRound(6, 4, false),  // Round 4 - upcoming
      createRound(7, 3, false),  // Round 3 - upcoming
      createRound(8, 2, false),  // Round 2 - upcoming
      createRound(9, 1, false),  // Round 1 - upcoming
    ],
  },
};

// Story: Large Game - Many Players
export const ManyPlayers: Story = {
  name: 'Six Players - Large Game',
  args: {
    players: [
      { id: '1', name: 'Alice' },
      { id: '2', name: 'Bob' },
      { id: '3', name: 'Charlie' },
      { id: '4', name: 'Diana' },
      { id: '5', name: 'Ethan' },
      { id: '6', name: 'Fiona' },
    ],
    currentRoundIndex: 3, // Round 7 active
    totals: {
      '1': 18,
      '2': 25,
      '3': -10,
      '4': 42,
      '5': 36,
      '6': -8,
    },
    rounds: [
      createRound(0, 10, true),  // Round 10 - completed
      createRound(1, 9, true),   // Round 9 - completed
      createRound(2, 8, true),   // Round 8 - completed
      createRound(3, 7, false),  // Round 7 - active
      createRound(4, 6, false),  // Round 6 - upcoming
      createRound(5, 5, false),  // Round 5 - upcoming
      createRound(6, 4, false),  // Round 4 - upcoming
      createRound(7, 3, false),  // Round 3 - upcoming
      createRound(8, 2, false),  // Round 2 - upcoming
      createRound(9, 1, false),  // Round 1 - upcoming
    ],
  },
};

// Story: High Score Competition
export const HighScoreCompetition: Story = {
  name: 'High Stakes - Large Scores',
  args: {
    players: mockPlayers,
    currentRoundIndex: 2, // Round 8 active
    totals: {
      '1': 125,
      '2': 98,
      '3': 142,
      '4': -45,
    },
    rounds: [
      createRound(0, 10, true),  // Round 10 - completed with high scores
      createRound(1, 9, true),   // Round 9 - completed with high scores
      createRound(2, 8, false),  // Round 8 - active (high card count = higher potential scores)
      createRound(3, 7, false),  // Round 7 - upcoming
      createRound(4, 6, false),  // Round 6 - upcoming
      createRound(5, 5, false),  // Round 5 - upcoming
      createRound(6, 4, false),  // Round 4 - upcoming
      createRound(7, 3, false),  // Round 3 - upcoming
      createRound(8, 2, false),  // Round 2 - upcoming
      createRound(9, 1, false),  // Round 1 - upcoming
    ],
  },
};

// Story: Empty State - Game Loading (Shows skeleton)
export const EmptyState: Story = {
  name: 'Empty State - Skeleton Loading',
  args: {
    players: mockPlayers,
    currentRoundIndex: 0,
    totals: {
      '1': 0,
      '2': 0,
      '3': 0,
      '4': 0,
    },
    rounds: [], // Empty rounds triggers skeleton loading state
  },
  parameters: {
    docs: {
      description: {
        story: 'Displays a skeleton loading state showing 10 placeholder rounds when no game data is available. This provides visual feedback while the game is being set up.',
      },
    },
  },
};

// Story: No Players - Complete Empty State
export const NoPlayers: Story = {
  name: 'No Players - Complete Empty Skeleton',
  args: {
    players: [],
    currentRoundIndex: 0,
    totals: {},
    rounds: [],
  },
  parameters: {
    docs: {
      description: {
        story: 'Shows skeleton loading state when no players have been added yet. The scorecard waits for players to be configured before showing the 10-round structure.',
      },
    },
  },
};

// Story: Single Round - Only Current Round
export const SingleRound: Story = {
  name: 'New Game - Only Active Round',
  args: {
    players: mockPlayers,
    currentRoundIndex: 0, // Only round active
    totals: {
      '1': 0,
      '2': 0,
      '3': 0,
      '4': 0,
    },
    rounds: [
      {
        roundIndex: 0,
        cardsPerPlayer: 10,
        bids: {
          '1': 3,
          '2': 2,
          '3': 4,
          '4': 1,
        },
        tricksWon: {}, // Not known yet
        deltas: {},   // Not known yet
      },
    ],
  },
};

// Story: Narrow Viewport - Responsive Scaling
export const NarrowViewport: Story = {
  name: 'Narrow Viewport (Under 500px) - Scaled Down',
  args: {
    ...GameInProgress.args,
  },
  parameters: {
    docs: {
      description: {
        story: 'Displays the scorecard in a narrow viewport (380px wide) to demonstrate the responsive scaling behavior. The component automatically scales down proportionally when the container width is under 500px, maintaining exact proportions of text, spacing, and layout elements.',
      },
    },
    viewport: {
      defaultViewport: 'narrowScorecard',
      viewports: {
        narrowScorecard: {
          name: 'Narrow Scorecard (380px)',
          styles: {
            width: '380px',
            height: '800px',
          },
        },
      },
    },
  },
};