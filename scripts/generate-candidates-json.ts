/**
 * Pre-bakes the candidates directory data into a CDN-hosted JSON file.
 *
 * Run with: bun run scripts/generate-candidates-json.ts
 * Requires: SUPABASE_SERVICE_ROLE_KEY env var (for storage upload)
 *
 * The JSON is uploaded to:
 *   {SUPABASE_URL}/storage/v1/object/public/data-cache/candidates-directory.json
 *
 * Clients fetch from this CDN URL (~50ms) instead of making multiple Postgres
 * round-trips on every page load.
 */

import { formatCandidateName } from '../src/lib/utils';

const SUPABASE_URL =
  process.env.VITE_SUPABASE_URL || 'https://ornnzinjrcyigazecctf.supabase.co';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!SERVICE_ROLE_KEY) {
  console.error('ERROR: SUPABASE_SERVICE_ROLE_KEY is required for storage uploads.');
  console.error('  export SUPABASE_SERVICE_ROLE_KEY=<your-service-role-key>');
  process.exit(1);
}

// ── helpers ──────────────────────────────────────────────────────────────────

function headers() {
  return {
    apikey: SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
    'Content-Type': 'application/json',
  };
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
  const candidates = [
    opts.overrideUrl,
    opts.candidateUrl,
    bioguideImageUrl(opts.candidateId),
    bioguideImageUrl(opts.personId),
  ];
  for (const v of candidates) {
    const t = v?.trim();
    if (t) return t;
  }
  return null;
}

async function rpc<T>(fnName: string): Promise<T[]> {
  const url = `${SUPABASE_URL}/rest/v1/rpc/${fnName}`;
  const res = await fetch(url, { method: 'POST', headers: headers(), body: '{}' });
  if (!res.ok) throw new Error(`RPC ${fnName} failed: ${res.status} ${await res.text()}`);
  return res.json() as Promise<T[]>;
}

async function query<T>(table: string, params: string): Promise<T[]> {
  const url = `${SUPABASE_URL}/rest/v1/${table}?${params}`;
  const res = await fetch(url, { headers: headers() });
  if (!res.ok) throw new Error(`Query ${table} failed: ${res.status} ${await res.text()}`);
  return res.json() as Promise<T[]>;
}

// ── fetch data ────────────────────────────────────────────────────────────────

interface RawCandidate {
  id: string;
  name: string;
  party: string;
  office: string;
  state: string;
  city: string | null;
  district: string | null;
  image_url: string | null;
  overall_score: number | null;
  coverage_tier: string | null;
  confidence: string | null;
  is_incumbent: boolean | null;
  score_version: string | null;
  last_updated: string | null;
  claimed_by_user_id: string | null;
  claimed_at: string | null;
  fec_candidate_id: string | null;
  last_donor_sync: string | null;
  person_id: string | null;
}

interface Override {
  candidate_id: string;
  name: string | null;
  party: string | null;
  office: string | null;
  state: string | null;
  district: string | null;
  image_url: string | null;
  overall_score: number | null;
  coverage_tier: string | null;
  confidence: string | null;
}

interface CongressMember {
  bioguide_id: string;
  name: string;
  party: string;
  office: string;
  state: string;
  district: string | null;
  image_url: string;
  is_incumbent: boolean;
  overall_score: number | null;
  coverage_tier: string;
  confidence: string;
}

function normalizeParty(p: string): 'Democrat' | 'Republican' | 'Independent' | 'Other' {
  if (p === 'Democrat' || p === 'Republican' || p === 'Independent') return p;
  return 'Other';
}

function formatName(name: string): string {
  // Use the same formatter the app renders with, so the baked CDN JSON carries
  // clean display names (FEC "LAST, FIRST MIDDLE MR." → "First Middle Last",
  // honorifics dropped, credentials moved to the end) instead of raw all-caps
  // strings that previously leaked through to the candidate list.
  return formatCandidateName(name.replace(/\s+/g, ' ').trim());
}

async function main() {
  console.log('Fetching candidates...');
  const [rawCandidates, rawOverrides, congressMembers] = await Promise.all([
    rpc<RawCandidate>('get_visible_candidates'),
    query<Override>('candidate_overrides', 'select=candidate_id,name,party,office,state,district,image_url,overall_score,coverage_tier,confidence&is_active=eq.true'),
    rpc<CongressMember>('get_all_congress_members'),
  ]);

  console.log(`  ${rawCandidates.length} candidates`);
  console.log(`  ${rawOverrides.length} overrides`);
  console.log(`  ${congressMembers.length} congress members`);

  // Apply overrides to candidates
  const overrideMap = new Map(rawOverrides.map(o => [o.candidate_id, o]));
  const candidates = rawCandidates.map(c => {
    const o = overrideMap.get(c.id);
    return {
      id: c.id,
      name: formatName(o?.name ?? c.name),
      party: normalizeParty(o?.party ?? c.party),
      office: o?.office ?? c.office,
      state: o?.state ?? c.state,
      city: c.city ?? undefined,
      district: o?.district ?? c.district,
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

  // Normalize congress members
  const congress = congressMembers.map(m => ({
    id: m.bioguide_id,
    bioguide_id: m.bioguide_id,
    name: formatName(m.name),
    party: normalizeParty(m.party),
    office: m.office,
    state: m.state,
    district: m.district,
    image_url: m.image_url || bioguideImageUrl(m.bioguide_id) || '',
    is_incumbent: m.is_incumbent,
    overall_score: m.overall_score ?? null,
    coverage_tier: m.coverage_tier,
    confidence: m.confidence,
  }));

  const payload = {
    generatedAt: new Date().toISOString(),
    version: 1,
    candidates,
    congressMembers: congress,
  };

  const json = JSON.stringify(payload);
  console.log(`Generated JSON: ${(json.length / 1024).toFixed(1)} KB`);

  // Upload to Supabase Storage
  console.log('Uploading to data-cache/candidates-directory.json...');
  const uploadUrl = `${SUPABASE_URL}/storage/v1/object/data-cache/candidates-directory.json`;
  const uploadRes = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      'Cache-Control': 'max-age=3600',
    },
    body: json,
  });

  if (!uploadRes.ok) {
    const body = await uploadRes.text();
    console.error(`Upload failed: ${uploadRes.status}`, body);
    process.exit(1);
  }

  const cdnUrl = `${SUPABASE_URL}/storage/v1/object/public/data-cache/candidates-directory.json`;
  console.log(`✓ Uploaded successfully.`);
  console.log(`  CDN URL: ${cdnUrl}`);
  console.log(`  ${candidates.length} candidates, ${congress.length} congress members`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
