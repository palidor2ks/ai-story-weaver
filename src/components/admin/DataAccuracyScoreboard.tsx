import { formatDistanceToNow } from "date-fns";
import { AlertTriangle, CheckCircle2, Clock, FileText, Landmark, RefreshCw, Scale, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  useBillsStatsCache,
  useStateFinanceStatsCache,
  useFinanceReconStatsCache,
  useIdentityStatsCache,
  useRefreshAdminStats,
} from "@/hooks/useAdminStatsCache";

// The categories roadmap priority #1 cares about that the dashboard didn't cover:
// bills freshness, state campaign finance, finance reconciliation, candidate identity.
// All values come from admin_stats_cache, recomputed every 15 minutes by
// refresh_admin_stats_cache() — the same source the preflight check:accuracy reads,
// so this panel and the CLI always agree.

function ago(ts: string | null | undefined): string {
  if (!ts) return "never";
  return formatDistanceToNow(new Date(ts), { addSuffix: true });
}

function Tile({
  tone,
  icon: Icon,
  label,
  value,
  detail,
}: {
  tone: "green" | "amber" | "red" | "muted";
  icon: typeof FileText;
  label: string;
  value: string;
  detail: string;
}) {
  const tones: Record<string, string> = {
    green: "border-emerald-200 bg-emerald-50 text-emerald-900",
    amber: "border-amber-200 bg-amber-50 text-amber-900",
    red: "border-red-200 bg-red-50 text-red-900",
    muted: "border-border bg-muted/40 text-foreground",
  };
  return (
    <div className={`rounded-lg border p-3 ${tones[tone]}`}>
      <div className="flex items-center gap-1.5 text-xs font-medium opacity-80">
        <Icon className="h-3.5 w-3.5 shrink-0" />
        {label}
      </div>
      <div className="mt-1 text-lg font-semibold leading-tight">{value}</div>
      <div className="mt-0.5 text-xs opacity-70">{detail}</div>
    </div>
  );
}

export function DataAccuracyScoreboard() {
  const bills = useBillsStatsCache();
  const states = useStateFinanceStatsCache();
  const recon = useFinanceReconStatsCache();
  const identity = useIdentityStatsCache();
  const refresh = useRefreshAdminStats();

  const billsData = bills.data?.data;
  const statesData = states.data?.data;
  const reconData = recon.data?.data;
  const identityData = identity.data?.data;

  const billsTone = billsData
    ? billsData.staleDays < 0 || billsData.staleDays > 7
      ? "red"
      : billsData.staleDays > 2
        ? "amber"
        : "green"
    : "muted";

  const stateErrors = statesData
    ? statesData.nj.errors7d + statesData.fl.errors7d + statesData.ny.errors7d
    : 0;

  const reconTone = reconData ? (reconData.error > 0 ? "red" : reconData.partial > 0 ? "amber" : "green") : "muted";

  const oldestUpdate = [bills.data?.updatedAt, states.data?.updatedAt, recon.data?.updatedAt, identity.data?.updatedAt]
    .filter(Boolean)
    .sort()[0];

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2 text-sm font-medium">
          <Scale className="h-4 w-4 shrink-0" />
          Data Accuracy Scoreboard
          {oldestUpdate && (
            <span className="text-xs text-muted-foreground">(Updated {ago(oldestUpdate as string)})</span>
          )}
        </div>
        <Button
          size="sm"
          variant="outline"
          disabled={refresh.isPending}
          onClick={() => refresh.mutate("all")}
        >
          <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${refresh.isPending ? "animate-spin" : ""}`} />
          Refresh all stats
        </Button>
      </div>
      <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
        <Tile
          tone={billsTone}
          icon={FileText}
          label="Bills freshness"
          value={billsData ? `${billsData.totalBills.toLocaleString()} bills` : "—"}
          detail={
            billsData
              ? billsData.staleDays > 7 || billsData.staleDays < 0
                ? `nightly sync DEAD — last ${ago(billsData.lastNightlySync)}`
                : `nightly sync ${ago(billsData.lastNightlySync)}`
              : "loading…"
          }
        />
        <Tile
          tone={statesData ? (stateErrors > 0 ? "red" : "green") : "muted"}
          icon={Landmark}
          label="State finance (NJ/FL/NY)"
          value={
            statesData
              ? `${(statesData.nj.contributions + statesData.fl.contributions + statesData.ny.contributions).toLocaleString()} rows`
              : "—"
          }
          detail={
            statesData
              ? stateErrors > 0
                ? `${stateErrors} sync errors this week`
                : `all synced, latest ${ago(
                    [statesData.nj.lastRun, statesData.fl.lastRun, statesData.ny.lastRun].filter(Boolean).sort().slice(-1)[0] ?? null,
                  )}`
              : "loading…"
          }
        />
        <Tile
          tone={reconTone}
          icon={reconData && reconData.error > 0 ? AlertTriangle : CheckCircle2}
          label="FEC reconciliation"
          value={reconData ? `${reconData.error} errors / ${reconData.partial} partial` : "—"}
          detail={
            reconData
              ? `${reconData.ok} ok · gap $${Math.abs(reconData.errorGapUsd / 1_000_000).toFixed(1)}M · ${ago(reconData.latestCheck)}`
              : "loading…"
          }
        />
        <Tile
          tone={identityData ? "green" : "muted"}
          icon={Users}
          label="Candidate identity"
          value={identityData ? `${identityData.candidates.toLocaleString()} candidates` : "—"}
          detail={
            identityData
              ? `${identityData.auditedMerges} audited merges · dupes gated by check:dupes`
              : "loading…"
          }
        />
      </div>
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Clock className="h-3 w-3" />
        Auto-refreshes server-side every 15 minutes (pg_cron → refresh_admin_stats_cache). Preflight reads the same numbers.
      </div>
    </div>
  );
}
