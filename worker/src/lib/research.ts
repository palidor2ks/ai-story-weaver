// Ported verbatim from supabase/functions/get-candidate-answers/index.ts
// AI research pipeline: Perplexity sonar-deep-research → Gemini fallback → party inference.
// Scoring snapped to discrete -10/-5/0/+5/+10. Evidence-first source_description with EVIDENCE TYPE prefix.

import { config } from "../config.js";
import { logger } from "../logger.js";

const PERPLEXITY_BATCH_LIMIT = 100;
const PERPLEXITY_DELAY_MS = 1200;

export interface QuestionOption {
  value: number;
  text: string;
}

export interface Question {
  id: string;
  text: string;
  topic_id: string;
  question_options?: QuestionOption[];
}

export interface GeneratedAnswer {
  question_id: string;
  answer_value: number;
  source_description: string;
  source_url: string | null;
  source_urls: string[];
  source_titles: string[];
  source_type: string;
  confidence: "high" | "medium" | "low";
  evidence_type:
    | "voting_record"
    | "public_statement"
    | "campaign_position"
    | "social_media"
    | "news_quote"
    | "organization_scorecard"
    | "inferred"
    | "mixed";
  voting_record_summary?: string;
  public_statement_summary?: string;
  has_discrepancy?: boolean;
  discrepancy_note?: string;
}

const TRUSTED_SOURCES = `
PRIORITY SOURCES (search in this order):

1. OFFICIAL GOVERNMENT SOURCES
   - Congress.gov voting records, bill sponsorships, cosponsored legislation
   - Official .gov websites (e.g., sullivan.senate.gov, pelosi.house.gov)
   - Committee hearing transcripts and floor speeches
   - C-SPAN archives and official video

2. OFFICIAL CAMPAIGN & PARTY SOURCES
   - Campaign websites, party platforms, press releases, DNC/RNC official positions

3. SOCIAL MEDIA (with direct quotes)
   - X/Twitter, Facebook, YouTube, Instagram official accounts

4. NEWS & JOURNALISM
   - AP, Reuters, NYT, WSJ, WaPo, Politico, The Hill, Roll Call, Axios, NPR, PBS

5. RESEARCH & ADVOCACY ORGANIZATIONS
   - OpenSecrets, Heritage, Brookings, Cato, CAP, LCV, NRA, Planned Parenthood Action, ACLU, Chamber of Commerce

6. SPECIALIZED POLITICAL DATABASES
   - Ballotpedia, VoteSmart, GovTrack, FiveThirtyEight, ProPublica Congress API
`;

// ---------------------------------------------------------------------------
// Utility functions (verbatim from edge function)
// ---------------------------------------------------------------------------

export function smartTruncate(text: string, maxLength: number): string {
  if (!text || text.length <= maxLength) return text || "";
  const sentenceEnd = text.slice(0, maxLength).lastIndexOf(". ");
  if (sentenceEnd > maxLength * 0.6) return text.slice(0, sentenceEnd + 1);
  const lastSpace = text.slice(0, maxLength).lastIndexOf(" ");
  if (lastSpace > maxLength * 0.7) return text.slice(0, lastSpace) + "...";
  return text.slice(0, maxLength - 3) + "...";
}

function buildOfficialSiteDomain(candidateName: string, candidateOffice: string): string | null {
  let lastName = candidateName.split(" ").pop()?.toLowerCase() || "";
  lastName = lastName.replace(/[^a-z0-9-]/g, "").replace(/^-+|-+$/g, "");
  if (!lastName || lastName.length < 2) return null;

  const officeLower = candidateOffice.toLowerCase();
  if (officeLower.includes("senator") || officeLower.includes("senate")) {
    return `${lastName}.senate.gov`;
  } else if (officeLower.includes("representative") || officeLower.includes("house") || officeLower.includes("congress")) {
    return `${lastName}.house.gov`;
  }
  return null;
}

export function snapToValidValue(value: number): number {
  const validValues = [-10, -5, 0, 5, 10];
  return validValues.reduce((prev, curr) =>
    Math.abs(curr - value) < Math.abs(prev - value) ? curr : prev,
  );
}

