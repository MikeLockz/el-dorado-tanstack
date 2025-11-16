import type { Meta, StoryObj } from '@storybook/react';
import { Hand } from './Hand';
import type { Card, Suit, Rank } from '@game/domain';
import { useState } from 'react';

const meta: Meta<typeof Hand> = {
  title: 'Game/Hand',
  component: Hand,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component: 'The Hand component displays a player\'s card hand during gameplay. Cards are grouped by suit in the order: spades, hearts, diamonds, clubs. The component shows card counts, disabled states when waiting for turn, and handles card play interactions with visual feedback.',
      },
    },
  },
  argTypes: {
    cards: {
      description: 'Array of Card objects representing the player\'s hand',
      control: 'object',
    },
    disabled: {
      description: 'Whether the hand is disabled (waiting for player\'s turn)',
      control: 'boolean',
    },
    onPlay: {
      description: 'Callback function triggered when a card is played',
      action: 'card played',
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

// Mock data creators
const createMockCard = (rank: Rank, suit: Suit, deckIndex: number = 0): Card => ({
  id: `d${deckIndex}:${suit}:${rank}`,
  rank,
  suit,
  deckIndex,
});

const createHand = (...cards: [Rank, Suit, number?][]): Card[] =>
  cards.map(([rank, suit, deckIndex = 0], index) => createMockCard(rank, suit, deckIndex));

// Stories

// Story: Empty Hand
export const EmptyHand: Story = {
  name: 'Empty Hand - No Cards to Play',
  args: {
    cards: [],
    disabled: false,
    onPlay: () => {},
  },
  parameters: {
    docs: {
      description: {
        story: 'Shows the Hand component when a player has no cards. Displays a "No cards to play" message in a compact, informative format. This typically occurs at the start of a round before cards are dealt or when a player has played all their cards.',
      },
    },
  },
};

// Story: Single Card
export const SingleCard: Story = {
  name: 'Single Card - One Card Remaining',
  args: {
    cards: createHand(['A', 'spades']),
    disabled: false,
    onPlay: () => {},
  },
  parameters: {
    docs: {
      description: {
        story: 'Displays a hand with only one card remaining. Shows how the component handles minimal hand sizes with proper spacing and the "1 card" count indicator in the header.',
      },
    },
  },
};

// Story: Active Hand - Mixed Suits
export const ActiveHandMixed: Story = {
  name: 'Active Hand - Mixed Suits (Playable)',
  args: {
    cards: createHand(
      ['K', 'spades'],
      ['Q', 'hearts'],
      ['J', 'diamonds'],
      ['10', 'clubs'],
      ['9', 'spades'],
      ['8', 'hearts'],
      ['7', 'diamonds'],
      ['6', 'clubs']
    ),
    disabled: false,
    onPlay: () => {},
  },
  parameters: {
    docs: {
      description: {
        story: 'Shows a typical active hand during gameplay with mixed suits. Cards are grouped by suit in the standard order (spades, hearts, diamonds, clubs), and each card is clickable for playing. The component is interactive with hover effects and proper card spacing.',
      },
    },
  },
};

// Story: Disabled Hand - Waiting for Turn
export const DisabledHandWaiting: Story = {
  name: 'Disabled Hand - Waiting for Turn',
  args: {
    cards: createHand(
      ['A', 'spades'],
      ['K', 'hearts'],
      ['Q', 'diamonds'],
      ['J', 'clubs'],
      ['10', 'spades'],
      ['9', 'hearts'],
      ['8', 'diamonds'],
      ['7', 'clubs']
    ),
    disabled: true,
    onPlay: () => {},
  },
  parameters: {
    docs: {
      description: {
        story: 'Shows the hand when it\'s disabled (waiting for the player\'s turn). Cards are displayed but not interactive, with a "Waiting for your turn…" message and subdued styling. This prevents players from making moves out of turn.',
      },
    },
  },
};

// Story: Full Hand - All 13 Cards
export const FullHand: Story = {
  name: 'Full Hand - All 13 Cards',
  args: {
    cards: createHand(
      ['A', 'spades'], ['K', 'spades'], ['Q', 'spades'], ['J', 'spades'], ['10', 'spades'],
      ['A', 'hearts'], ['K', 'hearts'], ['Q', 'hearts'],
      ['A', 'diamonds'], ['K', 'diamonds'],
      ['A', 'clubs'], ['K', 'clubs'], ['Q', 'clubs']
    ),
    disabled: false,
    onPlay: () => {},
  },
  parameters: {
    docs: {
      description: {
        story: 'Demonstrates a complete hand with 13 cards, showing how the component handles maximum hand sizes. Cards are properly grouped by suit with appropriate wrapping and spacing. The header shows "13 cards" count.',
      },
    },
  },
};

// Story: All One Suit - Spades Only
export const AllOneSuit: Story = {
  name: 'All One Suit - Spades Only',
  args: {
    cards: createHand(
      ['A', 'spades'], ['K', 'spades'], ['Q', 'spades'], ['J', 'spades'], ['10', 'spades'],
      ['9', 'spades'], ['8', 'spades'], ['7', 'spades'], ['6', 'spades'], ['5', 'spades'],
      ['4', 'spades'], ['3', 'spades'], ['2', 'spades']
    ),
    disabled: false,
    onPlay: () => {},
  },
  parameters: {
    docs: {
      description: {
        story: 'Shows a hand containing only spades (all 13 cards of one suit). This demonstrates the component\'s ability to handle edge cases and group cards efficiently when all cards share the same suit.',
      },
    },
  },
};

// Story: High Cards Collection
export const HighCards: Story = {
  name: 'High Cards - Face Cards Collection',
  args: {
    cards: createHand(
      ['A', 'spades'], ['K', 'spades'], ['Q', 'spades'], ['J', 'spades'],
      ['A', 'hearts'], ['K', 'hearts'], ['Q', 'hearts'], ['J', 'hearts'],
      ['A', 'diamonds'], ['K', 'diamonds'], ['Q', 'diamonds'],
      ['A', 'clubs'], ['K', 'clubs']
    ),
    disabled: false,
    onPlay: () => {},
  },
  parameters: {
    docs: {
      description: {
        story: 'Displays a premium hand with mostly high-value cards (Aces, Kings, Queens, Jacks). This showcases the visual distinction between different card ranks and how the component presents a strong hand.',
      },
    },
  },
};

// Story: Low Cards Collection
export const LowCards: Story = {
  name: 'Low Cards - Number Cards Collection',
  args: {
    cards: createHand(
      ['2', 'spades'], ['3', 'spades'], ['4', 'spades'], ['5', 'spades'], ['6', 'spades'],
      ['2', 'hearts'], ['3', 'hearts'], ['4', 'hearts'],
      ['2', 'diamonds'], ['3', 'diamonds'],
      ['2', 'clubs'], ['3', 'clubs'], ['4', 'clubs']
    ),
    disabled: false,
    onPlay: () => {},
  },
  parameters: {
    docs: {
      description: {
        story: 'Shows a hand composed entirely of low-value cards (2-6). Demonstrates how the component handles less favorable hands and provides consistent visual presentation regardless of card values.',
      },
    },
  },
};

// Story: Interactive Demo with Play Action
export const InteractivePlayDemo: Story = {
  name: 'Interactive Demo - Card Play Action',
  render: function Render() {
    const [playedCards, setPlayedCards] = useState<string[]>([]);
    const [lastPlayedCard, setLastPlayedCard] = useState<string | null>(null);

    const initialCards = createHand(
      ['A', 'spades'], ['K', 'hearts'], ['Q', 'diamonds'], ['J', 'clubs'],
      ['10', 'spades'], ['9', 'hearts'], ['8', 'diamonds'], ['7', 'clubs']
    );

    const remainingCards = initialCards.filter(card => !playedCards.includes(card.id));
    const isDisabled = remainingCards.length === 0;

    const handlePlayCard = (cardId: string) => {
      setPlayedCards(prev => [...prev, cardId]);
      setLastPlayedCard(cardId);
    };

    return (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Click on any card to play it. Played cards will be removed from the hand.
        </p>
        {lastPlayedCard && (
          <div className="rounded-lg bg-muted p-3 text-sm">
            <span className="font-medium">Last played card:</span> {lastPlayedCard}
          </div>
        )}
        <Hand
          cards={remainingCards}
          disabled={isDisabled}
          onPlay={handlePlayCard}
        />
      </div>
    );
  },
  parameters: {
    docs: {
      description: {
        story: 'Interactive demonstration of the Hand component with working card play functionality. Click on any card to "play" it - the card will be removed from the hand and the action will be logged. This shows the component\'s interactive behavior and how it handles card removal.',
      },
    },
  },
};

// Story: Mixed Suit Distribution
export const MixedSuitDistribution: Story = {
  name: 'Mixed Suit Distribution - Uneven Suits',
  args: {
    cards: createHand(
      // Heavy in spades
      ['A', 'spades'], ['K', 'spades'], ['Q', 'spades'], ['J', 'spades'], ['10', 'spades'], ['9', 'spades'],
      // Medium in hearts
      ['A', 'hearts'], ['K', 'hearts'], ['Q', 'hearts'],
      // Light in diamonds
      ['A', 'diamonds'],
      // Just one club
      ['A', 'clubs']
    ),
    disabled: false,
    onPlay: () => {},
  },
  parameters: {
    docs: {
      description: {
        story: 'Demonstrates uneven suit distribution with different numbers of cards in each suit. Shows how the component handles hands where some suits are heavily represented while others have only one or two cards.',
      },
    },
  },
};

// Story: Mobile Responsiveness
export const MobileView: Story = {
  name: 'Mobile View - Responsive Layout',
  args: {
    cards: createHand(
      ['A', 'spades'], ['K', 'hearts'], ['Q', 'diamonds'], ['J', 'clubs'],
      ['10', 'spades'], ['9', 'hearts'], ['8', 'diamonds'], ['7', 'clubs'],
      ['6', 'spades'], ['5', 'hearts'], ['4', 'diamonds'], ['3', 'clubs']
    ),
    disabled: false,
    onPlay: () => {},
  },
  parameters: {
    viewport: {
      defaultViewport: 'mobile1',
    },
    docs: {
      description: {
        story: 'Shows how the Hand component adapts to mobile screen sizes. The responsive design ensures cards remain readable and clickable even on smaller screens, with appropriate spacing and text sizing.',
      },
    },
  },
};

// Story: Animation Showcase
export const AnimationShowcase: Story = {
  name: 'Animation Showcase - Card Pop Effects',
  args: {
    cards: createHand(
      ['A', 'spades'], ['K', 'hearts'], ['Q', 'diamonds'], ['J', 'clubs'],
      ['10', 'spades'], ['9', 'hearts'], ['8', 'diamonds'], ['7', 'clubs']
    ),
    disabled: false,
    onPlay: () => {},
  },
  parameters: {
    docs: {
      description: {
        story: 'Demonstrates the card animation effects. Cards animate with the "card-pop" effect when rendered, providing visual feedback for hand changes. Hover over cards to see interactive states.',
      },
    },
  },
};

// Story: Usage Example - Complete Game Scenario
export const CompleteGameScenario: Story = {
  name: 'Usage Example - Complete Game Scenario',
  render: function Render() {
    const [currentPlayer, setCurrentPlayer] = useState(0);
    const [gameLog, setGameLog] = useState<string[]>([]);

    const players = ['Alice', 'Bob', 'Charlie', 'Diana'];
    const currentPlayerName = players[currentPlayer];
    const isCurrentPlayerTurn = currentPlayer === 0; // Player 0 is "us"

    const handCards = createHand(
      ['A', 'spades'], ['K', 'hearts'], ['Q', 'diamonds'], ['J', 'clubs'],
      ['10', 'spades'], ['9', 'hearts'], ['8', 'diamonds'], ['7', 'clubs']
    );

    const handlePlayCard = (cardId: string) => {
      const cardInfo = cardId.split(':');
      const [rank, suit] = [cardInfo[2], cardInfo[1]];
      setGameLog(prev => [
        ...prev,
        `${currentPlayerName} played ${rank} of ${suit}`,
        `${players[(currentPlayer + 1) % 4]}'s turn`
      ]);
      setCurrentPlayer(prev => (prev + 1) % 4);
    };

    return (
      <div className="space-y-4">
        <div className="rounded-lg bg-muted p-4">
          <h3 className="mb-2 font-semibold">Game Status</h3>
          <p className="text-sm text-muted-foreground">
            Current turn: <span className="font-medium text-foreground">{currentPlayerName}</span>
          </p>
          <p className="text-sm text-muted-foreground">
            Your hand is {isCurrentPlayerTurn ? 'active' : 'disabled'} (
            {isCurrentPlayerTurn ? 'you can play cards' : 'waiting for your turn'})
          </p>
        </div>
        <Hand
          cards={handCards}
          disabled={!isCurrentPlayerTurn}
          onPlay={handlePlayCard}
        />
        <div className="rounded-lg bg-muted p-3">
          <h4 className="mb-2 font-medium">Game Log:</h4>
          <div className="space-y-1 text-sm">
            {gameLog.length === 0 ? (
              <p className="text-muted-foreground">No moves yet. It's your turn - click a card to play!</p>
            ) : (
              gameLog.slice(-5).map((log, index) => (
                <p key={index} className={index % 2 === 0 ? "font-medium" : "text-muted-foreground"}>
                  {log}
                </p>
              ))
            )}
          </div>
        </div>
      </div>
    );
  },
  parameters: {
    docs: {
      description: {
        story: 'Complete usage example showing the Hand component in a realistic game scenario. Demonstrates turn-based gameplay with a game log, current player tracking, and conditional hand enabling/disabling. This example shows best practices for integrating the Hand component within a full game context.',
      },
    },
  },
};