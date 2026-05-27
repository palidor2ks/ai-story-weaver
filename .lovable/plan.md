# Plan: Representative X feed on candidate profiles

Adopt the substance of PR #101 (read-only X feed card on `CandidateProfile`) with fixes for the project's conventions and add the missing ingestion path so the section isn't permanently empty.

## 1. Database — `representative_social_posts`

New migration `supabase/migrations/<ts>_add_representative_social_posts.sql`:

- Table columns:
  - `id uuid pk default gen_random_uuid()`
  - `candidate_id uuid not null references public.candidates(id) on delete cascade` *(replaces PR's free-text slug — we already have stable IDs)*
  - `platform text not null default 'x' check (platform in ('x'))`
  - `handle text not null`
  - `post_id text not null`
  - `post_url text not null`
  - `post_text text`
  - `posted_at timestamptz not null`
  - `fetched_at timestamptz not null default now()`
  - `metadata jsonb not null default '{}'::jsonb`
  - `created_at timestamptz not null default now()`
  - `unique (platform, post_id)`
- Index: `(candidate_id, posted_at desc)`
- **GRANTs (required by project rules):**
  ```sql
  GRANT SELECT ON public.representative_social_posts TO anon, authenticated;
  GRANT ALL ON public.representative_social_posts TO service_role;
  ```
- RLS:
  - Enable RLS
  - `SELECT` policy `USING (true)` (public read)
  - `ALL` policy for authenticated `WHERE public.has_role(auth.uid(), 'admin'::app_role)` (admin write)

## 2. Ingestion — new edge function `sync-representative-x-posts`

`supabase/functions/sync-representative-x-posts/index.ts`:

- Admin-only invocation (check `has_role`).
- Inputs: optional `candidate_id` (single) or batch mode (all candidates with an `x_handle`).
- For each candidate, call X API v2 `users/by/username/{handle}/tweets` using existing X credentials (reuse the secret already wired for `XComposer` / `XConnectCallback`; if a separate read token is needed, add via `secrets`).
- Upsert into `representative_social_posts` on `(platform, post_id)` with `candidate_id` from the candidate row.
- Background batch via `EdgeRuntime.waitUntil()` with backoff on 429.
- Add a small admin trigger button (later — out of scope for this PR's UI, but expose a way to run it manually from Admin → Sync panel).

Prereq: ensure `candidates` has an `x_handle` (or equivalent) column. If missing, add it in the same migration and surface in `CandidateEditDialog`.

## 3. Frontend — adopt PR components with fixes

### `src/hooks/useRepresentativeSocialFeed.ts`
- Switch signature to `useRepresentativeSocialFeed(candidateId?: string, limit = 6)`.
- Drop `getRepresentativeSlug` helper.
- Query by `.eq('candidate_id', candidateId)`.
- Remove `(supabase as any)` cast after regenerating Supabase types from the migration.

### `src/components/RepresentativeSocialFeed.tsx`
- Props: `{ candidateId: string }`.
- Keep card + skeleton + empty state + time-ago.
- **Fix link rendering** (the PR diff shows `post.post_url` literalized in href): each item is an anchor with `href={post.post_url}`, `target="_blank"`, `rel="noopener noreferrer"`, `ExternalLink` icon, `@{handle}`, `timeAgo(posted_at)`, and `post_text`.
- Use semantic tokens only (no raw colors).

### `src/pages/CandidateProfile.tsx`
- Render `<RepresentativeSocialFeed candidateId={candidate.id} />` in the same slot the PR chose (above "Latest News").
- Only render when `candidate.x_handle` exists (or always render — empty state is benign).

## 4. Types
- After migration applies, regenerate `src/integrations/supabase/types.ts` so the hook can drop the `as any` cast.

## 5. Out of scope (follow-ups)
- Cron schedule for the sync function.
- Caching/dedupe of tweet media.
- Other platforms (Facebook, Instagram).

## Technical notes
- The Supabase Bot failure on the PR (`candidate_committees_candidate_id_fkey already exists`) is unrelated to this change and pre-exists on the branch DB — no action here.
- Keying by `candidate_id` eliminates the name/state/district slug drift risk that exists in the PR as-written.
- Public SELECT + GRANTs are the only way the card renders for signed-out visitors; without GRANTs PostgREST returns permission errors regardless of RLS.
