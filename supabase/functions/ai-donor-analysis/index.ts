// AI-powered donor analysis: Perplexity (web-grounded) primary, Lovable AI Gemini fallback.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface RequestBody {
  donor_id: string;
  donor_name: string;
  donor_type: string;
  cycle?: string | null;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Try to extract a JSON object from a possibly-noisy LLM string.
function extractJson(raw: string): any | null {
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { /* try fenced/embedded */ }
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) {
    try { return JSON.parse(fence[1]); } catch { /* keep going */ }
  }
  const first = raw.indexOf("{");
  const last = raw.lastIndexOf("}");
  if (first >= 0 && last > first) {
    try { return JSON.parse(raw.slice(first, last + 1)); } catch { /* fail */ }
  }
  return null;
}

const ANALYSIS_SCHEMA = {
  type: "object",
  properties: {
    summary: { type: "string" },
    analysis: { type: "string" },
    party_support: {
      type: "array",
      items: {
        type: "object",
        properties: {
          party: { type: "string" },
          amount: { type: "number" },
          share: { type: "number" },
        },
        required: ["party", "amount", "share"],
      },
    },
    causes: { type: "array", items: { type: "string" } },
    motivation_hypotheses: { type: "array", items: { type: "string" } },
    finance_claims: { type: "array", items: { type: "string" } },
    public_context_claims: { type: "array", items: { type: "string" } },
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
    "summary", "analysis", "party_support", "causes", "motivation_hypotheses",
    "finance_claims", "public_context_claims", "insufficient_information",
    "confidence", "confidence_rationale", "sources",
  ],
  additionalProperties: false,
};