export function extractJsonFromText(text: string): any | null {
  let workingText = text;
  if (text.length > 50_000) {
    const jsonStart = text.indexOf("{");
    const jsonEnd = text.lastIndexOf("}");
    if (jsonStart !== -1 && jsonEnd > jsonStart) {
      workingText = text.slice(jsonStart, jsonEnd + 1);
    }
  }

  try {
    return JSON.parse(workingText);
  } catch {
    // continue
  }

  const jsonMatch = workingText.match(/\{[\s\S]*?\}(?=\s*$|\s*```|\s*\n\n)/);
  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[0]);
    } catch {
      // continue
    }
  }

  const codeBlockMatch = workingText.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
  if (codeBlockMatch) {
    try {
      return JSON.parse(codeBlockMatch[1]);
    } catch {
      // continue
    }
  }

  const structuredMatch = workingText.match(
    /\{[^{}]*"answer_value"\s*:\s*-?\d+[^{}]*"evidence_type"\s*:\s*"[^"]+"/,
  );
  if (structuredMatch) {
    const startIdx = workingText.indexOf(structuredMatch[0]);
    let braceCount = 0;
    let endIdx = startIdx;
    for (let i = startIdx; i < workingText.length; i++) {
      if (workingText[i] === "{") braceCount++;
      if (workingText[i] === "}") braceCount--;
      if (braceCount === 0) {
        endIdx = i;
        break;
      }
    }
    try {
      return JSON.parse(workingText.slice(startIdx, endIdx + 1));
    } catch {
      // continue
    }
  }

  const anyJsonMatch = workingText.match(/\{[^{}]*"answer_value"[^{}]*\}/);
  if (anyJsonMatch) {
    try {
      return JSON.parse(anyJsonMatch[0]);
    } catch {
      return null;
    }
  }

  return null;
}

function detectEvidenceTypeFromDescription(description: string): GeneratedAnswer["evidence_type"] {
  if (!description) return "inferred";
  const desc = description.toUpperCase();

  if (
    desc.includes("VOTED YEA") ||
    desc.includes("VOTED NAY") ||
    desc.includes("VOTED FOR") ||
    desc.includes("VOTED AGAINST") ||
    desc.includes("ROLL CALL") ||
    desc.includes("VOTING RECORD") ||
    desc.match(/AFL-CIO|HERITAGE ACTION|LCV SCORE|NRA GRADE|ACLU SCORE/)
  ) {
    return "voting_record";
  }
  if (
    desc.includes("SPONSORED") ||
    desc.includes("CO-SPONSORED") ||
    desc.includes("COSPONSORED") ||
    desc.includes("INTRODUCED") ||
    desc.match(/H\.R\.\s*\d+|S\.\s*\d+|H\.RES|S\.RES/)
  ) {
    return "voting_record";
  }
  if (desc.match(/RATED|SCORED|GRADE[D]?|SCORECARD|% SCORE|RATING FROM|ACTION SCORE/)) {
    return "organization_scorecard";
  }
  if (
    desc.includes("STATED") ||
    desc.includes("SAID") ||
    desc.includes("ANNOUNCED") ||
    desc.includes("DECLARED") ||
    desc.includes("PRESS RELEASE") ||
    desc.includes("FLOOR SPEECH") ||
    desc.includes("REMARKS") ||
    desc.includes("TESTIFIED") ||
    desc.includes("STATEMENT")
  ) {
    return "public_statement";
  }
  if (
    desc.includes("CAMPAIGN") ||
    desc.includes("WEBSITE") ||
    desc.includes("PLATFORM") ||
    desc.includes("POSITION PAGE") ||
    desc.includes("CAMPAIGN SITE") ||
    desc.includes("OFFICIAL SITE")
  ) {
    return "campaign_position";
  }
  if (
    desc.includes("TWITTER") ||
    desc.includes("X.COM") ||
    desc.includes("TWEET") ||
    desc.includes("FACEBOOK") ||
    desc.includes("INSTAGRAM") ||
    desc.includes("POSTED ON")
  ) {
    return "social_media";
  }
  if (
    desc.includes("INTERVIEW") ||
    desc.includes("TOWN HALL") ||
    desc.includes("REPORTED") ||
    desc.includes("NEWS") ||
    desc.includes("TOLD REPORTERS") ||
    desc.includes("IN AN INTERVIEW")
  ) {
    return "news_quote";
  }
  if (
    desc.includes("PARTY ALIGNMENT") ||
    desc.includes("PARTY PLATFORM") ||
    desc.includes("BASED ON PARTY") ||
    desc.includes("INFERRED FROM PARTY") ||
    desc.includes("NO DOCUMENTED POSITION") ||
    desc.includes("NO DIRECT EVIDENCE")
  ) {
    return "inferred";
  }
  if (desc.length > 100 && !desc.includes("INFERRED") && !desc.includes("PARTY AFFILIATION")) {
    return "mixed";
  }
  return "inferred";
}

function mapEvidenceToSourceType(evidenceType: string): string {
  const mapping: Record<string, string> = {
    voting_record: "voting_record",
    public_statement: "public_statement",
    campaign_position: "campaign_website",
    social_media: "public_statement",
    news_quote: "interview",
    organization_scorecard: "web_research",
    inferred: "other",
    mixed: "web_research",
  };
  return mapping[evidenceType] || "web_research";
}

function validateEvidenceType(type: string): GeneratedAnswer["evidence_type"] {
  const valid: GeneratedAnswer["evidence_type"][] = [
    "voting_record",
    "public_statement",
    "campaign_position",
    "social_media",
    "news_quote",
    "organization_scorecard",
    "inferred",
    "mixed",
  ];
  return valid.includes(type as GeneratedAnswer["evidence_type"]) ? (type as GeneratedAnswer["evidence_type"]) : "inferred";
}

function extractSourcesFromDescription(description: string): { urls: string[]; titles: string[] } {
  const urls: string[] = [];
  const titles: string[] = [];
  if (!description) return { urls, titles };
  const foundBills = new Set<string>();

  for (const m of description.matchAll(/\bS\.?\s?(\d+)/gi)) {
    const num = m[1];
    const key = `S.${num}`;
    if (!foundBills.has(key)) {
      foundBills.add(key);
      urls.push(`https://www.congress.gov/bill/119th-congress/senate-bill/${num}`);
      titles.push(`S.${num}`);
    }
  }
  for (const m of description.matchAll(/\bH\.?R\.?\s?(\d+)/gi)) {
    const num = m[1];
    const key = `HR.${num}`;
    if (!foundBills.has(key)) {
      foundBills.add(key);
      urls.push(`https://www.congress.gov/bill/119th-congress/house-bill/${num}`);
      titles.push(`H.R.${num}`);
    }
  }
  for (const m of description.matchAll(/\bS\.?\s?Amdt\.?\s?(\d+)/gi)) {
    const num = m[1];
    const key = `S.Amdt.${num}`;
    if (!foundBills.has(key)) {
      foundBills.add(key);
      urls.push(`https://www.congress.gov/amendment/119th-congress/senate-amendment/${num}`);
      titles.push(`S.Amdt.${num}`);
    }
  }
  for (const m of description.matchAll(/\bH\.?\s?Amdt\.?\s?(\d+)/gi)) {
    const num = m[1];
    const key = `H.Amdt.${num}`;
    if (!foundBills.has(key)) {
      foundBills.add(key);
      urls.push(`https://www.congress.gov/amendment/119th-congress/house-amendment/${num}`);
      titles.push(`H.Amdt.${num}`);
    }
  }
  return { urls: urls.slice(0, 5), titles: titles.slice(0, 5) };
}

