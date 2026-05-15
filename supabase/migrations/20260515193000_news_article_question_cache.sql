create table if not exists public.news_articles (
  id uuid primary key default gen_random_uuid(),
  url text not null unique,
  title text not null,
  source text not null,
  published_at timestamptz not null,
  snippet text,
  created_at timestamptz not null default now()
);

create table if not exists public.news_article_questions (
  article_id uuid not null references public.news_articles(id) on delete cascade,
  question_id uuid not null references public.questions(id) on delete cascade,
  relevance_score integer not null default 0,
  matched_people text[] not null default '{}',
  matched_topics text[] not null default '{}',
  linked_at timestamptz not null default now(),
  primary key (article_id, question_id)
);

create table if not exists public.question_news_feed_cache (
  question_id uuid not null references public.questions(id) on delete cascade,
  article_id uuid not null references public.news_articles(id) on delete cascade,
  rank_score integer not null default 0,
  window_label text not null check (window_label in ('today','week','month','none')),
  last_seen_at timestamptz not null default now(),
  primary key (question_id, article_id)
);

create index if not exists idx_news_articles_published_at on public.news_articles(published_at desc);
create index if not exists idx_news_article_questions_question on public.news_article_questions(question_id);
create index if not exists idx_question_news_feed_cache_last_seen on public.question_news_feed_cache(last_seen_at desc);
