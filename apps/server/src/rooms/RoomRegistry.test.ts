import { describe, expect, it } from 'vitest';
import type { PlayerProfile } from '@game/domain';
import { RoomRegistry } from './RoomRegistry';

const profile: PlayerProfile = {
  displayName: 'Host',
  avatarSeed: 'seed',
  color: '#ff00ff',
};

describe('RoomRegistry', () => {
  it('creates rooms and allows lookups by id and join code', () => {
    const registry = new RoomRegistry();
    const { room, playerId, playerToken } = registry.createRoom({ hostProfile: profile });

    expect(room.joinCode).toHaveLength(6);
    expect(room.gameState.players).toHaveLength(1);
    expect(playerToken).toBeTruthy();
    expect(room.playerTokens.get(playerId)).toBe(playerToken);

    const byId = registry.getRoom(room.gameId);
    expect(byId).toBeDefined();
    expect(byId?.gameId).toBe(room.gameId);

    const byCode = registry.findByJoinCode(room.joinCode);
    expect(byCode?.gameId).toBe(room.gameId);

    const publicRooms = registry.listPublicRooms();
    expect(publicRooms).toHaveLength(1);
    expect(publicRooms[0].joinCode).toBe(room.joinCode);
  });

  it('excludes private rooms from the public listing', () => {
    const registry = new RoomRegistry();
    registry.createRoom({ hostProfile: profile, isPublic: false });
    registry.createRoom({ hostProfile: profile, isPublic: true });

    const publicRooms = registry.listPublicRooms();
    expect(publicRooms).toHaveLength(1);
  });
});
