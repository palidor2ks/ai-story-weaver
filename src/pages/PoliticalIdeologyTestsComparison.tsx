import { Link } from 'react-router-dom';
import { ArrowRight, CheckCircle2, AlertTriangle, Scale } from 'lucide-react';
import { Header } from '@/components/Header';
import { Seo } from '@/components/Seo';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/context/AuthContext';
import { useAdminRole } from '@/hooks/useAdminRole';

const tests = [
  {
    name: 'The Political Compass',
    url: 'politicalcompass.org',
    angle: 'Two-axis (economic left-right + social libertarian-authoritarian).',
    accuracy:
      'Uses a fixed question set with agree/disagree statements. Researchers have criticized it for skewing results toward the libertarian-left quadrant regardless of input.',
    bias: 'Methodology and scoring formulas are not public, which makes the result hard to audit.',
    bestFor: 'A quick conceptual placement on two axes.',
    gap: 'No connection to real candidates, votes, or policy records.',
  },
  {
    name: 'Pew Research Political Typology',
    url: 'pewresearch.org',
    angle: 'Sorts respondents into one of ~9 typology groups based on US survey data.',
    accuracy:
      'Backed by large nationally representative samples and transparent methodology. Strong as a descriptive snapshot of where you fit among American voters.',
    bias: 'Designed to describe the electorate, not to match you to specific officials or bills.',
    bestFor: 'Understanding which coalition of US voters you most resemble.',
    gap: 'Does not score individual politicians, parties, or campaign finance.',
  },
  {
    name: 'iSideWith',
    url: 'isidewith.com',
    angle: 'Issue-by-issue quiz that returns party and candidate match percentages.',
    accuracy:
      'Broad topic coverage and per-question weighting. Candidate positions rely on stated platforms, which can lag behind voting records.',
    bias: 'Heavy ad load and upsells; sourcing for each candidate position is not always linked inline.',
    bestFor: 'A fast match percentage during a major election cycle.',
    gap: 'Limited evidence trail (votes, donors, committees) behind each match.',
  },
  {
    name: '8values / 9axes',
    url: 'open-source quizzes',
    angle: 'Open-source multi-axis ideology quizzes (economic, diplomatic, civil, societal).',
    accuracy:
      'Transparent question set and scoring on GitHub. Returns a richer ideology label than a single quadrant.',
    bias: 'Self-selected online audience; no electoral application or candidate data.',
    bestFor: 'Hobbyist ideology labeling and discussion.',
    gap: 'No politician matching, no voting record analysis, no campaign finance context.',
  },
];

const criteria = [
  {
    title: 'Transparent methodology',
    body: 'Can you see how each question maps to your score? Pulse documents its scoring on /how-scoring-works.',
  },
  {
    title: 'Evidence-linked candidate matching',
    body: 'Does the test link your result to real votes, statements, and donors — or just a label?',
  },
  {
    title: 'Bias controls',
    body: 'Look for balanced question wording, source citations on candidate positions, and a clear non-endorsement stance.',
  },
  {
    title: 'Coverage of issues that matter to you',
    body: 'Generic left-right tests collapse 17+ policy areas into 2 axes. Topic-level scoring preserves real disagreement.',
  },
];

const faqs = [
  {
    question: 'Are political compass tests accurate?',
    answer:
      'Most political compass tests are descriptive, not predictive. They place you on an ideology axis based on stated agreement with statements. Accuracy improves when the test (a) publishes its methodology, (b) uses balanced question wording, and (c) ties results to real-world evidence like voting records — not just a quadrant label.',
  },
  {
    question: 'Which political ideology test is the least biased?',
    answer:
      'No quiz is fully neutral, but the least biased options publish their question set and scoring math, use neutrally worded statements, and cite sources for any candidate positions they reference. Pew Research is strong on methodology; Pulse focuses on source-backed candidate alignment so you can audit every match.',
  },
  {
    question: 'How does Pulse compare to The Political Compass or iSideWith?',
    answer:
      'Pulse goes beyond placing you on a quadrant or returning a match percentage. It converts your answers into topic-level scores and compares them against politicians, parties, voting records, donors, and committees — with sources behind each comparison.',
  },
  {
    question: 'Is there a free political compass test that matches me to real candidates?',
    answer:
      "Yes. Pulse's Political Compass Test is free, issue-based, and compares your views against real US politicians and parties with source-linked evidence.",
  },
];

