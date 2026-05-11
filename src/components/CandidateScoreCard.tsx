import { cn } from '@/lib/utils';
import { getScoreLabel } from '@/lib/scoreFormat';

interface CandidateScoreCardProps {
  score: number | null | undefined;
  matchScore?: number;
  userScore?: number | null;
  className?: string;
}

function formatScoreText(s: number | null | undefined): string {
  if (s === null || s === undefined) return 'NA';
  const clamped = Math.max(-10, Math.min(10, s));
  if (clamped === 0) return 'C';
  const abs = Math.abs(clamped).toFixed(2);
  if (clamped >= -3 && clamped <= 3) {
    return clamped < 0 ? `CL${abs}` : `CR${abs}`;
  }
  return clamped < 0 ? `L${abs}` : `R${abs}`;
}

function getScoreColor(s: number | null | undefined): string {
  if (s === null || s === undefined) return 'text-muted-foreground';
  if (s <= -3) return 'text-blue-600 dark:text-blue-400';
  if (s >= 3) return 'text-red-600 dark:text-red-400';
  return 'text-purple-600 dark:text-purple-400';
}

export function CandidateScoreCard({ score, matchScore, userScore, className }: CandidateScoreCardProps) {
  const isNA = score === null || score === undefined;
  const scoreText = formatScoreText(score);
  const colorClass = getScoreColor(score);
  const label = isNA ? 'Not Available' : getScoreLabel(score as number);

  // Marker position: -10 -> 0%, +10 -> 100%
  const clamped = isNA ? 0 : Math.max(-10, Math.min(10, score as number));
  const markerPct = ((clamped + 10) / 20) * 100;

  const hasUser = userScore !== null && userScore !== undefined;
  const userClamped = hasUser ? Math.max(-10, Math.min(10, userScore as number)) : 0;
  const userPct = ((userClamped + 10) / 20) * 100;
  const markersClose = hasUser && Math.abs(userPct - markerPct) < 6;

  return (
    <div
      className={cn(
        'relative rounded-2xl border bg-gradient-to-br from-card to-muted/40 p-5 shadow-sm overflow-hidden',
        className
      )}
    >
      {/* Decorative blur accent */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-12 -right-12 h-32 w-32 rounded-full bg-primary/10 blur-2xl"
      />

      <div className="flex items-end justify-between gap-4 mb-4">
        <div>
          <div className={cn('text-5xl font-extrabold tracking-tight leading-none', colorClass)}>
            {scoreText}
          </div>
          <div className="mt-1 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
            {label}
          </div>
        </div>
        {typeof matchScore === 'number' && !isNA && (
          <div className="text-right">
            <div className="text-2xl font-bold text-foreground leading-none">
              {Math.round(matchScore)}%
            </div>
            <div className="mt-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              Match with you
            </div>
          </div>
        )}
      </div>

      {/* Spectrum bar */}
      <div className="relative">
        <div
          className="h-2.5 w-full rounded-full"
          style={{
            background:
              'linear-gradient(to right, hsl(217 91% 60%) 0%, hsl(270 60% 65%) 50%, hsl(0 84% 60%) 100%)',
          }}
        />
        {/* Center tick */}
        <div className="absolute top-1/2 left-1/2 h-3 w-px -translate-x-1/2 -translate-y-1/2 bg-foreground/30" />

        {!isNA && (
          <div
            className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 transition-all"
            style={{ left: `${markerPct}%` }}
            aria-label="Representative position"
          >
            <div className="rounded-full border-2 border-background bg-foreground shadow-md h-4 w-4" />
            <div className="absolute left-1/2 top-4 -translate-x-1/2 mt-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">
              Rep
            </div>
          </div>
        )}

        {hasUser && (
          <div
            className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 transition-all"
            style={{ left: `${userPct}%` }}
            aria-label="Your position"
          >
            <div className="rounded-full border-2 border-primary bg-background shadow-md h-4 w-4" />
            <div className="absolute left-1/2 bottom-4 -translate-x-1/2 mb-1 text-[10px] font-semibold uppercase tracking-wider text-primary whitespace-nowrap">
              You
            </div>
          </div>
        )}

        <div className="mt-8 flex justify-between text-[10px] font-medium text-muted-foreground">
          <span>L10</span>
          <span>C</span>
          <span>R10</span>
        </div>
      </div>
    </div>
  );
}
