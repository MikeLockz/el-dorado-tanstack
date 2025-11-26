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
  it('creates rooms and allows lookups by id and join code', async () => {
    const registry = new RoomRegistry();
    const { room, playerId, playerToken } = await registry.createRoom({ hostProfile: profile });

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

  it('excludes private rooms from the public listing', async () => {
    const registry = new RoomRegistry();
    await registry.createRoom({ hostProfile: profile, isPublic: false });
    await registry.createRoom({ hostProfile: profile, isPublic: true });

    const publicRooms = registry.listPublicRooms();
    expect(publicRooms).toHaveLength(1);
  });

  it('allows players to join by code until the room is full', async () => {
    const registry = new RoomRegistry();
    const { room } = await registry.createRoom({ hostProfile: profile, maxPlayers: 2 });

    const joinProfile: PlayerProfile = {
      displayName: 'Challenger',
      avatarSeed: 'seed-2',
      color: '#00ff00',
    };

    const { playerId, playerToken } = await registry.joinRoomByCode(room.joinCode, joinProfile);
    expect(playerId).toBeDefined();
    expect(playerToken).toBeTruthy();
    expect(room.gameState.players).toHaveLength(2);

    await expect(registry.joinRoomByCode(room.joinCode, { ...joinProfile, displayName: 'Overflow' })).rejects.toThrow(
      RoomRegistryError,
    );
  });

  it('rejects invalid join codes', async () => {
    const registry = new RoomRegistry();
    await registry.createRoom({ hostProfile: profile });

    await expect(registry.joinRoomByCode('abc', profile)).rejects.toThrow(RoomRegistryError);
    await expect(registry.joinRoomByCode('ZZZZZZ', profile)).rejects.toThrow(RoomRegistryError);
  });

  it('resolves player tokens back to their rooms', async () => {
    const registry = new RoomRegistry();
    const { room, playerId, playerToken } = await registry.createRoom({ hostProfile: profile });

    const result = registry.resolvePlayerToken(playerToken, room.gameId);
    expect(result.room.gameId).toBe(room.gameId);
    expect(result.playerId).toBe(playerId);

    expect(() => registry.resolvePlayerToken('missing-token')).toThrow(RoomRegistryError);
    expect(() => registry.resolvePlayerToken(playerToken, 'different-game')).toThrow(RoomRegistryError);
  });

  it('refreshes player tokens on demand', async () => {
    const registry = new RoomRegistry();
    const { room, playerId, playerToken } = await registry.createRoom({ hostProfile: profile });

    const refreshed = registry.refreshPlayerToken(room, playerId);

    const claims = verifyPlayerToken(refreshed);
    expect(claims.gameId).toBe(room.gameId);
    expect(claims.playerId).toBe(playerId);
    expect(room.playerTokens.get(playerId)).toBe(refreshed);
    expect(playerToken).toBeTruthy();
  });

  it('removes players and emits event', async () => {
    const registry = new RoomRegistry();
    const { room } = await registry.createRoom({ hostProfile: profile, maxPlayers: 2 });
    const { playerId } = await registry.joinRoomByCode(room.joinCode, { ...profile, displayName: 'Guest' });

    let eventEmitted = false;
    registry.on('playerRemoved', (event) => {
      if (event.playerId === playerId && event.kicked) {
        eventEmitted = true;
      }
    });

    await registry.removePlayer(room, playerId);

    expect(room.gameState.players).toHaveLength(1);
    expect(room.gameState.players.find((p) => p.playerId === playerId)).toBeUndefined();
    expect(eventEmitted).toBe(true);
  });

  it('allows spectators to join and take a seat', async () => {
    const registry = new RoomRegistry();
    const { room } = await registry.createRoom({ hostProfile: profile, maxPlayers: 1 });

    // Room is full for players
    const spectatorProfile: PlayerProfile = {
      displayName: 'Spectator',
      avatarSeed: 'seed-3',
      color: '#0000ff',
    };

    // Join as spectator
    const { playerId, playerToken, room: joinedRoom } = await registry.joinRoomByCode(room.joinCode, spectatorProfile, { spectator: true });
    expect(playerId).toBeDefined();
    expect(joinedRoom.gameId).toBe(room.gameId);

    const player = joinedRoom.gameState.players.find((p) => p.playerId === playerId);
    expect(player).toBeDefined();
    expect(player?.spectator).toBe(true);
    expect(player?.seatIndex).toBeNull();

    // Verify token claims
    const claims = verifyPlayerToken(playerToken);
    expect(claims.isSpectator).toBe(true);
    expect(claims.seatIndex).toBeNull();

    // Now try to take a seat (should fail because room is full)
    await expect(registry.assignSeat(room, playerId)).rejects.toThrow(RoomRegistryError);

    // Increase max players to allow seat assignment
    room.gameState.config.maxPlayers = 2;

    // Assign seat
    await registry.assignSeat(room, playerId);

    const seatedPlayer = room.gameState.players.find((p) => p.playerId === playerId);
    expect(seatedPlayer?.spectator).toBe(false);
    expect(seatedPlayer?.seatIndex).toBe(1); // 0 is host

    // Verify refreshed token would have correct claims
    const refreshedToken = registry.refreshPlayerToken(room, playerId);
    const refreshedClaims = verifyPlayerToken(refreshedToken);
    expect(refreshedClaims.isSpectator).toBe(false);
    expect(refreshedClaims.seatIndex).toBe(1);
  });
});
