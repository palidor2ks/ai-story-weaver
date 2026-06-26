import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Header } from '@/components/Header';
import { Seo } from '@/components/Seo';
import { supabase } from '@/integrations/supabase/client';
import { TOPIC_DESCRIPTIONS } from '@/lib/topicDescriptions';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface Topic {
  id: string;
  name: string;
  icon: string;
  scope: string;
}

interface Poll {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  topic_id: string | null;
  published_at: string | null;
}

const FAQS = [
  {
    q: 'What are political issues today?',
    a: 'The most-discussed political issues today fall into eleven policy areas Pulse tracks: the economy and work, healthcare and the safety net, environment and energy, national security and borders, civil rights and justice, government and democracy, plus five local issues — cost of living, education, housing, public health, and public safety. Each issue page summarizes where parties and candidates stand and lets you take a personalized alignment quiz.',
  },
  {
    q: 'How do I find out my political views on the issues?',
    a: 'Take the Pulse political alignment quiz. It asks short, plain-English questions about each major policy area and matches your answers to the public records, votes, and statements of real candidates and parties.',
  },
  {
    q: 'Where can I see live political polls?',
    a: 'Pulse publishes ongoing public-opinion polls on current political issues. Each poll shows live aggregate results and lets you compare your view against the rest of the audience.',
  },
];

export default function Issues() {
  const { data: topics = [] } = useQuery({
    queryKey: ['issues', 'topics'],
    queryFn: async (): Promise<Topic[]> => {
      const { data, error } = await supabase
        .from('topics')
        .select('id,name,icon,scope')
        .order('scope', { ascending: true })
        .order('name', { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: polls = [] } = useQuery({
    queryKey: ['issues', 'polls'],
    queryFn: async (): Promise<Poll[]> => {
      const { data, error } = await supabase
        .from('polls')
        .select('id,slug,title,description,topic_id,published_at')
        .eq('status', 'published')
        .order('published_at', { ascending: false })
        .limit(24);
      if (error) throw error;
      return data ?? [];
    },
  });

  const federal = topics.filter((t) => t.scope !== 'local');
  const local = topics.filter((t) => t.scope === 'local');

  const jsonLd = [
    {
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      name: 'Political Issues & Polls',
      description:
        'Directory of today’s political issues and active public-opinion polls, with plain-English summaries and a personalized alignment quiz.',
      url: 'https://www.polipulseapp.com/issues',
    },
    {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: FAQS.map((f) => ({
        '@type': 'Question',
        name: f.q,
        acceptedAnswer: { '@type': 'Answer', text: f.a },
      })),
    },
  ];

  return (
    <div className="min-h-screen bg-background">
      <Seo
        title="Political Issues & Polls — Pulse"
        description="Browse today’s political issues, take live polls, and see how your views align with parties and candidates on every major policy area."
        path="/issues"
        jsonLd={jsonLd}
      />
      <Header />
      <main className="container mx-auto py-10 max-w-5xl">
        <section className="mb-10">
          <h1 className="font-display text-4xl md:text-5xl font-bold text-foreground mb-3">
            Political issues today
          </h1>
          <p className="text-lg text-muted-foreground mb-6 max-w-3xl">
            A plain-English directory of the political issues shaping public debate — from the
            economy and healthcare to immigration, civil rights, and local cost of living. Read
            short summaries of each topic, vote in live polls, and find out where you stand with a
            personalized alignment quiz.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button asChild size="lg">
              <Link to="/political-compass-test">Take the alignment quiz</Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link to="/candidates">Compare candidates</Link>
            </Button>
          </div>
        </section>

        <section className="mb-12" aria-labelledby="polls-heading">
          <h2 id="polls-heading" className="font-display text-2xl font-bold text-foreground mb-4">
            Live political polls
          </h2>
          {polls.length === 0 ? (
            <p className="text-muted-foreground">
              No active polls right now — check back soon, or{' '}
              <Link to="/political-compass-test" className="underline">
                take the alignment quiz
              </Link>{' '}
              in the meantime.
            </p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {polls.map((p) => (
                <Card key={p.id}>
                  <CardHeader>
                    <CardTitle className="text-lg">
                      <Link to={`/p/${p.slug}`} className="hover:underline">
                        {p.title}
                      </Link>
                    </CardTitle>
                    {p.description && (
                      <CardDescription className="line-clamp-2">{p.description}</CardDescription>
                    )}
                  </CardHeader>
                </Card>
              ))}
            </div>
          )}
        </section>

        <section className="mb-12" aria-labelledby="federal-heading">
          <h2 id="federal-heading" className="font-display text-2xl font-bold text-foreground mb-4">
            Federal issues
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {federal.map((t) => (
              <Card key={t.id}>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <span aria-hidden>{t.icon}</span>
                    {t.name}
                  </CardTitle>
                  <CardDescription>{TOPIC_DESCRIPTIONS[t.id] ?? ''}</CardDescription>
                </CardHeader>
                <CardContent>
                  <Link
                    to="/political-compass-test"
                    className="text-sm text-primary hover:underline"
                  >
                    See where you stand →
                  </Link>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        {local.length > 0 && (
          <section className="mb-12" aria-labelledby="local-heading">
            <h2 id="local-heading" className="font-display text-2xl font-bold text-foreground mb-4">
              Local issues
            </h2>
            <div className="grid gap-4 sm:grid-cols-2">
              {local.map((t) => (
                <Card key={t.id}>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-lg">
                      <span aria-hidden>{t.icon}</span>
                      {t.name}
                      <Badge variant="secondary" className="ml-auto">Local</Badge>
                    </CardTitle>
                    <CardDescription>{TOPIC_DESCRIPTIONS[t.id] ?? ''}</CardDescription>
                  </CardHeader>
                </Card>
              ))}
            </div>
          </section>
        )}

        <section aria-labelledby="faq-heading">
          <h2 id="faq-heading" className="font-display text-2xl font-bold text-foreground mb-4">
            Frequently asked
          </h2>
          <div className="space-y-4">
            {FAQS.map((f) => (
              <Card key={f.q}>
                <CardHeader>
                  <CardTitle className="text-base">{f.q}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground">{f.a}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
