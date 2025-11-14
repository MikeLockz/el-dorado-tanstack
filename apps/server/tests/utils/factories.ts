import type { PlayerProfile } from '@game/domain';

let colorCursor = 0;
const palette = ['#ff6b6b', '#4ecdc4', '#ffe66d', '#2b9eb3'];

export function buildProfile(name: string): PlayerProfile {
  const color = palette[colorCursor++ % palette.length];
  return {
    displayName: name,
    avatarSeed: name.toLowerCase().replace(/\s+/g, '-'),
    color,
  } satisfies PlayerProfile;
}
