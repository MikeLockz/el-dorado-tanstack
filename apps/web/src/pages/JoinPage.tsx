import { useMutation } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useEffect, useMemo, useState } from 'react';
import { joinByCode } from '@/api/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { profileFromForm } from '@/lib/profile';
import { loadProfilePreferences, updateProfilePreferences } from '@/lib/profilePreferences';
import { storeLobbyJoinCode, storePlayerToken } from '@/lib/playerTokens';

export function JoinPage() {
  const [joinCode, setJoinCode] = useState('');
  const initialPrefs = loadProfilePreferences();
  const [displayName, setDisplayName] = useState(initialPrefs.displayName);
  const [color, setColor] = useState(initialPrefs.color);
  const navigate = useNavigate();
  const profile = useMemo(() => profileFromForm(displayName, color), [displayName, color]);

  useEffect(() => {
    updateProfilePreferences({ displayName });
  }, [displayName]);

  useEffect(() => {
    updateProfilePreferences({ color });
  }, [color]);

  const joinMutation = useMutation({
    mutationFn: () => joinByCode({ joinCode: joinCode.trim(), profile }),
    onSuccess: (result) => {
      storePlayerToken(result.gameId, result.playerToken);
      storeLobbyJoinCode(result.gameId, joinCode.trim());
      navigate({ to: '/game/$gameId', params: { gameId: result.gameId } });
    },
  });

  const busy = joinMutation.isPending;

  return (
    <div className="grid gap-4 lg:grid-cols-[2fr,1fr]">
      <Card className="border-white/10 bg-background/80 backdrop-blur">
        <CardHeader>
          <CardTitle>Join a room</CardTitle>
          <CardDescription>Enter the table code from your host and your preferred display name.</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              joinMutation.mutate();
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="join-code">Join code</Label>
              <Input
                id="join-code"
                value={joinCode}
                onChange={(event) => setJoinCode(event.target.value.toUpperCase())}
                placeholder="ABCD"
                required
                minLength={3}
                maxLength={8}
                className="uppercase tracking-widest"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="display-name">Display name</Label>
              <Input id="display-name" value={displayName} onChange={(event) => setDisplayName(event.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="table-color">Table color</Label>
              <div className="flex items-center gap-3">
                <Input id="table-color" type="color" value={color} onChange={(event) => setColor(event.target.value)} className="h-12 w-16 cursor-pointer p-1" />
                <span className="text-sm text-muted-foreground">Used for your badges and highlights.</span>
              </div>
            </div>
            <Button type="submit" disabled={busy} className="w-full md:w-auto">
              {busy ? 'Joining…' : 'Join table'}
            </Button>
            {joinMutation.error && <p className="text-sm text-destructive">{joinMutation.error.message}</p>}
          </form>
        </CardContent>
      </Card>
      <Card className="border-white/10 bg-background/50">
        <CardHeader>
          <CardTitle>Need an invite?</CardTitle>
          <CardDescription>Ask your host for the code or use Matchmake on the home page to create a bot-filled table.</CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          <p>Once you join we store your token locally so reconnects are instant.</p>
        </CardContent>
      </Card>
    </div>
  );
}
