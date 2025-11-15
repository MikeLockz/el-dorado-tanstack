import { useMutation } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { useEffect, useMemo, useState } from 'react';
import { createRoom, matchmake } from '@/api/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { profileFromForm } from '@/lib/profile';
import { loadProfilePreferences, updateProfilePreferences } from '@/lib/profilePreferences';
import { storePlayerToken } from '@/lib/playerTokens';

const heroSteps = [
  {
    title: 'Share the join code',
    description: 'Spin up a room with deterministic shuffles and invite friends instantly.',
  },
  {
    title: 'Bid with confidence',
    description: 'Ten rounds, ascending/decreasing cards per player, and transparent scoring.',
  },
  {
    title: 'Replay everything',
    description: 'Every action is logged so you can review entire games move by move.',
  },
];

export function LandingPage() {
  const navigate = useNavigate();
  const [displayName, setDisplayName] = useState(() => loadProfilePreferences().displayName || 'Host');
  const profile = useMemo(() => profileFromForm(displayName), [displayName]);

  useEffect(() => {
    updateProfilePreferences({ displayName });
  }, [displayName]);

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
  const errorMessage = (createMutation.error ?? matchmakeMutation.error)?.message;

  return (
    <div className="space-y-6">
      <Card className="overflow-hidden border-none bg-gradient-to-br from-[#0d1628] via-[#0e1c33] to-[#070b14] shadow-2xl">
        <CardHeader className="gap-2 text-white">
          <CardTitle className="text-3xl font-semibold">Play El Dorado</CardTitle>
          <CardDescription className="text-base text-white/80">
            Launch a table, invite friends, and let deterministic shuffles keep the drama honest.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-[1fr,auto] md:items-end">
          <div className="space-y-3">
            <Label htmlFor="displayName" className="text-white/90">
              Display name
            </Label>
            <Input id="displayName" data-testid="display-name-input" value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="Your nickname" className="max-w-xs bg-white/10 text-white placeholder:text-white/70" />
          </div>
          <div className="flex flex-wrap gap-3">
            <Button type="button" onClick={() => createMutation.mutate()} disabled={busy} className="min-w-[160px]">
              {createMutation.isPending ? 'Creating…' : 'Start private room'}
            </Button>
            <Button type="button" variant="secondary" data-testid="matchmake-button" onClick={() => matchmakeMutation.mutate()} disabled={busy} className="min-w-[140px]">
              {matchmakeMutation.isPending ? 'Matching…' : 'Matchmake'}
            </Button>
            <Button type="button" variant="outline" asChild>
              <Link to="/join">Join by code</Link>
            </Button>
          </div>
          {errorMessage && <p className="text-sm text-destructive md:col-span-2">{errorMessage}</p>}
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-3">
        {heroSteps.map((step) => (
          <Card key={step.title} className="border-white/10 bg-background/70 backdrop-blur">
            <CardHeader>
              <CardTitle className="text-lg">{step.title}</CardTitle>
              <CardDescription>{step.description}</CardDescription>
            </CardHeader>
          </Card>
        ))}
      </div>
    </div>
  );
}
