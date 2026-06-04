// AI-powered analysis of donation recipients (candidates and committees) via Perplexity web search
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { callYouSmart, YouError, type YouCitation } from "../_shared/you-search.ts";
import { computeDeterministicConfidence } from "../_shared/confidence.ts";
import { readCache, writeCache } from "../_shared/ai-cache.ts";
import { isCronAuthorized } from "../_shared/cron-auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface RequestBody {
  entity_kind: "candidate" | "committee";
  entity_id: string;
  entity_name: string;
  fec_id?: string | null;
  party?: string | null;
  office?: string | null;
  state?: string | null;
  cycle?: string | null;
  force_refresh?: boolean;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

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
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const perplexityKey = Deno.env.get("PERPLEXITY_API_KEY");
    const youKey = Deno.env.get("YOU_API_KEY");
    const lovableKey = Deno.env.get("LOVABLE_API_KEY");

    // Cron / service-role callers (the daily stat-card picker warming the cache
    // ahead of an auto-post) bypass the user check; interactive callers must be
    // authenticated. All data access below uses the service-role `admin` client.
    if (!(await isCronAuthorized(req))) {
      const authHeader = req.headers.get("Authorization");
      if (!authHeader?.startsWith("Bearer ")) {
        return json({ error: "Unauthorized" }, 401);
      }
      const userClient = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: userData, error: userErr } = await userClient.auth.getUser();
      if (userErr || !userData?.user) return json({ error: "Unauthorized" }, 401);
    }

    if (!perplexityKey && !youKey && !lovableKey) {
      return json({ error: "No AI provider configured (PERPLEXITY_API_KEY, YOU_API_KEY, or LOVABLE_API_KEY)" }, 500);
    }

    let body: RequestBody;
    try { body = await req.json(); } catch { return json({ error: "Invalid JSON body" }, 400); }

    const entity_kind = body.entity_kind;
    const entity_id = String(body.entity_id ?? "").trim();
    const entity_name = String(body.entity_name ?? "").trim();
    const fec_id = body.fec_id ? String(body.fec_id).trim() : null;
    const party = body.party ? String(body.party).trim() : null;
    const office = body.office ? String(body.office).trim() : null;
    const state = body.state ? String(body.state).trim() : null;

    if (!entity_kind || !entity_id || !entity_name) {
      return json({ error: "entity_kind, entity_id and entity_name are required" }, 400);
    }

    const cycle = body.cycle ? String(body.cycle).trim() : null;

    const admin = createClient(supabaseUrl, serviceKey);

    // ─── Resolve committee alias group ─────────────────────────────────────
    // If this committee's FEC ID is part of an alias group, expand to all
    // member FEC IDs so finance and AI analysis cover the whole organization.
    let aliasedFecIds: string[] = fec_id ? [fec_id] : [];
    let aliasCanonicalName: string | null = null;
    if (entity_kind === "committee" && fec_id) {
      const { data: aliasRow } = await admin
        .from("committee_aliases")
        .select("canonical_name, fec_committee_ids")
        .eq("is_active", true)
        .contains("fec_committee_ids", [fec_id])
        .limit(1)
        .maybeSingle();
      if (aliasRow?.fec_committee_ids?.length) {
        aliasedFecIds = Array.from(
          new Set([fec_id, ...(aliasRow.fec_committee_ids as string[])]
            .map((s) => String(s).toUpperCase())),
        );
        aliasCanonicalName = (aliasRow as any).canonical_name ?? null;
      }
    }
    const isAliasedGroup = aliasedFecIds.length > 1;

    // Cache key bumped to v2 so existing "20/100 Low" payloads are bypassed,
    // and keyed by the canonical alias subject when applicable.
    const aliasSubject = isAliasedGroup
      ? `alias:${[...aliasedFecIds].sort().join(",")}`
      : `${entity_kind}:${entity_id}`;
    const cacheKey = {
      kind: "recipient" as const,
      subject_id: `v2:${aliasSubject}`,
      cycle: cycle && cycle !== "all" ? cycle : null,
    };
    if (!body.force_refresh) {
      const cached = await readCache<Record<string, unknown>>(cacheKey);
      if (cached) {
        return json({ ...cached.payload, cached: true, updated_at: cached.updated_at });
      }
    }

    // Pull aggregate finance signals for the recipient as anchors.
    let totalReceived = 0;
    let donorCount = 0;
    const topDonors: { name: string; amount: number }[] = [];

    if (entity_kind === "candidate") {
      const { data: dRows } = await admin
        .from("donors")
        .select("display_name, amount")
        .eq("candidate_id", entity_id)
        .limit(2000);
      const byDonor: Record<string, number> = {};
      for (const r of (dRows ?? []) as any[]) {
        totalReceived += Number(r.amount ?? 0);
        const k = String(r.display_name ?? "Unknown");
        byDonor[k] = (byDonor[k] ?? 0) + Number(r.amount ?? 0);
      }
      donorCount = Object.keys(byDonor).length;
      topDonors.push(
        ...Object.entries(byDonor)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 8)
          .map(([name, amount]) => ({ name, amount })),
      );
    } else if (entity_kind === "committee" && aliasedFecIds.length > 0) {
      // Aggregate contributions across every aliased FEC committee ID.
      const { data: cRows } = await admin
        .from("contributions")
        .select("contributor_name, amount")
        .in("recipient_committee_id", aliasedFecIds)
        .limit(5000);
      const byContrib: Record<string, number> = {};
      for (const r of (cRows ?? []) as any[]) {
        const amt = Number(r.amount ?? 0);
        if (!Number.isFinite(amt) || amt <= 0) continue;
        totalReceived += amt;
        const k = String(r.contributor_name ?? "Unknown");
        byContrib[k] = (byContrib[k] ?? 0) + amt;
      }
      donorCount = Object.keys(byContrib).length;
      topDonors.push(
        ...Object.entries(byContrib)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 8)
          .map(([name, amount]) => ({ name, amount })),
      );
    }

    const data_coverage: "none" | "sparse" | "moderate" | "rich" =
      totalReceived === 0 ? "none"
        : totalReceived < 50_000 ? "sparse"
        : totalReceived < 1_000_000 ? "moderate"
        : "rich";

    const fecIdAnchor = isAliasedGroup
      ? `FEC IDs ${aliasedFecIds.join(", ")} (the same operation under multiple registrations${aliasCanonicalName ? `, known as "${aliasCanonicalName}"` : ""})`
      : fec_id
      ? `FEC ID ${fec_id}`
      : null;

    const anchorBits = [
      fecIdAnchor,
      party ? `${party} party` : null,
      office ? `running for ${office}` : null,
      state ? `in ${state}` : null,
      topDonors.length ? `top donors include ${topDonors.slice(0, 4).map(d => d.name).join(", ")}` : null,
    ].filter(Boolean).join(", ");

    const kindLabel = entity_kind === "candidate" ? "political candidate" : "political committee/PAC";

    const sameEntityRule = isAliasedGroup
      ? `All of the FEC IDs above (${aliasedFecIds.join(", ")}) are the SAME organization — analyze them together as one entity. Do not treat them as separate filers.`
      : `Confirm you're looking at the SAME entity by matching the FEC ID, office, state, and donor profile above. If your search surfaces a DIFFERENT committee that shares the name (e.g. a predecessor, successor, or unrelated PAC), DO NOT stop — instead, analyze the anchored entity using whatever filings/news you can find for it, and list the same-named other committees in "related_entities" with relationship="possibly_related" or "same_name_distinct" and an evidence sentence explaining the link.`;

    const searchPrompt = `Research the ${kindLabel} "${entity_name}"${anchorBits ? ` (${anchorBits})` : ""}.

Use FEC.gov, OpenSecrets, ProPublica, FollowTheMoney, Ballotpedia, Vote Smart, the entity's official site, and major news outlets. ${sameEntityRule}

Produce a structured analysis covering:
- summary: 2-3 sentences identifying who they are
- positions: list of issue positions (each {topic, stance})
- goals: bullet list of what they're trying to achieve politically (policy outcomes, legislative agenda, electoral strategy)
- key_people: ${entity_kind === "candidate" ? "campaign leadership, key endorsers" : "founders, treasurer, leadership, affiliated lawmakers"}
- notable_recipients: ${entity_kind === "candidate" ? "key endorsements RECEIVED or coalitions joined" : "candidates and causes this committee SPENDS ON, with brief rationale"}
- controversies: documented controversies, FEC complaints, ethics issues (with [n] cites)
- related_entities: same-named or affiliated committees that are DISTINCT FEC filers (only when found). Each: {name, fec_id (or null), relationship: "predecessor"|"successor"|"affiliated"|"same_name_distinct"|"possibly_related", evidence (one sentence), citation (URL or null)}
- finance_claims: factual claims from FEC/finance signals above
- public_context_claims: claims from your web search, each ending with [n] citation
- insufficient_information: true ONLY if you cannot identify the anchored entity at all (no filings, no news, nothing). If you found a same-named related committee, set this to false and use related_entities.
- confidence: 0-100
- confidence_rationale: one sentence

Output ONLY a JSON object, no prose:
{
  "summary": string,
  "analysis": string (1-3 paragraphs),
  "positions": [{"topic": string, "stance": string}],
  "goals": [string],
  "key_people": [string],
  "notable_recipients": [string],
  "controversies": [string],
  "causes": [string],
  "related_entities": [{"name": string, "fec_id": string|null, "relationship": string, "evidence": string, "citation": string|null}],
  "finance_claims": [string],
  "public_context_claims": [string],
  "insufficient_information": boolean,
  "confidence": integer 0-100,
  "confidence_rationale": string
}`;

    const systemPrompt =
      "You are a nonpartisan campaign-finance and politics analyst. Ground every claim in the search results. Never invent dollar figures, FEC IDs, or quotes. When the user prompt provides multiple FEC IDs as one aliased group, treat them as ONE organization. Same-named but distinct committees go in related_entities, not insufficient_information. Output strict JSON only.";
    const geminiSystemPrompt =
      "You are a nonpartisan campaign-finance and politics analyst. You do not have live web search — ground every claim in the FEC/finance context provided in the user prompt and well-known public knowledge. Never invent dollar figures, FEC IDs, or quotes. If you cannot confidently identify the entity, set insufficient_information=true and cap confidence at 30. Output strict JSON only.";

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
            "fec.gov", "opensecrets.org", "propublica.org", "ballotpedia.org",
            "votesmart.org", "followthemoney.org", "nytimes.com",
            "washingtonpost.com", "politico.com", "reuters.com", "apnews.com", "wsj.com",
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

    const grounded: { title: string; url: string }[] =
      provider === "you"
        ? youCitations.map((c, i) => ({ title: `${c.title} [${i + 1}]`, url: c.url }))
        : citations.map((url, i) => {
            try {
              const host = new URL(url).hostname.replace(/^www\./, "");
              return { title: `${host} [${i + 1}]`, url };
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
    const relatedEntities = Array.isArray(parsed.related_entities)
      ? parsed.related_entities
          .filter((r: any) => r && (r.name || r.fec_id))
          .map((r: any) => ({
            name: String(r.name ?? "").trim(),
            fec_id: r.fec_id ? String(r.fec_id).trim().toUpperCase() : null,
            relationship: String(r.relationship ?? "possibly_related"),
            evidence: String(r.evidence ?? "").trim(),
            citation: r.citation ? String(r.citation).trim() : null,
          }))
      : [];
    const hasRelatedSiblings = relatedEntities.length > 0;
    if (grounded.length === 0 && !isAliasedGroup) {
      insufficient = true;
    }
    // Tier the confidence cap:
    //  - aliased group → no cap (we know it's the same org)
    //  - unidentified entity → cap 20
    //  - identifiable but thin (has related siblings, no aliased group) → cap 40
    if (insufficient && !isAliasedGroup) {
      confidence = Math.min(confidence, 20);
    } else if (hasRelatedSiblings && !isAliasedGroup) {
      confidence = Math.min(confidence, 40);
    }
    const groundedFailed = providerErrors.length > 0 && grounded.length === 0;
    const rationaleParts: string[] = [];
    if (groundedFailed) {
      rationaleParts.push(`Grounded search providers unavailable (${providerErrors.map(p => `${p.provider}:${p.status}`).join(", ")}). Fallback model cannot return external citations — treat as tentative.`);
    } else {
      rationaleParts.push(`Deterministic score from ${grounded.length} verified provider citation(s); weighted 55% source count (saturating at 6) + 45% domain reliability.`);
    }
    if (isAliasedGroup) {
      rationaleParts.push(`Combined analysis across ${aliasedFecIds.length} aliased FEC IDs (${aliasedFecIds.join(", ")}).`);
    } else if (hasRelatedSiblings) {
      rationaleParts.push(`${relatedEntities.length} same-named related committee(s) reported separately — confidence capped at 40 until aliased.`);
    }
    const confidence_rationale = rationaleParts.join(" ");

    const responseBody = {
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
      related_entities: relatedEntities,
      finance_claims: Array.isArray(parsed.finance_claims) ? parsed.finance_claims : [],
      public_context_claims: Array.isArray(parsed.public_context_claims) ? parsed.public_context_claims : [],
      insufficient_information: insufficient,
      confidence,
      confidence_rationale,
      data_coverage,
      sources,
      finance_context: {
        total_received: Math.round(totalReceived),
        donor_count: donorCount,
        top_donors: topDonors,
        fec_id,
        aliased_fec_ids: aliasedFecIds,
        alias_canonical_name: aliasCanonicalName,
      },
      aliased_fec_ids: aliasedFecIds,
      alias_canonical_name: aliasCanonicalName,
    };
    const saved = await writeCache(cacheKey, responseBody, provider);
    return json({ ...responseBody, cached: false, updated_at: saved?.updated_at });
  } catch (e) {
    console.error("ai-recipient-analysis error", e);
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});