// ---------------------------------------------------------------------------
// Per-job Perplexity counter wrapper (replaces module-global from edge fn)
// ---------------------------------------------------------------------------

export class ResearchContext {
  perplexityCallCount = 0;

  constructor(public readonly log = logger) {}

  hitPerplexityLimit(): boolean {
    return this.perplexityCallCount >= PERPLEXITY_BATCH_LIMIT;
  }
}

// ---------------------------------------------------------------------------
// Perplexity (primary)
// ---------------------------------------------------------------------------

export async function researchPositionWithPerplexity(
  ctx: ResearchContext,
  candidateName: string,
  candidateOffice: string,
  candidateState: string,
  candidateParty: string,
  question: Question,
): Promise<GeneratedAnswer | null> {
  if (!config.PERPLEXITY_API_KEY) {
    ctx.log.warn("[Perplexity] API key not configured");
    return null;
  }
  if (ctx.hitPerplexityLimit()) {
    ctx.log.warn("[Perplexity] Batch limit reached");
    return null;
  }
  ctx.perplexityCallCount++;

  const officialDomain = buildOfficialSiteDomain(candidateName, candidateOffice);
  const optionsContext =
    question.question_options
      ?.slice()
      .sort((a, b) => a.value - b.value)
      .map((opt) => `(${opt.value}) ${opt.text}`)
      .join("\n") || "";
  const topicName = question.topic_id?.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) || "policy";

  const systemPrompt = `You are a political research analyst finding concrete evidence of elected officials' positions.

${TRUSTED_SOURCES}

EVIDENCE QUALITY HIERARCHY:
1. HIGH confidence: Roll call votes (Yea/Nay), bill sponsorships/cosponsorships, official .gov statements, floor speeches
2. MEDIUM confidence: Campaign statements, verified social media posts, news interviews with direct quotes, organization scorecards
3. LOW confidence: Party alignment inference, general party platform statements

CRITICAL EVIDENCE TYPE RULES (follow exactly):
- "voting_record": roll call votes, bill sponsorships, cosponsored legislation, or org voting scorecards (Heritage Action, AFL-CIO, LCV, NRA, ACLU, etc.)
- "organization_scorecard": ratings/grades from advocacy organizations
- "public_statement": official statements, floor speeches, press releases, direct quotes from .gov
- "campaign_position": campaign website positions or platform documents
- "social_media": Twitter/X, Facebook, social media posts
- "news_quote": interview quotes or news article citations
- "inferred": ONLY if you found ZERO concrete evidence and must rely purely on party affiliation

DO NOT USE "inferred" if you found ANY votes, bills, statements, scorecards, or quotes!

OUTPUT RULES:
- Use the answer_value from the OPTIONS that matches the evidence found
- ALWAYS start source_description with evidence type in caps: "VOTED YEA on...", "SPONSORED...", "CO-SPONSORED...", "STATED...", "RATED by...", etc.
- Include specific bill numbers (H.R.XXX, S.XXX) when citing legislation
- Include dates when available
- If evidence shows SUPPORT for the policy, use the positive option value
- If evidence shows OPPOSITION, use the negative option value`;

  const userPrompt = `Research ${candidateName} (${candidateParty} ${candidateOffice}, ${candidateState}) position on this question:

TOPIC: ${topicName}
QUESTION: "${question.text}"

ANSWER OPTIONS (use these exact values):
${optionsContext}

${officialDomain ? `PRIORITY: Search ${officialDomain} first for official statements and press releases.` : ""}

SEARCH FOR ALL OF THESE (in order):
1. Roll call votes on related legislation
2. Bills sponsored or cosponsored on this topic
3. Committee activity and hearing statements
4. Official statements from ${officialDomain || "official websites"}
5. Campaign positions and press releases
6. Social media posts (Twitter/X, Facebook) with direct quotes
7. News interviews or town hall statements with direct quotes
8. Organization scorecards and ratings: Heritage, LCV, NRA, Planned Parenthood Action, ACLU, Chamber of Commerce, OpenSecrets

Return the answer_value from OPTIONS that best matches ALL evidence found.`;

  try {
    await new Promise((r) => setTimeout(r, PERPLEXITY_DELAY_MS));
    const t0 = Date.now();

    const response = await fetch("https://api.perplexity.ai/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.PERPLEXITY_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "sonar-deep-research",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "candidate_position",
            schema: {
              type: "object",
              properties: {
                answer_value: { type: "integer" },
                confidence: { type: "string", enum: ["high", "medium", "low"] },
                evidence_type: {
                  type: "string",
                  enum: [
                    "voting_record",
                    "public_statement",
                    "campaign_position",
                    "social_media",
                    "news_quote",
                    "organization_scorecard",
                    "inferred",
                  ],
                },
                source_description: { type: "string" },
                primary_source: {
                  type: "object",
                  properties: {
                    url: { type: "string" },
                    title: { type: "string" },
                    date: { type: "string" },
                  },
                },
                additional_sources: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: { url: { type: "string" }, title: { type: "string" } },
                  },
                },
              },
              required: ["answer_value", "confidence", "evidence_type", "source_description"],
            },
          },
        },
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      ctx.log.error({ status: response.status, body: errText.slice(0, 500) }, "[Perplexity] API error");
      return null;
    }

    const data = (await response.json()) as { choices?: { message?: { content?: string } }[]; citations?: string[] };
    const content = data.choices?.[0]?.message?.content || "";
    const citations = Array.isArray(data.citations) ? data.citations : [];
    ctx.log.info({ question_id: question.id, elapsed_s: Math.round((Date.now() - t0) / 1000), citations: citations.length }, "[Perplexity] done");

    const parsed = extractJsonFromText(content);
    if (!parsed || typeof parsed.answer_value !== "number") {
      ctx.log.warn({ question_id: question.id }, "[Perplexity] failed to parse");
      return null;
    }

    const validConfidence = ["high", "medium", "low"].includes(parsed.confidence) ? parsed.confidence : "medium";
    const sourceUrls: string[] = [];
    const sourceTitles: string[] = [];

    citations.slice(0, 5).forEach((url: string) => {
      if (url && !sourceUrls.includes(url)) {
        sourceUrls.push(url);
        sourceTitles.push(url.split("/")[2] || "Source");
      }
    });
    if (parsed.primary_source?.url && !sourceUrls.includes(parsed.primary_source.url)) {
      sourceUrls.unshift(parsed.primary_source.url);
      sourceTitles.unshift(parsed.primary_source.title || "Primary Source");
    }
    if (Array.isArray(parsed.additional_sources)) {
      parsed.additional_sources.forEach((src: { url?: string; title?: string }) => {
        if (src.url && !sourceUrls.includes(src.url) && sourceUrls.length < 5) {
          sourceUrls.push(src.url);
          sourceTitles.push(src.title || "Source");
        }
      });
    }

    const detected = detectEvidenceTypeFromDescription(parsed.source_description || "");
    const finalEvidenceType = detected !== "inferred" ? detected : validateEvidenceType(parsed.evidence_type);

    return {
      question_id: question.id,
      answer_value: snapToValidValue(parsed.answer_value),
      source_description: smartTruncate(parsed.source_description || "Research completed", 1000),
      source_url: sourceUrls[0] || null,
      source_urls: sourceUrls,
      source_titles: sourceTitles,
      source_type: mapEvidenceToSourceType(finalEvidenceType),
      confidence: validConfidence as "high" | "medium" | "low",
      evidence_type: finalEvidenceType,
      voting_record_summary: ["voting_record", "organization_scorecard"].includes(finalEvidenceType)
        ? parsed.source_description
        : undefined,
      public_statement_summary: ["public_statement", "social_media", "news_quote"].includes(finalEvidenceType)
        ? parsed.source_description
        : undefined,
    };
  } catch (err) {
    ctx.log.error({ err, question_id: question.id }, "[Perplexity] error");
    return null;
  }
}

