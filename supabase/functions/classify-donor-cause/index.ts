// Classify a single DONOR ENTITY (by primary_id) to one of the existing active
// committee_causes using Lovable AI, and CACHE the result in donor_card_causes.
//
// This is the donor-by-id sibling of classify-donor-alias-cause. It backfills a
// cause for donors that resolve to none via donor_cause_overrides or
// donor_aliases.primary_cause_id, so the auto-posted "Top Donor" social card can
// show a cause more often (the AI tier in get_donor_card_facts).
//
// Because these labels post PUBLICLY, the classifier ABSTAINS (stores cause_id
// null) whenever it can't confidently map the donor to one of the existing
// causes — a wrong label is worse than no label. Every result (including an
// abstain) is cached so we never re-run the AI or flip-flop a label.
//
// Body: { donor_id: string, force?: boolean }
// Auth: cron/service-role (isCronAuthorized) OR an authenticated admin.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { z } from 'https://esm.sh/zod@3.23.8';
import { isCronAuthorized } from '../_shared/cron-auth.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY')!;
const MODEL = 'google/gemini-2.5-flash';

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

const bodySchema = z.object({
  donor_id: z.string().min(1),
  force: z.boolean().optional(),
});

interface Cause {
  id: string;
  label: string;
  stance: string;
  issue: string;
  description: string | null;
}

interface DonorRecipient { name: string; amount: number }
interface DonorFacts {
  display_name: string;
  type: string;
  top_recipients: DonorRecipient[];
}

