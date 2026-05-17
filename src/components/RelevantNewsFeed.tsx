import { useRelevantNews, NewsPerson, NewsWindow } from '@/hooks/useRelevantNews';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Newspaper, Sparkles, ExternalLink } from 'lucide-react';

interface Props {
  people: NewsPerson[];
  topics?: string[];
  state?: string;
  district?: string;
  title?: string;
  maxItems?: number;
  questionIds?: string[];
}

const timeAgo = (iso: string) => {
  const diff = Date.now() - new Date(iso).getTime();
  const h = Math.floor(diff / 36e5);
  if (h < 1) return 'just now';
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
};

const windowLabel = (w: NewsWindow): string | null => {
  if (w === 'today') return 'Today';
  if (w === 'week') return 'This week';
  if (w === 'month') return 'This month';
  return null;
};

const emptyMessage = (w: NewsWindow): string => {
  if (w === 'none') return 'No relevant news found in the past month.';
  return 'No relevant news yet — check back soon.';
};

export const RelevantNewsFeed = ({
  people,
  topics = [],
  state,
  district,
  title = 'Relevant News',
  maxItems = 10,
  questionIds = [],
}: Props) => {
  const { data, isLoading } = useRelevantNews({
    people,
    topics,
    state,
    district,
    limit: maxItems,
    questionIds,
  });

  const items = data?.items ?? [];
  const win: NewsWindow = data?.window ?? 'none';
  const label = windowLabel(win);

  if (people.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Newspaper className="w-5 h-5 text-primary" />
          {title}
          {label && (
            <Badge variant="secondary" className="ml-auto text-xs font-normal">
              {label}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? (
          <>
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">{emptyMessage(win)}</p>
        ) : (
          items.map(item => (
            <a
              key={item.id}
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              className="block rounded-md border p-3 transition-colors group hover:bg-accent/40 cursor-pointer"
            >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      {item.isTopTopicHit && (
                        <Badge variant="default" className="gap-1 text-xs">
                          <Sparkles className="w-3 h-3" />
                          Top Topic
                        </Badge>
                      )}
                      {item.isNew && (
                        <Badge variant="secondary" className="text-xs">New</Badge>
                      )}
                      {item.matchedTopics.slice(0, 3).map(t => (
                        <Badge key={t} variant="outline" className="text-xs capitalize">{t}</Badge>
                      ))}
                      {item.topicLabel && (
                        <Badge variant="outline" className="text-xs">Topic: {item.topicLabel}</Badge>
                      )}
                    </div>
                    <h3 className="font-medium text-sm leading-snug group-hover:text-primary">
                      {item.title}
                    </h3>
                    {item.snippet && !item.snippet.startsWith('<') && !item.snippet.startsWith('http') && (
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{item.snippet}</p>
                    )}
                    {item.relatedQuestion && (
                      <p className="text-xs mt-1 text-muted-foreground">
                        Related question answered: <span className="font-medium text-foreground">{item.relatedQuestion}</span>
                      </p>
                    )}
                    <div className="flex items-center gap-2 text-xs text-muted-foreground mt-2">
                      <span className="font-medium">{item.source}</span>
                      <span>·</span>
                      <span>{timeAgo(item.publishedAt)}</span>
                      {item.matchedPeople.length > 0 && (
                        <>
                          <span>·</span>
                          <span className="truncate">{item.matchedPeople.slice(0, 2).join(', ')}</span>
                        </>
                      )}
                    </div>
                  </div>
                  <ExternalLink className="w-4 h-4 text-muted-foreground shrink-0 mt-1" />
                </div>
            </a>
          ))
        )}
      </CardContent>
    </Card>
  );
};
