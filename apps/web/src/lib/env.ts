const HTTP_FALLBACK = 'http://localhost:3000';
const WS_FALLBACK = 'ws://localhost:3000/ws';

function trimTrailingSlash(url: string) {
  return url.replace(/\/$/, '');
}

export function resolveApiBaseUrl(): string {
  const envValue = typeof import.meta !== 'undefined' ? (import.meta.env?.VITE_API_URL as string | undefined) : undefined;
  if (envValue && envValue.trim()) {
    return trimTrailingSlash(envValue.trim());
  }

  if (typeof window !== 'undefined' && window.location.origin) {
    return trimTrailingSlash(window.location.origin);
  }

  return HTTP_FALLBACK;
}

export function resolveWebSocketBase(): string {
  const envValue = typeof import.meta !== 'undefined' ? (import.meta.env?.VITE_WS_URL as string | undefined) : undefined;
  if (envValue && envValue.trim()) {
    return trimTrailingSlash(envValue.trim());
  }

  const httpBase = resolveApiBaseUrl();
  if (httpBase.startsWith('https://')) {
    return `wss://${httpBase.slice('https://'.length)}/ws`;
  }
  if (httpBase.startsWith('http://')) {
    return `ws://${httpBase.slice('http://'.length)}/ws`;
  }
  return WS_FALLBACK;
}

export function isLobbyViewEnabled(): boolean {
  const raw = typeof import.meta !== 'undefined' ? import.meta.env?.VITE_SHOW_LOBBY_VIEW : undefined;
  if (typeof raw === 'string') {
    return raw.toLowerCase() === 'true';
  }
  if (typeof raw === 'boolean') {
    return raw;
  }
  return false;
}
