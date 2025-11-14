import { useQuery } from '@tanstack/react-query';
import { useNavigate, useParams } from '@tanstack/react-router';
import { useState } from 'react';
import { getPlayerStats } from '@/api/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';

export function StatsPage() {
  const { userId } = useParams({ from: '/stats/$userId' });
  const navigate = useNavigate();
  const [searchId, setSearchId] = useState(userId);

  const statsQuery = useQuery({
    queryKey: ['playerStats', userId],
    queryFn: () => getPlayerStats(userId),
    enabled: Boolean(userId),
  });

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!searchId.trim()) return;
    navigate({ to: '/stats/$userId', params: { userId: searchId.trim() } });
  }

  const profile = statsQuery.data?.profile;
  const lifetime = statsQuery.data?.lifetime;

  return (
    <div className="space-y-4">
      <Card className="border-white/10 bg-background/70">
        <CardHeader>
          <CardTitle>Player statistics</CardTitle>
          <CardDescription>Look up registered player IDs to review their lifetime totals.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="flex flex-wrap items-end gap-3" onSubmit={handleSubmit}>
            <div className="flex-1 space-y-2 min-w-[220px]">
              <Label htmlFor="user-id-input">Player ID</Label>
              <Input id="user-id-input" value={searchId} onChange={(event) => setSearchId(event.target.value)} placeholder="example@player" required />
            </div>
            <Button type="submit" className="mt-2">
              Search
            </Button>
          </form>
        </CardContent>
      </Card>

      {statsQuery.isLoading && <Card className="border-white/10 bg-background/60"><CardContent>Loading stats…</CardContent></Card>}
      {statsQuery.error && !statsQuery.isLoading && (
        <Card className="border-destructive/30 bg-destructive/10 text-destructive-foreground">
          <CardContent>Error loading stats: {(statsQuery.error as Error).message}</CardContent>
        </Card>
      )}

      {profile && lifetime && (
        <div className="grid gap-4 lg:grid-cols-[1.1fr,1fr]">
          <Card className="border-white/10 bg-background/70">
            <CardHeader>
              <CardTitle>{profile.displayName}</CardTitle>
              <CardDescription className="flex flex-wrap items-center gap-2 text-sm">
                <Badge variant="outline">{profile.userId ?? 'Unbound ID'}</Badge>
                <Badge variant={profile.isBot ? 'warning' : 'success'}>{profile.isBot ? 'Bot profile' : 'Human'}</Badge>
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-muted-foreground">
              <p>Favorite color: <span style={{ color: profile.color }}>{profile.color}</span></p>
              <p>Avatar seed: {profile.avatarSeed}</p>
            </CardContent>
          </Card>
          <Card className="border-white/10 bg-background/70">
            <CardHeader>
              <CardTitle>Lifetime totals</CardTitle>
              <CardDescription>Tracked since your first completed game.</CardDescription>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-2 gap-3 text-sm">
                <Metric label="Games played" value={lifetime.gamesPlayed} />
                <Metric label="Games won" value={lifetime.gamesWon} />
                <Metric label="Highest score" value={lifetime.highestScore ?? '—'} />
                <Metric label="Lowest score" value={lifetime.lowestScore ?? '—'} />
                <Metric label="Total points" value={lifetime.totalPoints} />
                <Metric label="Tricks won" value={lifetime.totalTricksWon} />
                <Metric label="Best streak" value={lifetime.mostConsecutiveWins} />
                <Metric label="Longest drought" value={lifetime.mostConsecutiveLosses} />
                <Metric label="Last played" value={lifetime.lastGameAt ? new Date(lifetime.lastGameAt).toLocaleString() : '—'} className="col-span-2" />
              </dl>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

function Metric({ label, value, className }: { label: string; value: string | number; className?: string }) {
  return (
    <div className={className}>
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="text-lg font-semibold text-foreground">{value}</dd>
    </div>
  );
}
