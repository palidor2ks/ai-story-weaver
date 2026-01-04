import { cn } from '@/lib/utils';
import { CheckCircle2, AlertTriangle, TrendingDown, TrendingUp } from 'lucide-react';

interface CategoryData {
  label: string;
  local: number;
  fec: number | null;
  deltaAmount: number | null;
  deltaPct: number | null;
}

interface FinanceCategoryBreakdownProps {
  localIndividualItemized: number;  // NET (excludes memo_code='X')
  localGrossIndividual: number;     // GROSS (includes memo_code='X')
  memoXAmount: number;              // Difference (gross - net)
  localPacContributions: number;
  localPartyContributions: number;
  fecItemized: number | null;       // FEC individual itemized (includes memo entries)
  fecPacContributions: number;
  fecPartyContributions: number;
  individualDeltaPct: number | null;  // Uses GROSS for fair comparison
  pacDeltaPct: number | null;
  className?: string;
}

const formatCurrency = (value: number | null | undefined): string => {
  if (value === null || value === undefined) return '—';
  const absVal = Math.abs(value);
  if (absVal >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
  if (absVal >= 1000) return `$${(value / 1000).toFixed(0)}K`;
  return `$${Math.round(value).toLocaleString()}`;
};

const getDeltaColor = (deltaPct: number | null): string => {
  if (deltaPct === null) return 'text-muted-foreground';
  const absPct = Math.abs(deltaPct);
  if (absPct <= 2) return 'text-green-600 dark:text-green-400';
  if (absPct <= 5) return 'text-amber-600 dark:text-amber-400';
  return 'text-red-600 dark:text-red-400';
};

const getDeltaIcon = (deltaPct: number | null) => {
  if (deltaPct === null) return null;
  const absPct = Math.abs(deltaPct);
  if (absPct <= 2) return <CheckCircle2 className="h-3 w-3 text-green-500" />;
  if (deltaPct < 0) return <TrendingDown className="h-3 w-3" />;
  return <TrendingUp className="h-3 w-3" />;
};

export function FinanceCategoryBreakdown({
  localIndividualItemized,
  localGrossIndividual,
  memoXAmount,
  localPacContributions,
  localPartyContributions,
  fecItemized,
  fecPacContributions,
  fecPartyContributions,
  individualDeltaPct,
  pacDeltaPct,
  className,
}: FinanceCategoryBreakdownProps) {
  // Calculate party delta (simple since we have the values)
  const partyDeltaPct = fecPartyContributions > 0 
    ? ((localPartyContributions - fecPartyContributions) / fecPartyContributions) * 100
    : localPartyContributions > 0 ? 100 : 0;

  // Use GROSS individual for FEC comparison (apples-to-apples)
  const categories: CategoryData[] = [
    {
      label: 'Individuals (11A)',
      local: localGrossIndividual,  // Use GROSS for fair comparison with FEC
      fec: fecItemized,
      deltaAmount: fecItemized !== null ? localGrossIndividual - fecItemized : null,
      deltaPct: individualDeltaPct,
    },
    {
      label: 'PACs (11C)',
      local: localPacContributions,
      fec: fecPacContributions,
      deltaAmount: localPacContributions - fecPacContributions,
      deltaPct: pacDeltaPct,
    },
    {
      label: 'Party (11B)',
      local: localPartyContributions,
      fec: fecPartyContributions,
      deltaAmount: localPartyContributions - fecPartyContributions,
      deltaPct: partyDeltaPct,
    },
  ];

  // Calculate subtotals using GROSS individual
  const localSubtotal = localGrossIndividual + localPacContributions + localPartyContributions;
  const fecSubtotal = (fecItemized ?? 0) + fecPacContributions + fecPartyContributions;
  const subtotalDelta = localSubtotal - fecSubtotal;
  const subtotalDeltaPct = fecSubtotal > 0 ? (subtotalDelta / fecSubtotal) * 100 : 0;

  // Find the worst category (largest absolute delta)
  const worstCategory = categories.reduce((worst, cat) => {
    const currentAbs = Math.abs(cat.deltaPct ?? 0);
    const worstAbs = Math.abs(worst?.deltaPct ?? 0);
    return currentAbs > worstAbs ? cat : worst;
  }, categories[0]);

  return (
    <div className={cn("space-y-2 text-sm", className)}>
      <div className="font-medium border-b pb-1 mb-2">Category Comparison (Gross Local vs FEC)</div>
      
      {/* Header */}
      <div className="grid grid-cols-4 gap-2 text-xs text-muted-foreground pb-1 border-b">
        <span>Category</span>
        <span className="text-right">Local</span>
        <span className="text-right">FEC</span>
        <span className="text-right">Delta</span>
      </div>

      {/* Category rows */}
      {categories.map((cat) => (
        <div key={cat.label} className="grid grid-cols-4 gap-2 items-center text-xs">
          <span className="text-muted-foreground truncate">{cat.label}</span>
          <span className="text-right font-medium">{formatCurrency(cat.local)}</span>
          <span className="text-right font-medium">{formatCurrency(cat.fec)}</span>
          <div className={cn("flex items-center justify-end gap-0.5", getDeltaColor(cat.deltaPct))}>
            {getDeltaIcon(cat.deltaPct)}
            <span>
              {cat.deltaPct !== null 
                ? `${cat.deltaPct > 0 ? '+' : ''}${cat.deltaPct.toFixed(1)}%`
                : '—'}
            </span>
          </div>
        </div>
      ))}

      {/* Show memo_code='X' breakdown if present */}
      {memoXAmount > 0 && (
        <div className="grid grid-cols-4 gap-2 items-center text-xs text-muted-foreground bg-muted/30 rounded px-1 py-0.5">
          <span className="text-xs italic pl-2">└ memo_code='X'</span>
          <span className="text-right">{formatCurrency(memoXAmount)}</span>
          <span className="text-right text-muted-foreground text-xs">(in FEC)</span>
          <span className="text-right text-xs">deducted for donors</span>
        </div>
      )}

      {/* Subtotal */}
      <div className="grid grid-cols-4 gap-2 items-center text-xs pt-2 border-t mt-2">
        <span className="font-medium">Subtotal</span>
        <span className="text-right font-bold">{formatCurrency(localSubtotal)}</span>
        <span className="text-right font-bold">{formatCurrency(fecSubtotal)}</span>
        <div className={cn("flex items-center justify-end gap-0.5 font-medium", getDeltaColor(subtotalDeltaPct))}>
          {getDeltaIcon(subtotalDeltaPct)}
          <span>
            {subtotalDeltaPct > 0 ? '+' : ''}{subtotalDeltaPct.toFixed(1)}%
          </span>
        </div>
      </div>

      {/* Largest gap indicator */}
      {worstCategory && Math.abs(worstCategory.deltaPct ?? 0) > 2 && (
        <div className="flex items-center gap-1.5 pt-2 mt-2 border-t text-xs">
          <AlertTriangle className="h-3 w-3 text-amber-500" />
          <span className="text-muted-foreground">Largest gap:</span>
          <span className={getDeltaColor(worstCategory.deltaPct)}>
            {worstCategory.label} ({worstCategory.deltaPct! > 0 ? '+' : ''}{worstCategory.deltaPct?.toFixed(1)}%)
          </span>
        </div>
      )}
    </div>
  );
}
