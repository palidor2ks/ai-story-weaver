import { cn, formatCompactCurrency as formatCurrency } from '@/lib/utils';
import {
  computeFundingBreakdown,
  groupFundingSources,
  withPercents,
  type FundingInput,
} from '@/lib/fundingBreakdown';

interface Props {
  input: FundingInput;
  className?: string;
  title?: string;
}

const formatPercent = (pct: number) => `${pct.toFixed(1)}%`;

/**
 * Funding Sources panel — 4 horizontal bars showing where a candidate's
 * money comes from. Presentation only; computation lives in fundingBreakdown.ts.
 */
export function FundingSourcesBreakdown({ input, className, title = 'Funding Sources' }: Props) {
  const { sources, total } = computeFundingBreakdown(input);
  if (total <= 0) return null;
  // groupFundingSources already drops zeros, sorts by amount, and folds the
  // smallest slices into a capped "Other" bucket (kept last).
  const rows = withPercents(groupFundingSources(sources, total), total);

  return (
    <div
      className={cn(
        'rounded-2xl border border-border bg-card/60 p-5 md:p-6 shadow-sm',
        className,
      )}
    >
      <div className="flex items-center justify-between mb-5">
        <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
          {title}
          {input.cycleLabel ? ` · ${input.cycleLabel} Cycle` : ''}
        </p>
        <p className="text-xs text-muted-foreground">{formatCurrency(total)}</p>
      </div>

      <div className="space-y-4">
        {rows.map((r) => (
          <div key={r.label}>
            <div className="flex items-baseline justify-between mb-1.5">
              <span className="text-sm text-foreground font-medium">{r.label}</span>
              <span
                className="text-sm font-semibold tabular-nums"
                style={{ color: r.color }}
              >
                {formatPercent(r.pct)}
              </span>
            </div>
            <div className="h-2 w-full rounded-full bg-muted/60 overflow-hidden">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${Math.max(2, r.pct)}%`,
                  background: `linear-gradient(90deg, ${r.color} 0%, ${r.color} 100%)`,
                  opacity: r.pct === 0 ? 0.3 : 1,
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
