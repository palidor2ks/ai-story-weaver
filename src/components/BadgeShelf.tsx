import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useBadgeCatalog, useUserBadges, type BadgeDefinition, type UserBadge } from '@/hooks/useBadges';
import { cn } from '@/lib/utils';
import { Trophy } from 'lucide-react';

interface Props {
  userId?: string;
  showLocked?: boolean;
  /** Optional filter to a candidate-side or voter-side family. */
  family?: 'voter' | 'candidate';
}

const CATEGORY_ORDER: BadgeDefinition['category'][] = [
  'onboarding', 'progress', 'topic', 'engagement', 'social', 'candidate',
];

const CATEGORY_LABEL: Record<BadgeDefinition['category'], string> = {
  onboarding: 'Getting Started',
  progress: 'Question Progress',
  topic: 'Topic Depth',
  engagement: 'Engagement',
  social: 'Sharing',
  candidate: 'Candidate',
};

export function BadgeShelf({ userId, showLocked = true, family = 'voter' }: Props) {
  const { data: catalog = [], isLoading: catalogLoading } = useBadgeCatalog();
  const { data: earned = [], isLoading: earnedLoading } = useUserBadges(userId);

  const earnedBySlug = useMemo(() => {
    const map = new Map<string, UserBadge[]>();
    for (const b of earned) {
      if (!map.has(b.badge_slug)) map.set(b.badge_slug, []);
      map.get(b.badge_slug)!.push(b);
    }
    return map;
  }, [earned]);

  const grouped = useMemo(() => {
    const filtered = catalog.filter(b =>
      family === 'candidate' ? b.category === 'candidate' : b.category !== 'candidate'
    );
    const out = new Map<BadgeDefinition['category'], BadgeDefinition[]>();
    for (const b of filtered) {
      if (!out.has(b.category)) out.set(b.category, []);
      out.get(b.category)!.push(b);
    }
    return out;
  }, [catalog, family]);

  const earnedCount = earned.length;
  const totalUnique = catalog.filter(b =>
    family === 'candidate' ? b.category === 'candidate' : b.category !== 'candidate'
  ).length;

  if (catalogLoading || earnedLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Trophy className="h-5 w-5" /> Badges</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-24 animate-pulse bg-muted rounded" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span className="flex items-center gap-2"><Trophy className="h-5 w-5" /> Badges</span>
          <Badge variant="secondary">{earnedCount}/{totalUnique}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <TooltipProvider>
          {CATEGORY_ORDER.filter(c => grouped.has(c)).map(category => {
            const badges = grouped.get(category)!;
            return (
              <div key={category}>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                  {CATEGORY_LABEL[category]}
                </h3>
                <div className="grid grid-cols-[repeat(auto-fill,minmax(96px,1fr))] gap-2.5">
                  {badges.map(b => {
                    const got = earnedBySlug.get(b.slug);
                    const isEarned = !!got;
                    if (!showLocked && !isEarned) return null;
                    const count = got?.length ?? 0;
                    return (
                      <Tooltip key={b.slug}>
                        <TooltipTrigger asChild>
                          <div
                            className={cn(
                              'min-h-[88px] rounded-md border flex flex-col items-center justify-center p-2 text-lg relative transition-all',
                              isEarned
                                ? 'bg-gradient-to-br from-primary/10 to-primary/5 border-primary/30 shadow-sm hover:scale-105'
                                : 'bg-muted/40 border-border opacity-40 grayscale'
                            )}
                          >
                            <span aria-hidden="true">{b.icon ?? '🏅'}</span>
                            <span className="mt-1.5 line-clamp-2 max-w-full text-center text-[11px] font-medium leading-tight text-foreground">
                              {b.name}
                            </span>
                            {b.is_repeatable && count > 1 && (
                              <span className="absolute -top-1 -right-1 text-[10px] bg-primary text-primary-foreground rounded-full px-1.5 py-0.5 font-bold shadow-sm">
                                ×{count}
                              </span>
                            )}
                          </div>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-[220px]">
                          <p className="font-semibold">{b.name}{!isEarned && ' (locked)'}</p>
                          <p className="text-xs opacity-80">{b.description}</p>
                          {b.points > 0 && <p className="text-xs mt-1 opacity-60">+{b.points} pts</p>}
                        </TooltipContent>
                      </Tooltip>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </TooltipProvider>
      </CardContent>
    </Card>
  );
}
