import { cn, formatCompactCurrency } from '@/lib/utils';
import { CheckCircle2, AlertTriangle, TrendingDown, TrendingUp } from 'lucide-react';

interface CategoryData {
  label: string;
  local: number;
  fec: number | null;
  deltaAmount: number | null;
  deltaPct: number | null;
}

interface FinanceCategoryBreakdownProps {
  localIndividualItemized: number;  // NET individuals (excludes memo_code='X')
  localGrossIndividual: number;     // GROSS individuals (includes memo_code='X')
  localOrganization: number;        // Organizations (Line 11A non-Individual)
  memoXAmount: number;              // Difference (gross - net)
  conduitExcluded?: number;         // Conduit orgs excluded from organization_total
  passThroughExcluded?: number;     // Pass-through contributions excluded via memo_text detection
  localPacContributions: number;
  localPartyContributions: number;
  fecItemized: number | null;       // FEC individual_itemized_contributions (Line 11A = Ind + Org)
  fecPacContributions: number;
  fecPartyContributions: number;
  individualDeltaPct: number | null;  // Uses (Ind + Org) for fair comparison
  pacDeltaPct: number | null;
  className?: string;
}

const formatCurrency = (value: number | null | undefined): string => formatCompactCurrency(value);

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
  localOrganization,
  memoXAmount,
  conduitExcluded = 0,
  passThroughExcluded = 0,
  localPacContributions,
  localPartyContributions,
  fecItemized,
  fecPacContributions,
  fecPartyContributions,
  individualDeltaPct,
  pacDeltaPct,
  className,
}: FinanceCategoryBreakdownProps) {
  // FEC's individual_itemized_contributions = Line 11A (Individuals + Organizations) NET of memo_code='X'
  // For apples-to-apples comparison, we use NET values: localIndividualItemized + localOrganization
  const local11ATotal = localIndividualItemized + localOrganization;
  
  // Calculate 11A delta using the combined total
  const calculated11ADeltaPct = fecItemized && fecItemized > 0 
    ? ((local11ATotal - fecItemized) / fecItemized) * 100
    : 0;
  
  // Use the passed-in delta if it matches, otherwise use calculated (for backwards compatibility)
  const effective11ADeltaPct = individualDeltaPct ?? calculated11ADeltaPct;
  
  // Calculate party delta
  const partyDeltaPct = fecPartyContributions > 0 
    ? ((localPartyContributions - fecPartyContributions) / fecPartyContributions) * 100
    : localPartyContributions > 0 ? 100 : 0;

  // Line 11A comparison (Ind + Org vs FEC individual_itemized)
  const categories: CategoryData[] = [
    {
      label: 'Line 11A (Ind + Org)',
      local: local11ATotal,
      fec: fecItemized,
      deltaAmount: fecItemized !== null ? local11ATotal - fecItemized : null,
      deltaPct: effective11ADeltaPct,
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

  // Calculate subtotals using combined 11A
  const localSubtotal = local11ATotal + localPacContributions + localPartyContributions;
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
      <div className="font-medium border-b pb-1 mb-2">Category Comparison (Local vs FEC)</div>
      
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

      {/* Show 11A breakdown (Individuals vs Organizations) - NET values */}
      {(localIndividualItemized > 0 || localOrganization > 0) && (
        <div className="space-y-0.5">
          <div className="grid grid-cols-4 gap-2 items-center text-xs text-muted-foreground bg-muted/30 rounded px-1 py-0.5">
            <span className="text-xs italic pl-2">├ Individuals (net)</span>
            <span className="text-right">{formatCurrency(localIndividualItemized)}</span>
            <span></span>
            <span></span>
          </div>
          <div className="grid grid-cols-4 gap-2 items-center text-xs text-muted-foreground bg-muted/30 rounded px-1 py-0.5">
            <span className="text-xs italic pl-2">└ Organizations</span>
            <span className="text-right">{formatCurrency(localOrganization)}</span>
            <span></span>
            <span></span>
          </div>
        </div>
      )}

      {/* Show conduit organizations excluded (ActBlue, WinRed, etc.) */}
      {conduitExcluded > 0 && (
        <div className="grid grid-cols-4 gap-2 items-center text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 rounded px-1 py-0.5">
          <span className="text-xs italic pl-2">⚠ Conduits excluded</span>
          <span className="text-right">{formatCurrency(conduitExcluded)}</span>
          <span className="text-right text-xs">(excluded)</span>
          <span className="text-right text-xs">ActBlue/WinRed</span>
        </div>
      )}

      {/* Show memo_code='X' info if present (excluded from FEC itemized and our NET totals) */}
      {memoXAmount > 0 && (
        <div className="grid grid-cols-4 gap-2 items-center text-xs text-muted-foreground bg-muted/30 rounded px-1 py-0.5">
          <span className="text-xs italic pl-2">ℹ memo_code='X'</span>
          <span className="text-right">{formatCurrency(memoXAmount)}</span>
          <span className="text-right text-muted-foreground text-xs">(excluded)</span>
          <span className="text-right text-xs">pass-through</span>
        </div>
      )}

      {/* Show pass-through excluded (detected via memo_text pattern) */}
      {passThroughExcluded > 0 && (
        <div className="grid grid-cols-4 gap-2 items-center text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 rounded px-1 py-0.5">
          <span className="text-xs italic pl-2">⚠ Pass-through (11C)</span>
          <span className="text-right">{formatCurrency(passThroughExcluded)}</span>
          <span className="text-right text-xs">(excluded)</span>
          <span className="text-right text-xs">memo_text</span>
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
