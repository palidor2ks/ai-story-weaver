# Fix "new row violates row-level security policy" on poll submission

## Root cause

When a user (typically anonymous) submits a poll, `src/pages/Poll.tsx` does:

```ts
supabase.from('poll_responses').insert({...}).select().single();
```

The current INSERT policy on `poll_responses` has WITH CHECK:

```sql
EXISTS (SELECT 1 FROM polls p WHERE p.id = poll_id AND p.status = 'published')
```

That subquery is evaluated under the caller's RLS context against `polls`, which is OK for published polls. However the *follow-up* steps and edge conditions break in practice:

1. `.select().single()` after insert triggers RLS evaluation under the SELECT policy `user_id = auth.uid() OR has_role(...,'admin')`. For anonymous users, the new row has `user_id = NULL` and `auth.uid()` is NULL, so `NULL = NULL` → NULL (falsy) and the row is not visible. Combined with `Prefer: return=representation`, PostgREST surfaces this as an RLS policy error to the client.
2. The second insert into `poll_response_answers` depends on the returned `respRow.id`, so even when step 1 quietly fails the user sees the RLS error from step 1.
3. There's also no atomicity between the two inserts today — a partial submission can leak orphan rows.

## Plan

### 1. Add a SECURITY DEFINER RPC that submits both rows in one transaction

New migration creating `public.submit_poll_response(p_poll_id uuid, p_anon_session_id text, p_referrer text, p_user_agent text, p_answers jsonb) returns uuid`.

Behavior:
- Reject if poll doesn't exist or `status <> 'published'`.
- Validate `p_answers` shape (array of `{question_id, selected_option_id, value}`) and that every `question_id` belongs to `poll_questions` for this poll.
- Insert one `poll_responses` row (`user_id = auth.uid()`, `anon_session_id = NULLIF(auth.uid()::text, '') IS NULL ? p_anon_session_id : NULL`), then bulk-insert `poll_response_answers`.
- If the user is authenticated and poll type is `scored`/`mini_quiz`, also upsert into `quiz_answers` (mirrors current client behavior).
- Return the new response id.
- `SET search_path = public`, `SECURITY DEFINER`, `GRANT EXECUTE TO anon, authenticated`.

Why SECURITY DEFINER: lets us bypass the SELECT-after-insert visibility problem and removes the need for the client to do two RLS-checked inserts.

### 2. Fix the SELECT policy so the row remains visible to its submitter

Update `Users see own responses, admins see all` on `poll_responses` so anon submitters can still see their row (useful for future "view your answer" flows and any client code that still does `.select()` after insert):

```sql
USING (
  (user_id IS NOT NULL AND user_id = auth.uid())
  OR (anon_session_id IS NOT NULL AND anon_session_id = current_setting('request.headers', true)::json->>'x-anon-session-id')
  OR public.has_role(auth.uid(), 'admin')
)
```

(If injecting the header is undesirable we instead just leave the policy as-is — the new RPC means the client no longer needs SELECT-after-insert. Default to "just rely on the RPC" and keep the policy untouched unless we want the broader fix. I'll go with the simpler option: **leave the SELECT policy alone**, since the RPC removes the need for it.)

### 3. Update the client to use the RPC

In `src/pages/Poll.tsx` `handleSubmit`, replace the two `.insert(...)` calls with a single:

```ts
const { data: responseId, error } = await supabase.rpc('submit_poll_response', {
  p_poll_id: poll.id,
  p_anon_session_id: user ? null : getAnonSessionId(),
  p_referrer: document.referrer || null,
  p_user_agent: navigator.userAgent.slice(0, 200),
  p_answers: questions.map((pq: any) => {
    const opt = (pq.questions?.question_options || []).find((o: any) => o.id === answers[pq.question_id]);
    return {
      question_id: pq.question_id,
      selected_option_id: answers[pq.question_id],
      value: opt?.value ?? 0,
    };
  }),
});
```

Drop the separate `poll_response_answers` insert and the separate `quiz_answers` insert (the RPC handles both). Keep the `setSubmitted(true)` / toast logic unchanged.

### 4. Verify

- Submit a poll while logged out → expect 200, row appears in `poll_responses` + `poll_response_answers`.
- Submit while logged in → same, plus `quiz_answers` upserted for scored polls.
- Submit against a draft/closed poll id → expect RPC to raise "Poll not available".
- Check Supabase postgres logs no longer show the RLS error from `poll_responses`.

## Out of scope

- No UI redesign of the poll page.
- No changes to admin policies or tally function.
- No changes to `claim_anon_poll_responses` (still works for the post-signup claim flow).
