-- Helper RPC for the resolve-stub-source-urls backfill: cursor-paged fetch of
-- candidate_answers whose source URLs still contain Gemini grounding-redirect stubs.
-- Read-only, SECURITY DEFINER (the edge function calls it with the service role).
create or replace function public.get_stub_source_answers(lim int, after_id uuid)
returns table(id uuid, source_urls text[], source_titles text[], source_url text, source_type text)
language sql
security definer
set search_path = public
as $$
  select id, source_urls, source_titles, source_url, source_type
  from candidate_answers
  where id > after_id
    and ((source_urls is not null and exists (select 1 from unnest(source_urls) u where u like '%vertexaisearch%'))
         or source_url like '%vertexaisearch%')
  order by id
  limit lim;
$$;
