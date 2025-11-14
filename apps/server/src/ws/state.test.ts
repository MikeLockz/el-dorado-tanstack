import { describe, expect, it } from 'vitest';
import type { EngineEvent } from '@game/domain';
import { RoomRegistry } from '../rooms/RoomRegistry.js';
import { recordEngineEvents } from '../game/eventLog.js';
import { buildClientGameView } from './state.js';

const profile = {
  displayName: 'Tester',
  avatarSeed: 'seed',
  color: '#123456',
};

describe('ws/state helpers', () => {
  it('creates player-scoped client views without leaking other hands', async () => {
    const registry = new RoomRegistry();
    const { room, playerId } = await registry.createRoom({ hostProfile: profile });

    const view = buildClientGameView(room, playerId);
    expect(view.you).toBe(playerId);
    expect(view.hand).toEqual([]);
    expect(view.round).toBeNull();
  });

  it('records engine events with sequential indices', async () => {
    const registry = new RoomRegistry();
    const { room } = await registry.createRoom({ hostProfile: profile });

    const engineEvents: EngineEvent[] = [
      { type: 'TRICK_STARTED', payload: { trickIndex: 0, leaderPlayerId: 'p1' } },
      { type: 'CARD_PLAYED', payload: { playerId: 'p1', card: { id: 'c', suit: 'spades', rank: 'A', deckIndex: 0 } } },
    ];

    const recorded = recordEngineEvents(room, engineEvents);
    expect(recorded).toHaveLength(2);
    expect(recorded[0].eventIndex).toBe(0);
    expect(recorded[1].eventIndex).toBe(1);
    expect(room.eventLog).toHaveLength(2);
  });
});
