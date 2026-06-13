-- FTS retrieval function for the citation matcher.
-- Returns member_statements for a candidate ranked by full-text relevance to
-- a query string (typically the quiz question text). This supplements the
-- topic-tag pre-filter in match-answer-citations: topic tags are broad and
-- catch any economy-work statement, but a question about "AI regulation" needs
-- statements that actually use those words — FTS finds them directly.
--
-- Uses websearch_to_tsquery so natural-language question text works without
-- pre-processing (handles stopwords, quoting, +/- operators automatically).
-- The idx_member_statements_body_fts GIN index (added in 20260613000000) is
-- used automatically when the planner chooses it.

create or replace function public.search_member_statements_fts(
  p_candidate_id  text,
  p_query         text,
  p_limit         int  default 5
)
returns table (
  id            uuid,
  url           text,
  title         text,
  body_text     text,
  published_at  timestamptz
)
language sql stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select
    ms.id,
    ms.url,
    ms.title,
    ms.body_text,
    ms.published_at
  from member_statements ms
  where ms.candidate_id = p_candidate_id
    and ms.body_chars   > 200
    and to_tsvector('english',
          coalesce(ms.title, '') || ' ' || coalesce(ms.body_text, ''))
        @@ websearch_to_tsquery('english', p_query)
  order by ts_rank(
    to_tsvector('english',
      coalesce(ms.title, '') || ' ' || coalesce(ms.body_text, '')),
    websearch_to_tsquery('english', p_query)
  ) desc
  limit greatest(p_limit, 0)
$$;

revoke all on function public.search_member_statements_fts(text, text, int)
  from public, anon, authenticated;
grant execute on function public.search_member_statements_fts(text, text, int)
  to service_role;
