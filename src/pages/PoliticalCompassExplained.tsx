import { Link } from 'react-router-dom';
import { ArrowRight, Compass, MoveHorizontal, MoveVertical } from 'lucide-react';
import { Header } from '@/components/Header';
import { Seo } from '@/components/Seo';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const economicExamples = [
  { label: 'Far Left (-10)', body: 'State ownership of major industries, near-universal redistribution, capped private wealth.' },
  { label: 'Center-Left (-5)', body: 'Mixed economy with strong public services, progressive taxation, robust labor protections.' },
  { label: 'Center (0)', body: 'Market economy with a meaningful safety net; pragmatic case-by-case regulation.' },
  { label: 'Center-Right (+5)', body: 'Lower taxes, lighter regulation, means-tested welfare, private-sector preference.' },
  { label: 'Far Right (+10)', body: 'Minimal state, privatized services, free trade and capital flows with little intervention.' },
];

const socialExamples = [
  { label: 'Libertarian (-10)', body: 'Maximum personal freedom, civil liberties, decentralized authority, drug and speech permissiveness.' },
  { label: 'Liberal (-5)', body: 'Strong civil rights protections, due-process emphasis, limits on surveillance and policing.' },
  { label: 'Center (0)', body: 'Balances order and liberty; supports rights with conventional law-enforcement structures.' },
  { label: 'Conservative (+5)', body: 'Traditional institutions, stricter law enforcement, deference to national or religious norms.' },
  { label: 'Authoritarian (+10)', body: 'Centralized authority, strong national identity, expansive policing and surveillance powers.' },
];

const quadrants = [
  { name: 'Authoritarian Left', desc: 'State-led economy with strong central authority (e.g. command socialism).' },
  { name: 'Authoritarian Right', desc: 'Free markets paired with strong national or traditional authority.' },
  { name: 'Libertarian Left', desc: 'Egalitarian economics with maximal personal freedom (e.g. democratic socialism, anarcho-syndicalism).' },
  { name: 'Libertarian Right', desc: 'Free markets with minimal state intervention in personal life (classical liberal, libertarian).' },
];

