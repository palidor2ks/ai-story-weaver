import { Link } from 'react-router-dom';
import {
  ArrowRight,
  BarChart3,
  CheckCircle2,
  Compass,
  Database,
  MapPinned,
  Scale,
  Search,
  ShieldCheck,
  Vote,
} from 'lucide-react';
import { Header } from '@/components/Header';
import { Seo } from '@/components/Seo';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/context/AuthContext';
import { useAdminRole } from '@/hooks/useAdminRole';

const benefits = [
  {
    icon: Compass,
    title: 'See where you land',
    description: 'Answer issue-based questions and convert your positions into a clear left-right political alignment score.',
  },
  {
    icon: Vote,
    title: 'Compare to real candidates',
    description: 'Move beyond a generic quadrant and compare your views against politicians, parties, voting records, and public statements.',
  },
  {
    icon: Database,
    title: 'Trace the evidence',
    description: 'Pulse connects your results to transparent sourcing from public records, campaign finance data, and policy positions.',
  },
];

const steps = [
  'Answer policy questions across the issues that shape elections.',
  'Get a left-right score with topic-level strengths and gaps.',
  'Explore candidates, parties, donors, and committees that overlap with your priorities.',
];

const faqs = [
  {
    question: 'What is a political compass test?',
    answer:
      'A political compass test is a short questionnaire that maps your policy views into an ideological profile. Pulse focuses on practical electoral alignment by turning your answers into scores you can compare with candidates and parties.',
  },
  {
    question: 'How is Pulse different from iSideWith and other quizzes?',
    answer:
      'Pulse is built around ongoing comparison with public officials, party platforms, voting records, and campaign finance context. The goal is not just to label your ideology, but to help you understand who aligns with you and why.',
  },
  {
    question: 'Is the political compass test free?',
    answer:
      'Yes. You can create a free Pulse profile, take the quiz, and start comparing your results with candidates and political organizations.',
  },
  {
    question: 'Does Pulse endorse candidates?',
    answer:
      'No. Pulse provides informational alignment scores and source-backed context. Scores are not endorsements, ratings, or voting recommendations.',
  },
];

