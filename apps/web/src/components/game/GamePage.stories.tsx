import type { Meta, StoryObj } from '@storybook/react';
import { GamePage } from './GamePage';
import { gameStore, resetGameStore, updateGameState, setConnection, pushError, setWelcome } from '@/store/gameStore';
import type { ClientGameView, PlayerInGame, Card, Suit, Rank, PlayerId } from '@game/domain';
import { useEffect, useState } from 'react';
import type { ClientMessage } from '@/types/messages';

const meta: Meta<typeof GamePage> = {
  title: 'Game/GamePage',
  component: GamePage,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component: 'The GamePage component is the main container for the entire gameplay experience. It orchestrates all game UI elements including the player list, scorecard, trick area, player hand, and bidding modal. The component handles different game phases (lobby, bidding, playing), connection states, and provides comprehensive game state visualization with interactive controls.',
      },
    },
  },
  argTypes: {
    gameId: {
      description: 'Unique identifier for the game session',
      control: 'text',
    },
    playerToken: {
      description: 'Authentication token for the current player (null for spectators)',
      control: 'text',
    },
    sendMessage: {
      description: 'Function to send WebSocket messages to the game server',
      action: 'message sent',
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

const createMockPlayer = (playerId: string, displayName: string, seatIndex: number | null = null, isBot = false, status: PlayerInGame['status'] = 'active'): PlayerInGame => ({
  playerId: playerId as PlayerId,
  seatIndex,
  profile: {
    displayName,
    avatarSeed: `${displayName.toLowerCase()}-seed`,
    color: ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD'][seatIndex ?? 0] || '#6C5CE7',
  },
  status,
  isBot,
  spectator: false,
});

const createDemoGameState = (overrides: Partial<ClientGameView> = {}): ClientGameView => ({
  gameId: 'demo-game-123',
  phase: 'PLAYING',
  players: [],
  you: 'player-1',
  round: {
    roundIndex: 3,
    cardsPerPlayer: 7,
    trumpSuit: 'hearts',
    trumpCard: createMockCard('K', 'hearts'),
    dealerPlayerId: 'player-3',
    startingPlayerId: 'player-1',
    trumpBroken: false,
    bids: {},
    completedTricks: [],
    trickInProgress: null,
  },
  hand: [],
  cumulativeScores: {},
  roundSummaries: [],
  config: {
    minPlayers: 2,
    maxPlayers: 4,
    roundCount: 10,
  },
  isPublic: false,
  joinCode: 'ABC123',
  ...overrides,
});

// GamePage requires store setup, so we create a wrapper component
const GamePageWrapper: React.FC<React.ComponentProps<typeof GamePage>> = (props) => {
  useEffect(() => {
    // Reset store for each story render
    resetGameStore();
    return () => {
      resetGameStore();
    };
  }, []);

  return <GamePage {...props} />;
};

// Stories

// Story: Loading State
export const LoadingState: Story = {
  name: 'Loading State - Connecting to Game',
  render: function Render() {
    useEffect(() => {
      resetGameStore();
      setConnection('connecting');
      setWelcome({
        playerId: 'player-1',
        seatIndex: 0,
        spectator: false,
      });
    }, []);

    return (
      <GamePageWrapper
        gameId="demo-game-123"
        playerToken="token-123"
        sendMessage={(message) => {
          console.log('Message sent:', message);
          return true;
        }}
      />
    );
  },
  parameters: {
    docs: {
      description: {
        story: 'Shows the GamePage when initially connecting to a game server. Displays a connecting banner and minimal UI while waiting for server response. The player information is known but game data is not yet available.',
      },
    },
  },
};

// Story: Disconnected State
export const DisconnectedState: Story = {
  name: 'Disconnected State - Connection Lost',
  render: function Render() {
    useEffect(() => {
      resetGameStore();
      setConnection('closed');
      updateGameState(createDemoGameState({
        players: [
          createMockPlayer('player-1', 'Alice', 0),
          createMockPlayer('player-2', 'Bob', 1),
          createMockPlayer('player-3', 'Charlie', 2),
          createMockPlayer('player-4', 'Diana', 3),
        ],
      }));
    }, []);

    return (
      <GamePageWrapper
        gameId="demo-game-123"
        playerToken="token-123"
        sendMessage={() => false}
      />
    );
  },
  parameters: {
    docs: {
      description: {
        story: 'Displays the GamePage when connection to the game server is lost. Shows a disconnection banner and disables all game interactions. The game data persists for context but no actions can be performed.',
      },
    },
  },
};

// Story: Player as Spectator
export const SpectatorView: Story = {
  name: 'Spectator Mode - Watching Active Game',
  render: function Render() {
    useEffect(() => {
      resetGameStore();
      setConnection('open');
      setWelcome({
        playerId: 'spectator-1',
        seatIndex: null,
        spectator: true,
      });
      updateGameState(createDemoGameState({
        phase: 'PLAYING',
        players: [
          createMockPlayer('player-1', 'Alice', 0),
          createMockPlayer('player-2', 'Bob', 1),
          createMockPlayer('player-3', 'Charlie', 2),
          createMockPlayer('player-4', 'Diana', 3),
        ],
        round: {
          roundIndex: 3,
          cardsPerPlayer: 7,
          trumpSuit: 'clubs',
          trumpCard: createMockCard('7', 'clubs'),
          dealerPlayerId: 'player-4',
          startingPlayerId: 'player-4',
          trumpBroken: false,
          bids: {
            'player-1': 2,
            'player-2': 1,
            'player-3': 3,
            'player-4': 2,
          },
          completedTricks: [],
          trickInProgress: {
            trickIndex: 0,
            leaderPlayerId: 'player-1',
            ledSuit: null,
            plays: [],
            winningPlayerId: null,
            winningCardId: null,
            completed: false,
          },
        },
        cumulativeScores: {
          'player-1': 45,
          'player-2': 38,
          'player-3': 52,
          'player-4': 41,
        },
      }));
    }, []);

    return (
      <GamePageWrapper
        gameId="demo-game-123"
        playerToken={null}
        sendMessage={(message) => {
          console.log('Spectator message (would be blocked):', message);
          return false;
        }}
      />
    );
  },
  parameters: {
    docs: {
      description: {
        story: 'Shows the game from a spectator perspective. Displays all game information but disables all interactions. The spectator tag is visible and no personal hand is shown since spectators cannot hold cards.',
      },
    },
  },
};

// Story: Error State with Multiple Errors
export const ErrorState: Story = {
  name: 'Error State - Multiple Game Errors',
  render: function Render() {
    useEffect(() => {
      resetGameStore();
      setConnection('open');
      setWelcome({
        playerId: 'player-1',
        seatIndex: 0,
        spectator: false,
      });

      // Add some errors
      pushError('INVALID_PLAY', 'Cannot play that card at this time');
      pushError('INVALID_BID', 'Bid cannot be higher than number of cards per player');
      pushError('NETWORK_ERROR', 'Connection timed out');

      updateGameState(createDemoGameState({
        players: [
          createMockPlayer('player-1', 'Alice', 0),
          createMockPlayer('player-2', 'Bob', 1),
        ],
      }));
    }, []);

    return (
      <GamePageWrapper
        gameId="demo-game-123"
        playerToken="token-123"
        sendMessage={() => false}
      />
    );
  },
  parameters: {
    docs: {
      description: {
        story: 'Demonstrates the GamePage when multiple errors have occurred. Shows the error notification system with multiple error toasts appearing. All game actions are disabled when errors are present.',
      },
    },
  },
};

// Story: Lobby State
export const LobbyState: Story = {
  name: 'Lobby State - Waiting for Players',
  render: function Render() {
    useEffect(() => {
      resetGameStore();
      setConnection('open');
      setWelcome({
        playerId: 'player-1',
        seatIndex: 0,
        spectator: false,
      });
      updateGameState(createDemoGameState({
        phase: 'LOBBY',
        players: [
          createMockPlayer('player-1', 'Alice', 0),
          createMockPlayer('player-2', 'Bob', 1),
        ],
      }));
    }, []);

    return (
      <GamePageWrapper
        gameId="demo-game-123"
        playerToken="token-123"
        sendMessage={(message) => {
          console.log('Lobby message:', message);
          return true;
        }}
      />
    );
  },
  parameters: {
    docs: {
      description: {
        story: 'Shows the GamePage in lobby state while waiting for more players to join. Displays current players but no game mechanics are active yet. The refresh state button allows players to request updated lobby information.',
      },
    },
  },
};

// Story: Bidding Phase Waiting
export const BiddingPhaseWaiting: Story = {
  name: 'Bidding Phase - Waiting for Other Players',
  render: function Render() {
    useEffect(() => {
      resetGameStore();
      setConnection('open');
      setWelcome({
        playerId: 'player-1',
        seatIndex: 0,
        spectator: false,
      });
      updateGameState(createDemoGameState({
        phase: 'BIDDING',
        players: [
          createMockPlayer('player-1', 'Alice', 0),
          createMockPlayer('player-2', 'Bob', 1),
          createMockPlayer('player-3', 'Charlie', 2),
          createMockPlayer('player-4', 'Diana', 3),
        ],
        round: {
          roundIndex: 3,
          cardsPerPlayer: 7,
          trumpSuit: 'diamonds',
          trumpCard: createMockCard('8', 'diamonds'),
          dealerPlayerId: 'player-2',
          startingPlayerId: 'player-2',
          trumpBroken: false,
          bids: {
            'player-1': 2, // Alice has bid
            'player-2': null, // Bob is current bidder
            'player-3': null,
            'player-4': null,
          },
          completedTricks: [],
          trickInProgress: null,
        },
        hand: [createMockCard('A', 'spades'), createMockCard('K', 'hearts'), createMockCard('Q', 'diamonds'), createMockCard('J', 'clubs'), createMockCard('10', 'spades'), createMockCard('9', 'hearts'), createMockCard('8', 'diamonds')],
      }));
    }, []);

    return (
      <GamePageWrapper
        gameId="demo-game-123"
        playerToken="token-123"
        sendMessage={(message) => {
          console.log('Bidding message:', message);
          return true;
        }}
      />
    );
  },
  parameters: {
    docs: {
      description: {
        story: 'Shows the GamePage during the bidding phase with some players having bid and others still to bid. The bidding modal is not shown because the displayed player has already bid, but their bid is visible in the player list.',
      },
    },
  },
};

// Story: Bidding Phase Active
export const BiddingPhaseActive: Story = {
  name: 'Bidding Phase - Player Needs to Bid',
  render: function Render() {
    useEffect(() => {
      resetGameStore();
      setConnection('open');
      setWelcome({
        playerId: 'player-3',
        seatIndex: 2,
        spectator: false,
      });
      updateGameState(createDemoGameState({
        phase: 'BIDDING',
        players: [
          createMockPlayer('player-1', 'Alice', 0),
          createMockPlayer('player-2', 'Bob', 1),
          createMockPlayer('player-3', 'Charlie', 2),
          createMockPlayer('player-4', 'Diana', 3),
        ],
        you: 'player-3',
        round: {
          roundIndex: 4,
          cardsPerPlayer: 6,
          trumpSuit: 'hearts',
          trumpCard: createMockCard('J', 'hearts'),
          dealerPlayerId: 'player-2',
          startingPlayerId: 'player-2',
          trumpBroken: false,
          bids: {
            'player-1': 2,
            'player-2': 1,
            'player-3': null,
            'player-4': null,
          },
          completedTricks: [],
          trickInProgress: null,
        },
        hand: [createMockCard('A', 'spades'), createMockCard('K', 'hearts'), createMockCard('Q', 'diamonds'), createMockCard('J', 'clubs'), createMockCard('10', 'spades'), createMockCard('9', 'hearts')],
      }));
    }, []);

    return (
      <GamePageWrapper
        gameId="demo-game-123"
        playerToken="token-123"
        sendMessage={(message) => {
          console.log('Active bidding message:', message);
          return true;
        }}
      />
    );
  },
  parameters: {
    docs: {
      description: {
        story: 'Shows the GamePage from a player who needs to bid. The bidding modal is open and active, showing the current hand with trump card and allowing bid selection from 0 to cardsPerPlayer. Trump suit and current bid information is clearly displayed.',
      },
    },
  },
};

// Story: Playing Phase - Player Turn
export const PlayingPhasePlayerTurn: Story = {
  name: 'Playing Phase - Player\'s Turn to Play',
  render: function Render() {
    useEffect(() => {
      resetGameStore();
      setConnection('open');
      setWelcome({
        playerId: 'player-2',
        seatIndex: 1,
        spectator: false,
      });
      updateGameState(createDemoGameState({
        phase: 'PLAYING',
        players: [
          createMockPlayer('player-1', 'Alice', 0),
          createMockPlayer('player-2', 'Bob', 1),
          createMockPlayer('player-3', 'Charlie', 2),
          createMockPlayer('player-4', 'Diana', 3),
        ],
        you: 'player-2',
        round: {
          roundIndex: 3,
          cardsPerPlayer: 6,
          trumpSuit: 'diamonds',
          trumpCard: createMockCard('9', 'diamonds'),
          dealerPlayerId: 'player-4',
          startingPlayerId: 'player-4',
          trumpBroken: false,
          bids: {
            'player-1': 2,
            'player-2': 1,
            'player-3': 3,
            'player-4': 2,
          },
          completedTricks: [],
          trickInProgress: {
            trickIndex: 0,
            leaderPlayerId: 'player-1',
            ledSuit: 'clubs',
            plays: [{
              playerId: 'player-1',
              card: createMockCard('J', 'clubs'),
              order: 1,
            }],
            winningPlayerId: null,
            winningCardId: null,
            completed: false,
          },
        },
        hand: [createMockCard('A', 'spades'), createMockCard('K', 'hearts'), createMockCard('Q', 'diamonds'), createMockCard('10', 'spades'), createMockCard('9', 'hearts')],
      }));
    }, []);

    return (
      <GamePageWrapper
        gameId="demo-game-123"
        playerToken="token-123"
        sendMessage={(message) => {
          console.log('Play message:', message);
          return true;
        }}
      />
    );
  },
  parameters: {
    docs: {
      description: {
        story: 'Shows the GamePage during the playing phase on the current player\'s turn. The player hand is active and clickable, allowing card play. Shows current trick in progress with cards already played and trump suit information.',
      },
    },
  },
};

// Story: Playing Phase - Waiting for Turn
export const PlayingPhaseWaiting: Story = {
  name: 'Playing Phase - Waiting for Other Players',
  render: function Render() {
    useEffect(() => {
      resetGameStore();
      setConnection('open');
      setWelcome({
        playerId: 'player-1',
        seatIndex: 0,
        spectator: false,
      });
      updateGameState(createDemoGameState({
        phase: 'PLAYING',
        players: [
          createMockPlayer('player-1', 'Alice', 0),
          createMockPlayer('player-2', 'Bob', 1),
          createMockPlayer('player-3', 'Charlie', 2),
          createMockPlayer('player-4', 'Diana', 3),
        ],
        you: 'player-1',
        round: {
          roundIndex: 3,
          cardsPerPlayer: 6,
          trumpSuit: 'spades',
          trumpCard: createMockCard('K', 'spades'),
          dealerPlayerId: 'player-3',
          startingPlayerId: 'player-5',
          trumpBroken: false,
          bids: {
            'player-1': 2,
            'player-2': 1,
            'player-3': 3,
            'player-4': 2,
          },
          completedTricks: [
            // Previous trick completed
          ],
          trickInProgress: {
            trickIndex: 0,
            leaderPlayerId: 'player-3',
            ledSuit: 'hearts',
            plays: [{
              playerId: 'player-3',
              card: createMockCard('8', 'hearts'),
              order: 1,
            }, {
              playerId: 'player-4',
              card: createMockCard('9', 'hearts'),
              order: 2,
            }],
            winningPlayerId: null,
            winningCardId: null,
            completed: false,
          },
        },
        hand: [createMockCard('A', 'clubs'), createMockCard('K', 'diamonds'), createMockCard('Q', 'spades'), createMockCard('J', 'hearts'), createMockCard('10', 'clubs')],
      }));
    }, []);

    return (
      <GamePageWrapper
        gameId="demo-game-123"
        playerToken="token-123"
        sendMessage={(message) => {
          console.log('Waiting turn message:', message);
          return true;
        }}
      />
    );
  },
  parameters: {
    docs: {
      description: {
        story: 'Shows the GamePage during the playing phase when waiting for other players to play. The hand is disabled with a "Waiting for your turn…" message, and the current trick shows cards played by other players.',
      },
    },
  },
};

// Story: Game Completed
export const GameCompleted: Story = {
  name: 'Game Completed - Final Scores Displayed',
  render: function Render() {
    useEffect(() => {
      resetGameStore();
      setConnection('open');
      setWelcome({
        playerId: 'player-1',
        seatIndex: 0,
        spectator: false,
      });
      updateGameState(createDemoGameState({
        phase: 'COMPLETED',
        players: [
          createMockPlayer('player-1', 'Alice', 0),
          createMockPlayer('player-2', 'Bob', 1),
          createMockPlayer('player-3', 'Charlie', 2),
          createMockPlayer('player-4', 'Diana', 3),
        ],
        you: 'player-1',
        round: {
          roundIndex: 10,
          cardsPerPlayer: 1,
          trumpSuit: 'clubs',
          trumpCard: createMockCard('A', 'clubs'),
          dealerPlayerId: 'player-3',
          startingPlayerId: 'player-5',
          trumpBroken: false,
          bids: {
            'player-1': 0,
            'player-2': 1,
            'player-3': 0,
            'player-4': 1,
          },
          completedTricks: [
            // Mock completed trick
            {
              trickIndex: 0,
              leaderPlayerId: 'player-3',
              ledSuit: 'clubs',
              plays: [{
                playerId: 'player-3',
                card: createMockCard('9', 'clubs'),
                order: 1,
              }, {
                playerId: 'player-4',
                card: createMockCard('8', 'hearts'),
                order: 2,
              }, {
                playerId: 'player-1',
                card: createMockCard('7', 'diamonds'),
                order: 3,
              }, {
                playerId: 'player-2',
                card: createMockCard('6', 'spades'),
                order: 4,
              }],
              winningPlayerId: 'player-2',
              winningCardId: 'd0:clubs:9',
              completed: true,
            }
          ],
          trickInProgress: null,
        },
        hand: [createMockCard('6', 'hearts')], // Last card remaining
        cumulativeScores: {
          'player-1': 120,
          'player-2': 135, // Winner!
          'player-3': 118,
          'player-4': 128,
        },
      }));
    }, []);

    return (
      <GamePageWrapper
        gameId="demo-game-123"
        playerToken="token-123"
        sendMessage={(message) => {
          console.log('Game over message:', message);
          return true;
        }}
      />
    );
  },
  parameters: {
    docs: {
      description: {
        story: 'Shows the GamePage after a game has completed. Displays final scores in the scorecard and player list, with game state showing completion. Players can still view the scorecard and game information but cannot perform game actions.',
      },
    },
  },
};

// Interactive Demo with Complex Game Flow
export const InteractiveDemo: Story = {
  name: 'Interactive Demo - Full Game Simulation',
  render: function Render() {
    const [gameActions, setGameActions] = useState<string[]>([]);
    const [currentPhase, setCurrentPhase] = useState<'bidding' | 'playing'>('bidding');
    const [currentPlayer, setCurrentPlayer] = useState<string>('player-3');

    useEffect(() => {
      resetGameStore();
      setConnection('open');
      setWelcome({
        playerId: 'player-3',
        seatIndex: 2,
        spectator: false,
      });

      const gameState = createDemoGameState({
        phase: currentPhase.toUpperCase() as ClientGameView['phase'],
        players: [
          createMockPlayer('player-1', 'Alice', 0),
          createMockPlayer('player-2', 'Bob', 1),
          createMockPlayer('player-3', 'Charlie', 2),
          createMockPlayer('player-4', 'Diana', 3),
        ],
        you: 'player-3',
        round: {
          roundIndex: 4,
          cardsPerPlayer: 6,
          trumpSuit: 'hearts',
          trumpCard: createMockCard('J', 'hearts'),
          dealerPlayerId: 'player-2',
          startingPlayerId: 'player-2',
          trumpBroken: false,
          bids: currentPhase === 'playing' ? {
            'player-1': 2,
            'player-2': 1,
            'player-3': 3,
            'player-4': 2,
          } : {
            'player-1': 2,
            'player-2': 1,
            'player-3': null,
            'player-4': null,
          },
          completedTricks: currentPhase === 'playing' ? [
            // First trick completed (mock TrickState object)
            {
              trickIndex: 0,
              leaderPlayerId: 'player-1',
              ledSuit: 'hearts',
              plays: [{
                playerId: 'player-2',
                card: createMockCard('A', 'diamonds'),
                order: 1,
              }, {
                playerId: 'player-3',
                card: createMockCard('K', 'spades'),
                order: 2,
              }, {
                playerId: 'player-4',
                card: createMockCard('Q', 'hearts'),
                order: 3,
              }, {
                playerId: 'player-1',
                card: createMockCard('J', 'clubs'),
                order: 4,
              }],
              winningPlayerId: 'player-1',
              winningCardId: 'd0:spades:K',
              completed: true,
            }
          ] : [],
          trickInProgress: currentPhase === 'playing' ? {
            trickIndex: 0,
            leaderPlayerId: 'player-1',
            ledSuit: 'clubs',
            plays: [{
              playerId: 'player-1',
              card: createMockCard('J', 'clubs'),
              order: 1,
            }],
            winningPlayerId: null,
            winningCardId: null,
            completed: false,
          } : null,
        },
        hand: [
          createMockCard('A', 'spades'),
          createMockCard('K', 'hearts'),
          createMockCard('Q', 'diamonds'),
          createMockCard('J', 'clubs'),
          createMockCard('10', 'spades'),
          createMockCard('9', 'hearts'),
        ],
        cumulativeScores: {
          'player-1': 87,
          'player-2': 92,
          'player-3': 95,
          'player-4': 89,
        },
      });

      updateGameState(gameState);
    }, [currentPhase, currentPlayer]);

    const handleSendMessage = (message: ClientMessage) => {
      const timestamp = new Date().toLocaleTimeString();
      setGameActions(prev => [...prev, `[${timestamp}] ${JSON.stringify(message)}`]);

      if (message.type === 'BID') {
        setCurrentPhase('playing');
        setGameActions(prev => [...prev, `[${timestamp}] Phase changed to PLAYING`]);
      } else if (message.type === 'PLAY_CARD') {
        // Simulate trick progression
        setCurrentPlayer('player-4');
        setGameActions(prev => [...prev, `[${timestamp}] Trick continues to next player`]);
      }

      return true;
    };

    const switchPhase = () => {
      setCurrentPhase(prev => prev === 'bidding' ? 'playing' : 'bidding');
      setGameActions([]);
    };

    return (
      <div className="space-y-4">
        <div className="rounded-lg bg-muted p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-semibold">Interactive Game Demo</h3>
            <button
              onClick={switchPhase}
              className="rounded-md bg-primary px-3 py-1 text-xs text-primary-foreground hover:bg-primary/90"
            >
              Switch to {currentPhase === 'bidding' ? 'Playing' : 'Bidding'}
            </button>
          </div>
          <div className="mb-3 grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="font-medium">Current Phase:</span>{' '}
              <span className="text-muted-foreground">{currentPhase === 'bidding' ? 'Bidding' : 'Playing'}</span>
            </div>
            <div>
              <span className="font-medium">Current Turn:</span>{' '}
              <span className="text-muted-foreground">{currentPlayer === 'player-3' ? 'You' : 'Other Player'}</span>
            </div>
          </div>
          <div className="rounded-md bg-background/50 p-2">
            <p className="mb-1 text-xs font-medium">Recent Actions:</p>
            <div className="max-h-32 space-y-1 overflow-y-auto text-xs">
              {gameActions.length === 0 ? (
                <p className="text-muted-foreground">Try interacting with the game components below...</p>
              ) : (
                gameActions.slice(-5).map((action, index) => (
                  <div key={index} className="font-mono text-muted-foreground">
                    {action}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
        <GamePageWrapper
          gameId="interactive-demo-123"
          playerToken="demo-token-123"
          sendMessage={handleSendMessage}
        />
      </div>
    );
  },
  parameters: {
    docs: {
      description: {
        story: 'Interactive demonstration of the GamePage component with full game mechanics. Shows realistic game flow between bidding and playing phases, with turn-based interactions. The action log tracks all player actions for debugging and demonstration purposes.',
      },
    },
  },
};

// Story: Game with Disconnected Players
export const DisconnectedPlayersGame: Story = {
  name: 'Disconnected Players - Mixed Player States',
  render: function Render() {
    useEffect(() => {
      resetGameStore();
      setConnection('open');
      setWelcome({
        playerId: 'player-1',
        seatIndex: 0,
        spectator: false,
      });
      updateGameState(createDemoGameState({
        phase: 'PLAYING',
        players: [
          createMockPlayer('player-1', 'Alice', 0, false, 'active'),
          createMockPlayer('player-2', 'Bob', 1, false, 'disconnected'),
          createMockPlayer('player-3', 'Charlie', 2, true, 'active'), // Bot player
          createMockPlayer('player-4', 'Diana', 3, false, 'left'),
        ],
        you: 'player-1',
        round: {
          roundIndex: 5,
          cardsPerPlayer: 5,
          trumpSuit: 'spades',
          trumpCard: createMockCard('10', 'spades'),
          dealerPlayerId: 'player-1',
          startingPlayerId: 'player-5',
          trumpBroken: false,
          bids: {
            'player-1': 1,
            'player-2': 2,
            'player-3': 1,
            'player-4': 1,
          },
          completedTricks: [],
          trickInProgress: {
            trickIndex: 0,
            leaderPlayerId: 'player-1',
            ledSuit: 'hearts',
            plays: [{
              playerId: 'player-1',
              card: createMockCard('A', 'hearts'),
              order: 1,
            }],
            winningPlayerId: null,
            winningCardId: null,
            completed: false,
          },
        },
        hand: [createMockCard('K', 'spades'), createMockCard('Q', 'hearts'), createMockCard('J', 'diamonds'), createMockCard('10', 'clubs'), createMockCard('9', 'spades')],
        cumulativeScores: {
          'player-1': 65,
          'player-2': 58,
          'player-3': 71,
          'player-4': 63,
        },
      }));
    }, []);

    return (
      <GamePageWrapper
        gameId="demo-game-123"
        playerToken="token-123"
        sendMessage={(message) => {
          console.log('Mixed state message:', message);
          return true;
        }}
      />
    );
  },
  parameters: {
    docs: {
      description: {
        story: 'Demonstrates GamePage handling players in different connection states. Shows disconnected players, bot players, and players who have left the game. The UI adapts to show connection status and handle mixed game states gracefully.',
      },
    },
  },
};

// Story: 2-Player Game View
export const TwoPlayerGame: Story = {
  name: '2-Player Game - Duels',
  render: function Render() {
    useEffect(() => {
      resetGameStore();
      setConnection('open');
      setWelcome({
        playerId: 'player-1',
        seatIndex: 0,
        spectator: false,
      });
      updateGameState(createDemoGameState({
        phase: 'BIDDING',
        players: [
          createMockPlayer('player-1', 'Alice', 0),
          createMockPlayer('player-2', 'Bob', 1),
        ],
        you: 'player-1',
        round: {
          roundIndex: 2,
          cardsPerPlayer: 8,
          trumpSuit: 'diamonds',
          trumpCard: createMockCard('Q', 'diamonds'),
          dealerPlayerId: 'player-2',
          startingPlayerId: 'player-2',
          trumpBroken: false,
          bids: {
            'player-1': null,
            'player-2': 3,
          },
          completedTricks: [],
          trickInProgress: null,
        },
        hand: [createMockCard('A', 'spades'), createMockCard('K', 'hearts'), createMockCard('Q', 'diamonds'), createMockCard('J', 'clubs'), createMockCard('10', 'spades'), createMockCard('9', 'hearts'), createMockCard('8', 'diamonds'), createMockCard('7', 'clubs')],
        cumulativeScores: {
          'player-1': 42,
          'player-2': 45,
        },
      }));
    }, []);

    return (
      <GamePageWrapper
        gameId="2player-demo-123"
        playerToken="token-123"
        sendMessage={(message) => {
          console.log('2-player message:', message);
          return true;
        }}
      />
    );
  },
  parameters: {
    docs: {
      description: {
        story: 'Shows the GamePage optimized for 2-player games. With only two players, the layout remains clean and focused while providing all necessary game information for duels. ',
      },
    },
  },
};

// Mobile Responsive Demo
export const MobileGameView: Story = {
  name: 'Mobile View - Responsive Game Layout',
  render: function Render() {
    useEffect(() => {
      resetGameStore();
      setConnection('open');
      setWelcome({
        playerId: 'player-3',
        seatIndex: 2,
        spectator: false,
      });
      updateGameState(createDemoGameState({
        phase: 'PLAYING',
        players: [
          createMockPlayer('player-1', 'Alice', 0),
          createMockPlayer('player-2', 'Bob', 1),
          createMockPlayer('player-3', 'Charlie', 2),
          createMockPlayer('player-4', 'Diana', 3),
        ],
        you: 'player-3',
        round: {
          roundIndex: 5,
          cardsPerPlayer: 5,
          trumpSuit: 'diamonds',
          trumpCard: createMockCard('A', 'diamonds'),
          dealerPlayerId: 'player-4',
          startingPlayerId: 'player-4',
          trumpBroken: false,
          bids: {
            'player-1': 1,
            'player-2': 2,
            'player-3': 1,
            'player-4': 2,
          },
          completedTricks: [],
          trickInProgress: {
            trickIndex: 0,
            leaderPlayerId: 'player-1',
            ledSuit: 'clubs',
            plays: [{
              playerId: 'player-1',
              card: createMockCard('K', 'clubs'),
              order: 1,
            }, {
              playerId: 'player-2',
              card: createMockCard('Q', 'hearts'),
              order: 2,
            }, {
              playerId: 'player-3',
              card: createMockCard('J', 'diamonds'),
              order: 3,
            }],
            winningPlayerId: null,
            winningCardId: null,
            completed: false,
          },
        },
        hand: [createMockCard('10', 'spades'), createMockCard('9', 'hearts'), createMockCard('8', 'diamonds'), createMockCard('7', 'clubs'), createMockCard('6', 'spades')],
        cumulativeScores: {
          'player-1': 78,
          'player-2': 82,
          'player-3': 85,
          'player-4': 79,
        },
      }));
    }, []);

    return (
      <GamePageWrapper
        gameId="mobile-demo-123"
        playerToken="token-123"
        sendMessage={(message) => {
          console.log('Mobile message:', message);
          return true;
        }}
      />
    );
  },
  parameters: {
    viewport: {
      defaultViewport: 'mobile1',
    },
    docs: {
      description: {
        story: 'Demonstrates the GamePage layout on mobile devices. Shows responsive design that adapts player list, scorecard, and hand layout for optimal mobile gameplay experience while maintaining full functionality.',
      },
    },
  },
};

// Empty Hand with Starting Round
export const EmptyHandStartingRound: Story = {
  name: 'Empty Hand - Starting New Round',
  render: function Render() {
    useEffect(() => {
      resetGameStore();
      setConnection('open');
      setWelcome({
        playerId: 'player-1',
        seatIndex: 0,
        spectator: false,
      });
      updateGameState(createDemoGameState({
        phase: 'BIDDING',
        players: [
          createMockPlayer('player-1', 'Alice', 0),
          createMockPlayer('player-2', 'Bob', 1),
          createMockPlayer('player-3', 'Charlie', 2),
          createMockPlayer('player-4', 'Diana', 3),
        ],
        you: 'player-1',
        round: {
          roundIndex: 0,
          cardsPerPlayer: 10,
          trumpSuit: 'spades',
          trumpCard: createMockCard('K', 'spades'),
          dealerPlayerId: 'player-4',
          startingPlayerId: 'player-4',
          trumpBroken: false,
          bids: {
            'player-1': null,
            'player-2': null,
            'player-3': null,
            'player-4': null,
          },
          completedTricks: [],
          trickInProgress: null,
        },
        hand: [], // No cards dealt yet
        cumulativeScores: {},
      }));
    }, []);

    return (
      <GamePageWrapper
        gameId="empty-hand-demo-123"
        playerToken="token-123"
        sendMessage={(message) => {
          console.log('Empty hand message:', message);
          return true;
        }}
      />
    );
  },
  parameters: {
    docs: {
      description: {
        story: 'Demonstrates GamePage handling when no cards are dealt in hand. This typically occurs at the beginning of a round before cards are distributed, during certain game phases, or for spectators.',
      },
    },
  },
};

// 6-Player Game for Maximum Complexity
export const SixPlayerGame: Story = {
  name: '6-Player Game - Maximum Players',
  render: function Render() {
    useEffect(() => {
      resetGameStore();
      setConnection('open');
      setWelcome({
        playerId: 'player-3',
        seatIndex: 2,
        spectator: false,
      });
      updateGameState(createDemoGameState({
        phase: 'PLAYING',
        players: [
          createMockPlayer('player-1', 'Alice', 0),
          createMockPlayer('player-2', 'Bob', 1),
          createMockPlayer('player-3', 'Charlie', 2),
          createMockPlayer('player-4', 'Diana', 3),
          createMockPlayer('player-5', 'Eve', 4),
          createMockPlayer('player-6', 'Frank', 5),
        ],
        you: 'player-3',
        round: {
          roundIndex: 1,
          cardsPerPlayer: 8,
          trumpSuit: 'hearts',
          trumpCard: createMockCard('Q', 'hearts'),
          trumpBroken: false,
          dealerPlayerId: 'player-5',
          startingPlayerId: 'player-1',
          bids: {
            'player-1': 2,
            'player-2': 1,
            'player-3': 3,
            'player-4': 2,
            'player-5': 1,
            'player-6': 2,
          },
          completedTricks: [],
          trickInProgress: {
            trickIndex: 0,
            leaderPlayerId: 'player-1',
            ledSuit: 'spades',
            plays: [{
              playerId: 'player-1',
              card: createMockCard('A', 'spades'),
              order: 1,
            }, {
              playerId: 'player-2',
              card: createMockCard('K', 'hearts'),
              order: 2,
            }, {
              playerId: 'player-3',
              card: createMockCard('Q', 'diamonds'),
              order: 3,
            }],
            winningPlayerId: null,
            winningCardId: null,
            completed: false,
          }
        },
        hand: [
          createMockCard('J', 'clubs'),
          createMockCard('10', 'spades'),
          createMockCard('9', 'hearts'),
          createMockCard('8', 'diamonds'),
          createMockCard('7', 'clubs'),
          createMockCard('6', 'spades'),
          createMockCard('5', 'hearts'),
          createMockCard('4', 'diamonds'),
        ],
        cumulativeScores: {
          'player-1': 18,
          'player-2': 23,
          'player-3': 27,
          'player-4': 21,
          'player-5': 20,
          'player-6': 25,
        },
      }));
    }, []);

    return (
      <GamePageWrapper
        gameId="6player-demo-123"
        playerToken="token-123"
        sendMessage={(message) => {
          console.log('6-player message:', message);
          return true;
        }}
      />
    );
  },
  parameters: {
    docs: {
      description: {
        story: 'Displays the GamePage for a 6-player game session with maximum player capacity. Shows how the component scales to accommodate more players while maintaining readability and usability.',
      },
    },
  },
};