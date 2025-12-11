import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  Suit,
  Rank,
  Card,
  GameState,
  RoundState,
  TrickState,
  PlayerInGame,
  ServerPlayerState,
  playCard,
  completeTrick,
  PlayerId,
  EngineError,
} from '@game/domain';

const FIXTURE_PATH = path.join(__dirname, '../../../fixtures/compliance_suite.json');

interface FixtureScenario {
  id: string;
  description: string;
  type: 'legal_move' | 'trick_winner';
  setup: {
    hand?: string[]; // for legal_move
    trick_plays?: { card: string; player: string }[]; // for trick_winner
    led_suit?: string;
    trump_suit?: string;
    trump_broken?: boolean;
  };
  action?: { card: string }; // for legal_move
  expected: {
    valid?: boolean;
    error?: string;
    winning_player?: string;
  };
}

function parseSuit(s: string): Suit {
  const map: Record<string, Suit> = {
    C: 'clubs',
    D: 'diamonds',
    H: 'hearts',
    S: 'spades',
  };
  const suit = map[s.toUpperCase()];
  if (!suit) throw new Error(`Invalid suit: ${s}`);
  return suit;
}

function parseRank(r: string): Rank {
  return r as Rank;
}

function parseCard(c: string): Card {
  const [suitStr, rankStr] = c.split('-');
  return {
    id: c, 
    suit: parseSuit(suitStr),
    rank: parseRank(rankStr),
    deckIndex: 0,
  };
}

function createMockState(setup: FixtureScenario['setup']): GameState {
  const trickPlayerIds = setup.trick_plays ? setup.trick_plays.map(p => p.player) : [];
  const uniquePlayerIds = Array.from(new Set(['p1', 'p2', 'p3', 'p4', ...trickPlayerIds])).sort();
  
  const players: PlayerInGame[] = uniquePlayerIds.map((id, idx) => ({
    playerId: id as PlayerId,
    displayName: `Player ${id}`,
    seatIndex: idx,
    isBot: false,
    connected: true,
    spectator: false,
  }));

  const playerStates: Record<string, ServerPlayerState> = {};
  uniquePlayerIds.forEach((id) => {
    playerStates[id] = {
        playerId: id as PlayerId,
        hand: [],
        tricksWon: 0,
        callAway: false,
        readyToPlay: true
    };
  });

  if (setup.hand) {
    playerStates['p1'].hand = setup.hand.map(parseCard);
  }

  const trickPlays = setup.trick_plays ? setup.trick_plays.map((p, idx) => ({
    playerId: p.player as PlayerId,
    card: parseCard(p.card),
    order: idx,
  })) : [];
  
  const trickInProgress: TrickState = {
    trickIndex: 0,
    leaderPlayerId: trickPlays.length > 0 ? trickPlays[0].playerId : 'p1',
    ledSuit: setup.led_suit ? parseSuit(setup.led_suit) : null,
    plays: trickPlays,
    winningPlayerId: null,
    winningCardId: null,
    completed: false,
  };

  const roundState: RoundState = {
    roundIndex: 0,
    cardsPerPlayer: 10,
    roundSeed: 'test',
    trumpCard: null,
    trumpSuit: setup.trump_suit ? parseSuit(setup.trump_suit) : null,
    trumpBroken: setup.trump_broken ?? false,
    bids: { p1: 1, p2: 1, p3: 1, p4: 1 },
    biddingComplete: true,
    trickInProgress: trickInProgress,
    completedTricks: [],
    dealerPlayerId: 'p4',
    startingPlayerId: 'p1',
    deck: [],
    remainingDeck: [],
  };

  return {
    gameId: 'test-game',
    config: {
        gameId: 'test-game',
        sessionSeed: 'seed',
        roundCount: 1,
        minPlayers: uniquePlayerIds.length,
        maxPlayers: uniquePlayerIds.length,
    },
    phase: 'PLAYING',
    players,
    playerStates,
    roundState,
    roundSummaries: [],
    cumulativeScores: { p1: 0, p2: 0, p3: 0, p4: 0 },
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

describe('Compliance Suite', () => {
  const fixtureContent = fs.readFileSync(FIXTURE_PATH, 'utf-8');
  const scenarios: FixtureScenario[] = JSON.parse(fixtureContent);

  scenarios.forEach((scenario) => {
    it(`${scenario.id}: ${scenario.description}`, () => {
      const state = createMockState(scenario.setup);

      if (scenario.type === 'legal_move') {
        const cardToPlay = parseCard(scenario.action!.card);
        const playerId = 'p1'; 

        if (scenario.expected.valid) {
          expect(() => {
             playCard(state, playerId, cardToPlay.id);
          }).not.toThrow();
        } else {
          try {
            playCard(state, playerId, cardToPlay.id);
            expect.fail('Should have thrown an error');
          } catch (e: any) {
             if (e instanceof EngineError) {
                 expect(e.code).toBe(scenario.expected.error);
             } else {
                 // Rethrow if it's not the expected error type
                 throw e;
             }
          }
        }
      } else if (scenario.type === 'trick_winner') {
         const playsCount = scenario.setup.trick_plays!.length;
         state.players = state.players.slice(0, playsCount); 
         
         const result = completeTrick(state);
         const winnerId = result.state.roundState!.completedTricks[0].winningPlayerId;
         expect(winnerId).toBe(scenario.expected.winning_player);
      }
    });
  });
});