export default function PoliticalCompassTest() {
  const { user } = useAuth();
  const { data: adminData, isLoading: adminLoading } = useAdminRole();
  const isAdmin = !!user && !adminLoading && !!adminData?.isAdmin;

  const jsonLd = [
    {
      '@context': 'https://schema.org',
      '@type': 'WebPage',
      name: 'Political Compass Test',
      description:
        'Take a free political compass test on Pulse and compare your political alignment with candidates, parties, voting records, donors, and committees.',
      url: 'https://www.polipulseapp.com/political-compass-test',
    },
    {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: faqs.map((faq) => ({
        '@type': 'Question',
        name: faq.question,
        acceptedAnswer: {
          '@type': 'Answer',
          text: faq.answer,
        },
      })),
    },
  ];

  return (
    <div className="min-h-screen bg-background">
      <Seo
        title="Political Compass Test — Free Candidate Alignment | Pulse"
        description="Take a free political compass test and compare your political alignment with candidates, parties, voting records, donors, and committees on Pulse."
        path="/political-compass-test"
        jsonLd={jsonLd}
      />
      {isAdmin && <Header />}

      <main>
        <section className="relative overflow-hidden border-b border-border bg-gradient-to-b from-primary/10 via-background to-background">
          <div className="absolute left-1/2 top-16 h-72 w-72 -translate-x-1/2 rounded-full bg-primary/20 blur-3xl" aria-hidden="true" />
          <div className="container relative grid gap-12 px-4 py-16 md:py-24 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
            <div className="max-w-3xl">
              <Badge variant="secondary" className="mb-5 border-primary/20 bg-primary/10 text-primary">
                Political compass test
              </Badge>
              <h1 className="font-display text-4xl font-bold tracking-tight text-foreground md:text-6xl">
                Take a political compass test that connects your beliefs to real candidates.
              </h1>
              <p className="mt-6 text-lg leading-8 text-muted-foreground md:text-xl">
                Pulse helps you understand where you stand, then shows how your views compare with politicians, parties,
                voting records, donors, and committees. Get beyond a simple ideology label and see the evidence behind your
                alignment.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Button asChild variant="hero" size="xl">
                  <Link to="/auth" aria-label="Start the free political compass test">
                    Start the free test
                    <ArrowRight className="h-5 w-5" />
                  </Link>
                </Button>
                <Button asChild variant="outline" size="xl">
                  <Link to="/candidates">Browse candidates first</Link>
                </Button>
              </div>
              <div className="mt-6 flex flex-wrap gap-3 text-sm text-muted-foreground">
                {['Free to start', 'Issue-by-issue results', 'Candidate comparisons'].map((item) => (
                  <span key={item} className="inline-flex items-center gap-2 rounded-full bg-card px-3 py-1 shadow-sm">
                    <CheckCircle2 className="h-4 w-4 text-primary" />
                    {item}
                  </span>
                ))}
              </div>
            </div>

            <Card className="relative mx-auto w-full max-w-xl overflow-hidden shadow-elevated">
              <CardHeader className="border-b bg-card/80">
                <CardTitle className="font-display flex items-center gap-2 text-xl">
                  <Compass className="h-5 w-5 text-primary" />
                  Your alignment snapshot
                </CardTitle>
              </CardHeader>
              <CardContent className="p-6">
                <div className="rounded-2xl border bg-gradient-to-br from-blue-500/10 via-purple-500/10 to-red-500/10 p-5">
                  <div className="grid grid-cols-2 gap-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    <span>Left</span>
                    <span className="text-right">Right</span>
                  </div>
                  <div className="relative mt-4 h-64 rounded-xl border bg-background/80">
                    <div className="absolute left-1/2 top-0 h-full w-px bg-border" aria-hidden="true" />
                    <div className="absolute left-0 top-1/2 h-px w-full bg-border" aria-hidden="true" />
                    <div className="absolute left-[58%] top-[38%] flex h-16 w-16 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-4 border-background bg-primary text-primary-foreground shadow-xl">
                      <MapPinned className="h-7 w-7" />
                    </div>
                    <div className="absolute bottom-4 left-4 rounded-lg bg-card px-3 py-2 text-sm shadow-sm">
                      Civil liberties
                    </div>
                    <div className="absolute right-4 top-4 rounded-lg bg-card px-3 py-2 text-sm shadow-sm">
                      Economy
                    </div>
                  </div>
                  <div className="mt-5 grid gap-3 sm:grid-cols-3">
                    {[
                      ['Overall', 'C-R 2.1'],
                      ['Top match', 'Compare'],
                      ['Topics', '17 areas'],
                    ].map(([label, value]) => (
                      <div key={label} className="rounded-xl bg-card p-3 text-center shadow-sm">
                        <p className="text-xs text-muted-foreground">{label}</p>
                        <p className="mt-1 font-display text-lg font-semibold text-foreground">{value}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </section>

        <section className="container px-4 py-16 md:py-20">
          <div className="mx-auto max-w-3xl text-center">
            <Badge variant="outline" className="mb-4">Why Pulse</Badge>
            <h2 className="font-display text-3xl font-bold text-foreground md:text-4xl">
              A political compass built for voters, not just labels.
            </h2>
            <p className="mt-4 text-lg text-muted-foreground">
              Traditional quizzes can tell you a quadrant. Pulse turns your political compass result into a research tool for
              comparing the people and organizations asking for power.
            </p>
          </div>

          <div className="mt-10 grid gap-5 md:grid-cols-3">
            {benefits.map((benefit) => (
              <Card key={benefit.title} className="shadow-sm transition-all hover:-translate-y-1 hover:shadow-lg">
                <CardContent className="p-6">
                  <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <benefit.icon className="h-6 w-6" />
                  </div>
                  <h3 className="font-display text-xl font-semibold text-foreground">{benefit.title}</h3>
                  <p className="mt-3 text-muted-foreground">{benefit.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        <section className="border-y border-border bg-secondary/30">
          <div className="container grid gap-10 px-4 py-16 md:grid-cols-[0.9fr_1.1fr] md:items-center md:py-20">
            <div>
              <Badge variant="secondary" className="mb-4">How it works</Badge>
              <h2 className="font-display text-3xl font-bold text-foreground md:text-4xl">
                From quiz answers to accountable comparisons.
              </h2>
              <p className="mt-4 text-muted-foreground">
                Your result becomes more useful as you explore topic scores, evidence, and candidate alignment side by side.
              </p>
              <Button asChild variant="hero" size="lg" className="mt-7">
                <Link to="/auth">
                  Take the political compass test
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </div>

            <div className="space-y-4">
              {steps.map((step, index) => (
                <Card key={step}>
                  <CardContent className="flex gap-4 p-5">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
                      {index + 1}
                    </div>
                    <p className="text-base text-foreground">{step}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>

        <section className="container px-4 py-16 md:py-20">
          <div className="grid gap-5 md:grid-cols-4">
            {[
              { icon: Scale, label: 'Left-right scoring', text: 'Understand your overall ideology and topic-by-topic lean.' },
              { icon: Search, label: 'Source-backed context', text: 'Review how positions connect to public evidence.' },
              { icon: BarChart3, label: 'Election research', text: 'Compare candidates, parties, donors, and committees.' },
              { icon: ShieldCheck, label: 'Nonpartisan framing', text: 'Informational alignment scores, not endorsements.' },
            ].map((item) => (
              <Card key={item.label} className="bg-card/70">
                <CardContent className="p-5">
                  <item.icon className="mb-4 h-6 w-6 text-primary" />
                  <h3 className="font-semibold text-foreground">{item.label}</h3>
                  <p className="mt-2 text-sm text-muted-foreground">{item.text}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        <section className="container px-4 pb-16 md:pb-24">
          <div className="mx-auto max-w-3xl">
            <h2 className="font-display text-3xl font-bold text-foreground">Political compass test FAQ</h2>
            <div className="mt-6 space-y-4">
              {faqs.map((faq) => (
                <Card key={faq.question}>
                  <CardContent className="p-6">
                    <h3 className="font-display text-lg font-semibold text-foreground">{faq.question}</h3>
                    <p className="mt-2 text-muted-foreground">{faq.answer}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
            <div className="mt-8 rounded-2xl border bg-gradient-to-r from-primary/10 to-accent/10 p-6 text-center">
              <h2 className="font-display text-2xl font-bold text-foreground">Ready to see where you stand?</h2>
              <p className="mt-2 text-muted-foreground">
                Take the free political compass test and start comparing your results with the people shaping policy.
              </p>
              <Button asChild variant="hero" size="lg" className="mt-5">
                <Link to="/auth">
                  Start now
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
