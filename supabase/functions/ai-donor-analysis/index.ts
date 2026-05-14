// AI-powered donor analysis grounded in live web search via Perplexity
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

// Try to extract a JSON object out of any Perplexity reply (handles
// chain-of-thought wrappers and markdown fences from sonar-reasoning models).
function extractJson(raw: string): any | null {
  if (!raw) return null;
  const cleaned = raw.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
  const fence = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidates = [
    fence?.[1]?.trim(),
    cleaned,
    cleaned.slice(cleaned.indexOf("{"), cleaned.lastIndexOf("}") + 1),
  ].filter(Boolean) as string[];
  for (const c of candidates) {
    try { return JSON.parse(c); } catch { /* try next */ }
  }
  return null;
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
    const jinaKey = Deno.env.get("JINA_API_KEY");

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) {
      return json({ error: "Unauthorized" }, 401);
    }

    if (!jinaKey) {
      return json({ error: "JINA_API_KEY is not configured" }, 500);
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

    // Gather donor finance signals (used as anchors for the search query
    // and rendered separately as a deterministic finance context block).
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
    const cycles = Array.from(new Set(rows.map((r: any) => r.cycle).filter(Boolean)));
    const candidateIds = Array.from(
      new Set(rows.map((r: any) => r.candidate_id).filter(Boolean)),
    );

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
        const cur = recipientTotals[c.id] ?? {
          name: c.name, party, amount: 0, office: c.office, state: c.state,
        };
        cur.amount += Number(r.amount ?? 0);
        recipientTotals[c.id] = cur;
      }
    }
    const partyBreakdown = Object.entries(partyTotals)
      .map(([party, amount]) => ({
        party, amount,
        share: totalAmount > 0 ? amount / totalAmount : 0,
      }))
      .sort((a, b) => b.amount - a.amount);
    const topRecipients = Object.values(recipientTotals)
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 10);

    // Coverage classification
    const coverageScore =
      (totalTx >= 100 ? 3 : totalTx >= 20 ? 2 : totalTx >= 1 ? 1 : 0) +
      (totalAmount >= 1_000_000 ? 3 : totalAmount >= 50_000 ? 2 : totalAmount >= 1 ? 1 : 0) +
      (cycles.length >= 3 ? 2 : cycles.length >= 1 ? 1 : 0) +
      (Object.keys(recipientTotals).length >= 10 ? 2 : Object.keys(recipientTotals).length >= 1 ? 1 : 0);
    const data_coverage: "none" | "sparse" | "moderate" | "rich" =
      coverageScore === 0 ? "none"
        : coverageScore <= 3 ? "sparse"
        : coverageScore <= 6 ? "moderate"
        : "rich";

    // Detect FEC committee ID pattern in donor_id (e.g. "fec-C00...")
    const fecCommitteeMatch = donor_id.match(/C\d{8}/i);
    const fecCommitteeId = fecCommitteeMatch ? fecCommitteeMatch[0].toUpperCase() : null;

    // Build a search query that disambiguates the entity using our anchors.
    const topRecipNames = topRecipients.slice(0, 5).map((r) => r.name).join(", ");
    const partyTilt = partyBreakdown[0]?.party && partyBreakdown[0]?.share > 0.6
      ? ` predominantly supporting ${partyBreakdown[0].party} candidates`
      : "";
    const cycleStr = cycles.length ? ` active in ${cycles.slice(-3).join(", ")}` : "";
    const anchorBits = [
      fecCommitteeId ? `FEC committee ID ${fecCommitteeId}` : null,
      donor_type && donor_type !== "Unknown" ? `${donor_type.toLowerCase()} donor` : null,
      topRecipNames ? `whose top recipients include ${topRecipNames}` : null,
      partyTilt || null,
      cycleStr || null,
    ].filter(Boolean).join(", ");

    const searchPrompt = `Research the political donor "${donor_name}"${anchorBits ? ` (${anchorBits})` : ""}.

Use FEC.gov, OpenSecrets, ProPublica, FollowTheMoney, and major news outlets. Confirm you are looking at the SAME entity by matching the FEC committee ID, top recipients, and cycle activity above. If the search returns information about a different same-named entity, say so and stop.

Produce a structured analysis covering:
- summary: 2-3 sentences identifying who they are and why they donate
- positions: list of issue positions (each with topic + stance, e.g. {topic: "Climate", stance: "Opposes carbon regulation"})
- goals: bullet list of what this donor is trying to achieve with their political spending (policy outcomes, candidate types, ideological project)
- key_people: founders, leaders, treasurers, major associated individuals
- notable_recipients: notable candidates/committees they back, with brief note on why
- controversies: documented controversies, FEC complaints, or notable reporting (cite [n] indexes)
- finance_claims: factual claims derived from the FEC/finance data above
- public_context_claims: claims from your web search, each ending with a [n] citation index
- insufficient_information: true if you couldn't confidently identify the entity
- confidence: 0-100 trustworthiness score
- confidence_rationale: one sentence

Output ONLY a JSON object, no prose. Use this exact schema:
{
  "summary": string,
  "analysis": string (1-3 paragraph narrative),
  "positions": [{"topic": string, "stance": string}],
  "goals": [string],
  "key_people": [string],
  "notable_recipients": [string],
  "controversies": [string],
  "causes": [string],
  "motivation_hypotheses": [string],
  "finance_claims": [string],
  "public_context_claims": [string],
  "insufficient_information": boolean,
  "confidence": integer 0-100,
  "confidence_rationale": string
}`;

    const jinaResp = await fetch("https://deepsearch.jina.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${jinaKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "jina-deepsearch-v2",
        messages: [
          {
            role: "system",
            content:
              "You are a nonpartisan campaign-finance analyst. Ground every claim in the search results. Never invent dollar figures, FEC IDs, founders, or quotes. If the search results describe a different entity than the one anchored by the user, set insufficient_information=true and cap confidence at 20. Output strict JSON only — no prose, no markdown fences.",
          },
          { role: "user", content: searchPrompt },
        ],
        stream: false,
        reasoning_effort: "low",
      }),
    });

    if (!jinaResp.ok) {
      const t = await jinaResp.text();
      console.error("Jina error", jinaResp.status, t);
      const isAuth = jinaResp.status === 401 || jinaResp.status === 402 || jinaResp.status === 403;
      const isRate = jinaResp.status === 429;
      const message = isAuth
        ? "AI analysis is temporarily unavailable: the Jina API key is invalid or out of quota."
        : isRate
        ? "Jina rate limit reached. Try again shortly."
        : `Jina service error (${jinaResp.status}). Try again later.`;
      return json({ error: message, code: isAuth ? "JINA_AUTH" : isRate ? "JINA_RATE_LIMIT" : "JINA_ERROR", fallback: true }, 200);
    }

    const jinaJson = await jinaResp.json();
    const content: string = jinaJson?.choices?.[0]?.message?.content ?? "";
    // Jina exposes visited URLs as annotations or visitedURLs.
    const annotations: any[] = jinaJson?.choices?.[0]?.message?.annotations ?? [];
    const visitedUrls: string[] = Array.isArray(jinaJson?.visitedURLs) ? jinaJson.visitedURLs
      : Array.isArray(jinaJson?.choices?.[0]?.message?.visitedURLs) ? jinaJson.choices[0].message.visitedURLs
      : [];
    const citationUrls = new Set<string>();
    for (const a of annotations) {
      const u = a?.url_citation?.url ?? a?.url;
      if (typeof u === "string") citationUrls.add(u);
    }
    for (const u of visitedUrls) if (typeof u === "string") citationUrls.add(u);
    const citations = Array.from(citationUrls);

    let parsed = extractJson(content);
    if (!parsed) {
      // Jina returned prose. Use Lovable AI Gateway (Gemini) to restructure into JSON.
      const lovableKey = Deno.env.get("LOVABLE_API_KEY");
      if (!lovableKey) {
        console.error("Could not parse Jina output and no LOVABLE_API_KEY for fallback", content.slice(0, 500));
        return json({ error: "Could not parse AI response. Please regenerate." }, 500);
      }
      const structurePrompt = `Convert the following research narrative into the exact JSON schema. Use only facts from the narrative — do not invent. Citation indices [n] correspond to the URL list provided.

NARRATIVE:
${content}

CITATION URLS (in order):
${citations.map((u, i) => `[${i + 1}] ${u}`).join("\n")}

Return ONLY a JSON object with these keys: summary (string), analysis (string), positions (array of {topic, stance}), goals (string[]), key_people (string[]), notable_recipients (string[]), controversies (string[]), causes (string[]), motivation_hypotheses (string[]), finance_claims (string[]), public_context_claims (string[]), insufficient_information (boolean), confidence (0-100 integer), confidence_rationale (string).`;

      const gemResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${lovableKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: "You are a JSON converter. Output strict JSON only, no prose, no markdown fences." },
            { role: "user", content: structurePrompt },
          ],
          response_format: { type: "json_object" },
        }),
      });
      if (!gemResp.ok) {
        const t = await gemResp.text();
        console.error("Gemini structuring failed", gemResp.status, t.slice(0, 300));
        return json({ error: "Could not parse AI response. Please regenerate." }, 500);
      }
      const gemJson = await gemResp.json();
      const gemContent: string = gemJson?.choices?.[0]?.message?.content ?? "";
      parsed = extractJson(gemContent);
      if (!parsed) {
        console.error("Gemini structuring returned unparseable output", gemContent.slice(0, 500));
        return json({ error: "Could not parse AI response. Please regenerate." }, 500);
      }
    }

    const ppxSources = citations.map((url, i) => {
      try {
        const host = new URL(url).hostname.replace(/^www\./, "");
        return { title: `${host} [${i + 1}]`, url };
      } catch { return { title: url, url }; }
    });
    const modelSources = Array.isArray(parsed.sources) ? parsed.sources : [];
    const sourceMap = new Map<string, { title: string; url: string }>();
    [...ppxSources, ...modelSources].forEach((s: any) => {
      if (s?.url && !sourceMap.has(s.url)) sourceMap.set(s.url, { title: s.title || s.url, url: s.url });
    });
    const sources = Array.from(sourceMap.values());

    // Hard guard: zero citations → mark unidentified.
    let confidence = Math.max(0, Math.min(100, Number(parsed.confidence ?? 0)));
    let insufficient = Boolean(parsed.insufficient_information);
    if (sources.length === 0) {
      insufficient = true;
      confidence = Math.min(confidence, 20);
    }

    return json({
      summary: String(parsed.summary ?? ""),
      analysis: String(parsed.analysis ?? ""),
      positions: Array.isArray(parsed.positions) ? parsed.positions : [],
      goals: Array.isArray(parsed.goals) ? parsed.goals : [],
      key_people: Array.isArray(parsed.key_people) ? parsed.key_people : [],
      notable_recipients: Array.isArray(parsed.notable_recipients) ? parsed.notable_recipients : [],
      controversies: Array.isArray(parsed.controversies) ? parsed.controversies : [],
      causes: Array.isArray(parsed.causes) ? parsed.causes : [],
      motivation_hypotheses: Array.isArray(parsed.motivation_hypotheses) ? parsed.motivation_hypotheses : [],
      finance_claims: Array.isArray(parsed.finance_claims) ? parsed.finance_claims : [],
      public_context_claims: Array.isArray(parsed.public_context_claims) ? parsed.public_context_claims : [],
      party_support: partyBreakdown,
      insufficient_information: insufficient,
      confidence,
      confidence_rationale: String(parsed.confidence_rationale ?? ""),
      data_coverage,
      sources,
      finance_context: {
        total_amount: Math.round(totalAmount),
        total_transactions: totalTx,
        party_breakdown: partyBreakdown,
        top_recipients: topRecipients,
        fec_committee_id: fecCommitteeId,
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