export default function PoliticalIdeologyTestsComparison() {
  const { user } = useAuth();
  const { data: adminData, isLoading: adminLoading } = useAdminRole();
  const isAdmin = !!user && !adminLoading && !!adminData?.isAdmin;

  const jsonLd = [
    {
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: 'Political Ideology Tests Compared: Accuracy, Bias, and Candidate Matching',
      description:
        'A comparison guide for political compass tests and political spectrum quizzes — accuracy, bias, methodology, and which one connects your results to real candidates.',
      datePublished: '2026-06-10',
      dateModified: '2026-06-10',
      author: { '@type': 'Organization', name: 'Pulse' },
      publisher: { '@type': 'Organization', name: 'Pulse' },
      mainEntityOfPage: 'https://www.polipulseapp.com/blog/political-ideology-tests-comparison',
    },
    {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: faqs.map((f) => ({
        '@type': 'Question',
        name: f.question,
        acceptedAnswer: { '@type': 'Answer', text: f.answer },
      })),
    },
  ];

  return (
    <div className="min-h-screen bg-background">
      <Seo
        title="Political Ideology Tests Compared: Accuracy, Bias & Candidate Match | Pulse"
        description="Compare the top political compass tests and political spectrum quizzes — Pew, iSideWith, The Political Compass, 8values — on accuracy, bias, and candidate matching."
        path="/blog/political-ideology-tests-comparison"
        type="article"
        jsonLd={jsonLd}
      />
      {isAdmin && <Header />}

      <main className="container max-w-4xl px-4 py-12 md:py-16">
        <Badge variant="secondary" className="mb-4 border-primary/20 bg-primary/10 text-primary">
          Comparison guide
        </Badge>
        <h1 className="font-display text-4xl font-bold tracking-tight text-foreground md:text-5xl">
          Political ideology tests compared: accuracy, bias, and candidate matching
        </h1>
        <p className="mt-5 text-lg leading-8 text-muted-foreground">
          "Political compass test" and "political spectrum quiz" return dozens of results — but most stop at a label.
          This guide compares the best-known political ideology tests on the things that actually matter: transparent
          methodology, bias controls, and whether your result connects to real candidates and voting records.
        </p>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Button asChild variant="hero" size="lg">
            <Link to="/political-compass-test">
              Take the Pulse Political Compass Test
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
          <Button asChild variant="outline" size="lg">
            <Link to="/candidates">Browse candidates</Link>
          </Button>
        </div>

        <section className="mt-12">
          <h2 className="font-display text-2xl font-bold text-foreground md:text-3xl">
            How to judge a political ideology test
          </h2>
          <p className="mt-3 text-muted-foreground">
            Before you trust a result, check it against these four criteria. They separate a fun online quiz from a tool
            you can actually use to make a voting decision.
          </p>
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            {criteria.map((c) => (
              <Card key={c.title}>
                <CardContent className="p-5">
                  <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Scale className="h-5 w-5" />
                  </div>
                  <h3 className="font-display text-lg font-semibold text-foreground">{c.title}</h3>
                  <p className="mt-2 text-sm text-muted-foreground">{c.body}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        <section className="mt-12">
          <h2 className="font-display text-2xl font-bold text-foreground md:text-3xl">
            The major political compass and spectrum tests
          </h2>
          <div className="mt-6 space-y-4">
            {tests.map((t) => (
              <Card key={t.name}>
                <CardHeader>
                  <CardTitle className="font-display text-xl">{t.name}</CardTitle>
                  <p className="text-sm text-muted-foreground">{t.url}</p>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <p><span className="font-semibold text-foreground">Approach: </span><span className="text-muted-foreground">{t.angle}</span></p>
                  <p><span className="font-semibold text-foreground">Accuracy: </span><span className="text-muted-foreground">{t.accuracy}</span></p>
                  <p><span className="font-semibold text-foreground">Bias notes: </span><span className="text-muted-foreground">{t.bias}</span></p>
                  <p><span className="font-semibold text-foreground">Best for: </span><span className="text-muted-foreground">{t.bestFor}</span></p>
                  <p className="flex gap-2"><AlertTriangle className="h-4 w-4 shrink-0 text-amber-700 mt-0.5" /><span className="text-muted-foreground"><span className="font-semibold text-foreground">Gap: </span>{t.gap}</span></p>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        <section className="mt-12">
          <h2 className="font-display text-2xl font-bold text-foreground md:text-3xl">
            Where Pulse fits in
          </h2>
          <p className="mt-3 text-muted-foreground">
            Pulse is built for the part most quizzes skip: turning your political ideology result into accountable
            comparisons with real politicians. Every match links back to public evidence — votes, statements, donors,
            and committees — so you can audit why a candidate scored the way they did.
          </p>
          <Card className="mt-5 border-primary/20 bg-primary/5">
            <CardContent className="p-6 space-y-3">
              {[
                'Topic-level scoring across 17 policy areas instead of a single 2-axis quadrant.',
                'Candidate, party, donor, and committee comparisons backed by sources.',
                'Open methodology documented on /how-scoring-works.',
                'Nonpartisan framing — informational alignment scores, never endorsements.',
              ].map((point) => (
                <p key={point} className="flex gap-2 text-sm">
                  <CheckCircle2 className="h-5 w-5 shrink-0 text-primary" />
                  <span className="text-foreground">{point}</span>
                </p>
              ))}
            </CardContent>
          </Card>
        </section>

        <section className="mt-12">
          <h2 className="font-display text-2xl font-bold text-foreground md:text-3xl">FAQ</h2>
          <div className="mt-5 space-y-4">
            {faqs.map((f) => (
              <Card key={f.question}>
                <CardContent className="p-5">
                  <h3 className="font-display text-lg font-semibold text-foreground">{f.question}</h3>
                  <p className="mt-2 text-sm text-muted-foreground">{f.answer}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        <section className="mt-12 rounded-2xl border bg-gradient-to-r from-primary/10 to-accent/10 p-6 text-center">
          <h2 className="font-display text-2xl font-bold text-foreground">
            Ready to see where you actually stand?
          </h2>
          <p className="mt-2 text-muted-foreground">
            Take the free Pulse political compass test and compare your results to real candidates, parties, and
            voting records.
          </p>
          <Button asChild variant="hero" size="lg" className="mt-5">
            <Link to="/political-compass-test">
              Start the free test
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </section>
      </main>
    </div>
  );
}
