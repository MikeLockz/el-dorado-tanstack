import { useMutation } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { useMemo, useState } from 'react';
import { createRoom, matchmake } from '@/api/client';
import { profileFromForm } from '@/lib/profile';
import { storePlayerToken } from '@/lib/playerTokens';

export function LandingPage() {
  const navigate = useNavigate();
  const [displayName, setDisplayName] = useState('Host');
  const profile = useMemo(() => profileFromForm(displayName), [displayName]);

  const createMutation = useMutation({
    mutationFn: () => createRoom({ profile, isPublic: false }),
    onSuccess: (result) => {
      storePlayerToken(result.gameId, result.playerToken);
      navigate({ to: '/game/$gameId', params: { gameId: result.gameId } });
    },
  });

  const matchmakeMutation = useMutation({
    mutationFn: () => matchmake(profile),
    onSuccess: (result) => {
      storePlayerToken(result.gameId, result.playerToken);
      navigate({ to: '/game/$gameId', params: { gameId: result.gameId } });
    },
  });

  const busy = createMutation.isPending || matchmakeMutation.isPending;

  return (
    <div className="card-grid">
      <section className="panel" style={{ gridColumn: '1 / -1' }}>
        <h1>Play El Dorado</h1>
        <p style={{ opacity: 0.75 }}>Spin up a deterministic trick-taking room or jump into a match.</p>
        <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', maxWidth: 280 }}>
          <span>Display Name</span>
          <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="Your nickname" />
        </label>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginTop: '1rem' }}>
          <button className="primary" onClick={() => createMutation.mutate()} disabled={busy}>
            {createMutation.isPending ? 'Creating…' : 'Start Private Room'}
          </button>
          <button className="secondary" onClick={() => matchmakeMutation.mutate()} disabled={busy}>
            {matchmakeMutation.isPending ? 'Matching…' : 'Matchmake'}
          </button>
          <Link to="/join" className="secondary" style={{ display: 'inline-flex', alignItems: 'center' }}>
            Join by Code
          </Link>
        </div>
        {(createMutation.error || matchmakeMutation.error) && (
          <p style={{ color: '#ff6b6b' }}>
            {(createMutation.error ?? matchmakeMutation.error)?.message ?? 'Unable to create room'}
          </p>
        )}
      </section>
      <section className="panel">
        <h2>1. Share the code</h2>
        <p>Host a room and send friends the join code. We’ll handle the deck and turn order.</p>
      </section>
      <section className="panel">
        <h2>2. Bid and play</h2>
        <p>Call your bid, win tricks, and race to complete the ten rounds of El Dorado.</p>
      </section>
      <section className="panel">
        <h2>3. Rewatch anytime</h2>
        <p>Every action streams as events so we can replay the entire session deterministically.</p>
      </section>
    </div>
  );
}
