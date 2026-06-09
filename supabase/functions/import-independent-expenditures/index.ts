import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-sync-secret",
};

interface ScheduleERow {
  sub_id?: string | number;
  transaction_id?: string;
  image_number?: string;
  expenditure_date?: string;
  expenditure_amount?: number;
  support_oppose_indicator?: string;
  payee_name?: string;
  category_code_full?: string;
  expenditure_description?: string;
  committee_id?: string;
  committee?: { name?: string };
  candidate_id?: string;
  candidate_name?: string;
  candidate_office?: string;
  candidate_office_state?: string;
  candidate_office_district?: string;
  election_type_full?: string;
  report_type?: string;
}

async function fetchWithRetry(url: string, maxRetries = 4): Promise<Response> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const res = await fetch(url);
    if (res.status === 429 || res.status >= 500) {
      const wait = Math.min(2000 * 2 ** attempt, 16000);
      console.log(`[IE-IMPORT] backoff ${wait}ms (status ${res.status})`);
      await new Promise((r) => setTimeout(r, wait));
      continue;
    }
    return res;
  }
  throw new Error("Max retries exceeded");
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const fecApiKey = Deno.env.get("FEC_API_KEY");
    if (!fecApiKey) {
      return new Response(JSON.stringify({ error: "FEC API key not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const supabase = createClient(supabaseUrl, serviceKey);

    // Auth: two accepted callers.
    //   1) Cron / server jobs send a Vault-backed secret in `x-sync-secret`,
    //      validated via the SECURITY DEFINER check_ie_sync_secret RPC. The
    //      secret never lives in a function env var.
    //   2) Interactive admins send their user JWT in `Authorization`; we verify
    //      the session and require the `admin` role.
    const providedSecret = req.headers.get("x-sync-secret") ?? "";
    let authorized = false;
    if (providedSecret) {
      const { data: secretOk } = await supabase.rpc("check_ie_sync_secret", {
        p_token: providedSecret,
      });
      authorized = secretOk === true;
    }
    if (!authorized) {
      const authHeader = req.headers.get("Authorization") ?? "";
      if (!authHeader) {
        return new Response(JSON.stringify({ error: "Authentication required" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const userClient = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: userData, error: userErr } = await userClient.auth.getUser();
      if (userErr || !userData?.user) {
        return new Response(JSON.stringify({ error: "Invalid session" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { data: isAdmin } = await userClient.rpc("has_role", {
        _user_id: userData.user.id,
        _role: "admin",
      });
      if (!isAdmin) {
        return new Response(JSON.stringify({ error: "Admin role required" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    let body: Record<string, unknown> = {};
    try {
      body = await req.json();
    } catch {
      // optional body
    }
    const cycle = String(body.cycle ?? "2024");
    const minAmount = Math.max(0, Number(body.min_amount ?? 50000));
    const maxPages = Math.max(1, Math.min(20, Number(body.max_pages ?? 5)));
    const perPage = 100;

    // Pre-load lookup maps
    const { data: fecIds } = await supabase
      .from("candidate_fec_ids")
      .select("fec_candidate_id, candidate_id");
    const candidateIdByFec = new Map<string, string>();
    (fecIds ?? []).forEach((r) => {
      if (r.fec_candidate_id && r.candidate_id) {
        candidateIdByFec.set(r.fec_candidate_id, r.candidate_id);
      }
    });

    // Manual target corrections for filings whose FEC-coded candidate is wrong
    // or missing (e.g. pro-Harris IEs mis-coded to Biden's P80000722). Scoped by
    // committee/cycle/filer-name so we never remap a shared FEC ID globally.
    interface IETargetOverride {
      spending_committee_fec_id: string | null;
      match_cycle: string | null;
      match_target_fec_candidate_id: string | null;
      match_target_candidate_name: string | null;
      match_name_pattern: string | null;
      corrected_candidate_id: string;
      corrected_target_fec_candidate_id: string | null;
      corrected_target_candidate_name: string | null;
    }
    const { data: overrideRows } = await supabase
      .from("ie_target_overrides")
      .select(
        "spending_committee_fec_id, match_cycle, match_target_fec_candidate_id, match_target_candidate_name, match_name_pattern, corrected_candidate_id, corrected_target_fec_candidate_id, corrected_target_candidate_name",
      );
    const overrides = (overrideRows ?? []) as IETargetOverride[];
    const normName = (s: string | null | undefined) => (s ?? "").trim().toUpperCase();
    // Pre-compile name patterns once (case-insensitive). Invalid patterns are
    // treated as non-matching rather than throwing.
    const patternCache = new Map<string, RegExp | null>();
    const compilePattern = (p: string): RegExp | null => {
      if (!patternCache.has(p)) {
        try {
          patternCache.set(p, new RegExp(p, "i"));
        } catch {
          patternCache.set(p, null);
        }
      }
      return patternCache.get(p) ?? null;
    };
    const findOverride = (
      spendingFec: string,
      rowCycle: string,
      targetFec: string | null,
      name: string | null,
    ): IETargetOverride | null => {
      for (const o of overrides) {
        if (o.spending_committee_fec_id && o.spending_committee_fec_id !== spendingFec) continue;
        if (o.match_cycle && o.match_cycle !== rowCycle) continue;
        if (o.match_target_fec_candidate_id && o.match_target_fec_candidate_id !== targetFec) continue;
        if (o.match_target_candidate_name && normName(o.match_target_candidate_name) !== normName(name)) continue;
        if (o.match_name_pattern) {
          const re = compilePattern(o.match_name_pattern);
          if (!re || !re.test(name ?? "")) continue;
        }
        return o;
      }
      return null;
    };

    let inserted = 0;
    let updated = 0;
    let skipped = 0;
    const unmappedCommittees = new Set<string>();
    const unmappedCandidates = new Set<string>();

    let lastIndexes: Record<string, unknown> | null = null;
    let totalFetched = 0;

    for (let page = 0; page < maxPages; page++) {
      const params = new URLSearchParams({
        api_key: fecApiKey,
        data_type: "processed",
        most_recent: "true",
        is_notice: "true",
        min_amount: String(minAmount),
        two_year_transaction_period: cycle,
        per_page: String(perPage),
        sort: "-expenditure_date",
      });
      if (lastIndexes) {
        for (const [k, v] of Object.entries(lastIndexes)) {
          if (v != null) params.set(k, String(v));
        }
      }

      const url = `https://api.open.fec.gov/v1/schedules/schedule_e/?${params.toString()}`;
      const res = await fetchWithRetry(url);
      if (!res.ok) {
        const txt = await res.text();
        console.error("[IE-IMPORT] FEC error", res.status, txt.slice(0, 300));
        return new Response(
          JSON.stringify({ error: `FEC API ${res.status}`, details: txt.slice(0, 500) }),
          { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      const json = await res.json();
      const results: ScheduleERow[] = json?.results ?? [];
      totalFetched += results.length;

      const rows = results
        .map((r) => {
          const txId = String(r.sub_id ?? r.transaction_id ?? "");
          const spendingFec = r.committee_id;
          const supOpp = r.support_oppose_indicator;
          if (!txId || !spendingFec || (supOpp !== "S" && supOpp !== "O")) {
            skipped += 1;
            return null;
          }
          let targetFec = r.candidate_id ?? null;
          let candidateId = targetFec ? candidateIdByFec.get(targetFec) ?? null : null;
          let targetName = r.candidate_name ?? null;
          // Apply manual corrections before recording attribution.
          const override = findOverride(spendingFec, cycle, targetFec, targetName);
          if (override) {
            candidateId = override.corrected_candidate_id;
            targetFec = override.corrected_target_fec_candidate_id ?? targetFec;
            if (override.corrected_target_candidate_name) {
              targetName = override.corrected_target_candidate_name;
            }
          }
          if (!candidateId) {
            if (targetFec) unmappedCandidates.add(targetFec);
          }
          // We don't track committees in a `committees` table; record unmapped spenders
          // for visibility but we always keep `spending_committee_fec_id`.
          unmappedCommittees.add(spendingFec);
          return {
            fec_transaction_id: txId,
            image_number: r.image_number ?? null,
            expenditure_date: r.expenditure_date ?? null,
            cycle,
            amount: Number(r.expenditure_amount ?? 0),
            purpose: r.expenditure_description ?? r.category_code_full ?? null,
            communication_type: r.category_code_full ?? null,
            support_oppose_indicator: supOpp,
            spending_committee_fec_id: spendingFec,
            spending_committee_name: r.committee?.name ?? null,
            target_fec_candidate_id: targetFec,
            target_candidate_name: targetName,
            candidate_id: candidateId,
            state: r.candidate_office_state ?? null,
            office: r.candidate_office ?? null,
            district: r.candidate_office_district ?? null,
            election_type: r.election_type_full ?? null,
            report_type: r.report_type ?? null,
            raw_payload: r as unknown as Record<string, unknown>,
            source: "fec_processed_notice",
          };
        })
        .filter((r): r is NonNullable<typeof r> => r !== null);

      if (rows.length > 0) {
        // Determine which rows already exist (to count inserts vs updates)
        const keys = rows.map((r) => `${r.fec_transaction_id}|${r.spending_committee_fec_id}`);
        const { data: existing } = await supabase
          .from("independent_expenditures")
          .select("fec_transaction_id, spending_committee_fec_id")
          .in(
            "fec_transaction_id",
            rows.map((r) => r.fec_transaction_id),
          );
        const existingKeys = new Set(
          (existing ?? []).map(
            (e) => `${e.fec_transaction_id}|${e.spending_committee_fec_id}`,
          ),
        );

        const { error: upErr, count } = await supabase
          .from("independent_expenditures")
          .upsert(rows, {
            onConflict: "fec_transaction_id,spending_committee_fec_id",
            count: "exact",
          });
        if (upErr) {
          console.error("[IE-IMPORT] upsert error", upErr);
          return new Response(
            JSON.stringify({ error: upErr.message }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }
        keys.forEach((k) => {
          if (existingKeys.has(k)) updated += 1;
          else inserted += 1;
        });
        // count is total affected; not used directly
        void count;
      }

      lastIndexes = json?.pagination?.last_indexes ?? null;
      if (!lastIndexes) break;
      // small delay to avoid spamming the FEC API
      await new Promise((r) => setTimeout(r, 250));
    }

    return new Response(
      JSON.stringify({
        success: true,
        cycle,
        min_amount: minAmount,
        fetched: totalFetched,
        inserted,
        updated,
        skipped,
        unmapped_committees: unmappedCommittees.size,
        unmapped_candidates: unmappedCandidates.size,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[IE-IMPORT] error", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
