import { AlertTriangle } from 'lucide-react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import type { GameStoreError } from '@/store/gameStore';

interface ErrorToastProps {
  errors: GameStoreError[];
  onClear: () => void;
}

export function ErrorToast({ errors, onClear }: ErrorToastProps) {
  if (!errors.length) {
    return null;
  }

  return (
    <Alert variant="destructive" className="flex flex-col gap-2 rounded-2xl border border-destructive/60 bg-destructive/15 text-sm text-destructive-foreground">
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4" />
        <div className="space-y-1">
          <p className="font-semibold">Something went wrong</p>
          <ul className="list-disc space-y-1 pl-4 text-xs">
            {errors.map((error) => (
              <li key={error.timestamp}>{error.message}</li>
            ))}
          </ul>
        </div>
      </div>
      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={onClear}>
          Dismiss
        </Button>
      </div>
    </Alert>
  );
}
