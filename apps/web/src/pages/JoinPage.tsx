import { useMutation } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { joinByCode } from '@/api/client';
import { profileFromForm } from '@/lib/profile';
import { storePlayerToken } from '@/lib/playerTokens';
import { useNavigate } from '@tanstack/react-router';

export function JoinPage() {
  const [joinCode, setJoinCode] = useState('');
  const [displayName, setDisplayName] = useState('Adventurer');
  const [color, setColor] = useState('#ffd369');
  const navigate = useNavigate();
  const profile = useMemo(() => profileFromForm(displayName, color), [displayName, color]);

  const joinMutation = useMutation({
    mutationFn: () => joinByCode({ joinCode: joinCode.trim(), profile }),
    onSuccess: (result) => {
      storePlayerToken(result.gameId, result.playerToken);
      navigate({ to: '/game/$gameId', params: { gameId: result.gameId } });
    },
  });

  const busy = joinMutation.isPending;

  return (
    <section className="panel" style={{ maxWidth: 520, margin: '0 auto' }}>
      <h1>Join a Room</h1>
      <form
        className="form-card"
        onSubmit={(event) => {
          event.preventDefault();
          joinMutation.mutate();
        }}
      >
        <label>
          <span>Join Code</span>
          <input value={joinCode} onChange={(event) => setJoinCode(event.target.value.toUpperCase())} placeholder="ABCD" required minLength={3} maxLength={8} />
        </label>
        <label>
          <span>Display Name</span>
          <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} required />
        </label>
        <label>
          <span>Table Color</span>
          <input type="color" value={color} onChange={(event) => setColor(event.target.value)} />
        </label>
        <button className="primary" type="submit" disabled={busy}>
          {busy ? 'Joining…' : 'Join Table'}
        </button>
        {joinMutation.error && <p style={{ color: '#ff6b6b' }}>{joinMutation.error.message}</p>}
      </form>
    </section>
  );
}
