// AI-powered donor analysis grounded in live web search via Perplexity
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { callYouSmart, YouError, type YouCitation } from "../_shared/you-search.ts";
import { computeDeterministicConfidence } from "../_shared/confidence.ts";

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
    const perplexityKey = Deno.env.get("PERPLEXITY_API_KEY");
    const youKey = Deno.env.get("YOU_API_KEY");
    const lovableKey = Deno.env.get("LOVABLE_API_KEY");

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) {
      return json({ error: "Unauthorized" }, 401);
    }

    if (!perplexityKey && !youKey && !lovableKey) {
      return json({ error: "No AI provider configured (PERPLEXITY_API_KEY, YOU_API_KEY, or LOVABLE_API_KEY)" }, 500);
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
    let fecCommitteeId: string | null = fecCommitteeMatch ? fecCommitteeMatch[0].toUpperCase() : null;
    let fecCommitteeIds: string[] = fecCommitteeId ? [fecCommitteeId] : [];
    let aliasCanonicalName: string | null = null;

    // Look up donor alias for an FEC committee anchor. Matches across all
    // raw name variants attached to this donor (handles cases where the
    // display_name string itself isn't the FEC canonical name).
    try {
      const rawNames = Array.from(new Set([
        donor_name,
        ...rows.map((r: any) => String(r.name ?? "")).filter(Boolean),
      ]));
      const { data: memberRows } = await admin
        .from("donor_alias_members")
        .select("alias_id, donor_aliases!inner(canonical_name, fec_committee_id, fec_committee_ids, is_active)")
        .in("donor_name", rawNames)
        .eq("donor_type", donor_type);
      const activeHits = (memberRows ?? []).filter(
        (m: any) => m?.donor_aliases?.is_active,
      );
      if (activeHits.length > 0) {
        const a = (activeHits[0] as any).donor_aliases;
        aliasCanonicalName = String(a.canonical_name);
        // Merge IDs from the array column (preferred) and scalar fallback
        const arr = Array.isArray(a.fec_committee_ids) ? a.fec_committee_ids : [];
        const merged = new Set<string>(fecCommitteeIds);
        for (const id of arr) {
          if (id) merged.add(String(id).toUpperCase());
        }
        if (a.fec_committee_id) merged.add(String(a.fec_committee_id).toUpperCase());
        fecCommitteeIds = Array.from(merged);
        if (!fecCommitteeId && fecCommitteeIds.length > 0) {
          fecCommitteeId = fecCommitteeIds[0];
        }
      }
    } catch (e) {
      console.warn("alias FEC lookup failed", e);
    }

    // Build a search query that disambiguates the entity using our anchors.
    const topRecipNames = topRecipients.slice(0, 5).map((r) => r.name).join(", ");
    const partyTilt = partyBreakdown[0]?.party && partyBreakdown[0]?.share > 0.6
      ? ` predominantly supporting ${partyBreakdown[0].party} candidates`
      : "";
    const cycleStr = cycles.length ? ` active in ${cycles.slice(-3).join(", ")}` : "";
    const anchorBits = [
      fecCommitteeId ? `FEC committee ID ${fecCommitteeId}` : null,
      aliasCanonicalName && aliasCanonicalName.toLowerCase() !== donor_name.toLowerCase()
        ? `also known as "${aliasCanonicalName}"`
        : null,
      donor_type && donor_type !== "Unknown" ? `${donor_type.toLowerCase()} donor` : null,
      topRecipNames ? `whose top recipients include ${topRecipNames}` : null,
      partyTilt || null,
      cycleStr || null,
    ].filter(Boolean).join(", ");

    const primaryName = aliasCanonicalName ?? donor_name;
    const fecAnchorLine = fecCommitteeId
      ? `\n\nFEC ANCHOR: This donor is registered with the FEC under committee ID ${fecCommitteeId}${aliasCanonicalName ? ` (canonical name: "${aliasCanonicalName}")` : ""}. Use this as ground truth — the literal donor-name string above may be a filing variant.`
      : "";

    const searchPrompt = `Research the political donor "${primaryName}"${anchorBits ? ` (${anchorBits})` : ""}.${fecAnchorLine}

Use FEC.gov, OpenSecrets, ProPublica, FollowTheMoney, and major news outlets. Confirm you are looking at the SAME entity by matching the FEC committee ID, top recipients, and cycle activity above. If the search returns information about a different same-named entity, say so and stop.

Produce a concise, non-redundant structured analysis covering:
- summary: 2-3 sentences identifying who they are and why they donate
- positions: list of issue positions (each with topic + stance, e.g. {topic: "Climate", stance: "Opposes carbon regulation"})
- goals: short list of what this donor is trying to achieve with their political spending (policy outcomes, candidate types, ideological project)
- key_people: founders, leaders, treasurers, major associated individuals
- notable_recipients: notable candidates/committees they back, with brief note on why (do not repeat full points from goals/positions)
- controversies: documented controversies, FEC complaints, or notable reporting (cite [n] indexes)
- finance_claims: factual claims derived from the FEC/finance data above
- public_context_claims: concise claims from your web search, each ending with one or more [n] citation indexes that map to the citation list
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

    const anchorRule = fecCommitteeId
      ? " When an FEC ANCHOR committee ID is provided, treat it as ground truth: if search results confirm the same FEC ID (or the same committee name + treasurer + city), proceed at full confidence even if the literal donor-name string differs from the FEC canonical name. If results contradict the anchor (different FEC ID, different city, different treasurer), set insufficient_information=true and cap confidence at 20."
      : "";
    const systemPrompt =
      "You are a nonpartisan campaign-finance analyst. Ground every claim in the search results. Never invent dollar figures, FEC IDs, founders, or quotes. If the search results describe a different entity than the one anchored by the user, set insufficient_information=true and cap confidence at 20." + anchorRule + " Output strict JSON only.";
    const geminiSystemPrompt =
      "You are a nonpartisan campaign-finance analyst. You do not have live web search — ground every claim in the FEC/finance context provided in the user prompt and well-known public knowledge. Never invent dollar figures, FEC IDs, founders, or quotes. If you cannot confidently identify the entity, set insufficient_information=true and cap confidence at 30." + anchorRule + " Output strict JSON only.";

    let provider: "perplexity" | "you" | "gemini" | null = null;
    let content = "";
    let citations: string[] = [];
    let youCitations: YouCitation[] = [];
    let lastError: { status: number; code: string; message: string } | null = null;
    const providerErrors: { provider: string; status: number; code: string }[] = [];

    if (perplexityKey) {
      const ppxResp = await fetch("https://api.perplexity.ai/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${perplexityKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "sonar-pro",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: searchPrompt },
          ],
          temperature: 0.2,
          search_domain_filter: [
            "fec.gov", "opensecrets.org", "propublica.org",
            "followthemoney.org", "nytimes.com", "washingtonpost.com",
            "politico.com", "reuters.com", "apnews.com", "wsj.com",
          ],
        }),
      });

      if (ppxResp.ok) {
        const ppxJson = await ppxResp.json();
        content = ppxJson?.choices?.[0]?.message?.content ?? "";
        citations = Array.isArray(ppxJson?.citations) ? ppxJson.citations : [];
        provider = "perplexity";
      } else {
        const t = await ppxResp.text();
        console.error("Perplexity error", ppxResp.status, t);
        const isAuth = ppxResp.status === 401 || ppxResp.status === 402 || ppxResp.status === 403;
        const isRate = ppxResp.status === 429;
        lastError = {
          status: ppxResp.status,
          code: isAuth ? "PERPLEXITY_AUTH" : isRate ? "PERPLEXITY_RATE_LIMIT" : "PERPLEXITY_ERROR",
          message: isAuth
            ? "AI analysis is temporarily unavailable: the Perplexity API key is invalid or out of quota. Please update billing or rotate the key."
            : isRate
            ? "Perplexity rate limit reached. Try again shortly."
            : `Perplexity service error (${ppxResp.status}). Try again later.`,
        };
        providerErrors.push({ provider: "perplexity", status: ppxResp.status, code: lastError.code });
      }
    }

    if (!provider && youKey) {
      console.log("Trying You.com Smart as grounded-search fallback");
      try {
        const yres = await callYouSmart({ query: searchPrompt, apiKey: youKey, systemPrompt });
        content = yres.content;
        youCitations = yres.citations;
        citations = yres.citations.map((c) => c.url);
        provider = "you";
      } catch (e) {
        const ye = e as YouError;
        console.error("You.com fallback error", ye?.status, ye?.message);
        lastError = {
          status: ye?.status ?? 500,
          code: ye?.code ?? "YOU_ERROR",
          message: ye?.message ?? "You.com fallback failed.",
        };
        providerErrors.push({ provider: "you", status: ye?.status ?? 500, code: ye?.code ?? "YOU_ERROR" });
      }
    }

    if (!provider && lovableKey) {
      console.log("Falling back to Lovable AI Gateway (Gemini)");
      const gemResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${lovableKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-pro",
          messages: [
            { role: "system", content: geminiSystemPrompt },
            { role: "user", content: searchPrompt },
          ],
        }),
      });

      if (gemResp.ok) {
        const gJson = await gemResp.json();
        content = gJson?.choices?.[0]?.message?.content ?? "";
        citations = [];
        provider = "gemini";
      } else {
        const gt = await gemResp.text();
        console.error("Lovable AI fallback error", gemResp.status, gt);
        if (gemResp.status === 402) {
          lastError = { status: 402, code: "LOVABLE_AI_PAYMENT", message: "AI fallback unavailable: Lovable AI credits exhausted. Add credits in Settings → Workspace → Usage." };
        } else if (gemResp.status === 429) {
          lastError = { status: 429, code: "LOVABLE_AI_RATE_LIMIT", message: "AI fallback rate-limited. Try again shortly." };
        } else if (!lastError) {
          lastError = { status: gemResp.status, code: "LOVABLE_AI_ERROR", message: `AI fallback error (${gemResp.status}).` };
        }
      }
    }

    if (!provider) {
      const err = lastError ?? { code: "NO_PROVIDER", message: "No AI provider available." };
      return json({ error: err.message, code: err.code, fallback: true }, 200);
    }

    const parsed = extractJson(content);
    if (!parsed) {
      console.error(`Could not parse ${provider} output`, content.slice(0, 500));
      return json({ error: "Could not parse AI response. Please regenerate." }, 500);
    }

    // Build sources from grounded provider (Perplexity or You.com) + any sources the model returned.
    const grounded: { title: string; url: string; citation_index?: number }[] =
      provider === "you"
        ? youCitations.map((c, i) => ({ title: c.title, url: c.url, citation_index: i + 1 }))
        : citations.map((url, i) => {
            try {
              const host = new URL(url).hostname.replace(/^www\./, "");
              return { title: host, url, citation_index: i + 1 };
            } catch { return { title: url, url }; }
          });
    const modelSources = Array.isArray(parsed.sources) ? parsed.sources : [];
    const sourceMap = new Map<string, { title: string; url: string }>();
    [...grounded, ...modelSources].forEach((s: any) => {
      if (s?.url && !sourceMap.has(s.url)) sourceMap.set(s.url, { title: s.title || s.url, url: s.url });
    });
    const sources = Array.from(sourceMap.values());

    // Deterministic confidence from verified provider citations only (NOT model-emitted parsed.sources).
    let confidence = computeDeterministicConfidence(grounded);
    let insufficient = Boolean(parsed.insufficient_information);
    if (grounded.length === 0) {
      insufficient = true;
    }
    if (insufficient) {
      confidence = Math.min(confidence, 20);
    }
    const groundedFailed = providerErrors.length > 0 && grounded.length === 0;
    const confidence_rationale = groundedFailed
      ? `Grounded search providers unavailable (${providerErrors.map(p => `${p.provider}:${p.status}`).join(", ")}). Fallback model (Gemini) cannot return external citations — treat as tentative.`
      : `Deterministic score from ${grounded.length} verified provider citation(s); weighted 55% source count (saturating at 6) + 45% domain reliability.`;

    return json({
      provider,
      provider_errors: providerErrors,
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
      confidence_rationale,
      data_coverage,
      sources,
      finance_context: {
        total_amount: Math.round(totalAmount),
        total_transactions: totalTx,
        party_breakdown: partyBreakdown,
        top_recipients: topRecipients,
        fec_committee_id: fecCommitteeId,
        alias_canonical_name: aliasCanonicalName,
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
