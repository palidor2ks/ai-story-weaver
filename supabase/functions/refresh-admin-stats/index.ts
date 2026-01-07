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
      
      // Count legislative actions (sponsored + cosponsored) - using limit(1) instead of head:true
      console.log("[refresh-admin-stats] Counting legislative actions...");
      const legStart = Date.now();
      const { count: legislativeCount, data: legData, error: legError } = await supabase
        .from("votes")
        .select("id", { count: "exact" })
        .in("action_type", ["sponsored", "cosponsored"])
        .limit(1);
      console.log(`[refresh-admin-stats] Legislative count: ${legislativeCount}, rows: ${legData?.length}, error: ${legError?.message || 'none'}, took ${Date.now() - legStart}ms`);

      // Count floor votes - using limit(1) instead of head:true
      console.log("[refresh-admin-stats] Counting floor votes...");
      const floorStart = Date.now();
      const { count: floorCount, data: floorData, error: floorError } = await supabase
        .from("votes")
        .select("id", { count: "exact" })
        .eq("action_type", "floor_vote")
        .limit(1);
      console.log(`[refresh-admin-stats] Floor count: ${floorCount}, rows: ${floorData?.length}, error: ${floorError?.message || 'none'}, took ${Date.now() - floorStart}ms`);

      // Count total records - using limit(1) instead of head:true
      console.log("[refresh-admin-stats] Counting total records...");
      const totalStart = Date.now();
      const { count: totalRecords, data: totalData, error: totalError } = await supabase
        .from("votes")
        .select("id", { count: "exact" })
        .limit(1);
      console.log(`[refresh-admin-stats] Total count: ${totalRecords}, rows: ${totalData?.length}, error: ${totalError?.message || 'none'}, took ${Date.now() - totalStart}ms`);

      // Use vote_sync_status for accurate member counts (no sampling)
      console.log("[refresh-admin-stats] Fetching vote_sync_status for member counts...");
      const { data: syncStatus, error: syncError } = await supabase
        .from("vote_sync_status")
        .select("candidate_id, persisted_count, persisted_floor_votes");
      
      if (syncError) {
        console.error("[refresh-admin-stats] vote_sync_status error:", syncError);
      }

      const membersSynced = syncStatus?.filter(s => (s.persisted_count || 0) > 0 || (s.persisted_floor_votes || 0) > 0).length || 0;
      const membersWithFloorVotes = syncStatus?.filter(s => (s.persisted_floor_votes || 0) > 0).length || 0;

      console.log(`[refresh-admin-stats] Members synced: ${membersSynced}, with floor votes: ${membersWithFloorVotes}`);

      // Get total federal candidates for coverage - using limit(1) instead of head:true
      const { count: totalFederalCandidates } = await supabase
        .from("candidates")
        .select("id", { count: "exact" })
        .or("office.ilike.%Senator%,office.ilike.%Representative%")
        .limit(1);

      const coveragePercentage = totalFederalCandidates 
        ? Math.round((membersSynced / totalFederalCandidates) * 100)
        : 0;

      const votingStats = {
        legislativeActions: legislativeCount || 0,
        floorVotes: floorCount || 0,
        totalRecords: totalRecords || 0,
        membersSynced,
        membersWithFloorVotes,
        coveragePercentage,
      };

      console.log("[refresh-admin-stats] Final voting stats:", JSON.stringify(votingStats));

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
