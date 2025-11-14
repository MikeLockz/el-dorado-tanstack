import { describe, expect, it } from 'vitest';
import type { PlayerProfile } from '@game/domain';
import { RoomRegistry, RoomRegistryError } from './RoomRegistry.js';
import { verifyPlayerToken } from '../auth/playerTokens.js';

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

  it('allows players to join by code until the room is full', () => {
    const registry = new RoomRegistry();
    const { room } = registry.createRoom({ hostProfile: profile, maxPlayers: 2 });

    const joinProfile: PlayerProfile = {
      displayName: 'Challenger',
      avatarSeed: 'seed-2',
      color: '#00ff00',
    };

    const { playerId, playerToken } = registry.joinRoomByCode(room.joinCode, joinProfile);
    expect(playerId).toBeDefined();
    expect(playerToken).toBeTruthy();
    expect(room.gameState.players).toHaveLength(2);

    expect(() => registry.joinRoomByCode(room.joinCode, { ...joinProfile, displayName: 'Overflow' })).toThrow(
      RoomRegistryError,
    );
  });

  it('rejects invalid join codes', () => {
    const registry = new RoomRegistry();
    registry.createRoom({ hostProfile: profile });

    expect(() => registry.joinRoomByCode('abc', profile)).toThrow(RoomRegistryError);
    expect(() => registry.joinRoomByCode('ZZZZZZ', profile)).toThrow(RoomRegistryError);
  });

  it('resolves player tokens back to their rooms', () => {
    const registry = new RoomRegistry();
    const { room, playerId, playerToken } = registry.createRoom({ hostProfile: profile });

    const result = registry.resolvePlayerToken(playerToken, room.gameId);
    expect(result.room.gameId).toBe(room.gameId);
    expect(result.playerId).toBe(playerId);

    expect(() => registry.resolvePlayerToken('missing-token')).toThrow(RoomRegistryError);
    expect(() => registry.resolvePlayerToken(playerToken, 'different-game')).toThrow(RoomRegistryError);
  });

  it('refreshes player tokens on demand', () => {
    const registry = new RoomRegistry();
    const { room, playerId, playerToken } = registry.createRoom({ hostProfile: profile });

    const refreshed = registry.refreshPlayerToken(room, playerId);

    const claims = verifyPlayerToken(refreshed);
    expect(claims.gameId).toBe(room.gameId);
    expect(claims.playerId).toBe(playerId);
    expect(room.playerTokens.get(playerId)).toBe(refreshed);
    expect(playerToken).toBeTruthy();
  });
});
