import { useEffect } from 'react';
import { Header } from '@/components/Header';
import { Seo } from '@/components/Seo';
import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';
import { logBadgeEvent } from '@/lib/badges';

export const HowScoringWorks = () => {
  useEffect(() => { logBadgeEvent('scoring_viewed'); }, []);
  return (
    <div className="bg-[#F5F6FA] min-h-screen">
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

      {/* Navy gradient header */}
      <div className="bg-gradient-to-br from-poli-navy to-poli-dark pt-12 pb-6 px-4">
        <div className="max-w-2xl mx-auto">
          <p className="font-mono-label text-xs font-bold text-poli-red/80 uppercase tracking-widest">HOW IT WORKS</p>
          <h1 className="text-2xl font-black text-white mt-1">How Scoring Works</h1>
          <p className="text-sm text-white/60 mt-1">Understand how your match scores are calculated</p>
        </div>
      </div>

      <main className="max-w-2xl mx-auto pb-20">

        {/* Scale card — overlaps header */}
        <div className="bg-white -mt-4 rounded-2xl shadow-lg mx-4 p-5 mb-6">
          <p className="font-mono-label text-xs font-bold text-poli-red uppercase tracking-widest mb-3">POLITICAL SPECTRUM</p>
          <div
            className="h-3 rounded-full w-full"
            style={{ background: 'linear-gradient(90deg, #2E5BFF 0%, #ECECF2 50%, #FF5A6E 100%)' }}
          />
          <div className="flex justify-between mt-2">
            <span className="text-xs font-mono-label text-poli-muted">L10</span>
            <span className="text-xs font-mono-label text-poli-muted">0</span>
            <span className="text-xs font-mono-label text-poli-muted">R10</span>
          </div>
          <p className="text-sm text-poli-body mt-3">
            All scores use a <strong>-10.00 to +10.00</strong> scale. Scores are displayed with two decimals (e.g., L8.25, CL2.00, C, CR1.75, R5.50).
          </p>

          {/* Scale bands */}
          <div className="grid grid-cols-5 gap-2 mt-4">
            <div className="p-2 rounded-lg bg-blue-50 border border-blue-200">
              <p className="font-semibold text-blue-700 text-xs">Left (L)</p>
              <p className="text-xs text-blue-600">-10 to -4</p>
              <p className="text-xs text-blue-500 mt-0.5">L10 to L4</p>
            </div>
            <div className="p-2 rounded-lg bg-blue-50/50 border border-purple-200">
              <p className="font-semibold text-purple-700 text-xs">Center-Left</p>
              <p className="text-xs text-purple-600">-3 to -1</p>
              <p className="text-xs text-purple-500 mt-0.5">CL3 to CL1</p>
            </div>
            <div className="p-2 rounded-lg bg-purple-50 border border-purple-200">
              <p className="font-semibold text-purple-700 text-xs">Center (C)</p>
              <p className="text-xs text-purple-600">0</p>
              <p className="text-xs text-purple-500 mt-0.5">Moderate</p>
            </div>
            <div className="p-2 rounded-lg bg-red-50/50 border border-purple-200">
              <p className="font-semibold text-purple-700 text-xs">Center-Right</p>
              <p className="text-xs text-purple-600">+1 to +3</p>
              <p className="text-xs text-purple-500 mt-0.5">CR1 to CR3</p>
            </div>
            <div className="p-2 rounded-lg bg-red-50 border border-red-200">
              <p className="font-semibold text-red-700 text-xs">Right (R)</p>
              <p className="text-xs text-red-600">+4 to +10</p>
              <p className="text-xs text-red-500 mt-0.5">R4 to R10</p>
            </div>
          </div>
        </div>

        {/* How it works steps */}
        <div className="bg-white rounded-2xl shadow-lg mx-4 p-5 mb-6">
          <p className="font-mono-label text-xs font-bold text-poli-red uppercase tracking-widest mb-5">THE PROCESS</p>

          {/* Step 1 */}
          <div className="flex gap-4 mb-6">
            <div className="w-[30px] h-[30px] rounded-full bg-poli-navy flex items-center justify-center text-white text-sm font-bold flex-shrink-0 mt-0.5">1</div>
            <div>
              <p className="text-base font-bold text-poli-navy">Answer the Quiz</p>
              <p className="text-sm text-poli-body mt-1 leading-relaxed">
                Each quiz question has 5 answer options (A–E) mapped to values from -10 to +10. Answer A or B to indicate a progressive lean, C for neutral or mixed, and D or E for a conservative lean. Your topic score is the average of your answers for that topic's questions.
              </p>
            </div>
          </div>

          {/* Step 2 */}
          <div className="flex gap-4 mb-6">
            <div className="w-[30px] h-[30px] rounded-full bg-poli-navy flex items-center justify-center text-white text-sm font-bold flex-shrink-0 mt-0.5">2</div>
            <div>
              <p className="text-base font-bold text-poli-navy">Issues Are Weighted</p>
              <p className="text-sm text-poli-body mt-1 leading-relaxed">
                Your overall score is a weighted average of topic scores. During onboarding you rank 3 federal topics (Priority #1 = ×3, #2 = ×2, #3 = ×1) and 2 local topics (Priority #1 = ×2, #2 = ×1). Unranked federal topics still contribute at baseline weight ×1. Higher-ranked topics count more in your overall score.
              </p>
            </div>
          </div>

          {/* Step 3 */}
          <div className="flex gap-4 mb-6">
            <div className="w-[30px] h-[30px] rounded-full bg-poli-navy flex items-center justify-center text-white text-sm font-bold flex-shrink-0 mt-0.5">3</div>
            <div>
              <p className="text-base font-bold text-poli-navy">Candidates Are Scored</p>
              <p className="text-sm text-poli-body mt-1 leading-relaxed">
                Candidate positions are drawn from official voting records (Congress.gov), public statements, campaign finance data (FEC), and party platforms across 17 policy topics. When a candidate's stance is unknown (no reliable sources found), that question is excluded from score calculations rather than forced to 0.00. More unknown stances reduce confidence. All unknown questions are listed on candidate pages.
              </p>
            </div>
          </div>

          {/* Step 4 */}
          <div className="flex gap-4 mb-6">
            <div className="w-[30px] h-[30px] rounded-full bg-poli-navy flex items-center justify-center text-white text-sm font-bold flex-shrink-0 mt-0.5">4</div>
            <div>
              <p className="text-base font-bold text-poli-navy">Get Your Match</p>
              <p className="text-sm text-poli-body mt-1 leading-relaxed">
                Question-level scores are aggregated by topic and weighted by evidence strength — voting record carries more weight than public statements, which carry more than inferred party position — to produce a candidate's overall alignment. The closer a candidate's weighted score is to yours, the higher your match percentage.
              </p>
            </div>
          </div>
        </div>

        {/* Choice mapping */}
        <div className="bg-white rounded-2xl shadow-lg mx-4 p-5 mb-6">
          <p className="font-mono-label text-xs font-bold text-poli-red uppercase tracking-widest mb-4">CHOICE MAPPING</p>
          <p className="text-sm text-poli-body mb-4">How A/B/C/D/E answers map to positions:</p>
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <span className="bg-poli-navy/10 text-poli-navy rounded-md px-2 py-0.5 text-xs font-bold font-mono-label">A</span>
              <span className="bg-poli-navy/10 text-poli-navy rounded-md px-2 py-0.5 text-xs font-bold font-mono-label">B</span>
              <span className="text-sm text-poli-body">Progressive — left-leaning position (-10 to -5)</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="bg-poli-surface text-poli-muted rounded-md px-2 py-0.5 text-xs font-bold font-mono-label">C</span>
              <span className="text-sm text-poli-body">Neutral or mixed position (0)</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="bg-poli-red/10 text-poli-red rounded-md px-2 py-0.5 text-xs font-bold font-mono-label">D</span>
              <span className="bg-poli-red/10 text-poli-red rounded-md px-2 py-0.5 text-xs font-bold font-mono-label">E</span>
              <span className="text-sm text-poli-body">Conservative — right-leaning position (+5 to +10)</span>
            </div>
          </div>
        </div>

        {/* Match strength legend */}
        <div className="bg-white rounded-2xl shadow-lg mx-4 p-5 mb-6">
          <p className="font-mono-label text-xs font-bold text-poli-red uppercase tracking-widest mb-4">MATCH STRENGTH</p>
          <div className="flex items-center gap-3 mb-2">
            <div className="flex gap-1">
              <span className="w-[6px] h-[6px] rounded-sm bg-poli-green inline-block" />
              <span className="w-[6px] h-[6px] rounded-sm bg-poli-green inline-block" />
              <span className="w-[6px] h-[6px] rounded-sm bg-poli-green inline-block" />
            </div>
            <span className="text-sm text-poli-body">Strong Match (85–100%)</span>
          </div>
          <div className="flex items-center gap-3 mb-2">
            <div className="flex gap-1">
              <span className="w-[6px] h-[6px] rounded-sm bg-poli-gold inline-block" />
              <span className="w-[6px] h-[6px] rounded-sm bg-poli-gold inline-block" />
              <span className="w-[6px] h-[6px] rounded-sm bg-poli-surface inline-block" />
            </div>
            <span className="text-sm text-poli-body">Good Match (65–84%)</span>
          </div>
          <div className="flex items-center gap-3 mb-2">
            <div className="flex gap-1">
              <span className="w-[6px] h-[6px] rounded-sm bg-poli-red inline-block" />
              <span className="w-[6px] h-[6px] rounded-sm bg-poli-surface inline-block" />
              <span className="w-[6px] h-[6px] rounded-sm bg-poli-surface inline-block" />
            </div>
            <span className="text-sm text-poli-body">Weak Match (&lt;65%)</span>
          </div>
        </div>

        {/* Confidence tiers */}
        <div className="bg-white rounded-2xl shadow-lg mx-4 p-5 mb-6">
          <p className="font-mono-label text-xs font-bold text-poli-red uppercase tracking-widest mb-4">CONFIDENCE TIERS</p>
          <p className="text-sm text-poli-body mb-4">
            Confidence reflects how strong and complete the available evidence is for a candidate's scored positions:
          </p>
          <div className="space-y-3">
            <div className="flex items-center">
              <span className="bg-poli-green/10 text-poli-green border border-poli-green/20 rounded-full px-3 py-1 text-xs font-bold font-mono-label whitespace-nowrap">TIER A</span>
              <span className="text-xs text-poli-muted ml-2">High-confidence sourcing and coverage — AI stance evidence + donors + voting record available</span>
            </div>
            <div className="flex items-center">
              <span className="bg-poli-gold/10 text-poli-gold border border-poli-gold/20 rounded-full px-3 py-1 text-xs font-bold font-mono-label whitespace-nowrap">TIER B</span>
              <span className="text-xs text-poli-muted ml-2">Mixed confidence across topics — AI stance evidence + limited donors or limited voting record</span>
            </div>
            <div className="flex items-center">
              <span className="bg-poli-surface text-poli-dim border border-poli-surface rounded-full px-3 py-1 text-xs font-bold font-mono-label whitespace-nowrap">TIER C</span>
              <span className="text-xs text-poli-muted ml-2">Limited or less-certain evidence — AI stance evidence only; donors/voting record unavailable</span>
            </div>
          </div>
        </div>

        {/* Disclaimer */}
        <div className="mx-4 p-5 rounded-2xl bg-poli-surface border border-poli-surface text-center">
          <p className="text-xs text-poli-muted leading-relaxed">
            <strong className="text-poli-dim">Disclaimer:</strong> Pulse is for informational purposes only.
            We do not endorse or recommend any candidate. Scores are based on publicly available information
            and AI analysis, which may contain errors. Always verify information from official sources.
          </p>
        </div>

        {/* Back link */}
        <div className="mx-4 mt-6">
          <Link to="/profile" className="inline-flex items-center text-poli-muted hover:text-poli-navy transition-colors text-sm">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Feed
          </Link>
        </div>

      </main>
    </div>
  );
};
