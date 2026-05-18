import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { usePollBySlug, usePollTally } from '@/hooks/usePolls';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, CheckCircle2, Twitter, Facebook, Linkedin, Link as LinkIcon } from 'lucide-react';
import { Seo } from '@/components/Seo';
import { toast } from 'sonner';
import { twitterIntent, facebookIntent, linkedinIntent, openIntent } from '@/lib/shareIntents';
import { cn } from '@/lib/utils';
import { PollResults } from '@/components/poll/PollResults';

const ANON_KEY = 'polipulse_anon_session_id';

function getAnonSessionId(): string {
  let id = localStorage.getItem(ANON_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(ANON_KEY, id);
  }
  return id;
}

export default function Poll() {
  const { slug } = useParams<{ slug: string }>();
  const { user } = useAuth();
  const { data, isLoading } = usePollBySlug(slug);
  const [answers, setAnswers] = useState<Record<string, string>>({}); // questionId -> optionId
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const poll = data?.poll;
  const questions = data?.questions || [];
  const { data: tally = [] } = usePollTally(submitted ? poll?.id : undefined);

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
  if (poll.status !== 'published') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="max-w-md"><CardContent className="pt-6 text-center">
          <p>This poll isn't available right now.</p>
        </CardContent></Card>
      </div>
    );
  }

  const allAnswered = questions.every((q: any) => answers[q.question_id]);

  const handleSubmit = async () => {
    if (!allAnswered) return toast.error('Please answer all questions');
    setSubmitting(true);
    try {
      const anonId = getAnonSessionId();
      const payload = questions.map((pq: any) => {
        const opt = (pq.questions?.question_options || []).find((o: any) => o.id === answers[pq.question_id]);
        return {
          question_id: pq.question_id,
          selected_option_id: answers[pq.question_id],
          value: opt?.value ?? 0,
        };
      });

      const { error } = await supabase.rpc('submit_poll_response', {
        p_poll_id: poll.id,
        p_anon_session_id: user ? null : anonId,
        p_referrer: document.referrer || null,
        p_user_agent: navigator.userAgent.slice(0, 200),
        p_answers: payload,
      });
      if (error) throw error;

      setSubmitted(true);
      toast.success('Thanks for voting!');
    } catch (e: any) {
      toast.error(e.message || 'Submit failed');
    } finally {
      setSubmitting(false);
    }
  };

  const shareUrl = `${window.location.origin}/p/${poll.slug}`;
  const shareText = poll.title;

  return (
    <div className="min-h-screen bg-background">
      <Seo
        title={`${poll.title} — PoliPulse Poll`}
        description={poll.description || 'Take this PoliPulse poll'}
        path={`/p/${poll.slug}`}
      />

      <header className="border-b">
        <div className="container py-4 flex items-center justify-between">
          <Link to="/" className="font-display text-xl font-bold">PoliPulse</Link>
          {!user && (
            <Button asChild variant="outline" size="sm"><Link to="/auth">Sign in</Link></Button>
          )}
        </div>
      </header>

      <main className="container py-8 max-w-2xl">
        <Card>
          <CardHeader>
            <CardTitle className="font-display text-2xl">{poll.title}</CardTitle>
            {poll.description && <CardDescription>{poll.description}</CardDescription>}
          </CardHeader>
          <CardContent className="space-y-6">
            {!submitted && questions.map((pq: any, idx: number) => {
              const q = pq.questions;
              const opts = (q.question_options || []).slice().sort((a: any, b: any) => (a.display_order ?? 0) - (b.display_order ?? 0));
              return (
                <div key={pq.id}>
                  <p className="font-medium mb-3">
                    {questions.length > 1 && <span className="text-muted-foreground mr-2">{idx + 1}.</span>}
                    {q.text}
                  </p>
                  <div className="space-y-2">
                    {opts.map((o: any) => {
                      const selected = answers[q.id] === o.id;
                      return (
                        <button
                          key={o.id}
                          onClick={() => setAnswers(a => ({ ...a, [q.id]: o.id }))}
                          className={cn(
                            'w-full text-left rounded-lg border p-3 transition',
                            selected ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'
                          )}
                        >
                          <span className="flex items-center gap-2">
                            {selected && <CheckCircle2 className="w-4 h-4 text-primary" />}
                            {o.text}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}

            {!submitted && (
              <>
                <Button className="w-full" size="lg" onClick={handleSubmit} disabled={!allAnswered || submitting}>
                  {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Submit
                </Button>
                <div className="text-center">
                  <Link to={`/p/${poll.slug}/results`} className="text-sm text-muted-foreground hover:text-primary underline-offset-4 hover:underline">
                    View results without voting →
                  </Link>
                </div>
              </>
            )}

            {submitted && (
              <PollResults poll={poll} questions={questions} tally={tally} userAnswers={answers} />
            )}
          </CardContent>
        </Card>

        {submitted && (
          <>
            <Card className="mt-6">
              <CardHeader>
                <CardTitle>Share this poll</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={() => openIntent(twitterIntent(shareText, shareUrl))}>
                  <Twitter className="w-4 h-4 mr-2" />X
                </Button>
                <Button variant="outline" size="sm" onClick={() => openIntent(facebookIntent(shareUrl, shareText))}>
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

            {!user && <PollSignupPrompt anonSessionId={getAnonSessionId()} pollType={poll.type} />}
          </>
        )}
      </main>
    </div>
  );
}

function PollSignupPrompt({ anonSessionId, pollType }: { anonSessionId: string; pollType: string }) {
  const [busy, setBusy] = useState(false);

  const handleGoogle = async () => {
    setBusy(true);
    // Persist anon id so we can claim after redirect
    localStorage.setItem('polipulse_pending_claim', anonSessionId);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/` },
    });
    if (error) {
      toast.error(error.message);
      setBusy(false);
    }
  };

  return (
    <Card className="mt-6 border-primary/30 bg-primary/5">
      <CardHeader>
        <CardTitle>See how you compare to candidates</CardTitle>
        <CardDescription>
          {pollType === 'mc'
            ? 'Create a free PoliPulse account to track polls and see your political profile.'
            : 'Your answer is saved. Sign up and we\'ll match you to candidates and parties — your answer counts toward your profile.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        <Button className="w-full" onClick={handleGoogle} disabled={busy}>
          {busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
          Continue with Google
        </Button>
        <Button asChild variant="outline" className="w-full">
          <Link to="/auth" onClick={() => localStorage.setItem('polipulse_pending_claim', anonSessionId)}>
            Sign up with email
          </Link>
        </Button>
        <p className="text-xs text-muted-foreground text-center pt-2">
          Facebook & X sign-in coming soon.
        </p>
      </CardContent>
    </Card>
  );
}
