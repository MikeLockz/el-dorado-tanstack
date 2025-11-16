import type { Meta, StoryObj } from '@storybook/react';
import { TrickArea } from './TrickArea';
import type { PlayerInGame, PlayerId, TrickState, Card, Suit, Rank } from '@game/domain';

const meta: Meta<typeof TrickArea> = {
  title: 'Game/TrickArea',
  component: TrickArea,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component: 'The TrickArea component displays the current trick information including trick number, trump suit, cards played, and the winning card. It shows real-time trick progress with animations for card appearance and winning card highlighting.',
      },
    },
  },
  argTypes: {
    trick: {
      description: 'Current trick state with plays, winner, and index information',
      control: 'object',
    },
    players: {
      description: 'Array of players in the game with their profile information',
      control: 'object',
    },
    trumpSuit: {
      description: 'Trump suit for the current round (Clubs, Diamonds, Hearts, Spades)',
      control: 'select',
      options: ['clubs', 'diamonds', 'hearts', 'spades', null],
    },
    trumpCard: {
      description: 'The card that determines the trump suit',
      control: 'object',
    },
    completedCount: {
      description: 'Number of completed tricks in the current round',
      control: 'number',
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

// Mock data creators
const createMockPlayer = (id: string, displayName: string): PlayerInGame => ({
  playerId: id as PlayerId,
  profile: {
    displayName,
  },
  isBot: false,
  status: 'active',
});

const createMockCard = (rank: Rank, suit: Suit): Card => ({
  id: `${rank}-${suit}-${Math.random().toString(36).substr(2, 9)}`,
  rank,
  suit,
});

const createMockTrickPlay = (playerId: string, rank: Rank, suit: Suit, order: number) => ({
  playerId: playerId as PlayerId,
  card: createMockCard(rank, suit),
  order,
});

// Stories

// Story: No Trick Started
export const NoTrickStarted: Story = {
  name: 'No Trick Started - Waiting for First Card',
  args: {
    trick: null,
    players: [
      createMockPlayer('1', 'Alice'),
      createMockPlayer('2', 'Bob'),
      createMockPlayer('3', 'Charlie'),
      createMockPlayer('4', 'Diana'),
    ],
    trumpSuit: 'hearts',
    trumpCard: createMockCard('jack', 'hearts'),
    completedCount: 0,
  },
  parameters: {
    docs: {
      description: {
        story: 'Shows the TrickArea when no trick is currently in progress. Displays trick #1, trump information, and 0 completed tricks with a message indicating no cards have been played yet.',
      },
    },
  },
};

// Story: Trick in Progress - One Card
export const OneCardPlayed: Story = {
  name: 'Trick in Progress - One Card Played',
  args: {
    trick: {
      trickIndex: 2,
      leaderPlayerId: '1' as PlayerId,
      ledSuit: 'spades',
      plays: [
        createMockTrickPlay('1', 'ace', 'spades', 0),
      ],
      winningPlayerId: null,
      winningCardId: null,
      completed: false,
    },
    players: [
      createMockPlayer('1', 'Alice'),
      createMockPlayer('2', 'Bob'),
      createMockPlayer('3', 'Charlie'),
      createMockPlayer('4', 'Diana'),
    ],
    trumpSuit: 'hearts',
    trumpCard: createMockCard('jack', 'hearts'),
    completedCount: 2,
  },
  parameters: {
    docs: {
      description: {
        story: 'Shows a trick with one card played. The ace of spades is displayed, and since no winner is determined yet, no card is highlighted as the winning card.',
      },
    },
  },
};

// Story: Trick in Progress - Two Cards
export const TwoCardsPlayed: Story = {
  name: 'Trick in Progress - Two Cards Played',
  args: {
    trick: {
      trickIndex: 3,
      leaderPlayerId: '1' as PlayerId,
      ledSuit: 'clubs',
      plays: [
        createMockTrickPlay('1', '10', 'clubs', 0),
        createMockTrickPlay('2', 'queen', 'clubs', 1),
      ],
      winningPlayerId: '2',
      winningCardId: '', // Will be set based on the second card
      completed: false,
    },
    players: [
      createMockPlayer('1', 'Alice'),
      createMockPlayer('2', 'Bob'),
      createMockPlayer('3', 'Charlie'),
      createMockPlayer('4', 'Diana'),
    ],
    trumpSuit: 'spades',
    trumpCard: createMockCard('jack', 'spades'),
    completedCount: 3,
  },
};

// Story: Complete Trick - Four Cards with Winner
export const CompleteTrick: Story = {
  name: 'Complete Trick - Four Cards with Trump Winner',
  args: {
    trick: {
      trickIndex: 5,
      leaderPlayerId: '2' as PlayerId,
      ledSuit: 'diamonds',
      plays: [
        createMockTrickPlay('2', '9', 'diamonds', 0),
        createMockTrickPlay('3', 'king', 'diamonds', 1),
        createMockTrickPlay('4', 'jack', 'hearts', 2),
        createMockTrickPlay('1', '7', 'diamonds', 3),
      ],
      winningPlayerId: '4',
      winningCardId: '', // Will be set based on the trump card
      completed: true,
    },
    players: [
      createMockPlayer('1', 'Alice'),
      createMockPlayer('2', 'Bob'),
      createMockPlayer('3', 'Charlie'),
      createMockPlayer('4', 'Diana'),
    ],
    trumpSuit: 'hearts',
    trumpCard: createMockCard('jack', 'hearts'),
    completedCount: 5,
  },
  parameters: {
    docs: {
      description: {
        story: 'Shows a completed trick with all four cards played. Bob played 9♦, Charlie played K♦, Diana played J♥ (trump), and Alice played 7♦. Since hearts are trump and Diana played the jack of hearts, she wins the trick, and her card is highlighted with the winning animation.',
      },
    },
  },
};

// Story: High Card Wins - No Trump
export const HighCardWins: Story = {
  name: 'High Card Wins - No Trump in Trick',
  args: {
    trick: {
      trickIndex: 1,
      leaderPlayerId: '3' as PlayerId,
      ledSuit: 'spades',
      plays: [
        createMockTrickPlay('3', '8', 'spades', 0),
        createMockTrickPlay('4', 'jack', 'spades', 1),
        createMockTrickPlay('1', 'ace', 'spades', 2),
        createMockTrickPlay('2', '10', 'spades', 3),
      ],
      winningPlayerId: '1',
      winningCardId: '', // Will be set based on the ace
      completed: true,
    },
    players: [
      createMockPlayer('1', 'Alice'),
      createMockPlayer('2', 'Bob'),
      createMockPlayer('3', 'Charlie'),
      createMockPlayer('4', 'Diana'),
    ],
    trumpSuit: 'diamonds',
    trumpCard: createMockCard('queen', 'diamonds'),
    completedCount: 1,
  },
  parameters: {
    docs: {
      description: {
        story: 'Shows a trick where no trump cards were played, so the highest card of the led suit (spades) wins. Alice played the ace of spades, which is the highest card and wins the trick.',
      },
    },
  },
};

// Story: Trump vs High Card
export const TrumpVsHighCard: Story = {
  name: 'Trump vs High Card - Trump Wins',
  args: {
    trick: {
      trickIndex: 7,
      leaderPlayerId: '1' as PlayerId,
      ledSuit: 'clubs',
      plays: [
        createMockTrickPlay('1', 'king', 'clubs', 0),
        createMockTrickPlay('2', '9', 'clubs', 1),
        createMockTrickPlay('3', '5', 'hearts', 2),
        createMockTrickPlay('4', 'queen', 'clubs', 3),
      ],
      winningPlayerId: '3',
      winningCardId: '', // Will be set based on the heart
      completed: true,
    },
    players: [
      createMockPlayer('1', 'Alice'),
      createMockPlayer('2', 'Bob'),
      createMockPlayer('3', 'Charlie'),
      createMockPlayer('4', 'Diana'),
    ],
    trumpSuit: 'hearts',
    trumpCard: createMockCard('jack', 'hearts'),
    completedCount: 7,
  },
  parameters: {
    docs: {
      description: {
        story: 'Shows a trick where trump beats a high card of the led suit. Alice led with king of clubs, but Charlie played the 5 of hearts (trump), which beats all the club cards even though it\'s a lower rank.',
      },
    },
  },
};

// Story: Late Game - Many Completed Tricks
export const LateGame: Story = {
  name: 'Late Game - Many Completed Tricks',
  args: {
    trick: {
      trickIndex: 15,
      leaderPlayerId: '4' as PlayerId,
      ledSuit: 'diamonds',
      plays: [
        createMockTrickPlay('4', 'ace', 'diamonds', 0),
        createMockTrickPlay('1', '10', 'diamonds', 1),
      ],
      winningPlayerId: '4',
      winningCardId: '', // Will be set based on the ace
      completed: false,
    },
    players: [
      createMockPlayer('1', 'Alice'),
      createMockPlayer('2', 'Bob'),
      createMockPlayer('3', 'Charlie'),
      createMockPlayer('4', 'Diana'),
    ],
    trumpSuit: 'clubs',
    trumpCard: createMockCard('king', 'clubs'),
    completedCount: 11,
  },
  parameters: {
    docs: {
      description: {
        story: 'Shows the TrickArea late in the game with 11 completed tricks. Currently on trick #16 with Diana leading with the ace of diamonds.',
      },
    },
  },
};

// Story: No Trump - Nil Game
export const NoTrump: Story = {
  name: 'No Trump - Nil Game Variant',
  args: {
    trick: {
      trickIndex: 4,
      leaderPlayerId: '2' as PlayerId,
      ledSuit: 'hearts',
      plays: [
        createMockTrickPlay('2', 'jack', 'hearts', 0),
        createMockTrickPlay('3', 'queen', 'hearts', 1),
        createMockTrickPlay('4', 'king', 'hearts', 2),
        createMockTrickPlay('1', '10', 'hearts', 3),
      ],
      winningPlayerId: '4',
      winningCardId: '', // Will be set based on the king
      completed: true,
    },
    players: [
      createMockPlayer('1', 'Alice'),
      createMockPlayer('2', 'Bob'),
      createMockPlayer('3', 'Charlie'),
      createMockPlayer('4', 'Diana'),
    ],
    trumpSuit: null,
    trumpCard: null,
    completedCount: 4,
  },
  parameters: {
    docs: {
      description: {
        story: 'Shows a trick when there is no trump suit (nil game variant). Diana wins with the king of hearts, the highest card of the led suit.',
      },
    },
  },
};

// Story: Three Players
export const ThreePlayers: Story = {
  name: 'Three Player Game',
  args: {
    trick: {
      trickIndex: 2,
      leaderPlayerId: '1' as PlayerId,
      ledSuit: 'spades',
      plays: [
        createMockTrickPlay('1', 'queen', 'spades', 0),
        createMockTrickPlay('2', '8', 'spades', 1),
        createMockTrickPlay('3', 'ace', 'spades', 2),
      ],
      winningPlayerId: '3',
      winningCardId: '', // Will be set based on the ace
      completed: true,
    },
    players: [
      createMockPlayer('1', 'Alice'),
      createMockPlayer('2', 'Bob'),
      createMockPlayer('3', 'Charlie'),
    ],
    trumpSuit: 'diamonds',
    trumpCard: createMockCard('jack', 'diamonds'),
    completedCount: 2,
  },
  parameters: {
    docs: {
      description: {
        story: 'Shows a trick in a three-player game. All available slots are filled, and Charlie wins with the ace of spades.',
      },
    },
  },
};

// Story: Different Trump Suits
export const DifferentTrumpSuits: Story = {
  name: 'Different Trump Suits Examples',
  render: () => (
    <div className="space-y-8">
      <div>
        <h3 className="mb-2 text-sm font-medium text-muted-foreground">Trump: Clubs</h3>
        <TrickArea
          trick={{
            trickIndex: 1,
            leaderPlayerId: '1' as PlayerId,
            ledSuit: 'hearts',
            plays: [
              createMockTrickPlay('1', '7', 'hearts', 0),
              createMockTrickPlay('2', '9', 'clubs', 1),
            ],
            winningPlayerId: '2',
            winningCardId: '',
            completed: false,
          }}
          players={[
            createMockPlayer('1', 'Alice'),
            createMockPlayer('2', 'Bob'),
            createMockPlayer('3', 'Charlie'),
            createMockPlayer('4', 'Diana'),
          ]}
          trumpSuit="clubs"
          trumpCard={createMockCard('ace', 'clubs')}
          completedCount={0}
        />
      </div>
      <div>
        <h3 className="mb-2 text-sm font-medium text-muted-foreground">Trump: Diamonds</h3>
        <TrickArea
          trick={{
            trickIndex: 1,
            leaderPlayerId: '1' as PlayerId,
            ledSuit: 'spades',
            plays: [
              createMockTrickPlay('1', 'king', 'spades', 0),
              createMockTrickPlay('2', '8', 'diamonds', 1),
            ],
            winningPlayerId: '2',
            winningCardId: '',
            completed: false,
          }}
          players={[
            createMockPlayer('1', 'Alice'),
            createMockPlayer('2', 'Bob'),
            createMockPlayer('3', 'Charlie'),
            createMockPlayer('4', 'Diana'),
          ]}
          trumpSuit="diamonds"
          trumpCard={createMockCard('queen', 'diamonds')}
          completedCount={0}
        />
      </div>
      <div>
        <h3 className="mb-2 text-sm font-medium text-muted-foreground">Trump: Spades</h3>
        <TrickArea
          trick={{
            trickIndex: 1,
            leaderPlayerId: '1' as PlayerId,
            ledSuit: 'hearts',
            plays: [
              createMockTrickPlay('1', 'ace', 'hearts', 0),
              createMockTrickPlay('2', '6', 'spades', 1),
            ],
            winningPlayerId: '2',
            winningCardId: '',
            completed: false,
          }}
          players={[
            createMockPlayer('1', 'Alice'),
            createMockPlayer('2', 'Bob'),
            createMockPlayer('3', 'Charlie'),
            createMockPlayer('4', 'Diana'),
          ]}
          trumpSuit="spades"
          trumpCard={createMockCard('jack', 'spades')}
          completedCount={0}
        />
      </div>
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story: 'Shows examples of the same trick situation with different trump suits to demonstrate how the trump suit display and card winning logic works across all four suits.',
      },
    },
  },
};

