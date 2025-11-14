import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/use-toast';
import { randomProfileSeed } from '@/lib/profile';
import { loadProfilePreferences, saveProfilePreferences, type ProfilePreferences } from '@/lib/profilePreferences';

const colorPalette = ['#ffd369', '#ff9770', '#70d6ff', '#ff70a6', '#c1ffd7', '#f6e58d'];

export function ProfilePage() {
  const initial = loadProfilePreferences();
  const [displayName, setDisplayName] = useState(initial.displayName);
  const [color, setColor] = useState(initial.color);
  const [avatarSeed, setAvatarSeed] = useState(initial.avatarSeed);
  const [userId, setUserId] = useState(initial.userId ?? '');
  const { toast } = useToast();

  function handleSave(event: React.FormEvent) {
    event.preventDefault();
    const trimmedName = displayName.trim() || 'Adventurer';
    const trimmedUserId = userId.trim();
    const payload: ProfilePreferences = {
      displayName: trimmedName,
      color,
      avatarSeed,
      userId: trimmedUserId ? trimmedUserId : undefined,
    };
    saveProfilePreferences(payload);
    toast({ title: 'Profile saved', description: 'Your name, color, and avatar now preload when hosting or joining games.' });
  }

  const initials = displayName
    .split(' ')
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="grid gap-4 lg:grid-cols-[2fr,1fr]">
      <Card className="border-white/10 bg-background/70">
        <CardHeader>
          <CardTitle>Profile preferences</CardTitle>
          <CardDescription>Saved locally to keep your settings consistent across sessions.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={handleSave}>
            <div className="space-y-2">
              <Label htmlFor="profile-display-name">Display name</Label>
              <Input id="profile-display-name" value={displayName} onChange={(event) => setDisplayName(event.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="profile-user-id">Optional user ID</Label>
              <Input id="profile-user-id" value={userId} onChange={(event) => setUserId(event.target.value)} placeholder="you@example.com" />
              <p className="text-xs text-muted-foreground">Used for pulling stats from the server if your profile is registered.</p>
            </div>
            <div className="space-y-2">
              <Label>Favorite color</Label>
              <div className="flex flex-wrap gap-2">
                {colorPalette.map((swatch) => (
                  <button
                    key={swatch}
                    type="button"
                    onClick={() => setColor(swatch)}
                    className="h-10 w-10 rounded-full border-2 border-white/20 ring-offset-2 focus:outline-none focus-visible:ring-2"
                    style={{ backgroundColor: swatch, borderColor: color === swatch ? '#ffd369' : 'rgba(255,255,255,0.2)' }}
                  />
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="avatar-seed">Avatar seed</Label>
              <div className="flex gap-2">
                <Input id="avatar-seed" value={avatarSeed} onChange={(event) => setAvatarSeed(event.target.value)} />
                <Button type="button" variant="secondary" onClick={() => setAvatarSeed(randomProfileSeed())}>
                  Shuffle
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">We use the seed to render consistent avatars around the table.</p>
            </div>
            <Button type="submit">Save preferences</Button>
          </form>
        </CardContent>
      </Card>
      <Card className="border-white/10 bg-background/80">
        <CardHeader>
          <CardTitle>Preview</CardTitle>
          <CardDescription>How you’ll appear when a room loads your profile.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-full text-center text-lg font-semibold" style={{ backgroundColor: color, color: '#05080f', lineHeight: '3rem' }}>
              {initials || 'P'}
            </div>
            <div>
              <p className="text-base font-semibold text-foreground">{displayName || 'Player'}</p>
              <p className="text-xs">Avatar seed: {avatarSeed.slice(0, 8)}…</p>
            </div>
          </div>
          <Badge variant="outline" className="text-xs">
            Preferred color {color.toUpperCase()}
          </Badge>
          <p>Your user ID lets you bookmark stats at /stats/{userId || 'your-id'}.</p>
        </CardContent>
      </Card>
    </div>
  );
}
