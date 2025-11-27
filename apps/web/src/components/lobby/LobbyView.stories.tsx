import type { Meta, StoryObj } from '@storybook/react';
import type { ClientGameView, PlayerId, PlayerInGame } from '@game/domain';
import { LobbyView } from './LobbyView';


const meta: Meta<typeof LobbyView> = {
  title: 'Lobby/LobbyView',
  component: LobbyView,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component: 'High-level lobby experience shown before the first round begins. Use these stories to validate seat states, invite controls, and readiness messaging before enabling the feature flag.',
      },
    },
  },
  argTypes: {
    connection: {
      control: 'select',
      options: ['idle', 'connecting', 'open', 'closed'],
    },
    onRequestState: {
      action: 'request-state',
      description: 'Invoked when the "Refresh state" control is clicked.',
    },
  },
  args: {
    connection: 'open',
    joinCode: 'ABCD123',
  },
};

export default meta;
type Story = StoryObj<typeof LobbyView>;

const colors = ['#ff6b6b', '#4ecdc4', '#45b7d1', '#ffe066', '#c7f464', '#f08a5d'];

function createPlayer(playerId: string, displayName: string, seatIndex: number | null, overrides: Partial<PlayerInGame> = {}): PlayerInGame {
  const color = colors[(seatIndex ?? colors.length - 1) % colors.length];
  return {
    playerId: playerId as PlayerId,
    seatIndex,
    profile: {
      displayName,
      avatarSeed: overrides.profile?.avatarSeed ?? `${playerId}-seed`,
      color: overrides.profile?.color ?? color,
      userId: overrides.profile?.userId,
    },
    status: overrides.status ?? 'active',
    isBot: overrides.isBot ?? false,
    spectator: overrides.spectator ?? false,
  };
}

const basePlayers: PlayerInGame[] = [
  createPlayer('player-1', 'Host One', 0),
  createPlayer('player-2', 'Guest Two', 1),
  createPlayer('player-3', 'Guest Three', 2),
  createPlayer('player-4', 'Spectator Sue', null, { spectator: true }),
];

function createLobbyGame(overrides: Partial<ClientGameView> = {}): ClientGameView {
  const players = overrides.players ?? basePlayers;
  const lobbyReadyState = players.reduce<Record<PlayerId, { ready: boolean; updatedAt: number }>>((acc, player, index) => {
    if (player.spectator) {
      return acc;
    }
    acc[player.playerId] = {
      ready: player.isBot || index % 2 === 0,
      updatedAt: Date.now() - index * 1000,
    };
    return acc;
  }, {});
  return {
    gameId: overrides.gameId ?? 'lobby-demo',
    phase: 'LOBBY',
    players,
    you: overrides.you ?? players[0]?.playerId,
    hand: [],
    cumulativeScores: players.reduce<Record<string, number>>((scores, player, index) => {
      if (!player.spectator && player.seatIndex !== null) {
        scores[player.playerId] = index * 5;
      }
      return scores;
    }, {}),
    roundSummaries: [],
    round: null,
    config: overrides.config ?? {
      minPlayers: 2,
      maxPlayers: 4,
      roundCount: 10,
    },
    joinCode: overrides.joinCode ?? 'ABCD123',
    isPublic: overrides.isPublic ?? false,
    lobby: overrides.lobby ?? {
      readyState: lobbyReadyState,
      overrideReadyRequirement: false,
    },
  };
}

export const HostLobby: Story = {
  name: 'Host view',
  args: {
    game: createLobbyGame(),
    spectator: false,
  },
  parameters: {
    docs: {
      description: {
        story: 'Default host experience with a private lobby. Use this to validate invite controls and readiness messaging with mixed seats (players + spectator).',
      },
    },
  },
};

export const SpectatorLobby: Story = {
  name: 'Spectator view',
  args: {
    game: createLobbyGame({ you: 'player-4' }),
    spectator: true,
  },
  parameters: {
    docs: {
      description: {
        story: 'Spectator copy/controls are limited, but invite surfacing still works. Shows how the layout handles non-seated viewers.',
      },
    },
  },
};

export const PublicLobby: Story = {
  name: 'Public lobby',
  args: {
    game: createLobbyGame({
      isPublic: true,
      config: {
        minPlayers: 3,
        maxPlayers: 6,
        roundCount: 12,
      },
    }),
  },
  parameters: {
    docs: {
      description: {
        story: 'Demonstrates the lobby summary badges when settings diverge from defaults and the room is marked public.',
      },
    },
  },
};

export const ReconnectingLobby: Story = {
  name: 'Reconnecting state',
  args: {
    game: createLobbyGame(),
    connection: 'connecting',
  },
  parameters: {
    docs: {
      description: {
        story: 'Use this scenario to ensure the connection banner and controls behave correctly while the client attempts to recover.',
      },
    },
  },
};

export const HostBotManager: Story = {
  name: 'Host bot management',
  args: {
    game: createLobbyGame({
      config: {
        minPlayers: 3,
        maxPlayers: 6,
        roundCount: 10,
      },
      players: [
        createPlayer('player-1', 'Host One', 0),
        createPlayer('player-2', 'Guest Two', 1),
        createPlayer('player-3', 'Guest Three', 2),
        createPlayer('bot-1', 'Bot Ada', 3, { isBot: true }),
      ],
    }),
    spectator: false,
  },
  parameters: {
    docs: {
      description: {
        story: 'Showcases the host-only bot controls when open seats remain. Useful for reviewing copy, validation, and toasts without running the backend.',
      },
    },
  },
};

export const FullLobbyNoSeats: Story = {
  name: 'Full lobby (no seats left)',
  args: {
    game: createLobbyGame({
      players: [
        createPlayer('player-1', 'Host One', 0),
        createPlayer('player-2', 'Guest Two', 1),
        createPlayer('player-3', 'Guest Three', 2),
        createPlayer('bot-1', 'Bot Ada', 3, { isBot: true }),
      ],
      config: {
        minPlayers: 2,
        maxPlayers: 4,
        roundCount: 10,
      },
    }),
    spectator: false,
  },
  parameters: {
    docs: {
      description: {
        story: 'All seats are busy, so the bot controls explain why additional bots cannot be added. Use this to check disabled states and edge copy.',
      },
    },
  },
};
