// AI-powered analysis of a specific bill and a candidate's sponsorship/cosponsorship
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { callYouSmart, YouError, type YouCitation } from "../_shared/you-search.ts";
import { computeDeterministicConfidence } from "../_shared/confidence.ts";
import { readCache, writeCache, fingerprint } from "../_shared/ai-cache.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface RequestBody {
  bill_id?: string;
  bill_type?: string;
  bill_number?: string | number;
  bill_name?: string;
  congress?: string | number;
  topic?: string | null;
  status?: string | null;
  candidate_name: string;
  candidate_party?: string | null;
  candidate_office?: string | null;
  candidate_state?: string | null;
  is_sponsor: boolean;
  sponsorship_date?: string | null;
  bill_url?: string | null;
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
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const perplexityKey = Deno.env.get("PERPLEXITY_API_KEY");
    const youKey = Deno.env.get("YOU_API_KEY");
    const lovableKey = Deno.env.get("LOVABLE_API_KEY");

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) return json({ error: "Unauthorized" }, 401);

    if (!perplexityKey && !youKey && !lovableKey) {
      return json({ error: "No AI provider configured (PERPLEXITY_API_KEY, YOU_API_KEY, or LOVABLE_API_KEY)" }, 500);
    }

    let body: RequestBody;
    try { body = await req.json(); } catch { return json({ error: "Invalid JSON body" }, 400); }

    const billType = String(body.bill_type ?? "").toUpperCase().trim();
    const billNumber = String(body.bill_number ?? "").trim();
    const billName = String(body.bill_name ?? "").trim();
    const candidateName = String(body.candidate_name ?? "").trim();
    const role = body.is_sponsor ? "sponsored" : "cosponsored";

    if (!candidateName || (!billName && !billNumber)) {
      return json({ error: "candidate_name and bill information are required" }, 400);
    }

    // Bill analysis depends on which candidate is being viewed (sponsor vs cosponsor
    // and their record), so cache per bill + candidate + role.
    const subjectId = String(body.bill_id ?? `${billType}-${billNumber}-${body.congress ?? ''}`).trim();
    const fp = await fingerprint({ candidate: candidateName, role: body.is_sponsor ? 's' : 'c' });
    const cacheKey = { kind: "bill" as const, subject_id: subjectId, input_fingerprint: fp };
    if (!body.force_refresh && subjectId) {
      const cached = await readCache<Record<string, unknown>>(cacheKey);
      if (cached) {
        return json({ ...cached.payload, cached: true, updated_at: cached.updated_at });
      }
    }

    const billLabel = billType && billNumber ? `${billType} ${billNumber}` : billName;
    const congressLabel = body.congress ? `${body.congress}th Congress` : "";
    const anchorBits = [
      congressLabel,
      body.topic ? `policy area: ${body.topic}` : null,
      body.status ? `status: ${body.status}` : null,
      body.candidate_party ? `${body.candidate_party} party` : null,
      body.candidate_office ? `serving as ${body.candidate_office}` : null,
      body.candidate_state ? `from ${body.candidate_state}` : null,
      body.sponsorship_date ? `${role} on ${body.sponsorship_date}` : null,
      body.bill_url ? `official link: ${body.bill_url}` : null,
    ].filter(Boolean).join("; ");

    const searchPrompt = `Research the U.S. bill "${billLabel}: ${billName}"${anchorBits ? ` (${anchorBits})` : ""} and the role of ${candidateName}, who ${role} it.

Use congress.gov, govtrack.us, propublica.org/congress, ballotpedia.org, votesmart.org, and major news outlets (nytimes.com, washingtonpost.com, politico.com, reuters.com, apnews.com, thehill.com, rollcall.com). Confirm you are analyzing the SAME bill by matching bill number, congress, and short title. If you can't confirm, set insufficient_information=true and cap confidence at 20.

Produce a structured analysis covering:
- summary: 2-3 sentences explaining what the bill does in plain English
- key_provisions: bullet list of the main provisions
- positions: list of issue positions ({topic, stance}) describing where the bill sits on major policy axes
- candidate_role_explanation: 2-4 sentences explaining why ${candidateName} likely ${role} this bill, grounded in their record, district, party, or stated positions. If you cannot confidently explain, say so.
- supporters: groups, lawmakers, or coalitions backing the bill (with [n] cites)
- opponents: groups, lawmakers, or coalitions opposing the bill (with [n] cites)
- controversies: documented controversies or contested provisions
- public_context_claims: factual claims from your web search, each ending with [n] citation
- insufficient_information: true if you can't confidently identify the bill
- confidence: 0-100
- confidence_rationale: one sentence

Output ONLY a JSON object, no prose:
{
  "summary": string,
  "analysis": string (1-3 paragraphs of deeper context),
  "key_provisions": [string],
  "positions": [{"topic": string, "stance": string}],
  "candidate_role_explanation": string,
  "supporters": [string],
  "opponents": [string],
  "controversies": [string],
  "public_context_claims": [string],
  "insufficient_information": boolean,
  "confidence": integer 0-100,
  "confidence_rationale": string
}`;

    const systemPrompt =
      "You are a nonpartisan legislative analyst. Ground every claim in the search results. Never invent vote counts, sponsor names, or quotes. Output strict JSON only.";
    const geminiSystemPrompt =
      "You are a nonpartisan legislative analyst. You do not have live web search — ground every claim in the bill metadata provided in the user prompt and well-known public knowledge. Never invent vote counts, sponsor names, or quotes. If you cannot confidently identify the bill, set insufficient_information=true and cap confidence at 30. Output strict JSON only.";

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
            "congress.gov", "govtrack.us", "propublica.org", "ballotpedia.org",
            "votesmart.org", "nytimes.com", "washingtonpost.com", "politico.com",
            "reuters.com", "apnews.com", "thehill.com", "rollcall.com", "wsj.com",
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
            ? "AI analysis temporarily unavailable: Perplexity API key invalid or out of quota."
            : isRate
            ? "Perplexity rate limit reached. Try again shortly."
            : `Perplexity service error (${ppxResp.status}).`,
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
          lastError = { status: 402, code: "LOVABLE_AI_PAYMENT", message: "AI fallback unavailable: Lovable AI credits exhausted." };
        } else if (gemResp.status === 429) {
          lastError = { status: 429, code: "LOVABLE_AI_RATE_LIMIT", message: "AI fallback rate-limited. Try again shortly." };
        } else if (!lastError) {
          lastError = { status: gemResp.status, code: "LOVABLE_AI_ERROR", message: `AI fallback error (${gemResp.status}).` };
        }
        providerErrors.push({ provider: "gemini", status: gemResp.status, code: lastError.code });
      }
    }

    if (!provider) {
      const err = lastError ?? { code: "NO_PROVIDER", message: "No AI provider available." };
      return json({ error: err.message, code: err.code }, 200);
    }

    const parsed = extractJson(content);
    if (!parsed) {
      console.error(`Could not parse ${provider} output`, content.slice(0, 500));
      return json({ error: "Could not parse AI response. Please regenerate." }, 500);
    }

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

    let confidence = computeDeterministicConfidence(grounded);
    let insufficient = Boolean(parsed.insufficient_information);
    if (grounded.length === 0) insufficient = true;
    if (insufficient) confidence = Math.min(confidence, 20);
    const groundedFailed = providerErrors.length > 0 && grounded.length === 0;
    const confidence_rationale = groundedFailed
      ? `Grounded search providers unavailable (${providerErrors.map(p => `${p.provider}:${p.status}`).join(", ")}). Fallback model (Gemini) cannot return external citations — treat as tentative.`
      : `Deterministic score from ${grounded.length} verified provider citation(s); weighted 55% source count (saturating at 6) + 45% domain reliability.`;

    const responseBody = {
      provider,
      provider_errors: providerErrors,
      summary: String(parsed.summary ?? ""),
      analysis: String(parsed.analysis ?? ""),
      key_provisions: Array.isArray(parsed.key_provisions) ? parsed.key_provisions : [],
      positions: Array.isArray(parsed.positions) ? parsed.positions : [],
      candidate_role_explanation: String(parsed.candidate_role_explanation ?? ""),
      supporters: Array.isArray(parsed.supporters) ? parsed.supporters : [],
      opponents: Array.isArray(parsed.opponents) ? parsed.opponents : [],
      controversies: Array.isArray(parsed.controversies) ? parsed.controversies : [],
      public_context_claims: Array.isArray(parsed.public_context_claims) ? parsed.public_context_claims : [],
      insufficient_information: insufficient,
      confidence,
      confidence_rationale,
      sources,
    };
    const saved = await writeCache(cacheKey, responseBody, provider);
    return json({ ...responseBody, cached: false, updated_at: saved?.updated_at });
  } catch (e) {
    console.error("ai-bill-analysis error", e);
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});
