// reconcile-independent-expenditures
// Read-only verifier: for a given cycle, diff what we hold in
// public.independent_expenditures against the FEC API's authoritative Schedule E
// figures, so we can confirm completeness and surface double-counting / dirty data.
// Writes nothing. Same dual auth as import-independent-expenditures (admin JWT or
// the Vault-backed x-sync-secret).
//
// Body params: { cycle?: string = "2024", with_totals?: boolean = true }
//   with_totals=false skips the per-candidate dollar aggregation (3 cheap count
//   calls only) for a fast count-coverage check.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-sync-secret",
};

const FEC_BASE = "https://api.open.fec.gov/v1";

// deno-lint-ignore no-explicit-any
async function fecGet(path: string, params: Record<string, string>): Promise<any> {
  const qs = new URLSearchParams(params).toString();
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(`${FEC_BASE}${path}?${qs}`);
    if (res.status === 429 || res.status >= 500) {
      await new Promise((r) => setTimeout(r, Math.min(2000 * 2 ** attempt, 16000)));
      continue;
    }
    if (!res.ok) throw new Error(`FEC ${path} ${res.status}: ${(await res.text()).slice(0, 200)}`);
    return res.json();
  }
  throw new Error(`FEC ${path}: max retries exceeded`);
}

// Count of most-recent Schedule E records for a cycle (optional extra filters).
async function fecScheduleECount(apiKey: string, cycle: string, extra: Record<string, string>): Promise<number> {
  const j = await fecGet("/schedules/schedule_e/", {
    api_key: apiKey,
    two_year_transaction_period: cycle,
    most_recent: "true",
    per_page: "1",
    ...extra,
  });
  return Number(j?.pagination?.count ?? 0);
}

