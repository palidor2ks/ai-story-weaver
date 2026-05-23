DELETE FROM public.question_news_feed_cache
 WHERE article_id IN (
   SELECT id FROM public.news_articles WHERE published_at > now() - interval '60 days'
 );
DELETE FROM public.news_article_questions
 WHERE matched_topics = '{}'::text[];