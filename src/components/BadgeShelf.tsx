import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
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
        {CATEGORY_ORDER.filter(c => grouped.has(c)).map(category => {
          const badges = grouped.get(category)!;
          return (
            <div key={category}>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                {CATEGORY_LABEL[category]}
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {badges.map(b => {
                  const got = earnedBySlug.get(b.slug);
                  const isEarned = !!got;
                  if (!showLocked && !isEarned) return null;
                  const count = got?.length ?? 0;
                  return (
                    <div
                      key={b.slug}
                      className={cn(
                        'rounded-lg border flex flex-col items-center text-center gap-1 p-3 relative transition-all',
                        isEarned
                          ? 'bg-gradient-to-br from-primary/10 to-primary/5 border-primary/30 shadow-sm hover:scale-105'
                          : 'bg-muted/40 border-border opacity-40 grayscale'
                      )}
                    >
                      <span className="text-xl leading-none">{b.icon ?? '🏅'}</span>
                      <p className="text-xs font-semibold leading-tight">
                        {b.name}{!isEarned && ' (locked)'}
                      </p>
                      <p
                        className="text-[11px] text-muted-foreground leading-snug line-clamp-2"
                        title={b.description}
                      >
                        {b.description}
                      </p>
                      {b.points > 0 && (
                        <p className="text-[10px] text-muted-foreground/70">+{b.points} pts</p>
                      )}
                      {b.is_repeatable && count > 1 && (
                        <span className="absolute -top-1 -right-1 text-[10px] bg-primary text-primary-foreground rounded-full px-1.5 py-0.5 font-bold">
                          ×{count}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
