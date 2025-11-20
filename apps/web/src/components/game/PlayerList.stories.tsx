import type { Meta, StoryObj } from '@storybook/react';
import { PlayerList } from './PlayerList';
import type { PlayerInGame, PlayerId } from '@game/domain';

const meta: Meta<typeof PlayerList> = {
  title: 'Game/PlayerList',
  component: PlayerList,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component: 'A player list component that displays all players in a game with their current status, scores, and bids. Shows player roles (You, Dealer, Bot), turn indicators, and game state information.',
      },
    },
  },
  argTypes: {
    players: {
      description: 'Array of player objects with profile information and status',
      control: 'object',
    },
    currentPlayerId: {
      description: 'ID of the player whose turn it currently is',
      control: 'text',
    },
    dealerPlayerId: {
      description: 'ID of the dealer for this round',
      control: 'text',
    },
    you: {
      description: 'ID of the current user (to show "You" badge)',
      control: 'text',
    },
    scores: {
      description: 'Record mapping player IDs to their current scores',
      control: 'object',
    },
    bids: {
      description: 'Optional record mapping player IDs to their bids for the current round',
      control: 'object',
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

// Mock player data
const createMockPlayer = (id: string, displayName: string, isBot = false, status: PlayerInGame['status'] = 'active', seatIndex: number | null = parseInt(id) - 1): PlayerInGame => ({
  playerId: id as PlayerId,
  seatIndex,
  profile: {
    displayName,
    avatarSeed: `${displayName.toLowerCase()}-seed`,
    color: ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD'][parseInt(id) % 6] || '#6C5CE7',
  },
  isBot,
  status,
  spectator: false,
});

// Story: Active Game - Multiple Players
export const ActiveGame: Story = {
  name: 'Active Game - 4 Players with Current Turn',
  args: {
    players: [
      createMockPlayer('1', 'Alice'),
      createMockPlayer('2', 'Bob'),
      createMockPlayer('3', 'Charlie'),
      createMockPlayer('4', 'Diana'),
    ],
    currentPlayerId: '2',
    dealerPlayerId: '1',
    you: '3',
    scores: {
      '1': 25,
      '2': 18,
      '3': 32,
      '4': 21,
    },
    bids: {
      '1': 3,
      '2': 2,
      '3': 4,
      '4': null, // Hasn't bid yet
    },
  },
};

// Story: Game Setup - Waiting for Players
export const WaitingForPlayers: Story = {
  name: 'Game Setup - Player Status Variations',
  args: {
    players: [
      createMockPlayer('1', 'Alice', false, 'active'),
      createMockPlayer('2', 'Bob', false, 'active'),
      createMockPlayer('3', 'Charlie', false, 'disconnected'),
      createMockPlayer('4', 'Diana', false, 'disconnected'),
    ],
    currentPlayerId: null,
    dealerPlayerId: '1',
    you: '1',
    scores: {
      '1': 0,
      '2': 0,
      '3': 0,
      '4': 0,
    },
  },
};

// Story: Bot Game - Mixed Players
export const BotGame: Story = {
  name: 'Mixed Game - Players and Bots',
  args: {
    players: [
      createMockPlayer('1', 'Alice'),
      createMockPlayer('2', 'BotBob', true),
      createMockPlayer('3', 'Charlie'),
      createMockPlayer('4', 'BotDiana', true),
    ],
    currentPlayerId: '1',
    dealerPlayerId: '2',
    you: '1',
    scores: {
      '1': 45,
      '2': 38,
      '3': 52,
      '4': 41,
    },
    bids: {
      '1': 5,
      '2': 4,
      '3': 6,
      '4': 3,
    },
  },
};

// Story: Late Game - High Scores
export const LateGame: Story = {
  name: 'Late Game - High Scores',
  args: {
    players: [
      createMockPlayer('1', 'Alice'),
      createMockPlayer('2', 'Bob'),
      createMockPlayer('3', 'Charlie'),
      createMockPlayer('4', 'Diana'),
    ],
    currentPlayerId: '4',
    dealerPlayerId: '3',
    you: '2',
    scores: {
      '1': 156,
      '2': 142,
      '3': 98,
      '4': 173,
    },
    bids: {
      '1': 7,
      '2': 6,
      '3': 8,
      '4': 5,
    },
  },
};

// Story: Two Players - Simple Game
export const TwoPlayers: Story = {
  name: 'Simple Game - Two Players',
  args: {
    players: [
      createMockPlayer('1', 'Player One'),
      createMockPlayer('2', 'Player Two'),
    ],
    currentPlayerId: '2',
    dealerPlayerId: '1',
    you: '1',
    scores: {
      '1': 15,
      '2': 12,
    },
    bids: {
      '1': 2,
      '2': 3,
    },
  },
};

// Story: Large Game - Many Players
export const ManyPlayers: Story = {
  name: 'Large Game - 6 Players',
  args: {
    players: [
      createMockPlayer('1', 'Alice'),
      createMockPlayer('2', 'Bob'),
      createMockPlayer('3', 'Charlie'),
      createMockPlayer('4', 'Diana'),
      createMockPlayer('5', 'Ethan'),
      createMockPlayer('6', 'Fiona'),
    ],
    currentPlayerId: '3',
    dealerPlayerId: '2',
    you: '4',
    scores: {
      '1': 28,
      '2': 35,
      '3': 42,
      '4': 19,
      '5': 51,
      '6': 33,
    },
    bids: {
      '1': 3,
      '2': 4,
      '3': 5,
      '4': 2,
      '5': 6,
      '6': 3,
    },
  },
};

// Story: No Current Turn - Game Paused
export const NoCurrentTurn: Story = {
  name: 'No Current Turn - Game Paused',
  args: {
    players: [
      createMockPlayer('1', 'Alice'),
      createMockPlayer('2', 'Bob'),
      createMockPlayer('3', 'Charlie'),
      createMockPlayer('4', 'Diana'),
    ],
    currentPlayerId: null,
    dealerPlayerId: '1',
    you: '3',
    scores: {
      '1': 25,
      '2': 18,
      '3': 32,
      '4': 21,
    },
    bids: {
      '1': 3,
      '2': 2,
      '3': 4,
      '4': 1,
    },
  },
};

// Story: Empty Players - Waiting for Game
export const EmptyPlayers: Story = {
  name: 'No Players - Waiting for Game',
  args: {
    players: [],
    currentPlayerId: null,
    dealerPlayerId: null,
    you: null,
    scores: {},
  },
  parameters: {
    docs: {
      description: {
        story: 'Displays the player list when no players have joined the game yet. Shows "0 at table" badge and empty player list.',
      },
    },
  },
};

// Story: Negative Scores - Comeback Potential
export const NegativeScores: Story = {
  name: 'Negative Scores - Comeback Game',
  args: {
    players: [
      createMockPlayer('1', 'Alice'),
      createMockPlayer('2', 'Bob'),
      createMockPlayer('3', 'Charlie'),
      createMockPlayer('4', 'Diana'),
    ],
    currentPlayerId: '1',
    dealerPlayerId: '4',
    you: '2',
    scores: {
      '1': -15,
      '2': -8,
      '3': 12,
      '4': 25,
    },
    bids: {
      '1': 2,
      '2': 1,
      '3': 3,
      '4': 4,
    },
  },
};

// Story: All Bots - AI Game
export const AllBots: Story = {
  name: 'Bot Only Game - AI Players',
  args: {
    players: [
      createMockPlayer('1', 'BotAlice', true),
      createMockPlayer('2', 'BotBob', true),
      createMockPlayer('3', 'BotCharlie', true),
      createMockPlayer('4', 'BotDiana', true),
    ],
    currentPlayerId: '2',
    dealerPlayerId: '1',
    you: null,
    scores: {
      '1': 67,
      '2': 72,
      '3': 58,
      '4': 81,
    },
    bids: {
      '1': 4,
      '2': 5,
      '3': 3,
      '4': 6,
    },
  },
};

// Story: You Are Dealer - Special Highlight
export const YouAreDealer: Story = {
  name: 'You Are Dealer - Current User is Dealer',
  args: {
    players: [
      createMockPlayer('1', 'Alice'),
      createMockPlayer('2', 'You the Player'),
      createMockPlayer('3', 'Charlie'),
      createMockPlayer('4', 'Diana'),
    ],
    currentPlayerId: '3',
    dealerPlayerId: '2',
    you: '2',
    scores: {
      '1': 38,
      '2': 45,
      '3': 29,
      '4': 52,
    },
    bids: {
      '1': 3,
      '2': 4,
      '3': 2,
      '4': 5,
    },
  },
};

// Story: Current Turn is You - Your Move Highlight
export const YourTurn: Story = {
  name: 'Your Turn - Current Player is You',
  args: {
    players: [
      createMockPlayer('1', 'Alice'),
      createMockPlayer('2', 'You'),
      createMockPlayer('3', 'Charlie'),
      createMockPlayer('4', 'Diana'),
    ],
    currentPlayerId: '2',
    dealerPlayerId: '1',
    you: '2',
    scores: {
      '1': 28,
      '2': 35,
      '3': 19,
      '4': 42,
    },
    bids: {
      '1': 3,
      '2': null, // You haven't bid yet
      '3': 2,
      '4': 4,
    },
  },
};

// Story: Long Names - Handle Display Names
export const LongNames: Story = {
  name: 'Long Player Names - Display Testing',
  args: {
    players: [
      createMockPlayer('1', 'Sir Alexander Wellington III'),
      createMockPlayer('2', 'Maria Isabella Rodriguez-Chen'),
      createMockPlayer('3', 'Dr. Jean-Pierre von der Lichtenstein'),
      createMockPlayer('4', '王美麗 (Wang Mei-Li)'),
    ],
    currentPlayerId: '1',
    dealerPlayerId: '4',
    you: '3',
    scores: {
      '1': 31,
      '2': 27,
      '3': 45,
      '4': 33,
    },
    bids: {
      '1': 4,
      '2': 3,
      '3': 5,
      '4': 2,
    },
  },
};

// Story: No Bids - Pre-Bidding Round
export const NoBidsYet: Story = {
  name: 'No Bids Yet - Pre-Bidding Phase',
  args: {
    players: [
      createMockPlayer('1', 'Alice'),
      createMockPlayer('2', 'Bob'),
      createMockPlayer('3', 'Charlie'),
      createMockPlayer('4', 'Diana'),
    ],
    currentPlayerId: '1',
    dealerPlayerId: '2',
    you: '4',
    scores: {
      '1': 22,
      '2': 28,
      '3': 15,
      '4': 31,
    },
    bids: {}, // No bids placed yet
  },
};

// Story: Mobile View - Responsive Layout
export const MobileView: Story = {
  name: 'Mobile View - Responsive Player List',
  args: {
    players: [
      createMockPlayer('1', 'Alice'),
      createMockPlayer('2', 'Bob'),
      createMockPlayer('3', 'Charlie'),
      createMockPlayer('4', 'Diana'),
    ],
    currentPlayerId: '2',
    dealerPlayerId: '1',
    you: '3',
    scores: {
      '1': 25,
      '2': 18,
      '3': 32,
      '4': 21,
    },
    bids: {
      '1': 3,
      '2': 2,
      '3': 4,
      '4': 1,
    },
  },
  parameters: {
    viewport: {
      defaultViewport: 'mobile1',
    },
  },
};