// Story: Animation Showcase
export const AnimationShowcase: Story = {
  name: 'Animation Showcase - Card Pop & Glow Effects',
  args: {
    trick: {
      trickIndex: 8,
      leaderPlayerId: '1' as PlayerId,
      ledSuit: 'clubs',
      plays: [
        createMockTrickPlay('1', 'jack', 'clubs', 0),
        createMockTrickPlay('2', 'queen', 'clubs', 1),
        createMockTrickPlay('3', 'king', 'clubs', 2),
        createMockTrickPlay('4', 'ace', 'clubs', 3),
      ],
      winningPlayerId: '4',
      winningCardId: '', // Will be set based on the ace
      completed: true,
    },
    players: [
      createMockPlayer('1', 'Alice'),
      createMockPlayer('2', 'Bob'),
      createMockPlayer('3', 'Charlie'),
      createMockPlayer('4', 'Diana'),
    ],
    trumpSuit: 'hearts',
    trumpCard: createMockCard('jack', 'hearts'),
    completedCount: 8,
  },
  parameters: {
    docs: {
      description: {
        story: 'Shows off the card animation effects. Each card play animates in with the "card-pop" effect, and the winning card (ace of clubs in this case) gets the "trick-glow" highlighting effect.',
      },
    },
  },
};

