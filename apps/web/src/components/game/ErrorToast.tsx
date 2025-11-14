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
    <div className="error-toast" role="alert">
      <div>
        <strong>Something went wrong</strong>
        <ul>
          {errors.map((error) => (
            <li key={error.timestamp}>{error.message}</li>
          ))}
        </ul>
      </div>
      <button className="secondary" onClick={onClear}>
        Dismiss
      </button>
    </div>
  );
}