// Accept a cron/service-role caller OR an authenticated admin (same dual gate as
// pick-daily-stat-card).
async function authorize(req: Request): Promise<{ ok: true; admin: ReturnType<typeof createClient> } | { ok: false; res: Response }> {
  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  if (await isCronAuthorized(req)) return { ok: true, admin };

  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) return { ok: false, res: json({ error: 'Unauthorized' }, 401) };
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { global: { headers: { Authorization: authHeader } } });
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return { ok: false, res: json({ error: 'Unauthorized' }, 401) };
  const { data: role } = await admin.from('user_roles').select('role').eq('user_id', user.id).eq('role', 'admin').maybeSingle();
  if (!role) return { ok: false, res: json({ error: 'Forbidden: admin required' }, 403) };
  return { ok: true, admin };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const gate = await authorize(req);
  if (!gate.ok) return gate.res;
  const supabase = gate.admin;

  try {
    const parsedBody = bodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsedBody.success) return json({ error: 'donor_id required' }, 400);
    const { donor_id, force } = parsedBody.data;

    // CACHED: if we already classified this donor (cause OR abstain), return it
    // and do NOT re-call the AI, unless force=true.
    if (!force) {
      const { data: existing } = await supabase
        .from('donor_card_causes')
        .select('cause_id, reasoning')
        .eq('primary_id', donor_id)
        .maybeSingle();
      if (existing) {
        const label = existing.cause_id
          ? (await supabase.from('committee_causes').select('label').eq('id', existing.cause_id).maybeSingle()).data?.label ?? null
          : null;
        return json({ cause_id: existing.cause_id, label, reasoning: existing.reasoning, cached: true });
      }
    }

    // Load donor facts (name, type, biggest recipients) via the same RPC the card uses.
    const { data: factsRaw } = await supabase.rpc('get_donor_card_facts', { _donor_id: donor_id });
    const raw = (factsRaw ?? null) as Record<string, unknown> | null;
    if (!raw || !raw.display_name) return json({ error: 'Donor not found' }, 404);
    const recips = Array.isArray(raw.top_recipients) ? raw.top_recipients : [];
    const facts: DonorFacts = {
      display_name: String(raw.display_name),
      type: String(raw.type ?? ''),
      top_recipients: (recips as Array<Record<string, unknown>>)
        .filter((r) => r && r.name != null)
        .map((r) => ({ name: String(r.name), amount: Number(r.amount ?? 0) })),
    };

    // Load active causes (the EXACT allowed set the AI must choose from).
    const { data: causesData } = await supabase
      .from('committee_causes')
      .select('id, label, stance, issue, description')
      .eq('status', 'active');
    const causes = (causesData ?? []) as Cause[];
    if (causes.length === 0) return json({ error: 'No active causes available' }, 400);
    const allowed = new Set(causes.map((c) => c.id));

    const causeMenu = causes
      .map((c) => `- ${c.id}: ${c.label} (${c.stance} ${c.issue})${c.description ? ' — ' + c.description : ''}`)
      .join('\n');
    const topRecipients = facts.top_recipients
      .filter((r) => r.amount > 0)
      .map((r) => `${r.name} ($${Math.round(r.amount).toLocaleString('en-US')})`)
      .join('; ') || 'none';

    const prompt = `You are categorizing a US political DONOR by the cause/leaning they advocate for, choosing ONLY from a fixed list of existing causes. Your label will be shown PUBLICLY on a social card, so a WRONG label is worse than NO label.

Donor name: ${facts.display_name}
Donor type: ${facts.type || 'unknown'}
Biggest recipients of their money (the main signal for inferring their cause): ${topRecipients}

Allowed causes (you may ONLY choose one of these ids, or null):
${causeMenu}

Choose a cause id ONLY when the donor's issue/leaning CLEARLY and confidently matches one of the causes above — the recipients they fund are the primary signal. If the donor is a generic partisan giver with no clear single-issue focus, or you are not confident, return cause_id null (abstain). NEVER invent a cause id that is not in the list above.

Return STRICT JSON ONLY, no prose, in exactly this shape:
{ "cause_id": "<one of the ids above, or null>", "reasoning": "<=240 chars explaining the match, or why you abstained>" }`;

    const aiRes = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: 'system', content: 'You categorize US political donors by cause/leaning, choosing only from a fixed allowed list. You abstain (return null) whenever the match is not clear and confident, because the label is published publicly. You always respond with strict JSON only.' },
          { role: 'user', content: prompt },
        ],
        response_format: { type: 'json_object' },
      }),
    });

    if (aiRes.status === 429) return json({ error: 'Rate limited — try again shortly' }, 429);
    if (aiRes.status === 402) return json({ error: 'AI credits exhausted' }, 402);
    if (!aiRes.ok) {
      const txt = await aiRes.text();
      console.error('AI gateway failed', aiRes.status, txt);
      return json({ error: `AI gateway ${aiRes.status}` }, 502);
    }

    const aiJson = await aiRes.json();
    const content: string | undefined = aiJson?.choices?.[0]?.message?.content;
    if (!content) return json({ error: 'AI returned no classification' }, 502);

    // Parse the strict JSON the model was asked to return (tolerate a fenced block).
    let parsed: { cause_id?: unknown; reasoning?: unknown };
    try {
      parsed = JSON.parse(content.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, ''));
    } catch {
      console.error('AI returned non-JSON', content);
      return json({ error: 'AI returned malformed JSON' }, 502);
    }

    // Validate the cause id against the active set; anything else => abstain (null).
    const rawCauseId = typeof parsed.cause_id === 'string' ? parsed.cause_id : null;
    const causeId = rawCauseId && allowed.has(rawCauseId) ? rawCauseId : null;
    const reasoning = typeof parsed.reasoning === 'string' ? parsed.reasoning.slice(0, 240) : null;

    // Cache the result (cause OR abstain) so we never re-run the AI for this donor.
    const { error: upErr } = await supabase.from('donor_card_causes').upsert({
      primary_id: donor_id,
      cause_id: causeId,
      reasoning,
      assigned_by: 'ai',
      model: MODEL,
      classified_at: new Date().toISOString(),
    }, { onConflict: 'primary_id' });
    if (upErr) throw upErr;

    const label = causeId ? (causes.find((c) => c.id === causeId)?.label ?? null) : null;
    return json({ cause_id: causeId, label, reasoning });
  } catch (e) {
    console.error('classify-donor-cause error', e);
    return json({ error: e instanceof Error ? e.message : 'Unknown error' }, 500);
  }
});