export default function PoliticalCompassExplained() {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: 'Political Compass Axes Explained: Economic vs Social',
    description:
      'A plain-English guide to the two axes used by the political compass test — the economic (left-right) and social (libertarian-authoritarian) axes — and how they differ from the traditional one-dimensional political spectrum.',
    datePublished: '2026-06-18',
    author: { '@type': 'Organization', name: 'PoliPulse' },
    publisher: { '@type': 'Organization', name: 'PoliPulse' },
    mainEntityOfPage: 'https://www.polipulseapp.com/blog/political-compass-explained',
  };

  return (
    <div className="min-h-screen bg-background">
      <Seo
        title="Political Compass Axes Explained: Economic vs Social | PoliPulse"
        description="The political compass test scores you on two axes — economic (left-right) and social (libertarian-authoritarian). Learn what each axis measures, how they differ from the linear political spectrum, and what each quadrant means."
        path="/blog/political-compass-explained"
        type="article"
        jsonLd={jsonLd}
      />
      <Header />
      <main className="container mx-auto py-10 max-w-3xl">
        <article className="space-y-8">
          <header className="space-y-3">
            <h1 className="font-display text-3xl md:text-4xl font-bold text-foreground">
              Political Compass Axes Explained: Economic vs Social
            </h1>
            <p className="text-muted-foreground text-lg">
              The political compass test plots your beliefs on two axes instead of one.
              Here's what each axis actually measures, how the two-axis model differs from
              the traditional left-right political spectrum, and what each quadrant means in
              practice.
            </p>
          </header>

          <section className="space-y-3">
            <h2 className="font-display text-2xl font-semibold flex items-center gap-2">
              <Compass className="h-6 w-6" aria-hidden /> Why two axes instead of one
            </h2>
            <p>
              The traditional <strong>political spectrum</strong> is a single line from "left"
              to "right." It collapses every political belief — about taxes, civil liberties,
              policing, immigration, free speech — onto one dimension. That's tidy, but it
              also hides real disagreements: a socialist and a libertarian can both call
              themselves "left" while disagreeing sharply about state power.
            </p>
            <p>
              The <strong>political compass</strong> separates those questions into two
              independent axes. Where you stand on the economy is one axis; how much state
              authority over personal life you accept is another. Most modern political-compass
              tests — including the original politicalcompass.org and open-source variants
              like 8values and 9axes — build on this two-axis idea.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="font-display text-2xl font-semibold flex items-center gap-2">
              <MoveHorizontal className="h-6 w-6" aria-hidden /> The economic axis (X)
            </h2>
            <p>
              The horizontal axis measures how much you want the economy to be coordinated
              collectively versus left to private markets. "Left" doesn't mean a specific
              party — it means more public ownership, redistribution, and regulation. "Right"
              means more private ownership, lower taxes, and lighter regulation.
            </p>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Where positions roughly land</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {economicExamples.map((e) => (
                  <div key={e.label}>
                    <p className="font-medium">{e.label}</p>
                    <p className="text-muted-foreground text-sm">{e.body}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          </section>

          <section className="space-y-4">
            <h2 className="font-display text-2xl font-semibold flex items-center gap-2">
              <MoveVertical className="h-6 w-6" aria-hidden /> The social axis (Y)
            </h2>
            <p>
              The vertical axis measures how much authority the state should have over
              personal life and civil society. "Libertarian" here is the political-theory
              sense: skeptical of state power over individuals, regardless of economics.
              "Authoritarian" means more centralized authority, stricter enforcement, and
              stronger national or traditional norms.
            </p>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Where positions roughly land</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {socialExamples.map((e) => (
                  <div key={e.label}>
                    <p className="font-medium">{e.label}</p>
                    <p className="text-muted-foreground text-sm">{e.body}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          </section>

          <section className="space-y-4">
            <h2 className="font-display text-2xl font-semibold">The four quadrants</h2>
            <p>
              Crossing the two axes produces four quadrants. They're labels, not destiny —
              most people land somewhere mixed — but they're useful shorthand for describing
              how ideologies combine economic and social positions.
            </p>
            <div className="grid sm:grid-cols-2 gap-3">
              {quadrants.map((q) => (
                <Card key={q.name}>
                  <CardHeader><CardTitle className="text-base">{q.name}</CardTitle></CardHeader>
                  <CardContent>
                    <p className="text-muted-foreground text-sm">{q.desc}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="font-display text-2xl font-semibold">Compass vs. linear political spectrum</h2>
            <p>
              The linear left-right <strong>political spectrum</strong> answers one question:
              how far from the center are you? The political compass answers two: how far on
              economics, and how far on personal liberty. That's why two people who look
              identical on a left-right bar can sit in opposite quadrants on a compass —
              they agree about taxes and disagree about state power, or vice versa.
            </p>
            <p>
              The compass is better at <em>describing</em> a worldview. The linear spectrum is
              better at <em>summarizing</em> a coalition. Neither tells you how a specific
              politician has actually voted — which is the gap PoliPulse is built to close.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="font-display text-2xl font-semibold">From the compass to real candidates</h2>
            <p>
              A compass score is a starting point, not an endpoint. Knowing you're
              "libertarian-left" doesn't tell you which incumbent voted for the bills you
              care about, who funds their campaign, or how their record compares to their
              stated platform. PoliPulse takes the same kind of two-axis questions and maps
              your answers to the voting records, donors, and committee memberships of real
              officials.
            </p>
            <div className="flex flex-wrap gap-3 pt-2">
              <Button asChild size="lg">
                <Link to="/political-compass-test">
                  Take the PoliPulse compass test
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg">
                <Link to="/blog/political-ideology-tests-comparison">
                  Compare ideology tests
                </Link>
              </Button>
            </div>
          </section>
        </article>
      </main>
    </div>
  );
}
