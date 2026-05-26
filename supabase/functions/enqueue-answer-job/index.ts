import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "npm:zod@3.23.8";

const BodySchema = z.object({
  candidateId: z.string().min(1),
  forceRegenerate: z.boolean().optional().default(false),
  questionIds: z.array(z.string()).optional(),
  priority: z.number().int().min(1).max(1000).optional().default(100),
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json({ error: "Unauthorized" }, 401);
    }

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claims, error: claimsErr } = await userClient.auth.getClaims(token);
    if (claimsErr || !claims?.claims) return json({ error: "Unauthorized" }, 401);
    const userId = claims.claims.sub as string;

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Admin check
    const { data: roleRow } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "admin")
      .maybeSingle();
    if (!roleRow) return json({ error: "Forbidden: admin role required" }, 403);

    const parsed = BodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return json({ error: parsed.error.flatten().fieldErrors }, 400);
    }
    const { candidateId, forceRegenerate, questionIds, priority } = parsed.data;

    // Idempotency key: bucket by candidate + question scope + force flag (1-min bucket)
    const qsig = questionIds?.length ? questionIds.slice().sort().join(",") : "all";
    const bucket = Math.floor(Date.now() / 60_000);
    const idempotencyKey = `rep_answers:${candidateId}:${qsig}:${forceRegenerate ? "f" : "n"}:${bucket}`;

    // If a non-finished job with same key exists, return it
    const { data: existing } = await admin
      .from("job_queue")
      .select("id, status, created_at")
      .eq("idempotency_key", idempotencyKey)
      .in("status", ["pending", "running"])
      .maybeSingle();

    if (existing) {
      return json({ jobId: existing.id, status: existing.status, deduplicated: true });
    }

    const { data: inserted, error: insertErr } = await admin
      .from("job_queue")
      .insert({
        job_type: "rep_answers_generate",
        payload: { candidateId, forceRegenerate, questionIds: questionIds ?? null },
        priority,
        idempotency_key: idempotencyKey,
        created_by: userId,
      })
      .select("id, status")
      .single();

    if (insertErr) {
      console.error("enqueue insert failed", insertErr);
      return json({ error: insertErr.message }, 500);
    }

    return json({ jobId: inserted.id, status: inserted.status, deduplicated: false });
  } catch (e) {
    console.error("enqueue-answer-job error", e);
    return json({ error: e instanceof Error ? e.message : "Internal error" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
