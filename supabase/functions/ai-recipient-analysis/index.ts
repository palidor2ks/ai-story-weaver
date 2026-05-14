// AI-powered recipient (candidate or committee) analysis: Perplexity primary, Lovable AI Gemini fallback.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface RequestBody {
  entity_type: "candidate" | "committee";
  entity_id: string;
  cycle?: string | null;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function extractJson(raw: string): any | null {
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { /* try fenced */ }
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) { try { return JSON.parse(fence[1]); } catch { /* keep going */ } }
  const first = raw.indexOf("{"); const last = raw.lastIndexOf("}");
  if (first >= 0 && last > first) {
    try { return JSON.parse(raw.slice(first, last + 1)); } catch { /* fail */ }
  }
  return null;
}

const RECIPIENT_SCHEMA = {
  type: "object",
  properties: {
    summary: { type: "string" },
    analysis: { type: "string" },
    positions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          topic: { type: "string" },
          stance: { type: "string" },
          evidence: { type: "string" },
        },
        required: ["topic", "stance"],
      },
    },
    policy_priorities: { type: "array", items: { type: "string" } },
    goals: { type: "array", items: { type: "string" } },
    top_donor_categories: { type: "array", items: { type: "string" } },
    coalition_signals: { type: "array", items: { type: "string" } },
    finance_claims: { type: "array", items: { type: "string" } },
    public_context_claims: { type: "array", items: { type: "string" } },
    controversies: { type: "array", items: { type: "string" } },
    insufficient_information: { type: "boolean" },
    confidence: { type: "integer", minimum: 0, maximum: 100 },
    confidence_rationale: { type: "string" },
    sources: {
      type: "array",
      items: {
        type: "object",
        properties: { title: { type: "string" }, url: { type: "string" } },
        required: ["title", "url"],
      },
    },
  },
  required: [
    "summary", "analysis", "positions", "policy_priorities", "goals",
    "top_donor_categories", "coalition_signals", "finance_claims",
    "public_context_claims", "controversies", "insufficient_information",
    "confidence", "confidence_rationale", "sources",
  ],
  additionalProperties: false,
};

function buildSystemPrompt(): string {
  return `You are a nonpartisan political analyst. You will receive structured signals about a campaign-finance recipient (a candidate or a committee/PAC) and must produce an analysis of their positions, priorities, and what they appear to be trying to achieve.

CORE PRINCIPLE — DISAMBIGUATION FIRST:
- Names are often ambiguous; verify identity using the provided FEC ID, office, state, party, and committee type before relying on background knowledge.
- If the signals do not uniquely identify a real-world entity, set "insufficient_information" to true, cap confidence ≤ 20, and leave "public_context_claims" empty. Do not invent facts.

REQUIREMENTS:
- Treat numeric finance signals as ground truth; never invent figures, votes, or quotes.
- "positions": specific policy stances grounded in voting record, public statements, or platform — each with topic, stance, and (when available) brief evidence.
- "finance_claims": derived strictly from signals (totals, top donor categories, expenditures).
- "public_context_claims": from background/web; cite sources by 1-based index, e.g. "Endorsed by X [2]".
- "sources": real reachable URLs (fec.gov, opensecrets.org, ballotpedia, official campaign sites, major news). Empty rather than fabricated.
- "confidence" 0-100: 0-20 unidentified; 21-40 thin; 41-60 mixed; 61-80 good; 81-100 rich+well-documented.
- Stay neutral. Output STRICT JSON matching the schema. No markdown.`;
}

async function callPerplexity(apiKey: string, system: string, user: string): Promise<{ parsed: any; citations: string[] }> {
  const resp = await fetch("https://api.perplexity.ai/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "sonar-pro",
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      response_format: {
        type: "json_schema",
        json_schema: { name: "recipient_analysis", schema: RECIPIENT_SCHEMA },
      },
    }),
  });
  if (!resp.ok) {
    const t = await resp.text();
    throw new Error(`perplexity_${resp.status}:${t.slice(0, 200)}`);
  }
  const j = await resp.json();
  const content: string = j?.choices?.[0]?.message?.content ?? "";
  const citations: string[] = Array.isArray(j?.citations) ? j.citations : [];
  const parsed = extractJson(content);
  if (!parsed) throw new Error("perplexity_unparseable");
  return { parsed, citations };
}

