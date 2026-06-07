// Targeted FEC candidate onboarding.
//
// discover-fec-candidates sweeps the OpenFEC /candidates/ list for ACTIVE
// (candidate_status=C) filers, so it never onboards people who have withdrawn
// (e.g. a former presidential primary candidate) even though their independent
// expenditures are in our data. This function onboards an explicit list of FEC
// candidate ids through the SAME shared dedup funnel (resolveAndUpsertCandidate),
// then records the fec -> canonical alias in candidate_fec_ids so the IE importer
// links their spending.
//
// Auth: cron secret or service-role bearer (admin tooling). Body: { fec_ids: string[] }.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  type CandidateInput,
  mapParty,
  resolveAndUpsertCandidate,
} from '../_shared/onboard-candidate.ts';
import { requireCronAuth } from '../_shared/cron-auth.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const FEC_API_KEY = Deno.env.get('FEC_API_KEY') ?? '';

function officeLabel(code: string, state: string, district: string | null): string {
  if (code === 'H') return `U.S. House ${state}-${district ?? ''}`;
  if (code === 'S') return `U.S. Senate (${state})`;
  if (code === 'P') return 'President of the United States';
  return code;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const unauthorized = await requireCronAuth(req);
  if (unauthorized) return unauthorized;

  if (!FEC_API_KEY) {
    return new Response(JSON.stringify({ error: 'FEC_API_KEY not configured' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const body = await req.json().catch(() => ({}));
  const fecIds: string[] = Array.isArray(body.fec_ids) ? body.fec_ids.map(String) : [];
  if (fecIds.length === 0) {
    return new Response(JSON.stringify({ error: 'fec_ids[] required' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const results: Array<Record<string, unknown>> = [];

  for (const fecId of fecIds) {
    try {
      const r = await fetch(`https://api.open.fec.gov/v1/candidate/${fecId}/?api_key=${FEC_API_KEY}`);
      if (!r.ok) {
        results.push({ fec_id: fecId, ok: false, error: `FEC ${r.status}` });
        continue;
      }
      const j = await r.json();
      const fc = j?.results?.[0];
      if (!fc) {
        results.push({ fec_id: fecId, ok: false, error: 'not found in FEC' });
        continue;
      }

      const officeCode = String(fc.office ?? '').toUpperCase();
      const state = officeCode === 'P' ? 'US' : (fc.state || '');
      const district = officeCode === 'H' ? (fc.district ?? null) : null;

      const candidate: CandidateInput = {
        id: fc.candidate_id,
        name: fc.name || 'Unknown',
        party: mapParty(fc.party_full || fc.party),
        office: officeLabel(officeCode, state, district),
        state,
        district,
        is_incumbent: fc.incumbent_challenge === 'I',
        image_url: null,
        fec_candidate_id: fc.candidate_id,
        source: 'fec-targeted',
        source_ref: Array.isArray(fc.election_years) && fc.election_years.length
          ? String(Math.max(...fc.election_years)) : null,
      };

      // Run the shared dedup funnel WITHOUT the visible-states gate: these ids are
      // requested explicitly, so we onboard regardless of hidden_states.
      const { candidateId, isNew, skipped } = await resolveAndUpsertCandidate(supabase, candidate, {
        restrictToVisible: false,
      });

      if (!candidateId) {
        results.push({ fec_id: fecId, ok: false, skipped: skipped ?? 'no candidate id' });
        continue;
      }

      // Record the fec -> canonical alias so the IE importer links this spending.
      const { error: aliasErr } = await supabase.from('candidate_fec_ids').upsert({
        candidate_id: candidateId,
        fec_candidate_id: fc.candidate_id,
        office: officeCode === 'P' ? 'President' : officeCode === 'S' ? 'Senate' : 'House',
        state: state || null,
        district,
        is_primary: false,
        cycle: candidate.source_ref,
        match_method: 'targeted',
      }, { onConflict: 'candidate_id,fec_candidate_id' });
      if (aliasErr) console.warn('[onboard-fec] alias upsert failed', fc.candidate_id, aliasErr.message);

      results.push({ fec_id: fecId, ok: true, candidate_id: candidateId, is_new: isNew, name: fc.name });
    } catch (e) {
      results.push({ fec_id: fecId, ok: false, error: (e as Error).message });
    }
  }

  return new Response(JSON.stringify({ results }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
