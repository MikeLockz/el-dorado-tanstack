import { Loader2, WifiOff } from 'lucide-react';
import { Alert } from '@/components/ui/alert';
import { cn } from '@/lib/utils';
import type { ConnectionStatus } from '@/store/gameStore';

const messages: Record<ConnectionStatus, { text: string; variant: 'default' | 'destructive'; icon: 'spinner' | 'offline' } | null> = {
  idle: null,
  connecting: { text: 'Connecting to the table…', variant: 'default', icon: 'spinner' },
  open: null,
  closed: { text: 'Connection lost. Attempting to reconnect…', variant: 'destructive', icon: 'offline' },
};

export function ConnectionStateBanner({ connection }: { connection: ConnectionStatus }) {
  const payload = messages[connection];
  if (!payload) {
    return null;
  }

  const Icon = payload.icon === 'spinner' ? Loader2 : WifiOff;

  return (
    <Alert
      variant={payload.variant}
      className={cn(
        'flex items-center gap-3 rounded-2xl border border-white/10 bg-background/80 backdrop-blur',
        payload.variant === 'destructive' && 'border-destructive/60',
      )}
    >
      <Icon className={cn('h-4 w-4', payload.icon === 'spinner' && 'animate-spin')} />
      <span className="text-sm font-medium">{payload.text}</span>
    </Alert>
  );
}
