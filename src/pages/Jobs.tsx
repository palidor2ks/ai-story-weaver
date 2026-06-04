import { ArrowRight, BarChart3, CheckCircle2, Code2, Database, LineChart, Mail, ShieldCheck, UsersRound } from 'lucide-react';
import { Header } from '@/components/Header';
import { Seo } from '@/components/Seo';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

const roles = [
  {
    title: 'Full-Stack Developer',
    eyebrow: 'Product Engineering',
    icon: Code2,
    summary:
      'Help build, stabilize, and scale Pulse across the React app, Supabase backend, data pipelines, AI-assisted analysis features, and public-facing political transparency tools.',
    impact: [
      'Own end-to-end product features from UI polish through database design, edge functions, testing, deployment, and observability.',
      'Improve candidate, donor, committee, polling, quiz, scoring, profile, and admin workflows so the platform is fast, reliable, and easy to use.',
      'Partner directly with the founder to prioritize the build, ship iteratively, and turn rough product ideas into production-ready experiences.',
    ],
    responsibilities: [
      'Build responsive React, TypeScript, Vite, Tailwind, and shadcn/ui interfaces that are accessible, mobile-friendly, and SEO-aware.',
      'Design and maintain Supabase/Postgres schemas, RLS policies, storage, auth flows, migrations, and edge functions.',
      'Integrate political and campaign-finance data sources such as FEC, Congress.gov, OpenStates, civic representatives, and polling datasets.',
      'Develop data import, reconciliation, validation, and monitoring tooling for high-volume public datasets.',
      'Support AI-generated summaries, explanations, matching logic, and evidence review workflows with clear guardrails and auditability.',
      'Improve performance, caching, error handling, analytics, security, CI checks, and release quality across the app.',
    ],
    skills: [
      'React',
      'TypeScript',
      'Vite',
      'Tailwind CSS',
      'shadcn/ui',
      'Supabase',
      'Postgres',
      'SQL',
      'Row-level security',
      'Edge functions',
      'API integrations',
      'Data pipelines',
      'Testing',
      'Accessibility',
      'SEO',
      'Performance tuning',
      'Git',
      'AI product workflows',
    ],
    niceToHave: [
      'Experience with civic tech, campaign-finance data, government APIs, polling products, or public-interest journalism tools.',
      'Comfort working in early-stage environments where product, design, data, and engineering decisions move quickly.',
    ],
  },
  {
    title: 'Political Scientist & Polling Data Analyst',
    eyebrow: 'Political Data & Research',
    icon: BarChart3,
    summary:
      'Guide the political science, polling, survey methodology, and data interpretation behind Pulse so users can trust how candidates, parties, donors, and public opinion are represented.',
    impact: [
      'Turn political data into clear, balanced, nonpartisan insights for voters, journalists, campaigns, researchers, and civic organizations.',
      'Strengthen the methodology behind issue scoring, candidate comparisons, poll results, questionnaire design, and public-facing explanations.',
      'Help the team identify what data is meaningful, what is misleading, and what context users need before drawing conclusions.',
    ],
    responsibilities: [
      'Evaluate, clean, weight, and interpret polling and survey data, including crosstabs, toplines, trendlines, likely-voter screens, and margins of error.',
      'Advise on quiz/question wording, issue taxonomies, ideological scoring, party comparisons, and candidate-position research standards.',
      'Create methodology notes that explain assumptions, uncertainty, sample quality, partisan effects, and limitations in plain language.',
      'Analyze campaign-finance, donor, committee, voting-record, and public-opinion data to surface accurate and useful patterns.',
      'Review AI-assisted political summaries for factual accuracy, neutrality, evidence quality, and appropriate caveats.',
      'Collaborate with engineering on data models, dashboards, admin review tools, poll result pages, and quality-control workflows.',
    ],
    skills: [
      'Political science',
      'Polling methodology',
      'Survey design',
      'Public opinion research',
      'Statistics',
      'Data cleaning',
      'Data visualization',
      'Regression or weighting methods',
      'Crosstab analysis',
      'Excel/Sheets',
      'SQL',
      'R or Python',
      'Campaign finance',
      'Election data',
      'Research writing',
      'Nonpartisan analysis',
      'Methodology documentation',
      'Quality assurance',
    ],
    niceToHave: [
      'Graduate training or equivalent professional experience in political science, public policy, statistics, survey research, elections, or data journalism.',
      'Experience explaining complex political data to a general audience without overstating certainty or introducing partisan framing.',
    ],
  },
];

const collaborationPrinciples = [
  {
    icon: ShieldCheck,
    title: 'Trustworthy by default',
    text: 'Every feature and analysis should make sources, assumptions, and limitations easy to understand.',
  },
  {
    icon: Database,
    title: 'Data quality matters',
    text: 'The team will prioritize validation, reconciliation, reproducibility, and review workflows before flashy outputs.',
  },
  {
    icon: UsersRound,
    title: 'Built for real voters',
    text: 'Job one is helping people compare candidates and political information without needing to be policy experts.',
  },
  {
    icon: LineChart,
    title: 'Iterate with evidence',
    text: 'We will ship quickly, measure what works, and refine the product as the dataset and audience grow.',
  },
];

