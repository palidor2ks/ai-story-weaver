import {
  useNjLegislatorFinance,
  isNjStateLegislator,
  type NjTopContributor,
} from '@/hooks/useNjLegislatorFinance';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Building2, User as UserIcon, Landmark, ExternalLink } from 'lucide-react';

interface Props {
  name?: string | null;
  district?: string | null;
  office?: string | null;
  state?: string | null;
  level?: string | null;
}

const usd0 = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

const titleCase = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
const shortLocation = (loc: string | null) =>
  loc ? loc.replace(/legislative district/i, 'LD').replace(/\s+/g, ' ').trim() : '';
const isIndividual = (c: NjTopContributor) => c.is_individual;

/**
 * Campaign-finance section for NJ state legislators, shown on the unified
 * candidate profile. Sourced from NJ ELEC (state data the FEC doesn't cover).
 * Renders nothing for non-NJ-legislators or before contribution data has synced.
 */
export function NjStateFinanceSection(props: Props) {
  const { data, isLoading } = useNjLegislatorFinance(props);

  if (!isNjStateLegislator(props)) return null;
  if (isLoading || !data || (data.total_raised ?? 0) <= 0) return null;

  const cycles = (data.matched_entities ?? []).filter((e) => e.total > 0);
  const top = (data.top_contributors ?? []).slice(0, 12);

  return (
    <Card className="mb-6 border-border/60">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Landmark className="h-5 w-5 text-primary" />
            Campaign Finance — New Jersey
          </CardTitle>
          <Badge variant="outline" className="text-xs font-normal">
            NJ ELEC
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Summary */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <div>
            <div className="text-2xl font-bold">{usd0(data.total_raised)}</div>
            <div className="text-xs text-muted-foreground">Total raised</div>
          </div>
          <div>
            <div className="text-2xl font-bold">{data.contribution_count.toLocaleString()}</div>
            <div className="text-xs text-muted-foreground">Contributions</div>
          </div>
          <div>
            <div className="text-2xl font-bold">
              {(data.election_years ?? []).join(', ') || '—'}
            </div>
            <div className="text-xs text-muted-foreground">Election years</div>
          </div>
        </div>

        {/* Per-election breakdown */}
        {cycles.length > 0 && (
          <div className="space-y-1.5">
            <div className="text-sm font-medium text-muted-foreground">By election</div>
            {cycles.map((e) => (
              <div key={e.entity_s} className="flex items-center justify-between gap-3 text-sm">
                <span className="min-w-0 truncate text-muted-foreground">
                  {e.election_year} {e.election_type ? titleCase(e.election_type) : ''}
                  {shortLocation(e.location) ? ` · ${shortLocation(e.location)}` : ''}
                </span>
                <span className="shrink-0 font-medium tabular-nums">
                  {usd0(e.total)}{' '}
                  <span className="font-normal text-muted-foreground">({e.n})</span>
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Top contributors */}
        {top.length > 0 && (
          <div className="space-y-2">
            <div className="text-sm font-medium text-muted-foreground">Top contributors</div>
            {top.map((c, i) => (
              <div
                key={`${c.contributor}-${i}`}
                className="flex items-center gap-3 rounded-md border border-border/50 px-3 py-2"
              >
                <div
                  className={`shrink-0 ${
                    isIndividual(c)
                      ? 'text-blue-600 dark:text-blue-400'
                      : 'text-amber-600 dark:text-amber-400'
                  }`}
                >
                  {isIndividual(c) ? (
                    <UserIcon className="h-4 w-4" />
                  ) : (
                    <Building2 className="h-4 w-4" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{c.contributor}</div>
                  <div className="truncate text-xs text-muted-foreground">
                    {[
                      c.contributor_type,
                      isIndividual(c) ? c.occupation : null,
                      isIndividual(c) ? c.emp_name : null,
                    ]
                      .filter(Boolean)
                      .join(' · ') || '—'}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="text-sm font-semibold tabular-nums">{usd0(c.total)}</div>
                  {c.n > 1 && <div className="text-xs text-muted-foreground">{c.n} gifts</div>}
                </div>
              </div>
            ))}
          </div>
        )}

        <p className="pt-1 text-xs text-muted-foreground">
          Source:{' '}
          <a
            href="https://www.njelecefilesearch.com"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-0.5 underline hover:text-foreground"
          >
            NJ Election Law Enforcement Commission <ExternalLink className="h-3 w-3" />
          </a>
          . State contributions are tracked separately from federal (FEC) filings.
        </p>
      </CardContent>
    </Card>
  );
}
