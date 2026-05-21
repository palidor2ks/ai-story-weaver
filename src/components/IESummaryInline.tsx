import { TrendingUp, TrendingDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { IETotals } from '@/hooks/useIndependentExpenditures';

const compact = (n: number): string => {
  if (!n) return '$0';
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1)}K`;
  return `$${Math.round(n).toLocaleString()}`;
};

interface Props {
  totals: IETotals | undefined;
  size?: 'xs' | 'sm';
  className?: string;
  /** When true, render nothing if no spending — otherwise show a muted placeholder. */
  hideIfEmpty?: boolean;
}

export const IESummaryInline = ({ totals, size = 'xs', className, hideIfEmpty = true }: Props) => {
  const support = totals?.support_amount ?? 0;
  const oppose = totals?.oppose_amount ?? 0;
  const total = support + oppose;

  if (total === 0 && hideIfEmpty) return null;
  if (total === 0) {
    return <span className={cn('text-muted-foreground', size === 'xs' ? 'text-[11px]' : 'text-xs', className)}>No outside money</span>;
  }

  const textSize = size === 'xs' ? 'text-[11px]' : 'text-xs';
  const iconSize = size === 'xs' ? 'w-3 h-3' : 'w-3.5 h-3.5';

  return (
    <div className={cn('flex items-center gap-2 font-medium', textSize, className)} title="Independent expenditures (outside money)">
      {support > 0 && (
        <span className="inline-flex items-center gap-0.5 text-emerald-600 dark:text-emerald-400">
          <TrendingUp className={iconSize} aria-hidden />
          {compact(support)}
        </span>
      )}
      {oppose > 0 && (
        <span className="inline-flex items-center gap-0.5 text-destructive">
          <TrendingDown className={iconSize} aria-hidden />
          {compact(oppose)}
        </span>
      )}
    </div>
  );
};

export const formatIECompact = compact;
