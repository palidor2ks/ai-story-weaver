/**
 * Seed test users by replaying the real onboarding flow.
 *
 * For each of N users this script:
 *   1. Signs up an auth user with the public anon key (`auth.signUp`) — the DB
 *      trigger auto-creates the `profiles` row.
 *   2. Signs in as that user and updates their profile with a random residential
 *      address + random demographics (mirroring DemographicsForm.tsx).
 *   3. Calls `geocode-address` + `fetch-civic-officials` with the address — this is
 *      what "picks the local politician" (and auto-triggers `fetch-mayor` research
 *      for any uncached city).
 *   4. Picks 3 random federal topics + 2 random local topics, then answers their
 *      canonical onboarding questions with random options.
 *   5. Computes scores exactly like src/lib/scoring.ts and saves via the same
 *      `save_user_topics` / `save_quiz_results` RPCs the UI uses.
 *
 * Everything happens through normal RLS as the signed-in user (no service-role key).
 *
 * Run:  bunx tsx scripts/seed-test-users.ts
 * Re-runnable: existing seed users are detected and their onboarding is skipped if
 * already complete.
 */
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// ---------- env ----------
function loadEnv() {
  const env: Record<string, string> = { ...process.env } as Record<string, string>;
  try {
    const raw = readFileSync(new URL('../.env', import.meta.url), 'utf8');
    for (const line of raw.split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !env[m[1]]) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  } catch { /* .env optional if vars already exported */ }
  return env;
}
const ENV = loadEnv();
const SUPABASE_URL = ENV.VITE_SUPABASE_URL || ENV.SUPABASE_URL;
const ANON_KEY = ENV.VITE_SUPABASE_PUBLISHABLE_KEY || ENV.SUPABASE_ANON_KEY;
if (!SUPABASE_URL || !ANON_KEY) {
  console.error('Missing VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY (.env or env).');
  process.exit(1);
}

const USER_COUNT = Number(ENV.SEED_USER_COUNT || 20);
const EMAIL_PREFIX = 'polipulse-seed-';
const EMAIL_DOMAIN = 'example.com';
// No hardcoded credentials: set SEED_USER_PASSWORD to give every seed user the same
// (known) password, otherwise each user gets a throwaway random one. These are
// disposable test accounts on example.com; data is protected per-user by RLS.
const SEED_PASSWORD = ENV.SEED_USER_PASSWORD || '';

// ---------- random helpers ----------
const rand = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
const sample = <T>(arr: T[], n: number): T[] => shuffle(arr).slice(0, n);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ---------- seed data ----------
// Real residential / civic streets across NC + NJ. Mix of cities that already have
// seeded local officials (instant resolution) and ones that exercise the on-demand
// fetch-mayor research path. NJ-weighted where ward precision matters most.
const ADDRESSES = [
  '120 Stelton Rd, Piscataway, NJ 08854',
  '317 Hoes Ln, Piscataway, NJ 08854',
  '920 Broad St, Newark, NJ 07102',
  '50 Springfield Ave, Newark, NJ 07103',
  '263 Central Ave, Jersey City, NJ 07307',
  '180 Sip Ave, Jersey City, NJ 07306',
  '100 Municipal Blvd, Edison, NJ 08817',
  '319 E State St, Trenton, NJ 08608',
  '155 Broadway, Paterson, NJ 07505',
  '50 Winans Ave, Elizabeth, NJ 07202',
  '600 E 4th St, Charlotte, NC 28202',
  '2300 Selwyn Ave, Charlotte, NC 28207',
  '101 City Hall Plaza, Durham, NC 27701',
  '300 W Washington St, Greensboro, NC 27401',
  '222 W Hargett St, Raleigh, NC 27601',
  '101 N Main St, Winston-Salem, NC 27101',
  '70 Court Plaza, Asheville, NC 28801',
  '305 Chestnut St, Wilmington, NC 28401',
  '316 Pittsboro St, Chapel Hill, NC 27516',
  '316 N Academy St, Cary, NC 27513',
];

const FIRST_NAMES = ['Alex', 'Jordan', 'Taylor', 'Morgan', 'Casey', 'Riley', 'Jamie', 'Avery',
  'Quinn', 'Cameron', 'Drew', 'Sam', 'Reese', 'Skyler', 'Devon', 'Harper', 'Rowan', 'Emerson',
  'Parker', 'Sage'];