async function callGemini(apiKey: string, system: string, user: string): Promise<any> {
  const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-2.5-pro",
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      tools: [{
        type: "function",
        function: {
          name: "recipient_analysis",
          description: "Structured recipient analysis output.",
          parameters: RECIPIENT_SCHEMA,
        },
      }],
      tool_choice: { type: "function", function: { name: "recipient_analysis" } },
    }),
  });
  if (!resp.ok) {
    const t = await resp.text();
    throw new Error(`gemini_${resp.status}:${t.slice(0, 200)}`);
  }
  const j = await resp.json();
  const args = j?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
  if (!args) throw new Error("gemini_no_tool_args");
  try { return JSON.parse(args); } catch { throw new Error("gemini_unparseable"); }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");
    const perplexityApiKey = Deno.env.get("PERPLEXITY_API_KEY");

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) return json({ error: "Unauthorized" }, 401);

    let body: RequestBody;
    try { body = await req.json(); } catch { return json({ error: "Invalid JSON body" }, 400); }

    const entity_type = body.entity_type === "committee" ? "committee" : "candidate";
    const entity_id = String(body.entity_id ?? "").trim();
    const cycle = body.cycle && String(body.cycle).trim() && body.cycle !== "all"
      ? String(body.cycle).trim() : null;
    if (!entity_id) return json({ error: "entity_id is required" }, 400);

    const admin = createClient(supabaseUrl, serviceKey);

    // Build entity signals
    let signals: any = { entity_type, cycle: cycle ?? "all" };
    let displayName = "";

    if (entity_type === "candidate") {
      const { data: c } = await admin
        .from("candidates")
        .select("id, name, party, office, state, district, fec_candidate_id, fec_committee_id, lis_member_id, overall_score")
        .eq("id", entity_id).maybeSingle();
      if (!c) return json({ error: "Candidate not found" }, 404);
      displayName = c.name;

      // Top donor categories from contributions of authorized committees
      const { data: comms } = await admin
        .from("candidate_committees")
        .select("fec_committee_id")
        .eq("candidate_id", entity_id)
        .eq("active", true)
        .in("designation", ["P", "A"]);
      const commIds = (comms ?? []).map((x: any) => x.fec_committee_id).filter(Boolean);

      let categoryTotals: Record<string, number> = {};
      let totalReceipts = 0;
      if (commIds.length > 0) {
        let q = admin.from("contributions")
          .select("amount, contributor_type, line_number")
          .in("recipient_committee_id", commIds)
          .eq("is_contribution", true)
          .neq("memo_code", "X")
          .limit(5000);
        if (cycle) q = q.eq("cycle", cycle);
        const { data: contribs } = await q;
        for (const r of (contribs ?? []) as any[]) {
          const amt = Number(r.amount ?? 0);
          if (!Number.isFinite(amt)) continue;
          totalReceipts += amt;
          const key = String(r.contributor_type ?? "Unknown");
          categoryTotals[key] = (categoryTotals[key] ?? 0) + amt;
        }
      }
      const top_donor_categories = Object.entries(categoryTotals)
        .sort((a, b) => b[1] - a[1]).slice(0, 6)
        .map(([category, amount]) => ({ category, amount: Math.round(amount) }));

      signals.candidate = {
        name: c.name, party: c.party, office: c.office, state: c.state,
        district: c.district, fec_candidate_id: c.fec_candidate_id,
        fec_committee_id: c.fec_committee_id, lis_member_id: c.lis_member_id,
        overall_score: c.overall_score,
      };
      signals.finance = {
        authorized_committees: commIds,
        total_receipts: Math.round(totalReceipts),
        top_donor_categories,
      };
    } else {
      // Committee
      const { data: comm } = await admin
        .from("committee_finance_rollups")
        .select("committee_id, committee_name, committee_type, designation, party_affiliation, candidate_id, cycle, total_receipts, total_disbursements")
        .eq("committee_id", entity_id)
        .order("cycle", { ascending: false })
        .limit(20);
      const rows = comm ?? [];
      if (rows.length === 0) return json({ error: "Committee not found" }, 404);
      const head = rows[0];
      displayName = head.committee_name;
      signals.committee = {
        committee_id: head.committee_id,
        name: head.committee_name,
        type: head.committee_type,
        designation: head.designation,
        party: head.party_affiliation,
        cycles: rows.map((r: any) => ({
          cycle: r.cycle,
          receipts: Number(r.total_receipts ?? 0),
          disbursements: Number(r.total_disbursements ?? 0),
        })),
      };
      // Linked candidates this committee supports/opposes
      const { data: pacExp } = await admin
        .from("pac_expenditures")
        .select("candidate_id, support_oppose, amount, cycle")
        .eq("committee_id", entity_id)
        .limit(200);
      signals.expenditures = (pacExp ?? []).slice(0, 50);
    }

    const systemPrompt = buildSystemPrompt();
    const userPrompt = `Recipient signals (JSON):\n${JSON.stringify(signals, null, 2)}\n\nUse live web search to identify and characterize this ${entity_type}. Anchor on FEC ID and office/state. Cap confidence at 20 if you cannot disambiguate.\n\nProduce the analysis now as STRICT JSON matching the schema.`;

    let parsed: any = null;
    let provider: "perplexity" | "gemini" = "perplexity";
    let citations: string[] = [];
    let providerError: string | null = null;

    if (perplexityApiKey) {
      try {
        const r = await callPerplexity(perplexityApiKey, systemPrompt, userPrompt);
        parsed = r.parsed; citations = r.citations;
      } catch (e) {
        providerError = e instanceof Error ? e.message : String(e);
        console.warn("Perplexity failed, falling back to Gemini:", providerError);
      }
    } else {
      providerError = "PERPLEXITY_API_KEY not configured";
    }

    if (!parsed) {
      if (!lovableApiKey) {
        return json({ error: "Both Perplexity and Lovable AI are unavailable.", details: providerError }, 503);
      }
      try {
        parsed = await callGemini(lovableApiKey, systemPrompt, userPrompt);
        provider = "gemini";
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error("Gemini fallback also failed:", msg);
        if (/gemini_429/.test(msg)) return json({ error: "AI rate limit reached. Please try again shortly." }, 200);
        if (/gemini_402/.test(msg)) return json({ error: "AI credits exhausted. Add credits in workspace settings." }, 200);
        return json({ error: "AI analysis is temporarily unavailable.", details: msg, perplexity_error: providerError }, 200);
      }
    }

    if (provider === "perplexity" && (!Array.isArray(parsed.sources) || parsed.sources.length === 0) && citations.length > 0) {
      parsed.sources = citations.slice(0, 10).map((url, i) => ({
        title: (() => { try { return new URL(url).hostname; } catch { return `Source ${i + 1}`; } })(),
        url,
      }));
    }

    return json({
      ...parsed,
      entity_type,
      entity_id,
      display_name: displayName,
      provider,
      provider_fallback: provider === "gemini" ? { reason: providerError } : null,
      finance_context: signals,
    });
  } catch (e) {
    console.error("ai-recipient-analysis error", e);
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});
