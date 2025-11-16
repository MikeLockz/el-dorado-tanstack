import type { Meta, StoryObj } from '@storybook/react';
import { BiddingModal } from './BiddingModal';
import { PlayerInGame, Card, PlayerId } from '@game/domain';

const createMockPlayer = (id: string, displayName: string, seatIndex: number): PlayerInGame => ({
  playerId: id as PlayerId,
  seatIndex,
  profile: { displayName, avatarSeed: id, color: '#4F46E5' },
  status: 'active',
  isBot: false,
  spectator: false,
});

const mockCards: Card[] = [
  { id: 'c1', suit: 'hearts', rank: 'A', deckIndex: 0 },
  { id: 'c2', suit: 'spades', rank: 'K', deckIndex: 1 },
  { id: 'c3', suit: 'diamonds', rank: 'Q', deckIndex: 2 },
  { id: 'c4', suit: 'clubs', rank: 'J', deckIndex: 3 },
  { id: 'c5', suit: 'hearts', rank: '10', deckIndex: 4 },
  { id: 'c6', suit: 'spades', rank: '9', deckIndex: 5 },
];

const meta: Meta<typeof BiddingModal> = {
  title: 'Game/BiddingModal',
  component: BiddingModal,
  parameters: {
    layout: 'centered',
  },
  argTypes: {
    dealerPlayerId: {
      control: { type: 'select' },
      options: ['p1', 'p2', 'p3', 'p4'],
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

const fourPlayers = [
  createMockPlayer('p1', 'Alice', 0),
  createMockPlayer('p2', 'Bob', 1),
  createMockPlayer('p3', 'Charlie', 2),
  createMockPlayer('p4', 'Diana', 3),
];

const initialBids = {
  p1: null,
  p2: null,
  p3: null,
  p4: null,
};

const partialBids = {
  p1: 2,
  p2: 1,
  p3: null,
  p4: 3,
};

export const Default: Story = {
  args: {
    isOpen: true,
    cardsPerPlayer: 5,
    hand: mockCards,
    trumpCard: { id: 'trump', suit: 'hearts', rank: 'K', deckIndex: 6 },
    trumpSuit: 'hearts',
    dealerPlayerId: 'p1',
    currentBid: null,
    players: fourPlayers,
    bids: initialBids,
    onBid: (value) => console.log('Bid placed:', value),
  },
};

export const WithPartialBids: Story = {
  args: {
    isOpen: true,
    cardsPerPlayer: 5,
    hand: mockCards,
    trumpCard: { id: 'trump', suit: 'hearts', rank: 'K', deckIndex: 6 },
    trumpSuit: 'hearts',
    dealerPlayerId: 'p2',
    currentBid: 2,
    players: fourPlayers,
    bids: partialBids,
    onBid: (value) => console.log('Bid placed:', value),
  },
};

export const DealerPosition3: Story = {
  args: {
    isOpen: true,
    cardsPerPlayer: 5,
    hand: mockCards,
    trumpCard: { id: 'trump', suit: 'spades', rank: 'A', deckIndex: 7 },
    trumpSuit: 'spades',
    dealerPlayerId: 'p4',
    currentBid: null,
    players: fourPlayers,
    bids: {
      p1: null,
      p2: 2,
      p3: 1,
      p4: null,
    },
    onBid: (value) => console.log('Bid placed:', value),
  },
};

export const AllBidsComplete: Story = {
  args: {
    isOpen: true,
    cardsPerPlayer: 6,
    hand: mockCards,
    trumpCard: { id: 'trump', suit: 'diamonds', rank: 'Q', deckIndex: 8 },
    trumpSuit: 'diamonds',
    dealerPlayerId: 'p3',
    currentBid: 2,
    players: fourPlayers,
    bids: {
      p1: 2,
      p2: 1,
      p3: 3,
      p4: 0,
    },
    onBid: (value) => console.log('Bid placed:', value),
  },
};