export default function Jobs() {
  const jobPostingSchemas = roles.map((role) => ({
    '@context': 'https://schema.org',
    '@type': 'JobPosting',
    title: role.title,
    description: `${role.summary} Responsibilities include: ${role.responsibilities.join(' ')}`,
    employmentType: 'CONTRACTOR',
    hiringOrganization: {
      '@type': 'Organization',
      name: 'Pulse',
      sameAs: 'https://www.polipulseapp.com',
    },
    applicantLocationRequirements: {
      '@type': 'Country',
      name: 'United States',
    },
    jobLocationType: 'TELECOMMUTE',
  }));

  return (
    <div className="min-h-screen bg-background">
      <Seo
        title="Jobs — Pulse"
        description="Join Pulse as a full-stack developer or political scientist and polling data analyst to help build a trustworthy political data platform."
        path="/jobs"
        jsonLd={jobPostingSchemas}
      />
      <Header />

      <main>
        <section className="relative overflow-hidden border-b border-border bg-gradient-hero text-primary-foreground">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.22),transparent_28rem)]" />
          <div className="container relative py-16 md:py-24">
            <Badge className="mb-6 bg-white/15 text-white hover:bg-white/20 border-white/20">
              Now hiring two founding collaborators
            </Badge>
            <div className="max-w-4xl space-y-6">
              <h1 className="font-display text-4xl font-bold tracking-tight md:text-6xl">
                Help build the political data platform voters can actually use.
              </h1>
              <p className="max-w-3xl text-lg leading-8 text-white/85 md:text-xl">
                Pulse needs a hands-on full-stack developer and a political scientist who understands polling and data. Together, these roles will support the product, research, methodology, and technical infrastructure behind the app.
              </p>
              <div className="flex flex-col gap-3 sm:flex-row">
                <Button asChild size="lg" className="bg-white text-primary hover:bg-white/90">
                  <a href="mailto:support@polipulseapp.com?subject=Pulse%20Jobs%20Application">
                    Apply by email
                    <Mail className="ml-2 h-4 w-4" />
                  </a>
                </Button>
                <Button asChild size="lg" variant="outline" className="border-white/40 bg-white/10 text-white hover:bg-white/20 hover:text-white">
                  <a href="#open-roles">
                    View open roles
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </a>
                </Button>
              </div>
            </div>
          </div>
        </section>

        <section className="container py-12 md:py-16">
          <div className="mb-8 max-w-3xl">
            <h2 className="font-display text-3xl font-bold text-foreground md:text-4xl">Collaboration principles</h2>
            <p className="mt-3 text-muted-foreground">
              How we work together as a small, focused team building civic-tech that voters can trust.
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-4">
            {collaborationPrinciples.map((principle) => (
              <Card key={principle.title} className="bg-gradient-card shadow-elevated">
                <CardHeader className="pb-3">
                  <principle.icon className="mb-2 h-8 w-8 text-primary" />
                  <CardTitle as="h3" className="text-lg">{principle.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm leading-6 text-muted-foreground">{principle.text}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        <section id="open-roles" className="container pb-16 md:pb-24">
          <div className="mb-8 max-w-3xl">
            <Badge variant="outline" className="mb-3">Open roles</Badge>
            <h2 className="font-display text-3xl font-bold text-foreground md:text-4xl">Two roles that support the build</h2>
            <p className="mt-3 text-muted-foreground">
              These descriptions are intentionally broad because Pulse needs people who can own important parts of a growing civic-tech product from strategy through execution.
            </p>
          </div>

          <div className="grid gap-8 lg:grid-cols-2">
            {roles.map((role) => (
              <Card key={role.title} className="overflow-hidden shadow-elevated">
                <CardHeader className="border-b border-border bg-secondary/60">
                  <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                    <role.icon className="h-6 w-6" />
                  </div>
                  <CardDescription>{role.eyebrow}</CardDescription>
                  <CardTitle className="font-display text-2xl">{role.title}</CardTitle>
                  <p className="pt-2 leading-7 text-muted-foreground">{role.summary}</p>
                </CardHeader>
                <CardContent className="space-y-8 p-6">
                  <RoleSection title="What you will help accomplish" items={role.impact} />
                  <RoleSection title="Responsibilities" items={role.responsibilities} />

                  <div>
                    <h3 className="mb-3 font-semibold text-foreground">Skills and experience needed</h3>
                    <div className="flex flex-wrap gap-2">
                      {role.skills.map((skill) => (
                        <Badge key={skill} variant="secondary" className="rounded-full">
                          {skill}
                        </Badge>
                      ))}
                    </div>
                  </div>

                  <RoleSection title="Nice to have" items={role.niceToHave} />
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        <section className="border-t border-border bg-secondary/50">
          <div className="container grid gap-8 py-12 md:grid-cols-[1fr_auto] md:items-center md:py-16">
            <div>
              <h2 className="font-display text-3xl font-bold text-foreground">Interested in helping build Pulse?</h2>
              <p className="mt-3 max-w-2xl text-muted-foreground">
                Send a short note, your resume or LinkedIn, and examples of work that show how you can support the app. For the developer role, include shipped products or code samples. For the political scientist role, include polling, research, data, writing, or methodology examples.
              </p>
            </div>
            <Button asChild size="lg">
              <a href="mailto:support@polipulseapp.com?subject=Pulse%20Jobs%20Application">
                Apply by email
                <Mail className="ml-2 h-4 w-4" />
              </a>
            </Button>
          </div>
        </section>
      </main>
    </div>
  );
}

function RoleSection({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <h3 className="mb-3 font-semibold text-foreground">{title}</h3>
      <ul className="space-y-3">
        {items.map((item) => (
          <li key={item} className="flex gap-3 text-sm leading-6 text-muted-foreground">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
