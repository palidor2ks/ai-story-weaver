import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ExternalLink, MessageSquare } from 'lucide-react';
import { useRepresentativeSocialFeed } from '@/hooks/useRepresentativeSocialFeed';

interface Props {
  candidateId: string;
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

export const RepresentativeSocialFeed = ({ candidateId }: Props) => {
  const { data = [], isLoading } = useRepresentativeSocialFeed(candidateId, 6);

  return (
    <Card className="shadow-elevated">
      <CardHeader className="pb-3">
        <CardTitle className="font-display flex items-center gap-2 text-lg">
          <MessageSquare className="w-5 h-5 text-primary" />
          Latest from X
          <Badge variant="secondary" className="ml-auto text-xs font-normal">
            Auto-updated
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : data.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">
            No X posts ingested yet for this representative.
          </p>
        ) : (
          <ul className="space-y-3">
            {data.map((post) => (
              <li key={post.id}>
                <a
                  href={post.post_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block p-3 rounded-lg border border-border hover:border-primary/40 hover:bg-muted/30 transition-colors"
                >
                  <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                    <span className="font-medium text-foreground">@{post.handle}</span>
                    <span>·</span>
                    <span>{timeAgo(post.posted_at)}</span>
                    <ExternalLink className="w-3 h-3 ml-auto" />
                  </div>
                  <p className="text-sm text-foreground leading-snug break-words">
                    {post.post_text || 'Open post on X'}
                  </p>
                </a>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
};
