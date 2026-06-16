-- Restrict PUBLIC candidate visibility to visible states; admins still see everything.
--
-- Why: the product now focuses on a small set of visible states (hidden states are managed in
-- the Visible States admin panel). The dashboard display was already scoped, but the public
-- `candidates` SELECT policy was `USING (true)` — so anyone could load a hidden-state candidate
-- directly by id (/candidate/:id), embed it in a share card (/r/card/:id), or find it in the
-- sitemap (the sitemap generator reads via the anon key). This makes the visible-states gate a
-- SERVER-SIDE guarantee for the public app instead of best-effort client-side filtering.
--
-- Mechanism: replace the public SELECT policy so a row is visible when the caller is an admin
-- (`has_role`) OR the candidate's state is visible. This mirrors the client-side `isHidden()` the
-- Candidates list and Feed already use (state null or '' => visible; otherwise visible iff the
-- state is not in hidden_states — note 'US' IS in hidden_states, so national candidates are hidden
-- from the public exactly as the existing client filter already hides them). Hidden states are read
-- through `get_hidden_state_codes()` (SECURITY DEFINER, anon-executable) so the check works for
-- logged-out users regardless of hidden_states' own RLS, and the non-correlated subquery runs once.
--
-- Edge functions use the service_role key (BYPASSRLS), so ingestion is unaffected. This is the
-- public choke point: /candidate/:id and /r/card/:id both read `candidates` by id and already
-- handle a null result gracefully ("Candidate not found" / blank card), so hiding the row is all
-- that's needed. Existing data is untouched — this only changes who can SELECT it.

drop policy if exists "Candidates are viewable by everyone" on public.candidates;

create policy "Candidates are viewable by everyone"
on public.candidates
for select
to public
using (
  -- (select auth.uid()) so Postgres evaluates it once per statement (InitPlan), not per row —
  -- matches the project-wide RLS optimization (migration 20260602190001), avoids auth_rls_initplan.
  public.has_role((select auth.uid()), 'admin')
  or candidates.state is null
  or upper(candidates.state) = ''
  or upper(candidates.state) not in (
    select upper(state_code)
    from public.get_hidden_state_codes()
    where state_code is not null
  )
);
