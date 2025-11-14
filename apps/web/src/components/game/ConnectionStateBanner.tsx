import type { ConnectionStatus } from '@/store/gameStore';

const messages: Record<ConnectionStatus, string | null> = {
  idle: 'Connect to a game to begin.',
  connecting: 'Connecting to the table…',
  open: null,
  closed: 'Disconnected. Retrying…',
};

export function ConnectionStateBanner({ connection }: { connection: ConnectionStatus }) {
  const message = messages[connection];
  if (!message) {
    return null;
  }

  return <div className="connection-banner">{message}</div>;
}
