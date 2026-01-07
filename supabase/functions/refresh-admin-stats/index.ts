import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type StatKey = "voting_records_stats" | "candidate_answer_stats" | "fec_stats" | "all";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { statKey } = await req.json() as { statKey: StatKey };
    console.log(`[refresh-admin-stats] Refreshing: ${statKey}`);

    const results: Record<string, unknown> = {};

    if (statKey === "voting_records_stats" || statKey === "all") {
      console.log("[refresh-admin-stats] Fetching voting records stats...");
      
      // Get vote counts by action type
      const { data: votes, error: votesError } = await supabase
        .from("votes")
        .select("action_type", { count: "exact" });
      
      if (votesError) {
        console.error("[refresh-admin-stats] Votes query error:", votesError);
      }

      // Count by action type using a separate query
      const { count: legislativeCount } = await supabase
        .from("votes")
        .select("*", { count: "exact", head: true })
        .in("action_type", ["Sponsored", "Cosponsored"]);

      const { count: floorCount } = await supabase
        .from("votes")
        .select("*", { count: "exact", head: true })
        .in("action_type", ["Yea", "Nay", "Present", "Not Voting"]);

      const { count: totalRecords } = await supabase
        .from("votes")
        .select("*", { count: "exact", head: true });

      // Get members with votes
      const { data: membersData } = await supabase
        .from("votes")
        .select("candidate_id")
        .limit(10000);

      const uniqueMembers = new Set(membersData?.map(v => v.candidate_id) || []);

      // Get total federal candidates for coverage
      const { count: totalFederalCandidates } = await supabase
        .from("candidates")
        .select("*", { count: "exact", head: true })
        .or("office.ilike.%Senator%,office.ilike.%Representative%");

      const coveragePercentage = totalFederalCandidates 
        ? Math.round((uniqueMembers.size / totalFederalCandidates) * 100)
        : 0;

      const votingStats = {
        legislativeActions: legislativeCount || 0,
        floorVotes: floorCount || 0,
        totalRecords: totalRecords || 0,
        membersSynced: uniqueMembers.size,
        coveragePercentage,
      };

      console.log("[refresh-admin-stats] Voting stats:", votingStats);

      const { error: upsertError } = await supabase
        .from("admin_stats_cache")
        .upsert({
          stat_key: "voting_records_stats",
          stat_value: votingStats,
          updated_at: new Date().toISOString(),
        });

      if (upsertError) {
        console.error("[refresh-admin-stats] Upsert error:", upsertError);
      }

      results.voting_records_stats = votingStats;
    }

    if (statKey === "candidate_answer_stats" || statKey === "all") {
      console.log("[refresh-admin-stats] Fetching candidate answer stats...");

      const [questionsRes, candidatesRes, coverageRes] = await Promise.all([
        supabase.from("questions").select("*", { count: "exact", head: true }),
        supabase.from("candidates").select("*", { count: "exact", head: true }),
        supabase.from("candidate_answer_coverage_stats").select("*"),
      ]);

      const totalQuestions = questionsRes.count || 0;
      const totalCandidates = candidatesRes.count || 0;
      const coverageData = coverageRes.data || [];

      // Calculate stats
      let noAnswers = 0;
      let lowCoverage = 0;
      let fullCoverage = 0;

      coverageData.forEach((c) => {
        const answerCount = c.answer_count || 0;
        const answerPct = totalQuestions > 0 ? (answerCount / totalQuestions) * 100 : 0;
        
        if (answerCount === 0) noAnswers++;
        else if (answerPct < 30) lowCoverage++;
        else if (answerPct >= 80) fullCoverage++;
      });

      // Candidates without any answers in the coverage view
      const candidatesWithAnswers = coverageData.length;
      noAnswers = Math.max(0, totalCandidates - candidatesWithAnswers) + noAnswers;

      const answerStats = {
        totalCandidates,
        totalQuestions,
        noAnswers,
        lowCoverage,
        fullCoverage,
      };

      console.log("[refresh-admin-stats] Answer stats:", answerStats);

      await supabase.from("admin_stats_cache").upsert({
        stat_key: "candidate_answer_stats",
        stat_value: answerStats,
        updated_at: new Date().toISOString(),
      });

      results.candidate_answer_stats = answerStats;
    }

    if (statKey === "fec_stats" || statKey === "all") {
      console.log("[refresh-admin-stats] Fetching FEC stats...");

      // Get candidates with FEC IDs
      const { data: candidatesWithFec } = await supabase
        .from("candidates")
        .select("id, fec_candidate_id, last_donor_sync");

      const withFecId = candidatesWithFec?.filter(c => c.fec_candidate_id).length || 0;
      const neverSynced = candidatesWithFec?.filter(c => c.fec_candidate_id && !c.last_donor_sync).length || 0;
      
      // Check committee sync status
      const { data: committees } = await supabase
        .from("candidate_committees")
        .select("candidate_id, last_sync_completed_at, has_more");

      const committeesByCandidate = new Map<string, { synced: boolean; complete: boolean }>();
      committees?.forEach(c => {
        const existing = committeesByCandidate.get(c.candidate_id || "");
        if (!existing) {
          committeesByCandidate.set(c.candidate_id || "", {
            synced: !!c.last_sync_completed_at,
            complete: c.last_sync_completed_at && !c.has_more,
          });
        } else {
          existing.synced = existing.synced || !!c.last_sync_completed_at;
          existing.complete = existing.complete && (!c.has_more);
        }
      });

      let partialSync = 0;
      let complete = 0;
      committeesByCandidate.forEach(v => {
        if (v.complete) complete++;
        else if (v.synced) partialSync++;
      });

      const fecStats = {
        withFecId,
        neverSynced,
        partialSync,
        complete,
      };

      console.log("[refresh-admin-stats] FEC stats:", fecStats);

      await supabase.from("admin_stats_cache").upsert({
        stat_key: "fec_stats",
        stat_value: fecStats,
        updated_at: new Date().toISOString(),
      });

      results.fec_stats = fecStats;
    }

    return new Response(JSON.stringify({ success: true, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[refresh-admin-stats] Error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
