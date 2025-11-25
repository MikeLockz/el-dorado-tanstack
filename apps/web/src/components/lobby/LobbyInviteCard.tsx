import { Copy, Link2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface LobbyInviteCardProps {
  joinCode?: string | null;
  shareUrl?: string;
  isPublic: boolean;
  onCopyCode: () => void;
  onCopyLink: () => void;
}

export function LobbyInviteCard({ joinCode, shareUrl, isPublic, onCopyCode, onCopyLink }: LobbyInviteCardProps) {
  const hasJoinCode = Boolean(joinCode);
  const formattedShareUrl = shareUrl ?? '';

  return (
    <Card className="border-white/10 bg-background/80 backdrop-blur">
      <CardHeader className="flex flex-row items-start justify-between">
        <div>
          <CardTitle>Invite players</CardTitle>
          <CardDescription>Share the join code or link so friends can grab a seat.</CardDescription>
        </div>
        <Badge
          variant="outline"
          className={cn(
            'border-emerald-400/50 text-emerald-200',
            !isPublic && 'border-rose-400/60 text-rose-100',
          )}
        >
          {isPublic ? 'Public' : 'Private'}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <p className="text-xs uppercase text-muted-foreground">Join code</p>
          <div className="mt-2 rounded-2xl border border-dashed border-white/20 bg-black/30 p-4">
            {hasJoinCode ? (
              <code className="text-3xl font-mono tracking-[0.3em] text-white">{joinCode}</code>
            ) : (
              <div className="h-10 w-full animate-pulse rounded-xl bg-white/10" />
            )}
          </div>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button type="button" className="w-full sm:w-auto" onClick={onCopyCode} disabled={!hasJoinCode}>
            <Copy className="mr-2 h-4 w-4" /> Copy code
          </Button>
          <Button type="button" variant="outline" className="w-full sm:w-auto" onClick={onCopyLink} disabled={!formattedShareUrl}>
            <Link2 className="mr-2 h-4 w-4" /> Copy link
          </Button>
        </div>
        {formattedShareUrl && (
          <div className="rounded-xl border border-white/5 bg-black/20 p-3 text-xs text-muted-foreground">
            <p className="font-medium text-foreground">Shareable link</p>
            <p className={cn('truncate font-mono text-xs text-white/80')} title={formattedShareUrl}>
              {formattedShareUrl}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
