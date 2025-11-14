import type { PlayerProfile } from '@game/domain';

const colorPalette = ['#ffd369', '#ff9770', '#70d6ff', '#ff70a6', '#c1ffd7', '#f6e58d'];

function randomFrom<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length) % items.length];
}

function randomSeed() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2);
}

function defaultName() {
  return `Player-${Math.floor(Math.random() * 900 + 100)}`;
}

export function buildProfile(input: Partial<PlayerProfile>): PlayerProfile {
  const displayName = (input.displayName ?? '').trim() || defaultName();
  const avatarSeed = (input.avatarSeed ?? '').trim() || randomSeed();
  const color = (input.color ?? '').trim() || randomFrom(colorPalette);

  return {
    userId: input.userId,
    displayName,
    avatarSeed,
    color,
  };
}

export function profileFromForm(displayName: string, color?: string): PlayerProfile {
  return buildProfile({ displayName, color });
}
