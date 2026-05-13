import { useParams, Link } from 'react-router-dom';
import { usePollBySlug, usePollTally } from '@/hooks/usePolls';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, Twitter, Facebook, Linkedin, Link as LinkIcon, ArrowLeft } from 'lucide-react';
import { Seo } from '@/components/Seo';
import { PollResults } from '@/components/poll/PollResults';
import { twitterIntent, facebookIntent, linkedinIntent, openIntent } from '@/lib/shareIntents';
import { toast } from 'sonner';

export default function PollResultsPage() {
  const { slug } = useParams<{ slug: string }>();
  const { data, isLoading } = usePollBySlug(slug);
  const poll = data?.poll;
  const questions = data?.questions || [];
  const { data: tally = [] } = usePollTally(poll?.id);

  if (isLoading) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="animate-spin" /></div>;
  }
  if (!poll) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="max-w-md"><CardContent className="pt-6 text-center">
          <p>Poll not found.</p>
          <Button asChild className="mt-4"><Link to="/">Home</Link></Button>
        </CardContent></Card>
      </div>
    );
  }

  const shareUrl = `${window.location.origin}/p/${poll.slug}`;

  return (
    <div className="min-h-screen bg-background">
      <Seo
        title={`${poll.title} — Results`}
        description={poll.description || 'Live poll results on PoliPulse'}
        path={`/p/${poll.slug}/results`}
      />
      <header className="border-b">
        <div className="container py-4 flex items-center justify-between">
          <Link to="/" className="font-display text-xl font-bold">PoliPulse</Link>
          <Button asChild variant="outline" size="sm">
            <Link to={`/p/${poll.slug}`}><ArrowLeft className="w-4 h-4 mr-1" />Vote</Link>
          </Button>
        </div>
      </header>
      <main className="container py-8 max-w-2xl space-y-6">
        <div>
          <h1 className="font-display text-2xl font-bold">{poll.title}</h1>
          {poll.description && <p className="text-muted-foreground mt-1">{poll.description}</p>}
        </div>

        <PollResults poll={poll} questions={questions} tally={tally} />

        <Card>
          <CardHeader><CardTitle>Share this poll</CardTitle></CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => openIntent(twitterIntent(poll.title, shareUrl))}>
              <Twitter className="w-4 h-4 mr-2" />X
            </Button>
            <Button variant="outline" size="sm" onClick={() => openIntent(facebookIntent(shareUrl, poll.title))}>
              <Facebook className="w-4 h-4 mr-2" />Facebook
            </Button>
            <Button variant="outline" size="sm" onClick={() => openIntent(linkedinIntent(shareUrl))}>
              <Linkedin className="w-4 h-4 mr-2" />LinkedIn
            </Button>
            <Button variant="outline" size="sm" onClick={() => {
              navigator.clipboard.writeText(shareUrl); toast.success('Link copied');
            }}>
              <LinkIcon className="w-4 h-4 mr-2" />Copy link
            </Button>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
