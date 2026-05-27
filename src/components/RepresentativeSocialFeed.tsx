import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ExternalLink, MessageSquare } from 'lucide-react';
import { getRepresentativeSlug, useRepresentativeSocialFeed } from '@/hooks/useRepresentativeSocialFeed';

interface Props {
  candidateName: string;
  state?: string;
  district?: string;
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

export const RepresentativeSocialFeed = ({ candidateName, state, district }: Props) => {
  const representativeSlug = getRepresentativeSlug(candidateName, state, district);
  const { data = [], isLoading } = useRepresentativeSocialFeed(representativeSlug, 6);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <MessageSquare className="w-5 h-5 text-primary" />
          Latest from X
          <Badge variant="secondary" className="ml-auto text-xs font-normal">Auto-updated</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? (
          <>
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </>
        ) : data.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            No X posts ingested yet for this representative.
          </p>
        ) : (
          data.map((post) => (
            <a
              key={post.id}
              href={post.post_url}
              target="_blank"
              rel="noopener noreferrer"
              className="block rounded-md border p-3 transition-colors group hover:bg-accent/40 cursor-pointer"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge variant="outline" className="text-xs">@{post.handle}</Badge>
                    <span className="text-xs text-muted-foreground">{timeAgo(post.posted_at)}</span>
                  </div>
                  <p className="text-sm leading-snug whitespace-pre-wrap line-clamp-4">
                    {post.post_text || 'Open post on X'}
                  </p>
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
