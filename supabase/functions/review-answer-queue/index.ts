import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
declare const EdgeRuntime: { waitUntil: (promise: Promise<unknown>) => void };
const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SYSTEM_KEY = "answer_review_scheduler_state";
type SchedulerState = { status: "idle" | "running" | "error"; updatedAt: string; candidateCursor: string | null; partyCursor: string | null; cycleCount: number; lastError?: string; lastRunSummary?: { candidatesChecked: number; partiesChecked: number; candidateAnswersGenerated: number; partyAnswersGenerated: number; runtimeMs: number; }; };
const defaultState: SchedulerState = { status: "idle", updatedAt: new Date(0).toISOString(), candidateCursor: null, partyCursor: null, cycleCount: 0 };
const getRuntimeMs = (startedAt: number) => Date.now() - startedAt;
async function getState(supabase: ReturnType<typeof createClient>): Promise<SchedulerState> { const { data } = await supabase.from("admin_stats_cache").select("stat_value").eq("stat_key", SYSTEM_KEY).maybeSingle(); return { ...defaultState, ...(data?.stat_value as Partial<SchedulerState> | null) }; }
async function setState(supabase: ReturnType<typeof createClient>, state: SchedulerState) { await supabase.from("admin_stats_cache").upsert({ stat_key: SYSTEM_KEY, stat_value: state, updated_at: new Date().toISOString() }, { onConflict: "stat_key" }); }
async function processCandidates(supabase: ReturnType<typeof createClient>, cursor: string | null, limit: number) {
  let query = supabase.from("candidates").select("id, name, party, office, state").order("id", { ascending: true }).limit(limit);
  if (cursor) query = query.gt("id", cursor);
  const { data, error } = await query; if (error) throw new Error(`Failed to query candidates: ${error.message}`);
  let generated = 0;
  for (const candidate of data ?? []) {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/get-candidate-answers`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`, "x-internal-chain-secret": SUPABASE_SERVICE_ROLE_KEY }, body: JSON.stringify({ candidateId: candidate.id, candidateName: candidate.name, candidateParty: candidate.party, candidateOffice: candidate.office, candidateState: candidate.state, forceRegenerate: false }) });
    if (!response.ok) { console.warn(`[candidate:${candidate.id}] skipped: ${await response.text()}`); continue; }
    const result = await response.json(); generated += Number(result.generated || 0);
  }
  return { checked: data?.length || 0, generated, nextCursor: data?.length ? data[data.length - 1].id : null };
}
async function processParties(supabase: ReturnType<typeof createClient>, cursor: string | null, limit: number) {
  let query = supabase.from("parties").select("id").order("id", { ascending: true }).limit(limit);
  if (cursor) query = query.gt("id", cursor);
  const { data, error } = await query; if (error) throw new Error(`Failed to query parties: ${error.message}`);
  let generated = 0;
  for (const party of data ?? []) {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/populate-party-answers`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`, "x-internal-chain-secret": SUPABASE_SERVICE_ROLE_KEY }, body: JSON.stringify({ partyId: party.id }) });
    if (!response.ok) { console.warn(`[party:${party.id}] skipped: ${await response.text()}`); continue; }
    const result = await response.json(); generated += Number(result.totalAnswersProcessed || 0);
  }
  return { checked: data?.length || 0, generated, nextCursor: data?.length ? data[data.length - 1].id : null };
}
async function runCycle(params: { candidateLimit: number; partyLimit: number; maxRuntimeMs: number }) {
  const startedAt = Date.now(); const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY); const state = await getState(supabase);
  await setState(supabase, { ...state, status: "running", updatedAt: new Date().toISOString() });
  try {
    const candidateResult = await processCandidates(supabase, state.candidateCursor, params.candidateLimit);
    if (getRuntimeMs(startedAt) > params.maxRuntimeMs) throw new Error(`Cycle exceeded maxRuntimeMs=${params.maxRuntimeMs}`);
    const partyResult = await processParties(supabase, state.partyCursor, params.partyLimit);
    await setState(supabase, { ...state, status: "idle", updatedAt: new Date().toISOString(), candidateCursor: candidateResult.nextCursor, partyCursor: partyResult.nextCursor, cycleCount: state.cycleCount + 1, lastRunSummary: { candidatesChecked: candidateResult.checked, partiesChecked: partyResult.checked, candidateAnswersGenerated: candidateResult.generated, partyAnswersGenerated: partyResult.generated, runtimeMs: getRuntimeMs(startedAt) } });
  } catch (error) {
    await setState(supabase, { ...state, status: "error", updatedAt: new Date().toISOString(), lastError: error instanceof Error ? error.message : "Unknown error" });
    throw error;
  }
}
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization"); if (!authHeader?.startsWith("Bearer ")) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { global: { headers: { Authorization: authHeader } } });
    const { data: { user }, error: authError } = await userClient.auth.getUser(); if (authError || !user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const adminDbClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY); const { data: roleData } = await adminDbClient.from("user_roles").select("role").eq("user_id", user.id).eq("role", "admin").maybeSingle(); if (!roleData) return new Response(JSON.stringify({ error: "Forbidden: admin role required" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const body = await req.json().catch(() => ({}));
    const candidateLimit = Math.max(1, Math.min(20, Number(body.candidateLimit ?? 5)));
    const partyLimit = Math.max(1, Math.min(5, Number(body.partyLimit ?? 1)));
    const maxRuntimeMs = Math.max(10000, Math.min(120000, Number(body.maxRuntimeMs ?? 75000)));
    EdgeRuntime.waitUntil(runCycle({ candidateLimit, partyLimit, maxRuntimeMs }));
    return new Response(JSON.stringify({ success: true, message: "Answer review cycle started. Schedule this function every 2-5 minutes.", limits: { candidateLimit, partyLimit, maxRuntimeMs }, stateKey: SYSTEM_KEY }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    return new Response(JSON.stringify({ success: false, error: error instanceof Error ? error.message : "Unknown error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