// Story: Mobile Responsiveness
export const MobileView: Story = {
  name: 'Mobile View - Responsive Layout',
  args: {
    trick: {
      trickIndex: 6,
      leaderPlayerId: '2' as PlayerId,
      ledSuit: 'hearts',
      plays: [
        createMockTrickPlay('2', 'ace', 'hearts', 0),
        createMockTrickPlay('3', 'king', 'hearts', 1),
        createMockTrickPlay('4', 'queen', 'hearts', 2),
        createMockTrickPlay('1', 'jack', 'hearts', 3),
      ],
      winningPlayerId: '2',
      winningCardId: '', // Will be set based on the ace
      completed: true,
    },
    players: [
      createMockPlayer('1', 'Alice'),
      createMockPlayer('2', 'Bob'),
      createMockPlayer('3', 'Charlie'),
      createMockPlayer('4', 'Diana'),
    ],
    trumpSuit: 'diamonds',
    trumpCard: createMockCard('jack', 'diamonds'),
    completedCount: 6,
  },
  parameters: {
    viewport: {
      defaultViewport: 'mobile1',
    },
    docs: {
      description: {
        story: 'Shows how the TrickArea component adapts to mobile screen sizes. The layout remains readable and the card information is clearly visible even on smaller screens.',
      },
    },
  },
};