const LAST_NAMES = ['Rivera', 'Chen', 'Patel', 'Johnson', 'Nguyen', 'Garcia', 'Smith', 'Kim',
  'Brooks', 'Okafor', 'Rossi', 'Cohen', 'Murphy', 'Diaz', 'Walsh', 'Hassan', 'Park', 'Flores',
  'Bauer', 'Ahmed'];

// Demographic option sets copied verbatim from src/components/DemographicsForm.tsx + religionOptions.ts
const POLITICAL_PARTIES = ['Democrat', 'Republican', 'Independent', 'Libertarian', 'Green Party', 'Other', 'Prefer not to say'];
const INCOME_RANGES = ['Under $50,000', '$50,000 - $100,000', '$100,000 - $200,000', '$200,000 - $500,000', '$500,000 - $1M', '$1M - $5M', '$5M - $20M', '$20M - $100M', 'Over $100M', 'Prefer not to say'];
const EMPLOYMENT_STATUSES = ['Self-employed', 'Employed (1 job)', 'Employed (multiple jobs)', 'Part-time employed', 'Student', 'Prefer not to say'];
const SEX_OPTIONS = ['Male', 'Female', 'Non-binary', 'Other', 'Prefer not to say'];
const EDUCATION_LEVELS = ['Less than high school', 'High school diploma or GED', 'Some college', 'Associate degree', "Bachelor's degree", "Master's degree", 'Doctorate or professional degree', 'Prefer not to say'];
const RACE_OPTIONS = ['American Indian or Alaska Native', 'Asian', 'Black or African American', 'Hispanic or Latino', 'Middle Eastern or North African', 'Native Hawaiian or Other Pacific Islander', 'White', 'Multiracial', 'Other', 'Prefer not to say'];
const RELIGIONS = ['Catholic', 'Baptist', 'Non-denominational Christian', 'Sunni', 'Reform Jewish', 'Zen', 'Hinduism (General)', 'Sikhism', 'Atheist', 'Agnostic', 'None', 'Spiritual but not religious'];

interface Demographics {
  political_party: string; age: number; income: string; employment_status: string;
  sex: string; religion: string; education_level: string; race: string;
}
function randomDemographics(): Demographics {
  return {
    political_party: rand(POLITICAL_PARTIES),
    age: 18 + Math.floor(Math.random() * 73), // 18..90
    income: rand(INCOME_RANGES),
    employment_status: rand(EMPLOYMENT_STATUSES),
    sex: rand(SEX_OPTIONS),
    religion: rand(RELIGIONS),
    education_level: rand(EDUCATION_LEVELS),
    race: rand(RACE_OPTIONS),
  };
}

// ---------- scoring (mirror of src/lib/scoring.ts) ----------
const round2 = (n: number) => Math.round(n * 100) / 100;
function topicAverage(values: number[]): number {
  return round2(values.reduce((a, b) => a + b, 0) / values.length);
}
function weightedOverall(topicScores: { topicId: string; score: number }[], weights: Map<string, number>): number {
  let ws = 0, tw = 0;
  for (const ts of topicScores) {
    const w = weights.get(ts.topicId) ?? 1;
    ws += ts.score * w; tw += w;
  }
  return tw === 0 ? 0 : round2(ws / tw);
}

// ---------- types for DB rows ----------
interface TopicRow { id: string; name: string; scope: string }
interface QuestionRow { id: string; topic_id: string }
interface OptionRow { id: string; question_id: string; value: number; is_skip_option: boolean | null }

async function loadQuizCatalog(db: SupabaseClient) {
  const { data: topics, error: tErr } = await db.from('topics').select('id, name, scope');
  if (tErr) throw tErr;
  const { data: questions, error: qErr } = await db
    .from('questions').select('id, topic_id').eq('is_onboarding_canonical', true);
  if (qErr) throw qErr;
  const qById = new Map<string, QuestionRow>();
  const topicsWithQuestions = new Set<string>();
  for (const q of (questions ?? []) as QuestionRow[]) {
    qById.set(q.id, q);
    topicsWithQuestions.add(q.topic_id);
  }
  const { data: options, error: oErr } = await db
    .from('question_options').select('id, question_id, value, is_skip_option')
    .in('question_id', Array.from(qById.keys()));
  if (oErr) throw oErr;
  const optsByQuestion = new Map<string, OptionRow[]>();
  for (const o of (options ?? []) as OptionRow[]) {
    const list = optsByQuestion.get(o.question_id) ?? [];
    list.push(o);
    optsByQuestion.set(o.question_id, list);
  }
  const tArr = (topics ?? []) as TopicRow[];
  return {
    federal: tArr.filter((t) => t.scope !== 'local' && topicsWithQuestions.has(t.id)),
    local: tArr.filter((t) => t.scope === 'local' && topicsWithQuestions.has(t.id)),
    questions: (questions ?? []) as QuestionRow[],
    optsByQuestion,
  };
}

