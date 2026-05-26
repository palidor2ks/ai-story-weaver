
-- Allow users to delete their own profile
CREATE POLICY "Users can delete their own profile"
  ON public.profiles FOR DELETE
  TO authenticated
  USING (auth.uid() = id);

-- Public read access for news content (civic-information app)
GRANT SELECT ON public.news_articles TO anon;
GRANT SELECT ON public.news_article_questions TO anon;
GRANT SELECT ON public.question_news_feed_cache TO anon;

CREATE POLICY "news_articles public read"
  ON public.news_articles FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "news_article_questions public read"
  ON public.news_article_questions FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "question_news_feed_cache public read"
  ON public.question_news_feed_cache FOR SELECT
  TO anon
  USING (true);

-- Public read access for share cards (used by social link unfurlers)
GRANT SELECT ON public.share_cards TO anon;

CREATE POLICY "share_cards public read"
  ON public.share_cards FOR SELECT
  TO anon
  USING (true);
