// AI-powered donor analysis using Lovable AI Gateway
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json({ error: "Unauthorized" }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) {
      return json({ error: "Unauthorized" }, 401);
    }

    if (!lovableApiKey) {
      return json({ error: "AI gateway not configured" }, 500);
    }

    let body: RequestBody;
    try {
      body = await req.json();
    } catch {
      return json({ error: "Invalid JSON body" }, 400);
    }

    const donor_id = String(body.donor_id ?? "").trim();
    const donor_name = String(body.donor_name ?? "").trim();
    const donor_type = String(body.donor_type ?? "Unknown").trim();
    const cycle =
      body.cycle && String(body.cycle).trim() && body.cycle !== "all"
        ? String(body.cycle).trim()
        : null;

    if (!donor_id || !donor_name) {
      return json({ error: "donor_id and donor_name are required" }, 400);
    }

    const admin = createClient(supabaseUrl, serviceKey);

    // Gather donor finance signals
    let donorRowsQ = admin
      .from("donors")
      .select("name, display_name, type, amount, transaction_count, candidate_id, cycle")
      .eq("display_name", donor_name)
      .limit(2000);
    if (cycle) donorRowsQ = donorRowsQ.eq("cycle", cycle);
    const { data: donorRows } = await donorRowsQ;

    const rows = donorRows ?? [];
    const totalAmount = rows.reduce((s, r: any) => s + Number(r.amount ?? 0), 0);
    const totalTx = rows.reduce(
      (s, r: any) => s + Number(r.transaction_count ?? 0),
      0,
    );
    const nameVariations = Array.from(new Set(rows.map((r: any) => r.name))).slice(0, 25);
    const types = Array.from(new Set(rows.map((r: any) => r.type)));
    const cycles = Array.from(new Set(rows.map((r: any) => r.cycle).filter(Boolean)));
    const candidateIds = Array.from(
      new Set(rows.map((r: any) => r.candidate_id).filter(Boolean)),
    );

    // Recipient candidates with party
    let candidates: any[] = [];
    if (candidateIds.length > 0) {
      const { data: cands } = await admin
        .from("candidates")
        .select("id, name, party, office, state")
        .in("id", candidateIds);
      candidates = cands ?? [];
    }
    const candById = new Map(candidates.map((c) => [c.id, c]));

    // Aggregate party support and top recipients
    const partyTotals: Record<string, number> = {};
    const recipientTotals: Record<string, { name: string; party: string; amount: number; office?: string; state?: string }> = {};
    for (const r of rows as any[]) {
      const c = candById.get(r.candidate_id);
      const party = (c?.party ?? "Unknown") as string;
      partyTotals[party] = (partyTotals[party] ?? 0) + Number(r.amount ?? 0);
      if (c) {
        const cur = recipientTotals[c.id] ?? {
          name: c.name,
          party,
          amount: 0,
          office: c.office,
          state: c.state,
        };
        cur.amount += Number(r.amount ?? 0);
        recipientTotals[c.id] = cur;
      }
    }
    const partyBreakdown = Object.entries(partyTotals)
      .map(([party, amount]) => ({
        party,
        amount,
        share: totalAmount > 0 ? amount / totalAmount : 0,
      }))
      .sort((a, b) => b.amount - a.amount);
    const topRecipients = Object.values(recipientTotals)
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 10);

    // Alias info
    const { data: aliasMatch } = await admin
      .from("donor_aliases")
      .select("canonical_name, alias_patterns, donor_types")
      .eq("canonical_name", donor_name)
      .maybeSingle();

    // Deterministic data coverage classification (server-computed)
    const coverageScore =
      (totalTx >= 100 ? 3 : totalTx >= 20 ? 2 : totalTx >= 1 ? 1 : 0) +
      (totalAmount >= 1_000_000 ? 3 : totalAmount >= 50_000 ? 2 : totalAmount >= 1 ? 1 : 0) +
      (cycles.length >= 3 ? 2 : cycles.length >= 1 ? 1 : 0) +
      (Object.keys(recipientTotals).length >= 10 ? 2 : Object.keys(recipientTotals).length >= 1 ? 1 : 0);
    // 0..10 → bucket
    const data_coverage: "none" | "sparse" | "moderate" | "rich" =
      coverageScore === 0 ? "none"
        : coverageScore <= 3 ? "sparse"
        : coverageScore <= 6 ? "moderate"
        : "rich";

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

    const systemPrompt = `You are a nonpartisan campaign-finance analyst. You will receive structured FEC-style finance signals about a political donor and must produce an analysis.

CORE PRINCIPLE — DISAMBIGUATION FIRST:
- Donor names are frequently AMBIGUOUS. Many different PACs, committees, companies, and individuals share the same or near-identical names (e.g. "AMERICA PAC" has been used by several unrelated committees across cycles).
- You MUST NOT assume a name uniquely identifies an entity. Before drawing on background knowledge, you must be able to anchor the entity using the provided finance signals (recipients, party breakdown, cycles active, name variations, donor type, dollar magnitude).
- If the finance signals do NOT uniquely identify a specific real-world entity (e.g. zero recipients, zero amount, no distinguishing name variations), you MUST treat the entity as UNIDENTIFIED:
  * Set "insufficient_information" to true.
  * Confidence MUST be ≤ 20.
  * "public_context_claims" MUST be empty.
  * Do NOT name founders, leaders, ideologies, controversies, affiliations, or any specific real-world facts about a same-named entity. Do not speculate.
  * The summary and analysis must say plainly that the entity could not be uniquely identified from the available filings, and note that multiple unrelated committees/donors may share this name.
- Only invoke background knowledge when finance signals corroborate identity (e.g. a PAC's known top recipients match, FEC committee ID matches, or distinctive name variations / cycle activity match a well-documented entity).

OTHER REQUIREMENTS:
- Treat the finance signals as ground truth for dollar amounts and recipients. Never invent figures, dates, quotes, or people.
- Separate claims by provenance:
  * "finance_claims": bullet statements derived strictly from the provided finance signals (totals, party splits, recipients, cycles active).
  * "public_context_claims": bullet statements drawn from background knowledge — ONLY allowed when the entity has been disambiguated per the rule above. Each item SHOULD reference a source by 1-based index in brackets, e.g. "Founded by X in 2024 [1]".
- "sources": include reputable URLs (FEC.gov, OpenSecrets, major news outlets, official sites) only for claims you actually made. Leave empty rather than fabricating URLs.
- Output a "confidence" integer 0-100:
  * 0-20: entity not uniquely identifiable, or no real signal. (REQUIRED when unidentified per rule above.)
  * 21-40: thin finance data AND limited corroborated background.
  * 41-60: either decent finance data OR solid corroborated background.
  * 61-80: good finance data AND corroborated background.
  * 81-100: rich filings, well-documented entity, citable sources.
  Penalize when sources is empty or data_coverage is "none"/"sparse" without independent corroboration.
- "confidence_rationale": one sentence explaining the score (what you had / what was missing).
- Stay neutral. No partisan framing.
- Output STRICT JSON matching the schema. No markdown, no commentary outside JSON.`;

    const userPrompt = `Donor finance signals (JSON):\n${JSON.stringify(signals, null, 2)}\n\nServer-computed data_coverage = "${data_coverage}".\n\nReminder: if the finance signals do not uniquely identify a specific real-world entity, treat as UNIDENTIFIED — do not name founders/leaders/ideologies of any same-named entity, set insufficient_information=true, and cap confidence at 20.\n\nProduce the analysis now.`;

    const aiResp = await fetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${lovableApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-pro",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          tools: [
            {
              type: "function",
              function: {
                name: "donor_analysis",
                description: "Structured donor analysis output.",
                parameters: {
                  type: "object",
                  properties: {
                    summary: { type: "string", description: "2-3 sentence overview." },
                    analysis: { type: "string", description: "Longer narrative, 1-3 paragraphs." },
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
                    finance_claims: {
                      type: "array",
                      description: "Bullet statements derived strictly from the provided finance signals.",
                      items: { type: "string" },
                    },
                    public_context_claims: {
                      type: "array",
                      description: "Bullet statements drawn from background public knowledge. May include [n] source citations.",
                      items: { type: "string" },
                    },
                    insufficient_information: { type: "boolean" },
                    confidence: {
                      type: "integer",
                      minimum: 0,
                      maximum: 100,
                      description: "0-100 trustworthiness score for the overall analysis.",
                    },
                    confidence_rationale: {
                      type: "string",
                      description: "One sentence explaining the confidence score.",
                    },
                    sources: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          title: { type: "string" },
                          url: { type: "string" },
                        },
                        required: ["title", "url"],
                      },
                    },
                  },
                  required: [
                    "summary",
                    "analysis",
                    "party_support",
                    "causes",
                    "motivation_hypotheses",
                    "finance_claims",
                    "public_context_claims",
                    "insufficient_information",
                    "confidence",
                    "confidence_rationale",
                    "sources",
                  ],
                  additionalProperties: false,
                },
              },
            },
          ],
          tool_choice: {
            type: "function",
            function: { name: "donor_analysis" },
          },
        }),
      },
    );

    if (!aiResp.ok) {
      if (aiResp.status === 429) {
        return json(
          { error: "AI rate limit reached. Please try again shortly." },
          429,
        );
      }
      if (aiResp.status === 402) {
        return json(
          { error: "AI credits exhausted. Add credits in workspace settings." },
          402,
        );
      }
      const t = await aiResp.text();
      console.error("AI gateway error", aiResp.status, t);
      return json({ error: "AI gateway error" }, 500);
    }

    const aiJson = await aiResp.json();
    const toolCall = aiJson.choices?.[0]?.message?.tool_calls?.[0];
    let parsed: any = null;
    if (toolCall?.function?.arguments) {
      try {
        parsed = JSON.parse(toolCall.function.arguments);
      } catch (e) {
        console.error("Failed to parse tool args", e);
      }
    }
    if (!parsed) {
      return json({ error: "Invalid AI response" }, 500);
    }

    return json({
      ...parsed,
      data_coverage,
      finance_context: {
        total_amount: signals.finance.total_amount,
        total_transactions: signals.finance.total_transactions,
        party_breakdown: signals.finance.party_breakdown,
        top_recipients: signals.finance.top_recipients,
      },
    });
  } catch (e) {
    console.error("ai-donor-analysis error", e);
    return json(
      { error: e instanceof Error ? e.message : "Unknown error" },
      500,
    );
  }
});