type Catalog = Awaited<ReturnType<typeof loadQuizCatalog>>;

// Build a randomized set of answers + scores for a user.
function buildOnboarding(cat: Catalog) {
  const fedTopics = sample(cat.federal, Math.min(3, cat.federal.length));
  const localTopics = sample(cat.local, Math.min(2, cat.local.length));
  const ordered = [...fedTopics, ...localTopics]; // weights 5,4,3,2,1 by order
  const WEIGHTS = [5, 4, 3, 2, 1];
  const weightMap = new Map<string, number>();
  ordered.forEach((t, i) => weightMap.set(t.id, WEIGHTS[i] ?? 1));
  const selectedIds = new Set(ordered.map((t) => t.id));

  const answers: { questionId: string; selectedOptionId: string; value: number }[] = [];
  const scorableByTopic = new Map<string, number[]>();

  for (const q of cat.questions) {
    if (!selectedIds.has(q.topic_id)) continue;
    const opts = cat.optsByQuestion.get(q.id) ?? [];
    if (opts.length === 0) continue;
    const realOpts = opts.filter((o) => !o.is_skip_option);
    const skipOpt = opts.find((o) => o.is_skip_option);
    // ~8% chance to mark "not important" when a skip option exists
    const useSkip = skipOpt && Math.random() < 0.08;
    const chosen = useSkip ? skipOpt! : rand(realOpts.length ? realOpts : opts);
    answers.push({ questionId: q.id, selectedOptionId: chosen.id, value: chosen.value });
    if (!useSkip) {
      const list = scorableByTopic.get(q.topic_id) ?? [];
      list.push(chosen.value);
      scorableByTopic.set(q.topic_id, list);
    }
  }

  const topicScores = Array.from(scorableByTopic.entries())
    .map(([topicId, values]) => ({ topicId, score: topicAverage(values) }));
  const overall = weightedOverall(topicScores, weightMap);

  return {
    topicIdsOrdered: ordered.map((t) => t.id),
    topicNames: ordered.map((t) => t.name),
    answers,
    topicScores,
    overall,
  };
}

function newClient(): SupabaseClient {
  return createClient(SUPABASE_URL!, ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

interface UserResult {
  email: string; address: string; status: string;
  localPolitician?: string; ward?: string | null; overall?: number;
}

async function resolveLocalPolitician(db: SupabaseClient, address: string) {
  const { data: geo } = await db.functions.invoke('geocode-address', { body: { address } });
  const civicBody = {
    address, includeFederalLegislative: false,
    lat: geo?.lat ?? undefined, lng: geo?.lng ?? undefined,
    state: geo?.state ?? undefined, city: geo?.city ?? undefined,
  };
  let local: Array<{ name: string; office: string; party?: string }> = [];
  let ward: string | null = null;
  // First call (may auto-trigger fetch-mayor for uncached cities); poll a couple times.
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data } = await db.functions.invoke('fetch-civic-officials', { body: civicBody });
    local = data?.local ?? [];
    ward = data?.userWard ?? null;
    if (local.length > 0) break;
    if (attempt < 2) await sleep(12_000); // let fetch-mayor research land
  }
  const mayor = local.find((o) => /mayor/i.test(o.office));
  const pick = mayor ?? local[0];
  const label = pick
    ? `${pick.name} (${pick.office}${pick.party ? `, ${pick.party}` : ''})`
    : 'local research triggered (pending)';
  return { label, ward, geoState: geo?.state ?? null, geoCity: geo?.city ?? null };
}

