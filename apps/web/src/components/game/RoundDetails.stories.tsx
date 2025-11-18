import type { Meta, StoryObj } from '@storybook/react';
import { RoundDetails } from './RoundDetails';
import type { PlayerInGame, TrickState, TrickPlay, Card } from '@game/domain';

const meta: Meta<typeof RoundDetails> = {
  title: 'Game/RoundDetails',
  component: RoundDetails,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component: 'A detailed view component showing all tricks played in a round, including cards played by each player with winner and leader indicators.',
      },
    },
    a11y: {
      element: 'table',
    },
  },
  argTypes: {
    tricks: {
      description: 'Array of completed TrickState objects containing all card plays for each trick',
      control: 'object',
    },
    players: {
      description: 'Array of PlayerInGame objects with player information',
      control: 'object',
    },
    trumpSuit: {
      description: 'The trump suit for the current round (clubs, diamonds, hearts, spades, or null)',
      control: 'select',
      options: ['clubs', 'diamonds', 'hearts', 'spades', null],
    },
    currentRoundIndex: {
      description: 'The current round index (0-based)',
      control: 'number',
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

// Mock player data
const mockPlayers: PlayerInGame[] = [
  {
    playerId: '1',
    profile: { displayName: 'Alice', avatarSeed: 'alice', color: '#3b82f6' },
    seatIndex: 0,
    status: 'active',
    isBot: false,
    spectator: false,
  },
  {
    playerId: '2',
    profile: { displayName: 'Bob', avatarSeed: 'bob', color: '#10b981' },
    seatIndex: 1,
    status: 'active',
    isBot: false,
    spectator: false,
  },
  {
    playerId: '3',
    profile: { displayName: 'Charlie', avatarSeed: 'charlie', color: '#f59e0b' },
    seatIndex: 2,
    status: 'active',
    isBot: false,
    spectator: false,
  },
  {
    playerId: '4',
    profile: { displayName: 'Diana', avatarSeed: 'diana', color: '#ef4444' },
    seatIndex: 3,
    status: 'active',
    isBot: false,
    spectator: false,
  },
];

// Helper function to create a card
const createMockCard = (suit: Card['suit'], rank: Card['rank'], deckIndex = 1): Card => ({
  id: `d${deckIndex}:${suit}:${rank}`,
  suit,
  rank,
  deckIndex,
});

// Helper function to create a trick play
const createTrickPlay = (playerId: string, card: Card, order: number): TrickPlay => ({
  playerId,
  card,
  order,
});

// Helper function to create a trick
const createTrick = (trickIndex: number, leaderId: string, plays: { playerId: string; card: Card }[], winningPlayerId?: string): TrickState => {
  const trickPlays = plays.map((play, idx) => createTrickPlay(play.playerId, play.card, idx));
  const ledSuit = plays[0].card.suit;

  return {
    trickIndex,
    leaderPlayerId: leaderId,
    ledSuit,
    plays: trickPlays,
    winningPlayerId: winningPlayerId || leaderId,
    winningCardId: winningPlayerId ? plays.find(p => p.playerId === winningPlayerId)?.card.id || plays[0].card.id : plays[0].card.id,
    completed: true,
  };
};

export const Default: Story = {
  args: {
    tricks: [
      createTrick(0, '1', [
        { playerId: '1', card: createMockCard('hearts', 'K') },
        { playerId: '2', card: createMockCard('hearts', 'Q') },
        { playerId: '3', card: createMockCard('hearts', 'J') },
        { playerId: '4', card: createMockCard('hearts', '10') },
      ], '1'),
      createTrick(1, '2', [
        { playerId: '2', card: createMockCard('spades', 'A') },
        { playerId: '3', card: createMockCard('spades', 'K') },
        { playerId: '4', card: createMockCard('spades', 'Q') },
        { playerId: '1', card: createMockCard('spades', 'J') },
      ], '2'),
      createTrick(2, '3', [
        { playerId: '3', card: createMockCard('diamonds', '10') },
        { playerId: '4', card: createMockCard('diamonds', '9') },
        { playerId: '1', card: createMockCard('diamonds', '8') },
        { playerId: '2', card: createMockCard('diamonds', '7') },
      ], '3'),
    ],
    players: mockPlayers,
    trumpSuit: 'hearts',
    currentRoundIndex: 0,
  },
};

export const NoTrump: Story = {
  args: {
    tricks: [
      createTrick(0, '1', [
        { playerId: '1', card: createMockCard('clubs', 'A') },
        { playerId: '2', card: createMockCard('clubs', 'K') },
        { playerId: '3', card: createMockCard('clubs', 'Q') },
        { playerId: '4', card: createMockCard('clubs', 'J') },
      ], '1'),
      createTrick(1, '2', [
        { playerId: '2', card: createMockCard('spades', 'A') },
        { playerId: '3', card: createMockCard('spades', 'K') },
        { playerId: '4', card: createMockCard('spades', 'Q') },
        { playerId: '1', card: createMockCard('spades', 'J') },
      ], '2'),
    ],
    players: mockPlayers,
    trumpSuit: null,
    currentRoundIndex: 2,
  },
};

export const EmptyRound: Story = {
  args: {
    tricks: [],
    players: mockPlayers,
    trumpSuit: 'spades',
    currentRoundIndex: 1,
  },
};

export const SingleTrick: Story = {
  args: {
    tricks: [
      createTrick(0, '3', [
        { playerId: '3', card: createMockCard('hearts', 'A') },
        { playerId: '4', card: createMockCard('hearts', 'K') },
        { playerId: '1', card: createMockCard('hearts', 'Q') },
        { playerId: '2', card: createMockCard('hearts', 'J') },
      ], '3'),
    ],
    players: mockPlayers,
    trumpSuit: 'diamonds',
    currentRoundIndex: 5,
  },
};

export const EqualDistribution: Story = {
  args: {
    tricks: [
      createTrick(0, '1', [
        { playerId: '1', card: createMockCard('clubs', 'A') },
        { playerId: '2', card: createMockCard('clubs', 'K') },
        { playerId: '3', card: createMockCard('clubs', 'Q') },
        { playerId: '4', card: createMockCard('clubs', 'J') },
      ], '1'),
      createTrick(1, '1', [
        { playerId: '2', card: createMockCard('spades', 'A') },
        { playerId: '3', card: createMockCard('spades', 'K') },
        { playerId: '4', card: createMockCard('spades', 'Q') },
        { playerId: '1', card: createMockCard('spades', 'J') },
      ], '2'),
      createTrick(2, '1', [
        { playerId: '3', card: createMockCard('hearts', 'A') },
        { playerId: '4', card: createMockCard('hearts', 'K') },
        { playerId: '1', card: createMockCard('hearts', 'Q') },
        { playerId: '2', card: createMockCard('hearts', 'J') },
      ], '3'),
      createTrick(3, '1', [
        { playerId: '4', card: createMockCard('diamonds', 'A') },
        { playerId: '1', card: createMockCard('diamonds', 'K') },
        { playerId: '2', card: createMockCard('diamonds', 'Q') },
        { playerId: '3', card: createMockCard('diamonds', 'J') },
      ], '4'),
    ],
    players: mockPlayers,
    trumpSuit: 'clubs',
    currentRoundIndex: 8,
  },
};

export const ManyTricks: Story = {
  args: {
    tricks: Array.from({ length: 8 }, (_, i) =>
      createTrick(i, mockPlayers[i % 4].playerId, [
        { playerId: mockPlayers[0].playerId, card: createMockCard('hearts', ['2', '3', '4', '5', '6', '7', '8', '9'][i] as Card['rank']) },
        { playerId: mockPlayers[1].playerId, card: createMockCard('diamonds', ['2', '3', '4', '5', '6', '7', '8', '9'][i] as Card['rank']) },
        { playerId: mockPlayers[2].playerId, card: createMockCard('clubs', ['2', '3', '4', '5', '6', '7', '8', '9'][i] as Card['rank']) },
        { playerId: mockPlayers[3].playerId, card: createMockCard('spades', ['2', '3', '4', '5', '6', '7', '8', '9'][i] as Card['rank']) },
      ])
    ),
    players: mockPlayers,
    trumpSuit: 'hearts',
    currentRoundIndex: 3,
  },
};

export const FewerPlayers: Story = {
  args: {
    players: [
      {
        playerId: '1',
        profile: { displayName: 'Alice', avatarSeed: 'alice', color: '#3b82f6' },
        seatIndex: 0,
        status: 'active',
        isBot: false,
        spectator: false,
      },
      {
        playerId: '2',
        profile: { displayName: 'Bob', avatarSeed: 'bob', color: '#10b981' },
        seatIndex: 1,
        status: 'active',
        isBot: false,
        spectator: false,
      },
    ],
    tricks: [
      createTrick(0, '1', [
        { playerId: '1', card: createMockCard('hearts', 'A') },
        { playerId: '2', card: createMockCard('hearts', 'K') },
      ], '1'),
      createTrick(1, '2', [
        { playerId: '2', card: createMockCard('clubs', 'Q') },
        { playerId: '1', card: createMockCard('clubs', 'J') },
      ], '2'),
      createTrick(2, '1', [
        { playerId: '1', card: createMockCard('spades', '10') },
        { playerId: '2', card: createMockCard('spades', '9') },
      ], '1'),
    ],
    trumpSuit: 'diamonds',
    currentRoundIndex: 6,
  },
};

export const TrumpBroken: Story = {
  args: {
    tricks: [
      createTrick(0, '1', [
        { playerId: '1', card: createMockCard('hearts', 'A') },
        { playerId: '2', card: createMockCard('hearts', 'K') },
        { playerId: '3', card: createMockCard('hearts', 'Q') },
        { playerId: '4', card: createMockCard('hearts', 'J') },
      ], '1'),
      createTrick(1, '2', [
        { playerId: '2', card: createMockCard('clubs', 'A') },
        { playerId: '3', card: createMockCard('spades', 'K') }, // Player 3 breaks trump here
        { playerId: '4', card: createMockCard('clubs', 'Q') },
        { playerId: '1', card: createMockCard('clubs', 'J') },
      ], '3'),
      createTrick(2, '3', [
        { playerId: '3', card: createMockCard('spades', 'A') },
        { playerId: '4', card: createMockCard('spades', 'Q') },
        { playerId: '1', card: createMockCard('spades', 'J') },
        { playerId: '2', card: createMockCard('spades', '10') },
      ], '3'),
    ],
    players: mockPlayers,
    trumpSuit: 'spades',
    currentRoundIndex: 2,
  },
};

export const ResponsiveTest: Story = {
  args: {
    tricks: [
      createTrick(0, '1', [
        { playerId: '1', card: createMockCard('hearts', 'A') },
        { playerId: '2', card: createMockCard('hearts', 'K') },
        { playerId: '3', card: createMockCard('hearts', 'Q') },
        { playerId: '4', card: createMockCard('hearts', 'J') },
      ], '1'),
      createTrick(1, '2', [
        { playerId: '2', card: createMockCard('clubs', 'A') },
        { playerId: '3', card: createMockCard('clubs', 'K') },
        { playerId: '4', card: createMockCard('clubs', 'Q') },
        { playerId: '1', card: createMockCard('clubs', 'J') },
      ], '2'),
    ],
    players: mockPlayers.map((player, i) => ({
      ...player,
      profile: { 
        displayName: `Player with a really long name that should wrap nicely ${i + 1}`,
        avatarSeed: player.profile.avatarSeed,
        color: player.profile.color,
      },
    })),
    trumpSuit: 'spades',
    currentRoundIndex: 4,
  },
  parameters: {
    viewport: {
      defaultViewport: 'mobile1',
    },
  },
};