// ---------------------------------------------------------------------------
// Gemini fallback (Lovable AI Gateway)
// ---------------------------------------------------------------------------

export async function researchWithGeminiFallback(
  ctx: ResearchContext,
  candidateName: string,
  candidateOffice: string,
  candidateState: string,
  candidateParty: string,
  question: Question,
): Promise<GeneratedAnswer | null> {
  if (!config.LOVABLE_API_KEY) return null;

  const optionsContext =
    question.question_options
      ?.slice()
      .sort((a, b) => a.value - b.value)
      .map((opt) => `(${opt.value}) ${opt.text}`)
      .join("\n") || "";
  const topicName = question.topic_id?.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) || "policy";

  const prompt = `Research ${candidateName} (${candidateParty} ${candidateOffice}, ${candidateState}) position on:

TOPIC: ${topicName}
QUESTION: "${question.text}"

OPTIONS:
${optionsContext}

Find evidence from: voting records, official statements, campaign positions, social media, news quotes, organization scorecards (Heritage, LCV, NRA, etc.).

Return JSON:
{
  "answer_value": <value from options>,
  "confidence": "high"|"medium"|"low",
  "evidence_type": "voting_record"|"public_statement"|"inferred",
  "source_description": "<evidence summary>"
}`;

  try {
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: "You are a political research analyst. Return only valid JSON." },
          { role: "user", content: prompt },
        ],
        max_tokens: 500,
      }),
    });
    if (!response.ok) {
      ctx.log.error({ status: response.status }, "[Gemini] API error");
      return null;
    }
    const data = (await response.json()) as { choices?: { message?: { content?: string } }[] };
    const content = data.choices?.[0]?.message?.content || "";
    const parsed = extractJsonFromText(content);
    if (!parsed || typeof parsed.answer_value !== "number") return null;

    const validConfidence = ["high", "medium", "low"].includes(parsed.confidence) ? parsed.confidence : "low";
    const geminiEvidenceType = parsed.evidence_type || "inferred";
    const detected = detectEvidenceTypeFromDescription(parsed.source_description || "");
    const finalEvidenceType = detected !== "inferred" ? detected : validateEvidenceType(geminiEvidenceType);
    const extractedSources =
      finalEvidenceType === "voting_record" || finalEvidenceType === "mixed"
        ? extractSourcesFromDescription(parsed.source_description || "")
        : { urls: [], titles: [] };

    return {
      question_id: question.id,
      answer_value: snapToValidValue(parsed.answer_value),
      source_description: smartTruncate(parsed.source_description || "Position inferred", 1000),
      source_url: extractedSources.urls[0] || null,
      source_urls: extractedSources.urls,
      source_titles: extractedSources.titles,
      source_type: mapEvidenceToSourceType(finalEvidenceType),
      confidence: validConfidence as "high" | "medium" | "low",
      evidence_type: finalEvidenceType,
    };
  } catch (err) {
    ctx.log.error({ err }, "[Gemini] error");
    return null;
  }
}