async function seedOne(i: number, cat: Catalog): Promise<UserResult> {
  const nn = String(i + 1).padStart(2, '0');
  const email = `${EMAIL_PREFIX}${nn}@${EMAIL_DOMAIN}`;
  const password = SEED_PASSWORD || `seed-${nn}-${randomUUID()}`;
  const name = `${rand(FIRST_NAMES)} ${rand(LAST_NAMES)}`;
  const address = ADDRESSES[i % ADDRESSES.length];
  const result: UserResult = { email, address, status: '' };

  const db = newClient();

  // 1. Sign up (idempotent: "already registered" -> just sign in)
  const { data: signUpData, error: signUpErr } = await db.auth.signUp({
    email, password, options: { data: { name } },
  });
  let session = signUpData?.session ?? null;

  if (signUpErr && !/already registered|already been registered/i.test(signUpErr.message)) {
    result.status = `signup failed: ${signUpErr.message}`;
    return result;
  }

  // 2. Ensure a session
  if (!session) {
    const { data: signInData, error: signInErr } = await db.auth.signInWithPassword({ email, password });
    if (signInErr) {
      result.status = /not confirmed/i.test(signInErr.message)
        ? 'created, EMAIL NOT CONFIRMED (run MCP confirm + rerun)'
        : `signin failed: ${signInErr.message}`;
      return result;
    }
    session = signInData.session;
  }
  const userId = session!.user.id;

  // Skip onboarding if this user already has quiz answers (idempotent rerun)
  const { count } = await db.from('quiz_answers').select('id', { count: 'exact', head: true }).eq('user_id', userId);
  const alreadyOnboarded = (count ?? 0) > 0;

  // 3. Profile demographics + address
  const demo = randomDemographics();
  const cityState = address.split(',').slice(-2).join(',').trim();
  const { error: profErr } = await db.from('profiles').update({
    name, address, location: cityState, ...demo,
  }).eq('id', userId);
  if (profErr) { result.status = `profile update failed: ${profErr.message}`; return result; }

  // 4. Resolve the local politician from the address
  const civic = await resolveLocalPolitician(db, address);
  result.localPolitician = civic.label;
  result.ward = civic.ward;

  if (alreadyOnboarded) {
    result.status = 'already onboarded (profile + reps refreshed)';
    await db.auth.signOut();
    return result;
  }

  // 5. Topics + randomized quiz answers + scores
  const ob = buildOnboarding(cat);
  if (ob.answers.length === 0) { result.status = 'no canonical questions for selected topics'; await db.auth.signOut(); return result; }

  const { error: topicsErr } = await db.rpc('save_user_topics', {
    p_user_id: userId,
    p_topics: ob.topicIdsOrdered.map((id, idx) => ({ topic_id: id, weight: [5, 4, 3, 2, 1][idx] ?? 1 })),
  });
  if (topicsErr) { result.status = `save_user_topics failed: ${topicsErr.message}`; await db.auth.signOut(); return result; }

  const { error: quizErr } = await db.rpc('save_quiz_results', {
    p_user_id: userId,
    p_overall_score: ob.overall,
    p_topic_scores: ob.topicScores,
    p_answers: ob.answers,
  });
  if (quizErr) { result.status = `save_quiz_results failed: ${quizErr.message}`; await db.auth.signOut(); return result; }

  result.overall = ob.overall;
  result.status = `onboarded (${ob.answers.length} answers, topics: ${ob.topicNames.join(', ')})`;
  await db.auth.signOut();
  return result;
}

async function main() {
  console.log(`Seeding ${USER_COUNT} test users against ${SUPABASE_URL}\n`);
  const cat = await loadQuizCatalog(newClient());
  console.log(`Catalog: ${cat.federal.length} federal topics, ${cat.local.length} local topics, ${cat.questions.length} canonical questions.\n`);

  const results: UserResult[] = [];
  for (let i = 0; i < USER_COUNT; i++) {
    try {
      const r = await seedOne(i, cat);
      results.push(r);
      console.log(`#${String(i + 1).padStart(2, '0')} ${r.email} | ${r.address}`);
      console.log(`     local: ${r.localPolitician ?? '-'}${r.ward ? ` [${r.ward}]` : ''} | overall: ${r.overall ?? '-'} | ${r.status}`);
    } catch (e) {
      results.push({ email: `${EMAIL_PREFIX}${i + 1}`, address: ADDRESSES[i % ADDRESSES.length], status: `error: ${(e as Error).message}` });
      console.error(`#${i + 1} error:`, (e as Error).message);
    }
  }

  const ok = results.filter((r) => /onboarded/.test(r.status)).length;
  const needConfirm = results.filter((r) => /NOT CONFIRMED/.test(r.status));
  console.log(`\nDone. ${ok}/${USER_COUNT} onboarded.`);
  if (needConfirm.length) {
    console.log(`\n${needConfirm.length} users need email confirmation. Run this SQL (Supabase MCP), then re-run the script:`);
    console.log(`  UPDATE auth.users SET email_confirmed_at = now()\n  WHERE email LIKE '${EMAIL_PREFIX}%@${EMAIL_DOMAIN}' AND email_confirmed_at IS NULL;`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
