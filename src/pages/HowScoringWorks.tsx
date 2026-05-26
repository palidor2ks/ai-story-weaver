import { Header } from '@/components/Header';
import { Seo } from '@/components/Seo';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { 
  Scale, 
  Calculator, 
  Layers, 
  AlertTriangle, 
  CheckCircle2, 
  Info,
  ArrowLeft,
  ArrowRight
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';

export const HowScoringWorks = () => {
  return (
    <div className="min-h-screen bg-background">
      <Seo
        title="How Scoring Works — Pulse"
        description="Learn how Pulse scores politicians on a -10 to +10 scale across 17 policy topics using voting records, public statements, and party platforms."
        path="/how-scoring-works"
        jsonLd={{
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: [
            {
              "@type": "Question",
              name: "What scale does Pulse use to score politicians?",
              acceptedAnswer: {
                "@type": "Answer",
                text: "Pulse uses a -10.00 to +10.00 left-right scale, where negative values indicate left-leaning positions and positive values indicate right-leaning positions.",
              },
            },
            {
              "@type": "Question",
              name: "What data sources inform a politician's score?",
              acceptedAnswer: {
                "@type": "Answer",
                text: "Scores draw on official voting records (Congress.gov), public statements, campaign finance data (FEC), and party platforms, analyzed across 17 policy topics.",
              },
            },
            {
              "@type": "Question",
              name: "How are individual question scores combined?",
              acceptedAnswer: {
                "@type": "Answer",
                text: "Question-level scores are aggregated by topic and weighted by evidence strength (voting record > public statements > inferred party position) to produce a politician's overall alignment.",
              },
            },
            {
              "@type": "Question",
              name: "Are Pulse scores endorsements?",
              acceptedAnswer: {
                "@type": "Answer",
                text: "No. Scores are informational only. Pulse is not affiliated with any candidate, party, or campaign, and scores should not be interpreted as endorsements.",
              },
            },
          ],
        }}
      />
      <Header />
      
      <main className="container py-8 px-4">
        <div className="max-w-3xl mx-auto">
          {/* Back Link */}
          <Link to="/profile" className="inline-flex items-center text-muted-foreground hover:text-foreground mb-6 transition-colors">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Feed
          </Link>

          {/* Header */}
          <div className="mb-8">
            <h1 className="font-display text-3xl md:text-4xl font-bold text-foreground mb-4">
              How Scoring Works
            </h1>
            <p className="text-lg text-muted-foreground">
              Transparency is core to Pulse. Here's exactly how we calculate political alignment scores.
            </p>
          </div>

          {/* The L/R Scale */}
          <Card className="mb-6 shadow-elevated">
            <CardHeader>
              <CardTitle className="font-display flex items-center gap-2">
                <Scale className="w-5 h-5 text-primary" />
                The Left-Right Scale
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-foreground">
                All scores use a <strong>-10.00 to +10.00</strong> scale:
              </p>
              
              <div className="relative h-8 bg-gradient-to-r from-blue-500 via-purple-500 to-red-500 rounded-full overflow-hidden">
                <div className="absolute inset-0 flex items-center justify-between px-4 text-white text-sm font-bold">
                  <span>L10</span>
                  <span>Center</span>
                  <span>R10</span>
                </div>
              </div>

              <div className="grid md:grid-cols-5 gap-3 mt-4">
                <div className="p-3 rounded-lg bg-blue-50 border border-blue-200">
                  <p className="font-semibold text-blue-700">Left (L)</p>
                  <p className="text-sm text-blue-600">-10 to -4</p>
                  <p className="text-xs text-blue-500 mt-1">L10 to L4</p>
                </div>
                <div className="p-3 rounded-lg bg-blue-50/50 border border-purple-200">
                  <p className="font-semibold text-purple-700">Center-Left (CL)</p>
                  <p className="text-sm text-purple-600">-3 to -1</p>
                  <p className="text-xs text-purple-500 mt-1">CL3 to CL1</p>
                </div>
                <div className="p-3 rounded-lg bg-purple-50 border border-purple-200">
                  <p className="font-semibold text-purple-700">Center (C)</p>
                  <p className="text-sm text-purple-600">0</p>
                  <p className="text-xs text-purple-500 mt-1">Moderate</p>
                </div>
                <div className="p-3 rounded-lg bg-red-50/50 border border-purple-200">
                  <p className="font-semibold text-purple-700">Center-Right (CR)</p>
                  <p className="text-sm text-purple-600">+1 to +3</p>
                  <p className="text-xs text-purple-500 mt-1">CR1 to CR3</p>
                </div>
                <div className="p-3 rounded-lg bg-red-50 border border-red-200">
                  <p className="font-semibold text-red-700">Right (R)</p>
                  <p className="text-sm text-red-600">+4 to +10</p>
                  <p className="text-xs text-red-500 mt-1">R4 to R10</p>
                </div>
              </div>

              <p className="text-sm text-muted-foreground">
                Scores are displayed with two decimals (e.g., L8.25, CL2.00, C, CR1.75, R5.50).
              </p>
            </CardContent>
          </Card>

          {/* Question Values */}
          <Card className="mb-6 shadow-elevated">
            <CardHeader>
              <CardTitle className="font-display flex items-center gap-2">
                <Calculator className="w-5 h-5 text-primary" />
                Question Values
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-foreground">
                Each quiz question has 5 answer options mapped to values from -10 to +10:
              </p>
              
              <div className="space-y-2">
                <div className="flex items-center gap-3 p-3 rounded-lg bg-secondary">
                  <Badge variant="outline" className="bg-blue-100 text-blue-700">-10</Badge>
                  <span className="text-sm">Strongly progressive response</span>
                </div>
                <div className="flex items-center gap-3 p-3 rounded-lg bg-secondary">
                  <Badge variant="outline" className="bg-blue-50 text-blue-700">-5</Badge>
                  <span className="text-sm">Lean progressive response</span>
                </div>
                <div className="flex items-center gap-3 p-3 rounded-lg bg-secondary">
                  <Badge variant="outline" className="bg-purple-100 text-purple-700">0</Badge>
                  <span className="text-sm">Neutral or mixed response</span>
                </div>
                <div className="flex items-center gap-3 p-3 rounded-lg bg-secondary">
                  <Badge variant="outline" className="bg-red-50 text-red-700">+5</Badge>
                  <span className="text-sm">Lean conservative response</span>
                </div>
                <div className="flex items-center gap-3 p-3 rounded-lg bg-secondary">
                  <Badge variant="outline" className="bg-red-100 text-red-700">+10</Badge>
                  <span className="text-sm">Strongly conservative response</span>
                </div>
              </div>

              <p className="text-sm text-muted-foreground">
                Your topic score is the average of your answers for that topic's questions.
              </p>
            </CardContent>
          </Card>

          {/* Weighting */}
          <Card className="mb-6 shadow-elevated">
            <CardHeader>
              <CardTitle className="font-display flex items-center gap-2">
                <Layers className="w-5 h-5 text-primary" />
                Topic Weighting
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-foreground">
                Your overall score is a weighted average of topic scores. During onboarding you rank topics in two separate flows:
              </p>

              <div>
                <p className="font-semibold text-foreground mb-2">Federal priorities — pick 3 of 6 topics</p>
                <div className="space-y-2">
                  {[
                    { rank: 1, weight: 'Weight ×3', normalized: 'Most influence' },
                    { rank: 2, weight: 'Weight ×2', normalized: 'More influence' },
                    { rank: 3, weight: 'Weight ×1', normalized: 'Baseline influence' },
                  ].map(({ rank, weight, normalized }) => (
                    <div key={rank} className="flex items-center justify-between p-3 rounded-lg bg-secondary">
                      <div className="flex items-center gap-3">
                        <span className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold text-sm">
                          {rank}
                        </span>
                        <span className="text-sm">Priority #{rank}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-sm text-muted-foreground">{weight}</span>
                        <Badge variant="outline">{normalized}</Badge>
                      </div>
                    </div>
                  ))}
                  <div className="flex items-center justify-between p-3 rounded-lg bg-secondary/60 border border-dashed border-border">
                    <span className="text-sm text-muted-foreground">Unranked federal topics</span>
                    <div className="flex items-center gap-3">
                      <span className="text-sm text-muted-foreground">Weight ×1</span>
                      <Badge variant="outline">Still counted</Badge>
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <p className="font-semibold text-foreground mb-2">Local priorities — pick 2 topics</p>
                <div className="space-y-2">
                  {[
                    { rank: 1, weight: 'Weight ×2', normalized: 'More influence' },
                    { rank: 2, weight: 'Weight ×1', normalized: 'Baseline influence' },
                  ].map(({ rank, weight, normalized }) => (
                    <div key={rank} className="flex items-center justify-between p-3 rounded-lg bg-secondary">
                      <div className="flex items-center gap-3">
                        <span className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold text-sm">
                          {rank}
                        </span>
                        <span className="text-sm">Priority #{rank}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-sm text-muted-foreground">{weight}</span>
                        <Badge variant="outline">{normalized}</Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <p className="text-sm text-muted-foreground">
                You rank 3 federal topics and 2 local topics during onboarding. Higher-ranked topics count more in your overall score; unranked federal topics still contribute at the baseline weight.
              </p>

            </CardContent>
          </Card>

          {/* Unknown Stances */}
          <Card className="mb-6 shadow-elevated">
            <CardHeader>
              <CardTitle className="font-display flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-primary" />
                Unknown Stances
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-foreground">
                When a candidate's stance on a question is unknown (no reliable sources found):
              </p>
              
              <div className="space-y-3">
                <div className="flex items-start gap-3 p-3 rounded-lg bg-blue-50 border border-blue-200">
                  <Info className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium text-blue-800">Not Scored Until Evidence Exists</p>
                    <p className="text-sm text-blue-700">Unknown questions are excluded from score calculations rather than forced to 0.00.</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-3 rounded-lg bg-yellow-50 border border-yellow-200">
                  <AlertTriangle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium text-yellow-800">Confidence is Reduced</p>
                    <p className="text-sm text-yellow-700">More unknown stances = lower confidence badge.</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-3 rounded-lg bg-emerald-50 border border-emerald-200">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium text-emerald-800">Always Disclosed</p>
                    <p className="text-sm text-emerald-700">Unknown questions are listed on candidate pages.</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Confidence Levels */}
          <Card className="mb-6 shadow-elevated">
            <CardHeader>
              <CardTitle className="font-display flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-primary" />
                Confidence Levels
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-foreground">
                Confidence reflects how strong and complete the available evidence is for a candidate's scored positions:
              </p>
              
              <div className="space-y-2">
                <div className="flex items-center justify-between p-3 rounded-lg bg-green-50 border border-green-200">
                  <div className="flex items-center gap-3">
                    <Badge className="bg-green-100 text-green-800">High</Badge>
                    <span className="text-sm text-green-700">High-confidence sourcing and coverage</span>
                  </div>
                </div>
                <div className="flex items-center justify-between p-3 rounded-lg bg-yellow-50 border border-yellow-200">
                  <div className="flex items-center gap-3">
                    <Badge className="bg-yellow-100 text-yellow-800">Medium</Badge>
                    <span className="text-sm text-yellow-700">Mixed confidence across topics</span>
                  </div>
                </div>
                <div className="flex items-center justify-between p-3 rounded-lg bg-red-50 border border-red-200">
                  <div className="flex items-center gap-3">
                    <Badge className="bg-red-100 text-red-800">Low</Badge>
                    <span className="text-sm text-red-700">Limited or less-certain evidence</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Coverage Tiers */}
          <Card className="mb-6 shadow-elevated">
            <CardHeader>
              <CardTitle className="font-display flex items-center gap-2">
                <Layers className="w-5 h-5 text-primary" />
                Coverage Tiers
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-foreground">
                Not all candidates have the same data availability:
              </p>
              
              <div className="space-y-2">
                <div className="p-4 rounded-lg bg-green-50 border border-green-200">
                  <div className="flex items-center gap-2 mb-2">
                    <Badge className="bg-green-100 text-green-800">Tier 1 - Full</Badge>
                  </div>
                  <p className="text-sm text-green-700">AI stance evidence + donors + voting record available</p>
                </div>
                <div className="p-4 rounded-lg bg-yellow-50 border border-yellow-200">
                  <div className="flex items-center gap-2 mb-2">
                    <Badge className="bg-yellow-100 text-yellow-800">Tier 2 - Partial</Badge>
                  </div>
                  <p className="text-sm text-yellow-700">AI stance evidence + limited donors or limited voting record</p>
                </div>
                <div className="p-4 rounded-lg bg-gray-50 border border-gray-200">
                  <div className="flex items-center gap-2 mb-2">
                    <Badge className="bg-gray-100 text-gray-800">Tier 3 - Basic</Badge>
                  </div>
                  <p className="text-sm text-gray-700">AI stance evidence only; donors/voting record unavailable</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Disclaimer */}
          <div className="p-6 rounded-xl bg-secondary/50 border border-border text-center">
            <p className="text-sm text-muted-foreground">
              <strong>Disclaimer:</strong> Pulse is for informational purposes only. 
              We do not endorse or recommend any candidate. Scores are based on publicly available information 
              and AI analysis, which may contain errors. Always verify information from official sources.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
};
