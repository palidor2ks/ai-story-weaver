// AI-powered analysis of a specific bill and a candidate's sponsorship/cosponsorship
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  callGeminiGrounded,
  GeminiQuotaError,
  resolveGroundedSources,
  extractJson,
  getGoogleAIKey,
} from "../_shared/gemini-research.ts";
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
  vote_position?: string | null;
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) return json({ error: "Unauthorized" }, 401);

    if (!getGoogleAIKey()) {
      return json({ error: "No AI provider configured (GOOGLE_AI_API_KEY)" }, 500);
    }

    let body: RequestBody;
    try { body = await req.json(); } catch { return json({ error: "Invalid JSON body" }, 400); }

    const billType = String(body.bill_type ?? "").toUpperCase().trim();
    const billNumber = String(body.bill_number ?? "").trim();
    const billName = String(body.bill_name ?? "").trim();
    const candidateName = String(body.candidate_name ?? "").trim();

    // The candidate's relationship to this measure can be a roll-call vote (Yea/Nay)
    // or a sponsorship. Frame the analysis around the ACTUAL action — conflating a
    // vote with cosponsorship produces nonsense (e.g. "no evidence they cosponsored
    // this nomination" on what was really a confirmation vote).
    const votePos = String(body.vote_position ?? "").toLowerCase().trim();
    const action = (() => {
      if (votePos === "yea" || votePos === "aye" || votePos === "yes") return "voted YES on";
      if (votePos === "nay" || votePos === "no") return "voted NO on";
      if (votePos === "present") return "voted PRESENT on";
      if (votePos === "sponsored") return "sponsored";
      if (votePos === "cosponsored") return "cosponsored";
      return body.is_sponsor ? "sponsored" : "cosponsored";
    })();
    const isVote = action.startsWith("voted");
    const measureWord = isVote ? "measure (a bill, resolution, nomination, or procedural motion)" : "bill";
    const role = action;

    if (!candidateName || (!billName && !billNumber)) {
      return json({ error: "candidate_name and bill information are required" }, 400);
    }

    // Bill analysis depends on which candidate is being viewed and how they acted
    // (vote direction or sponsorship role), so cache per bill + candidate + action.
    const subjectId = String(body.bill_id ?? `${billType}-${billNumber}-${body.congress ?? ''}`).trim();
    const fp = await fingerprint({ candidate: candidateName, role: body.is_sponsor ? 's' : 'c', action });
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
      body.sponsorship_date ? `${role} ${body.sponsorship_date}` : null,
      body.bill_url ? `official link: ${body.bill_url}` : null,
    ].filter(Boolean).join("; ");

    const searchPrompt = `Research the U.S. ${measureWord} "${billLabel}: ${billName}"${anchorBits ? ` (${anchorBits})` : ""} and the role of ${candidateName}, who ${role} it.

${isVote
  ? `IMPORTANT: ${candidateName} ${role} this measure as a recorded vote — they did NOT necessarily sponsor or cosponsor it. This may be a bill, resolution, nomination/confirmation, or procedural motion. Do not frame their involvement as sponsorship or cosponsorship; analyze why they would cast this vote.`
  : ``}
Use congress.gov, govtrack.us, propublica.org/congress, ballotpedia.org, votesmart.org, and major news outlets (nytimes.com, washingtonpost.com, politico.com, reuters.com, apnews.com, thehill.com, rollcall.com). Confirm you are analyzing the SAME measure by matching its number/title and congress (for a nomination, match the nominee name and the position). If you can't confirm, set insufficient_information=true and cap confidence at 20.

Produce a structured analysis covering:
- summary: 2-3 sentences explaining what the ${isVote ? "measure" : "bill"} does in plain English
- key_provisions: bullet list of the main provisions (for a nomination, who the nominee is and the role)
- positions: list of issue positions ({topic, stance}) describing where the ${isVote ? "measure" : "bill"} sits on major policy axes
- candidate_role_explanation: 2-4 sentences explaining why ${candidateName} likely ${role} this ${isVote ? "measure" : "bill"}, grounded in their record, state/district, party, or stated positions. If you cannot confidently explain, say so.
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

    const geminiSystemPrompt =
      "You are a nonpartisan legislative analyst. Ground every claim in the search results. Never invent vote counts, sponsor names, or quotes. Output strict JSON only.";

    const { text, rawSources } = await callGeminiGrounded({
      prompt: searchPrompt,
      systemInstruction: geminiSystemPrompt,
      temperature: 0.2,
    });

    const parsed = extractJson(text);
    if (!parsed) {
      console.error("Could not parse Gemini output", text.slice(0, 500));
      return json({ error: "Could not parse AI response. Please regenerate." }, 500);
    }

    // Resolve Gemini's opaque redirect URIs to validated deep links.
    const resolvedSources = await resolveGroundedSources(rawSources, {
      keyQuote: typeof parsed.summary === "string" ? parsed.summary.slice(0, 80) : undefined,
    });
    const grounded = resolvedSources.map((s, i) => ({ title: s.title, url: s.url, citation_index: i + 1 }));

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
    const confidence_rationale = `Deterministic score from ${grounded.length} verified Gemini grounding citation(s); weighted 55% source count (saturating at 6) + 45% domain reliability.`;

    const responseBody = {
      provider: "gemini",
      provider_errors: [],
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
    const saved = await writeCache(cacheKey, responseBody, "gemini");
    return json({ ...responseBody, cached: false, updated_at: saved?.updated_at });
  } catch (e) {
    if (e instanceof GeminiQuotaError) {
      console.warn("ai-bill-analysis: Google AI quota exceeded");
      return json({ error: "AI analysis temporarily unavailable (quota limit). Please try again later." }, 429);
    }
    console.error("ai-bill-analysis error", e);
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});