function buildSystemPrompt(): string {
  return `You are a nonpartisan campaign-finance analyst. You will receive structured FEC-style finance signals about a political donor and must produce an analysis.

CORE PRINCIPLE — DISAMBIGUATION FIRST:
- Donor names are frequently AMBIGUOUS. Many different PACs, committees, companies, and individuals share the same or near-identical names.
- You MUST anchor the entity using the provided finance signals (recipients, party breakdown, cycles active, name variations, donor type, dollar magnitude) before drawing on background knowledge.
- If finance signals do NOT uniquely identify a real-world entity (zero recipients, zero amount, no distinguishing variations):
  * Set "insufficient_information" to true.
  * Confidence MUST be ≤ 20.
  * "public_context_claims" MUST be empty.
  * Do NOT name founders, leaders, ideologies, controversies, or specific facts about a same-named entity.
  * State plainly that the entity could not be uniquely identified and that multiple unrelated committees may share this name.

REQUIREMENTS:
- Treat the finance signals as ground truth for dollar amounts and recipients. Never invent figures, dates, quotes, or people.
- "finance_claims": bullets derived strictly from the provided finance signals.
- "public_context_claims": bullets from background/web knowledge — only when entity is disambiguated. Each item SHOULD reference a source by 1-based index in brackets, e.g. "Founded in 2024 [1]".
- "sources": real, reachable URLs (FEC.gov, OpenSecrets, news outlets, official sites). Empty rather than fabricated.
- "confidence" 0-100 calibrated: 0-20 unidentified; 21-40 thin; 41-60 mixed; 61-80 good; 81-100 rich+well-documented.
- "confidence_rationale": one sentence.
- Stay neutral. No partisan framing.
- Output STRICT JSON matching the schema. No markdown, no commentary outside JSON.`;
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
        json_schema: { name: "donor_analysis", schema: ANALYSIS_SCHEMA },
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
          name: "donor_analysis",
          description: "Structured donor analysis output.",
          parameters: ANALYSIS_SCHEMA,
        },
      }],
      tool_choice: { type: "function", function: { name: "donor_analysis" } },
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

    const donor_id = String(body.donor_id ?? "").trim();
    const donor_name = String(body.donor_name ?? "").trim();
    const donor_type = String(body.donor_type ?? "Unknown").trim();
    const cycle = body.cycle && String(body.cycle).trim() && body.cycle !== "all"
      ? String(body.cycle).trim() : null;
    if (!donor_id || !donor_name) return json({ error: "donor_id and donor_name are required" }, 400);

    const admin = createClient(supabaseUrl, serviceKey);

    // Gather finance signals
    let donorRowsQ = admin
      .from("donors")
      .select("name, display_name, type, amount, transaction_count, candidate_id, cycle")
      .eq("display_name", donor_name)
      .limit(2000);
    if (cycle) donorRowsQ = donorRowsQ.eq("cycle", cycle);
    const { data: donorRows } = await donorRowsQ;

    const rows = donorRows ?? [];
    const totalAmount = rows.reduce((s, r: any) => s + Number(r.amount ?? 0), 0);
    const totalTx = rows.reduce((s, r: any) => s + Number(r.transaction_count ?? 0), 0);
    const nameVariations = Array.from(new Set(rows.map((r: any) => r.name))).slice(0, 25);
    const types = Array.from(new Set(rows.map((r: any) => r.type)));
    const cycles = Array.from(new Set(rows.map((r: any) => r.cycle).filter(Boolean)));
    const candidateIds = Array.from(new Set(rows.map((r: any) => r.candidate_id).filter(Boolean)));

    let candidates: any[] = [];
    if (candidateIds.length > 0) {
      const { data: cands } = await admin
        .from("candidates")
        .select("id, name, party, office, state")
        .in("id", candidateIds);
      candidates = cands ?? [];
    }
    const candById = new Map(candidates.map((c) => [c.id, c]));

    const partyTotals: Record<string, number> = {};
    const recipientTotals: Record<string, { name: string; party: string; amount: number; office?: string; state?: string }> = {};
    for (const r of rows as any[]) {
      const c = candById.get(r.candidate_id);
      const party = (c?.party ?? "Unknown") as string;
      partyTotals[party] = (partyTotals[party] ?? 0) + Number(r.amount ?? 0);
      if (c) {
        const cur = recipientTotals[c.id] ?? { name: c.name, party, amount: 0, office: c.office, state: c.state };
        cur.amount += Number(r.amount ?? 0);
        recipientTotals[c.id] = cur;
      }
    }
    const partyBreakdown = Object.entries(partyTotals)
      .map(([party, amount]) => ({ party, amount, share: totalAmount > 0 ? amount / totalAmount : 0 }))
      .sort((a, b) => b.amount - a.amount);
    const topRecipients = Object.values(recipientTotals)
      .sort((a, b) => b.amount - a.amount).slice(0, 10);

    const { data: aliasMatch } = await admin
      .from("donor_aliases")
      .select("canonical_name, alias_patterns, donor_types")
      .eq("canonical_name", donor_name).maybeSingle();

    const coverageScore =
      (totalTx >= 100 ? 3 : totalTx >= 20 ? 2 : totalTx >= 1 ? 1 : 0) +
      (totalAmount >= 1_000_000 ? 3 : totalAmount >= 50_000 ? 2 : totalAmount >= 1 ? 1 : 0) +
      (cycles.length >= 3 ? 2 : cycles.length >= 1 ? 1 : 0) +
      (Object.keys(recipientTotals).length >= 10 ? 2 : Object.keys(recipientTotals).length >= 1 ? 1 : 0);
    const data_coverage: "none" | "sparse" | "moderate" | "rich" =
      coverageScore === 0 ? "none" : coverageScore <= 3 ? "sparse" : coverageScore <= 6 ? "moderate" : "rich";

    const signals = {
      donor: {
        display_name: donor_name,
        type: donor_type,
        all_types: types,
        canonical_alias: aliasMatch?.canonical_name ?? null,
      },
      finance: {
        cycle: cycle ?? "all",
        total_amount: Math.round(totalAmount),
        total_transactions: totalTx,
        cycles_active: cycles,
        name_variations: nameVariations,
        party_breakdown: partyBreakdown,
        top_recipients: topRecipients,
        data_coverage,
      },
    };

    const systemPrompt = buildSystemPrompt();
    const userPrompt = `Donor finance signals (JSON):\n${JSON.stringify(signals, null, 2)}\n\nServer-computed data_coverage = "${data_coverage}".\nUse live web search to identify and characterize the donor only when finance signals corroborate identity. Cap confidence at 20 if unidentified.\n\nProduce the analysis now as STRICT JSON matching the schema.`;

    let parsed: any = null;
    let provider: "perplexity" | "gemini" = "perplexity";
    let citations: string[] = [];
    let providerError: string | null = null;

    // Primary: Perplexity (web-grounded)
    if (perplexityApiKey) {
      try {
        const r = await callPerplexity(perplexityApiKey, systemPrompt, userPrompt);
        parsed = r.parsed;
        citations = r.citations;
      } catch (e) {
        providerError = e instanceof Error ? e.message : String(e);
        console.warn("Perplexity failed, falling back to Gemini:", providerError);
      }
    } else {
      providerError = "PERPLEXITY_API_KEY not configured";
    }

    // Fallback: Lovable AI Gemini
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
        // Surface 429/402 distinctly
        if (/gemini_429/.test(msg)) return json({ error: "AI rate limit reached. Please try again shortly." }, 200);
        if (/gemini_402/.test(msg)) return json({ error: "AI credits exhausted. Add credits in workspace settings." }, 200);
        return json({ error: "AI analysis is temporarily unavailable.", details: msg, perplexity_error: providerError }, 200);
      }
    }

    // Merge Perplexity citations into sources if model returned empty.
    if (provider === "perplexity" && (!Array.isArray(parsed.sources) || parsed.sources.length === 0) && citations.length > 0) {
      parsed.sources = citations.slice(0, 10).map((url, i) => ({
        title: (() => { try { return new URL(url).hostname; } catch { return `Source ${i + 1}`; } })(),
        url,
      }));
    }

    return json({
      ...parsed,
      data_coverage,
      provider,
      provider_fallback: provider === "gemini" ? { reason: providerError } : null,
      finance_context: {
        total_amount: signals.finance.total_amount,
        total_transactions: signals.finance.total_transactions,
        party_breakdown: signals.finance.party_breakdown,
        top_recipients: signals.finance.top_recipients,
      },
    });
  } catch (e) {
    console.error("ai-donor-analysis error", e);
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});
