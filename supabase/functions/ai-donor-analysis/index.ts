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
      },
    };

    const systemPrompt = `You are a nonpartisan campaign-finance analyst. You will receive structured FEC-style finance signals about a political donor and must produce an analysis.

REQUIREMENTS:
- Treat the finance signals as ground truth for dollar amounts and recipients.
- Finance signals may be sparse, zero, or limited to a single cycle. Sparse finance data DOES NOT mean the donor/organization is unknown — many well-known PACs, super PACs, corporations, unions, and individuals have extensive public records (news coverage, FEC filings in other cycles, founders, leadership, stated mission, affiliated figures, business interests) that you should draw on from your training knowledge.
- ALWAYS attempt a substantive analysis using your knowledge of the entity (who runs it, who founded/funds it, its stated purpose, notable activity, controversies, affiliations). Reference cycles outside the provided window if relevant (e.g. a PAC's prior-cycle spending).
- Include source links in "sources" whenever you can recall reputable URLs (FEC.gov, OpenSecrets, major news outlets, official sites). If you cannot recall exact URLs, still produce the analysis but leave sources empty rather than fabricating.
- Only set "insufficient_information" to true if the entity is genuinely obscure AND finance signals are empty AND you have no reliable knowledge of it. For any reasonably notable PAC, candidate committee, corporation, union, or public figure, set it to false.
- Stay neutral. No partisan framing. Do not invent specific dollar figures, dates, or quotes.
- Output STRICT JSON matching the provided schema. No markdown, no commentary outside JSON.`;

    const userPrompt = `Donor finance signals (JSON):\n${JSON.stringify(signals, null, 2)}\n\nProduce the analysis now.`;

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
                    insufficient_information: { type: "boolean" },
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
                    "insufficient_information",
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
