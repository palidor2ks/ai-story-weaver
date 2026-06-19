/**
 * Generates and uploads the pre-baked candidates directory JSON to Supabase Storage.
 *
 * The JSON is stored at:
 *   storage/data-cache/candidates-directory.json
 *
 * Clients fetch from the public CDN URL (~50ms) instead of hitting Postgres on every page load.
 *
 * Invoke via:
 *   POST /functions/v1/refresh-candidates-cache
 *   Authorization: Bearer <anon-key>   (no body required)
 *
 * Can also be wired to a pg_cron job (daily) so the cache stays warm automatically.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function getAdminClient() {
  const url = Deno.env.get('SUPABASE_URL')!;
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  return createClient(url, key, { auth: { persistSession: false } });
}

const BIOGUIDE_PATTERN = /^[A-Z][0-9]{6}$/;
function bioguideImageUrl(id: string | null | undefined): string | undefined {
  const t = id?.trim();
  if (!t || !BIOGUIDE_PATTERN.test(t)) return undefined;
  return `https://bioguide.congress.gov/bioguide/photo/${t[0]}/${t}.jpg`;
}

function resolveImageUrl(opts: {
  overrideUrl?: string | null;
  candidateUrl?: string | null;
  candidateId?: string | null;
  personId?: string | null;
}): string | null {
  for (const v of [opts.overrideUrl, opts.candidateUrl, bioguideImageUrl(opts.candidateId), bioguideImageUrl(opts.personId)]) {
    const t = v?.trim();
    if (t) return t;
  }
  return null;
}

function normalizeParty(p: string): 'Democrat' | 'Republican' | 'Independent' | 'Other' {
  if (p === 'Democrat' || p === 'Republican' || p === 'Independent') return p;
  return 'Other';
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const admin = getAdminClient();

    // Fetch in parallel: candidates, overrides, congress members
    const [candidatesRes, overridesRes, congressRes] = await Promise.all([
      admin.rpc('get_visible_candidates'),
      admin.from('candidate_overrides')
        .select('candidate_id, name, party, office, state, district, image_url, overall_score, coverage_tier, confidence')
        .eq('is_active', true),
      admin.rpc('get_all_congress_members'),
    ]);

    if (candidatesRes.error) throw new Error(`get_visible_candidates: ${candidatesRes.error.message}`);

    const rawCandidates = candidatesRes.data ?? [];
    const overrideMap = new Map((overridesRes.data ?? []).map((o: any) => [o.candidate_id, o]));

    const candidates = rawCandidates.map((c: any) => {
      const o: any = overrideMap.get(c.id);
      return {
        id: c.id,
        name: (o?.name ?? c.name ?? '').replace(/\s+/g, ' ').trim(),
        party: normalizeParty(o?.party ?? c.party ?? 'Other'),
        office: o?.office ?? c.office,
        state: o?.state ?? c.state,
        city: c.city ?? undefined,
        district: o?.district ?? c.district ?? null,
        image_url: resolveImageUrl({
          overrideUrl: o?.image_url,
          candidateUrl: c.image_url,
          candidateId: c.id,
          personId: c.person_id,
        }),
        overall_score: o?.overall_score ?? c.overall_score ?? 0,
        coverage_tier: o?.coverage_tier ?? c.coverage_tier ?? 'tier_3',
        confidence: o?.confidence ?? c.confidence ?? 'medium',
        is_incumbent: c.is_incumbent ?? true,
        score_version: c.score_version || 'v1.0',
        last_updated: c.last_updated,
        claimed_by_user_id: c.claimed_by_user_id,
        claimed_at: c.claimed_at,
        fec_candidate_id: c.fec_candidate_id,
        last_donor_sync: c.last_donor_sync,
        person_id: c.person_id,
      };
    });

    const congressMembers = (congressRes.data ?? []).map((m: any) => ({
      id: m.bioguide_id,
      bioguide_id: m.bioguide_id,
      name: (m.name ?? '').replace(/\s+/g, ' ').trim(),
      party: normalizeParty(m.party ?? 'Other'),
      office: m.office,
      state: m.state,
      district: m.district ?? null,
      image_url: m.image_url || bioguideImageUrl(m.bioguide_id) || '',
      is_incumbent: m.is_incumbent ?? true,
      overall_score: m.overall_score ?? null,
      coverage_tier: m.coverage_tier || 'tier_3',
      confidence: m.confidence || 'medium',
    }));

    const payload = {
      generatedAt: new Date().toISOString(),
      version: 1,
      candidates,
      congressMembers,
    };

    const json = JSON.stringify(payload);
    const bytes = new TextEncoder().encode(json);

    // Upload to Supabase Storage
    const { error: uploadError } = await admin.storage
      .from('data-cache')
      .upload('candidates-directory.json', bytes, {
        contentType: 'application/json',
        upsert: true,
        cacheControl: '3600',
      });

    if (uploadError) throw new Error(`Storage upload: ${uploadError.message}`);

    const sizeKb = (bytes.length / 1024).toFixed(1);
    console.log(`[refresh-candidates-cache] uploaded ${sizeKb} KB — ${candidates.length} candidates, ${congressMembers.length} congress members`);

    return new Response(JSON.stringify({
      ok: true,
      generatedAt: payload.generatedAt,
      candidateCount: candidates.length,
      congressMemberCount: congressMembers.length,
      sizeKb: parseFloat(sizeKb),
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[refresh-candidates-cache] error:', msg);
    return new Response(JSON.stringify({ ok: false, error: msg }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