// ---------------------------------------------------------------------------
// Party-alignment last-resort inference
// ---------------------------------------------------------------------------

export async function inferFromPartyAlignment(
  ctx: ResearchContext,
  candidateParty: string,
  question: Question,
): Promise<GeneratedAnswer | null> {
  if (!config.LOVABLE_API_KEY) return null;

  const optionsContext =
    question.question_options
      ?.slice()
      .sort((a, b) => a.value - b.value)
      .map((opt) => `(${opt.value}) ${opt.text}`)
      .join("\n") || "";

  const prompt = `Based on ${candidateParty} party's general platform and ideology, what would be the most likely position on:

"${question.text}"

OPTIONS:
${optionsContext}

Party ideologies:
- Democrats: support government programs, progressive social policies, environmental protection, civil rights expansions
- Republicans: smaller government, free markets, traditional values, states' rights
- Libertarians: minimal government, individual liberty, non-intervention
- Green: environmental protection, social justice, grassroots democracy
- Independent: varies widely

Return JSON: {"score": <value>, "reasoning": "PARTY ALIGNMENT: <brief explanation>"}`;

  try {
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: "Return only valid JSON." },
          { role: "user", content: prompt },
        ],
        temperature: 0.3,
        max_tokens: 200,
      }),
    });
    if (!response.ok) return null;
    const data = (await response.json()) as { choices?: { message?: { content?: string } }[] };
    const content = data.choices?.[0]?.message?.content || "";
    const parsed = extractJsonFromText(content);
    if (!parsed || typeof parsed.score !== "number") return null;

    return {
      question_id: question.id,
      answer_value: snapToValidValue(parsed.score),
      source_description: smartTruncate(
        parsed.reasoning || `Position inferred from ${candidateParty} party alignment`,
        1000,
      ),
      source_url: null,
      source_urls: [],
      source_titles: [],
      source_type: "other",
      confidence: "low",
      evidence_type: "inferred",
    };
  } catch (err) {
    ctx.log.warn({ err }, "[Inference] error");
    return null;
  }
}

// ---------------------------------------------------------------------------
// Top-level: Perplexity → Gemini → party-alignment
// ---------------------------------------------------------------------------

export async function researchQuestionPosition(
  ctx: ResearchContext,
  candidateName: string,
  candidateOffice: string,
  candidateState: string,
  candidateParty: string,
  question: Question,
): Promise<GeneratedAnswer | null> {
  const perplexityAnswer = await researchPositionWithPerplexity(
    ctx, candidateName, candidateOffice, candidateState, candidateParty, question,
  );
  if (perplexityAnswer && perplexityAnswer.evidence_type !== "inferred") return perplexityAnswer;

  const geminiAnswer = await researchWithGeminiFallback(
    ctx, candidateName, candidateOffice, candidateState, candidateParty, question,
  );
  if (geminiAnswer && geminiAnswer.evidence_type !== "inferred") return geminiAnswer;

  return inferFromPartyAlignment(ctx, candidateParty, question);
}
