// Fetches a candidate's "who they are" record — their positions & goals — for the
// "Analysis" caption style, from the SAME cached ai-recipient-analysis the rep-profile
// AI-analysis dialog shows. On a cold cache it can generate the analysis on demand
// (service-role call), so the Analysis style is always positions/goals and never quietly
// collapses into the finance angle.
import { readCache } from './ai-cache.ts';
import { type AnalysisPayload, recordBlockFromAnalysis } from './candidate-record-utils.ts';

export { type AnalysisPayload, recordBlockFromAnalysis };

export interface RecordMeta {
  name: string;
  party?: string | null;
  office?: string | null;
  state?: string | null;
  fecId?: string | null;
}

// Best-effort on-demand generation of the analysis via the ai-recipient-analysis edge
// function (service-role bearer is accepted, see cron-auth). Bounded by a timeout so a
// slow web search can't hang the caption request. Returns the payload or null.
async function generateAnalysis(candidateId: string, meta: RecordMeta): Promise<AnalysisPayload | null> {
  const supaUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supaUrl || !serviceKey) return null;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 45_000);
  try {
    const res = await fetch(`${supaUrl}/functions/v1/ai-recipient-analysis`, {
      method: 'POST',
      signal: ctrl.signal,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${serviceKey}` },
      body: JSON.stringify({
        entity_kind: 'candidate',
        entity_id: candidateId,
        entity_name: meta.name,
        fec_id: meta.fecId ?? null,
        party: meta.party ?? null,
        office: meta.office ?? null,
        state: meta.state ?? null,
        cycle: null,
        force_refresh: false,
      }),
    });
    if (!res.ok) return null;
    return (await res.json()) as AnalysisPayload;
  } catch (e) {
    console.warn('analysis on-demand generate failed', e);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// Read the candidate's positions/goals record block. When `generate` is true and the
// cache is cold (or carries nothing usable), generate it on demand first. Returns null
// when there's genuinely nothing to say (caller should NOT fall back to finance).
export async function getCandidateRecord(opts: {
  candidateId: string;
  meta: RecordMeta;
  generate?: boolean;
}): Promise<string | null> {
  const cached = await readCache<AnalysisPayload>({
    kind: 'recipient', subject_id: `v2:candidate:${opts.candidateId}`, cycle: null,
  });
  let block = recordBlockFromAnalysis(cached?.payload);
  if (!block && opts.generate) {
    const fresh = await generateAnalysis(opts.candidateId, opts.meta);
    block = recordBlockFromAnalysis(fresh);
  }
  return block;
}
