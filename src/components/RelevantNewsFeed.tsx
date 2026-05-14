import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ExternalLink, Newspaper } from 'lucide-react';
import { useRelevantNews } from '@/hooks/useRelevantNews';

type RelevantNewsFeedProps = {
  title: string;
  people: string[];
  topics: string[];
  district?: string | null;
  state?: string | null;
  className?: string;
};

export function RelevantNewsFeed({ title, people, topics, district, state, className }: RelevantNewsFeedProps) {
  const { data: articles = [], isLoading } = useRelevantNews({ people, topics, district, state }, people.length > 0);

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Newspaper className="w-5 h-5" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading relevant news...</p>
        ) : articles.length === 0 ? (
          <p className="text-sm text-muted-foreground">No relevant articles right now. Check back soon.</p>
        ) : (
          <div className="space-y-3">
            {articles.map((article) => (
              <article key={article.id} className="rounded-md border p-3">
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  {article.isNew && <Badge variant="secondary">New</Badge>}
                  {article.isTopTopicHit && <Badge>Top Topic Match</Badge>}
                  <span className="text-xs text-muted-foreground">{article.source}</span>
                  <span className="text-xs text-muted-foreground">•</span>
                  <span className="text-xs text-muted-foreground">{new Date(article.publishedAt).toLocaleString()}</span>
                </div>
                <a href={article.url} target="_blank" rel="noreferrer" className="font-medium hover:underline inline-flex items-center gap-1">
                  {article.title}
                  <ExternalLink className="w-3 h-3" />
                </a>
                {article.snippet && <p className="text-sm text-muted-foreground mt-1">{article.snippet}</p>}
                {article.matchedTopics.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {article.matchedTopics.slice(0, 4).map((topic) => (
                      <Badge key={topic} variant="outline" className="text-xs">{topic}</Badge>
                    ))}
                  </div>
                )}
              </article>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
