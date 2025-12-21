import { Header } from '@/components/Header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { 
  Scale, 
  Calculator, 
  Layers, 
  AlertTriangle, 
  CheckCircle, 
  Info,
  ArrowLeft,
  ArrowRight
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';

export const HowScoringWorks = () => {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      <main className="container py-8 px-4">
        <div className="max-w-3xl mx-auto">
          {/* Back Link */}
          <Link to="/feed" className="inline-flex items-center text-muted-foreground hover:text-foreground mb-6 transition-colors">
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

              <div className="grid md:grid-cols-3 gap-4 mt-4">
                <div className="p-4 rounded-lg bg-blue-50 border border-blue-200">
                  <p className="font-semibold text-blue-700">Left (L)</p>
                  <p className="text-sm text-blue-600">-10.00 to -0.01</p>
                  <p className="text-xs text-blue-500 mt-1">Progressive positions</p>
                </div>
                <div className="p-4 rounded-lg bg-purple-50 border border-purple-200">
                  <p className="font-semibold text-purple-700">Center</p>
                  <p className="text-sm text-purple-600">0.00</p>
                  <p className="text-xs text-purple-500 mt-1">Moderate/mixed positions</p>
                </div>
                <div className="p-4 rounded-lg bg-red-50 border border-red-200">
                  <p className="font-semibold text-red-700">Right (R)</p>
                  <p className="text-sm text-red-600">+0.01 to +10.00</p>
                  <p className="text-xs text-red-500 mt-1">Conservative positions</p>
                </div>
              </div>

              <p className="text-sm text-muted-foreground">
                Scores are displayed with two decimals (e.g., L2.34, R6.10) for precision.
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
                Each quiz question has answer options with values from -10 to +10:
              </p>
              
              <div className="space-y-2">
                <div className="flex items-center gap-3 p-3 rounded-lg bg-secondary">
                  <Badge variant="outline" className="bg-blue-100 text-blue-700">-10</Badge>
                  <span className="text-sm">Strongly progressive response</span>
                </div>
                <div className="flex items-center gap-3 p-3 rounded-lg bg-secondary">
                  <Badge variant="outline" className="bg-purple-100 text-purple-700">0</Badge>
                  <span className="text-sm">Neutral or mixed response</span>
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
                Your overall score is weighted by your <strong>Top 5 topic priorities</strong>:
              </p>
              
              <div className="space-y-2">
                {[
                  { rank: 1, weight: 5, normalized: '33%' },
                  { rank: 2, weight: 4, normalized: '27%' },
                  { rank: 3, weight: 3, normalized: '20%' },
                  { rank: 4, weight: 2, normalized: '13%' },
                  { rank: 5, weight: 1, normalized: '7%' },
                ].map(({ rank, weight, normalized }) => (
                  <div key={rank} className="flex items-center justify-between p-3 rounded-lg bg-secondary">
                    <div className="flex items-center gap-3">
                      <span className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold text-sm">
                        {rank}
                      </span>
                      <span className="text-sm">Priority #{rank}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm text-muted-foreground">Weight: {weight}</span>
                      <Badge variant="outline">{normalized}</Badge>
                    </div>
                  </div>
                ))}
              </div>

              <p className="text-sm text-muted-foreground">
                Topics you care about most have more influence on your overall score and candidate matches.
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
                <div className="flex items-start gap-3 p-3 rounded-lg bg-yellow-50 border border-yellow-200">
                  <Info className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium text-yellow-800">Imputed as Center (0.00)</p>
                    <p className="text-sm text-yellow-700">Unknown stances are treated as neutral for scoring purposes.</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-3 rounded-lg bg-yellow-50 border border-yellow-200">
                  <AlertTriangle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium text-yellow-800">Confidence is Reduced</p>
                    <p className="text-sm text-yellow-700">More unknown stances = lower confidence badge.</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-3 rounded-lg bg-yellow-50 border border-yellow-200">
                  <CheckCircle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium text-yellow-800">Always Disclosed</p>
                    <p className="text-sm text-yellow-700">Unknown questions are listed on candidate pages.</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Confidence Levels */}
          <Card className="mb-6 shadow-elevated">
            <CardHeader>
              <CardTitle className="font-display flex items-center gap-2">
                <CheckCircle className="w-5 h-5 text-primary" />
                Confidence Levels
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-foreground">
                Confidence reflects how complete the candidate's stance data is:
              </p>
              
              <div className="space-y-2">
                <div className="flex items-center justify-between p-3 rounded-lg bg-green-50 border border-green-200">
                  <div className="flex items-center gap-3">
                    <Badge className="bg-green-100 text-green-800">High</Badge>
                    <span className="text-sm text-green-700">≥85% of weighted stances known</span>
                  </div>
                </div>
                <div className="flex items-center justify-between p-3 rounded-lg bg-yellow-50 border border-yellow-200">
                  <div className="flex items-center gap-3">
                    <Badge className="bg-yellow-100 text-yellow-800">Medium</Badge>
                    <span className="text-sm text-yellow-700">60-84% of weighted stances known</span>
                  </div>
                </div>
                <div className="flex items-center justify-between p-3 rounded-lg bg-red-50 border border-red-200">
                  <div className="flex items-center gap-3">
                    <Badge className="bg-red-100 text-red-800">Low</Badge>
                    <span className="text-sm text-red-700">&lt;60% of weighted stances known</span>
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
