// AI-powered analysis of donation recipients (candidates and committees) via Perplexity web search
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

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
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function extractJson(raw: string): any | null {
  if (!raw) return null;
  const cleaned = raw
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/```json\s*/gi, "```")
    .trim();
  const fence = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const firstBrace = cleaned.indexOf("{");
  const lastBrace = cleaned.lastIndexOf("}");
  const candidates = [
    fence?.[1]?.trim(),
    cleaned,
    firstBrace >= 0 && lastBrace > firstBrace ? cleaned.slice(firstBrace, lastBrace + 1) : null,
  ].filter(Boolean) as string[];
  for (const c of candidates) {
    try { return JSON.parse(c); } catch { /* try next */ }
    try {
      return JSON.parse(c.replace(/,\s*}/g, "}").replace(/,\s*]/g, "]").replace(/[\x00-\x1F\x7F]/g, ""));
    } catch { /* try next */ }
  }
  return null;
}

function narrativeFallback(content: string, citations: string[]): any {
  const analysis = content.trim();
  const sentences = analysis.match(/[^.!?]+[.!?]+/g) ?? [];
  const summary = sentences.slice(0, 2).join(" ").trim() || analysis.slice(0, 500);
  return {
    summary,
    analysis,
    positions: [],
    goals: [],
    key_people: [],
    notable_recipients: [],
    controversies: [],
    causes: [],
    finance_claims: [],
    public_context_claims: analysis ? [analysis.slice(0, 1000)] : [],
    insufficient_information: citations.length === 0 || analysis.length < 80,
    confidence: citations.length ? 45 : 20,
    confidence_rationale: citations.length
      ? "Jina returned grounded narrative text but not structured JSON, so the analysis was preserved with limited field extraction."
      : "Jina returned unstructured text without extractable source URLs.",
  };
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
    if (userErr || !userData?.user) return json({ error: "Unauthorized" }, 401);

    if (!jinaKey) {
      return json({ error: "JINA_API_KEY is not configured" }, 500);
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

    const admin = createClient(supabaseUrl, serviceKey);

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
    }

    const data_coverage: "none" | "sparse" | "moderate" | "rich" =
      totalReceived === 0 ? "none"
        : totalReceived < 50_000 ? "sparse"
        : totalReceived < 1_000_000 ? "moderate"
        : "rich";

    const anchorBits = [
      fec_id ? `FEC ID ${fec_id}` : null,
      party ? `${party} party` : null,
      office ? `running for ${office}` : null,
      state ? `in ${state}` : null,
      topDonors.length ? `top donors include ${topDonors.slice(0, 4).map(d => d.name).join(", ")}` : null,
    ].filter(Boolean).join(", ");

    const kindLabel = entity_kind === "candidate" ? "political candidate" : "political committee/PAC";

    const searchPrompt = `Research the ${kindLabel} "${entity_name}"${anchorBits ? ` (${anchorBits})` : ""}.

Use FEC.gov, OpenSecrets, ProPublica, FollowTheMoney, Ballotpedia, Vote Smart, the entity's official site, and major news outlets. Confirm you're looking at the SAME entity by matching the FEC ID, office, state, and donor profile above. If results describe a different same-named entity, say so and stop.

Produce a structured analysis covering:
- summary: 2-3 sentences identifying who they are
- positions: list of issue positions (each {topic, stance})
- goals: bullet list of what they're trying to achieve politically (policy outcomes, legislative agenda, electoral strategy)
- key_people: ${entity_kind === "candidate" ? "campaign leadership, key endorsers" : "founders, treasurer, leadership, affiliated lawmakers"}
- notable_recipients: ${entity_kind === "candidate" ? "key endorsements RECEIVED or coalitions joined" : "candidates and causes this committee SPENDS ON, with brief rationale"}
- controversies: documented controversies, FEC complaints, ethics issues (with [n] cites)
- finance_claims: factual claims from FEC/finance signals above
- public_context_claims: claims from your web search, each ending with [n] citation
- insufficient_information: true if you can't confidently identify the entity
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
  "finance_claims": [string],
  "public_context_claims": [string],
  "insufficient_information": boolean,
  "confidence": integer 0-100,
  "confidence_rationale": string
}`;

    const jinaController = new AbortController();
    const jinaTimeout = setTimeout(() => jinaController.abort(), 90_000);
    let jinaResp: Response;
    try {
      jinaResp = await fetch("https://deepsearch.jina.ai/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${jinaKey}`,
          "Content-Type": "application/json",
        },
        signal: jinaController.signal,
        body: JSON.stringify({
          model: "jina-deepsearch-v2",
          messages: [
            {
              role: "system",
              content:
                "You are a nonpartisan campaign-finance and politics analyst. Ground every claim in the search results. Never invent dollar figures, FEC IDs, or quotes. If results describe a different entity than anchored, set insufficient_information=true and cap confidence at 20. Output strict JSON only — no prose, no markdown fences.",
            },
            { role: "user", content: searchPrompt },
          ],
          stream: false,
          reasoning_effort: "low",
        }),
      });
    } catch (e) {
      clearTimeout(jinaTimeout);
      const aborted = (e as { name?: string })?.name === "AbortError";
      console.error("Jina fetch failed", aborted ? "timeout" : e);
      return json({
        error: aborted
          ? "AI research timed out while searching the web. Please try again."
          : "Could not reach the AI research service. Please try again.",
        code: aborted ? "JINA_TIMEOUT" : "JINA_NETWORK",
        fallback: true,
      }, 200);
    }
    clearTimeout(jinaTimeout);

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
      const lovableKey = Deno.env.get("LOVABLE_API_KEY");
      if (!lovableKey) {
        console.error("Could not parse Jina output and no LOVABLE_API_KEY", content.slice(0, 500));
        parsed = narrativeFallback(content, citations);
      } else {
        const structurePrompt = `Convert the following research narrative into the exact JSON schema. Use only facts from the narrative — do not invent. Citation indices [n] correspond to the URL list provided.

NARRATIVE:
${content}

CITATION URLS (in order):
${citations.map((u, i) => `[${i + 1}] ${u}`).join("\n")}

Return ONLY a JSON object with these keys: summary (string), analysis (string), positions (array of {topic, stance}), goals (string[]), key_people (string[]), notable_recipients (string[]), controversies (string[]), causes (string[]), finance_claims (string[]), public_context_claims (string[]), insufficient_information (boolean), confidence (0-100 integer), confidence_rationale (string).`;

        const gemResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${lovableKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "google/gemini-3-flash-preview",
            messages: [
              { role: "system", content: "You are a JSON converter. Use the required tool with only facts present in the user-provided narrative." },
              { role: "user", content: structurePrompt },
            ],
            tools: [{
              type: "function",
              function: {
                name: "return_recipient_analysis",
                description: "Return structured recipient analysis extracted from a grounded research narrative.",
                parameters: {
                  type: "object",
                  properties: {
                    summary: { type: "string" },
                    analysis: { type: "string" },
                    positions: { type: "array", items: { type: "object", properties: { topic: { type: "string" }, stance: { type: "string" } }, required: ["topic", "stance"] } },
                    goals: { type: "array", items: { type: "string" } },
                    key_people: { type: "array", items: { type: "string" } },
                    notable_recipients: { type: "array", items: { type: "string" } },
                    controversies: { type: "array", items: { type: "string" } },
                    causes: { type: "array", items: { type: "string" } },
                    finance_claims: { type: "array", items: { type: "string" } },
                    public_context_claims: { type: "array", items: { type: "string" } },
                    insufficient_information: { type: "boolean" },
                    confidence: { type: "integer", minimum: 0, maximum: 100 },
                    confidence_rationale: { type: "string" },
                  },
                  required: ["summary", "analysis", "positions", "goals", "key_people", "notable_recipients", "controversies", "causes", "finance_claims", "public_context_claims", "insufficient_information", "confidence", "confidence_rationale"],
                  additionalProperties: false,
                },
              },
            }],
            tool_choice: { type: "function", function: { name: "return_recipient_analysis" } },
          }),
        });
        if (!gemResp.ok) {
          const t = await gemResp.text();
          console.error("Gemini structuring failed", gemResp.status, t.slice(0, 300));
          parsed = narrativeFallback(content, citations);
        } else {
          const gemJson = await gemResp.json();
          const toolArgs: string | undefined = gemJson?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
          const gemContent: string = toolArgs ?? gemJson?.choices?.[0]?.message?.content ?? "";
          parsed = extractJson(gemContent);
          if (!parsed) {
            console.error("Gemini structuring returned unparseable output", gemContent.slice(0, 500));
            parsed = narrativeFallback(content, citations);
          }
        }
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
      finance_claims: Array.isArray(parsed.finance_claims) ? parsed.finance_claims : [],
      public_context_claims: Array.isArray(parsed.public_context_claims) ? parsed.public_context_claims : [],
      insufficient_information: insufficient,
      confidence,
      confidence_rationale: String(parsed.confidence_rationale ?? ""),
      data_coverage,
      sources,
      finance_context: {
        total_received: Math.round(totalReceived),
        donor_count: donorCount,
        top_donors: topDonors,
        fec_id,
      },
    });
  } catch (e) {
    console.error("ai-recipient-analysis error", e);
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});