// Authoritative deduped cycle dollars: sum of FEC's per-candidate IE aggregation.
async function fecTotalByCandidate(
  apiKey: string,
  cycle: string,
  maxPages = 60,
): Promise<{ total: number; support: number; oppose: number; capped: boolean }> {
  let total = 0, support = 0, oppose = 0, pages = 1, page = 1;
  for (; page <= maxPages; page++) {
    const j = await fecGet("/schedules/schedule_e/by_candidate/", {
      api_key: apiKey,
      cycle,
      election_full: "false",
      per_page: "100",
      page: String(page),
    });
    pages = Number(j?.pagination?.pages ?? 1);
    for (const r of (j?.results ?? [])) {
      const amt = Number(r?.total ?? 0);
      total += amt;
      const so = r?.support_oppose_indicator;
      if (so === "S") support += amt;
      else if (so === "O") oppose += amt;
    }
    if (page >= pages) break;
    await new Promise((r) => setTimeout(r, 200));
  }
  return { total, support, oppose, capped: page < pages };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const fecApiKey = Deno.env.get("FEC_API_KEY");
    if (!fecApiKey) {
      return new Response(JSON.stringify({ error: "FEC API key not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Auth: cron/server secret OR admin user JWT (mirrors import-independent-expenditures).
    const providedSecret = req.headers.get("x-sync-secret") ?? "";
    let authorized = false;
    if (providedSecret) {
      const { data: secretOk } = await supabase.rpc("check_ie_sync_secret", { p_token: providedSecret });
      authorized = secretOk === true;
    }
    if (!authorized) {
      const authHeader = req.headers.get("Authorization") ?? "";
      if (!authHeader) {
        return new Response(JSON.stringify({ error: "Authentication required" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
      const { data: userData, error: userErr } = await userClient.auth.getUser();
      if (userErr || !userData?.user) {
        return new Response(JSON.stringify({ error: "Invalid session" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { data: isAdmin } = await userClient.rpc("has_role", { _user_id: userData.user.id, _role: "admin" });
      if (!isAdmin) {
        return new Response(JSON.stringify({ error: "Admin role required" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    let body: Record<string, unknown> = {};
    try { body = await req.json(); } catch { /* optional body */ }
    const cycle = String(body.cycle ?? "2024");
    const withTotals = body.with_totals !== false;

    // Our side
    const { data: localData, error: locErr } = await supabase.rpc("ie_reconcile_local", { p_cycle: cycle });
    if (locErr) {
      return new Response(JSON.stringify({ error: `local aggregate failed: ${locErr.message}` }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const ours = (Array.isArray(localData) ? localData[0] : localData) ?? {};

    // FEC ground truth — counts are cheap (1 call each); dollars optional.
    const fecAll = await fecScheduleECount(fecApiKey, cycle, {});
    const fecNotice = await fecScheduleECount(fecApiKey, cycle, { is_notice: "true" });
    const fecReport = await fecScheduleECount(fecApiKey, cycle, { is_notice: "false" });
    const fecTotals = withTotals ? await fecTotalByCandidate(fecApiKey, cycle) : null;

    const ourRows = Number(ours.rows ?? 0);
    const ourDistinctTx = Number(ours.distinct_transactions ?? 0);
    const ourSum = Number(ours.sum_amount ?? 0);
    const countCoverage = fecAll > 0 ? ourDistinctTx / fecAll : null;
    const dollarRatio = fecTotals && fecTotals.total > 0 ? ourSum / fecTotals.total : null;

    const notes: string[] = [];
    if (countCoverage != null && countCoverage < 0.98) {
      notes.push(`Possible GAPS: ${ourDistinctTx} distinct transactions held vs FEC's ${fecAll} most-recent records (${(countCoverage * 100).toFixed(1)}% coverage).`);
    }
    if (countCoverage != null && countCoverage > 1.02) {
      notes.push(`More distinct transactions (${ourDistinctTx}) than FEC most-recent records (${fecAll}) — superseded amendments retained.`);
    }
    if (dollarRatio != null && dollarRatio > 1.1) {
      notes.push(`Likely DOUBLE-COUNTING: our $${(ourSum / 1e9).toFixed(2)}B is ${dollarRatio.toFixed(2)}x FEC's deduped $${(fecTotals!.total / 1e9).toFixed(2)}B (24/48h notice + periodic report and/or amendments not collapsed).`);
    }
    if (dollarRatio != null && dollarRatio < 0.9) {
      notes.push(`Our dollars ($${(ourSum / 1e9).toFixed(2)}B) are below FEC's $${(fecTotals!.total / 1e9).toFixed(2)}B — possible missing rows.`);
    }
    if (Number(ours.bad_date_rows ?? 0) > 0) {
      notes.push(`${Number(ours.bad_date_rows)} rows have out-of-range expenditure dates (filer typos).`);
    }
    if (fecTotals?.capped) notes.push("FEC dollar total was page-capped; treat it as a lower bound.");

    return new Response(JSON.stringify({
      cycle,
      ours: {
        rows: ourRows,
        distinct_transactions: ourDistinctTx,
        distinct_committees: Number(ours.distinct_committees ?? 0),
        sum_amount: ourSum,
        support_amount: Number(ours.support_amount ?? 0),
        oppose_amount: Number(ours.oppose_amount ?? 0),
        bad_date_rows: Number(ours.bad_date_rows ?? 0),
        date_range: [ours.min_valid_date ?? null, ours.max_valid_date ?? null],
      },
      fec: {
        most_recent_records: fecAll,
        notice_records: fecNotice,
        report_records: fecReport,
        total_amount: fecTotals?.total ?? null,
        support_amount: fecTotals?.support ?? null,
        oppose_amount: fecTotals?.oppose ?? null,
        total_capped: fecTotals?.capped ?? null,
      },
      assessment: {
        count_coverage_ratio: countCoverage,
        dollar_inflation_ratio: dollarRatio,
        notes,
      },
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    console.error("[IE-RECONCILE] error", err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Internal error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
