// Mint a candidate-specific cause ("Pro Mike Rogers" / "Anti Mike Rogers") when an
// AI classifier determines a committee or donor entity exists primarily to support or
// oppose ONE specific candidate.
//
// The committee_causes taxonomy is otherwise built around issues, industries, and
// ideologies — it has no candidate-support concept — so single-candidate vehicles
// (leadership PACs, single-candidate super PACs) used to collapse into a generic
// bucket like "Pro-Business". This lets the classifier create the right cause on the
// fly and assign it as the entity's primary cause.

export interface CandidateCauseInput {
  candidate_name?: string | null;
  stance?: string | null; // 'pro' | 'anti'
  reasoning?: string | null;
}

export interface MintedCandidateCause {
  id: string;
  label: string;
  stance: 'pro' | 'anti';
}

// Candidate causes are filed under the "government" quiz topic — the same place the
// existing figure-driven causes (pro-trump / anti-trump) live. Topic ids have been
// renamed over time, so probe a couple of known spellings before falling back.
const GOVERNMENT_TOPIC_IDS = ['government-democracy', 'government'];

const cleanName = (raw: string): string =>
  raw.replace(/\s+/g, ' ').trim().replace(/[.,;:]+$/, '');

const slugify = (raw: string): string =>
  raw.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** Resolve the quiz topic candidate causes should map to, given the valid topic ids. */
export function resolveCandidateTopicId(validTopicIds: Set<string>): string | null {
  for (const id of GOVERNMENT_TOPIC_IDS) {
    if (validTopicIds.has(id)) return id;
  }
  // Fall back to any topic whose id mentions government, then to the first valid topic.
  for (const id of validTopicIds) {
    if (id.includes('government')) return id;
  }
  return validTopicIds.values().next().value ?? null;
}

/**
 * Create (or reuse) the candidate cause described by `input` and return it so the
 * caller can assign it as a primary cause. Returns null when the input isn't a usable
 * candidate cause, or when the cause already exists but was rejected by an admin (so we
 * never resurface a rejected label).
 */
export async function mintCandidateCause(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  input: CandidateCauseInput | null | undefined,
  validTopicIds: Set<string>,
): Promise<MintedCandidateCause | null> {
  if (!input) return null;
  const stance = input.stance === 'anti' ? 'anti' : input.stance === 'pro' ? 'pro' : null;
  if (!stance) return null;

  const name = cleanName(String(input.candidate_name ?? ''));
  // Guard against junk: need a real-looking name with at least one letter.
  if (name.length < 3 || name.length > 60 || !/[a-z]/i.test(name)) return null;

  const nameSlug = slugify(name);
  if (!nameSlug) return null;
  const id = `${stance}-${nameSlug}`.slice(0, 60);

  const topicId = resolveCandidateTopicId(validTopicIds);
  if (!topicId) return null;

  const label = `${stance === 'pro' ? 'Pro' : 'Anti'} ${name}`.slice(0, 80);

  // ignoreDuplicates so we never override an admin's edits/decision on an existing row.
  const { error: upsertErr } = await supabase.from('committee_causes').upsert({
    id,
    label,
    stance,
    issue: name.slice(0, 80),
    quiz_topic_id: topicId,
    description: `${stance === 'pro' ? 'Supports' : 'Opposes'} ${name}`.slice(0, 200),
    status: 'active',
    created_by: 'ai',
    ai_reasoning: String(input.reasoning ?? '').slice(0, 240),
  }, { onConflict: 'id', ignoreDuplicates: true });
  if (upsertErr) {
    console.error('mintCandidateCause upsert failed', upsertErr);
    return null;
  }

  // Read back the authoritative row: a pre-existing rejected cause must not be assigned.
  const { data: row } = await supabase
    .from('committee_causes')
    .select('id, label, status')
    .eq('id', id)
    .maybeSingle();
  if (!row || row.status === 'rejected') return null;

  return { id: row.id, label: row.label ?? label, stance };
}
