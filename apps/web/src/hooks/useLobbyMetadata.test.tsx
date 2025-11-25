import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { useLobbyMetadata } from './useLobbyMetadata';
import { clearLobbyJoinCode, getLobbyJoinCode, storeLobbyJoinCode } from '@/lib/playerTokens';

vi.mock('@/lib/playerTokens', () => {
  return {
    getLobbyJoinCode: vi.fn(() => 'ABC123'),
    storeLobbyJoinCode: vi.fn(),
    clearLobbyJoinCode: vi.fn(),
  };
});

const mocked = {
  getLobbyJoinCode: vi.mocked(getLobbyJoinCode),
  storeLobbyJoinCode: vi.mocked(storeLobbyJoinCode),
  clearLobbyJoinCode: vi.mocked(clearLobbyJoinCode),
};

describe('useLobbyMetadata', () => {
  beforeEach(() => {
    mocked.getLobbyJoinCode.mockReturnValue('ABC123');
    mocked.storeLobbyJoinCode.mockClear();
    mocked.clearLobbyJoinCode.mockClear();
  });

  it('hydrates join code for provided game', () => {
    const { result, rerender } = renderHook(({ id }) => useLobbyMetadata(id), {
      initialProps: { id: 'game-1' },
    });

    expect(result.current.joinCode).toBe('ABC123');

    mocked.getLobbyJoinCode.mockReturnValue('XYZ789');
    rerender({ id: 'game-2' });
    expect(result.current.joinCode).toBe('XYZ789');
  });

  it('persists new join code', () => {
    const { result } = renderHook(() => useLobbyMetadata('game-1'));

    act(() => {
      result.current.setJoinCode('def456');
    });

    expect(mocked.storeLobbyJoinCode).toHaveBeenCalledWith('game-1', 'DEF456');
    expect(result.current.joinCode).toBe('DEF456');
  });

  it('clears join code when falsy value provided', () => {
    const { result } = renderHook(() => useLobbyMetadata('game-1'));

    act(() => {
      result.current.setJoinCode(null);
    });

    expect(mocked.clearLobbyJoinCode).toHaveBeenCalledWith('game-1');
    expect(result.current.joinCode).toBeNull();
  });
});
