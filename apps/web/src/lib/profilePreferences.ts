import type { PlayerProfile } from '@game/domain';
import { buildProfile } from '@/lib/profile';

const STORAGE_KEY = 'profile:preferences';

export type ProfilePreferences = Pick<PlayerProfile, 'displayName' | 'color' | 'avatarSeed'> & { userId?: string };

function hasWindow() {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function readStorage(): ProfilePreferences | null {
  if (!hasWindow()) {
    return null;
  }
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as StoredProfile;
    return parsed;
  } catch {
    return null;
  }
}

function defaultProfile(): ProfilePreferences {
  const profile = buildProfile({ displayName: 'Adventurer', color: '#ffd369' });
  return { displayName: profile.displayName, color: profile.color, avatarSeed: profile.avatarSeed };
}

export function loadProfilePreferences(): ProfilePreferences {
  return { ...defaultProfile(), ...(readStorage() ?? {}) };
}

export function saveProfilePreferences(prefs: ProfilePreferences) {
  if (!hasWindow()) {
    return;
  }
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
}

export function updateProfilePreferences(update: Partial<ProfilePreferences>) {
  const current = loadProfilePreferences();
  const next = { ...current, ...update };
  saveProfilePreferences(next);
  return next;
}
