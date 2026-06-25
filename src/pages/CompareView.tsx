import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useCandidate, calculateMatchScore } from '@/hooks/useCandidates';
import { useCandidatePersonalizedScore } from '@/hooks/useCandidatePersonalizedScore';
import { formatScore } from '@/lib/scoreFormat';
import { useProfile } from '@/hooks/useProfile';
import { useCandidateScoreMap } from '@/hooks/useCandidateScoreMap';
import { CandidateWithOverride } from '@/hooks/useCandidates';

// ────────────────────────────────────────────────────────────
// helpers
// ────────────────────────────────────────────────────────────

function getInitials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .map((w) => w[0].toUpperCase())
    .slice(0, 2)
    .join('');
}

function avatarBg(party: string | undefined): string {
  if (party === 'Democrat') return 'bg-[#2A5BD0]';
  if (party === 'Republican') return 'bg-[#C8102E]';
  return 'bg-[#9A9EB5]';
}

function scoreLabelColor(score: number | null | undefined): string {
  if (score === null || score === undefined) return 'text-[#9A9EB5]';
  if (score <= -3) return 'text-[#182B7A]';
  if (score >= 3) return 'text-[#C8102E]';
  return 'text-purple-600';
}

type StanceKind = 'ALIGNS' | 'DIFFERS' | 'PARTIAL';

function compareStances(scoreA: number, scoreB: number): StanceKind {
  const signA = Math.sign(scoreA);
  const signB = Math.sign(scoreB);
  if (signA === 0 || signB === 0) return 'PARTIAL';
  if (signA === signB) return 'ALIGNS';
  if (signA !== signB) return 'DIFFERS';
  return 'PARTIAL';
}

function stanceBadgeClass(kind: StanceKind): string {
  switch (kind) {
    case 'ALIGNS':
      return 'bg-[#1B7A4B]/10 text-[#1B7A4B]';
    case 'DIFFERS':
      return 'bg-[#C8102E]/10 text-[#C8102E]';
    case 'PARTIAL':
      return 'bg-[#C19A3F]/10 text-[#C19A3F]';
  }
}

// ────────────────────────────────────────────────────────────
// sub-components
// ────────────────────────────────────────────────────────────

const Spinner = () => (
  <div className="min-h-screen bg-[#F5F6FA] flex items-center justify-center">
    <div className="flex flex-col items-center gap-3">
      <div className="w-8 h-8 border-2 border-[#182B7A] border-t-transparent rounded-full animate-spin" />
      <p className="text-sm text-[#9A9EB5] font-mono-label">Loading…</p>
    </div>
  </div>
);

const CandidateBlock = ({ candidate }: { candidate: CandidateWithOverride }) => (
  <div className="flex flex-col items-center gap-1 flex-1 min-w-0">
    <div
      className={`w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-sm flex-shrink-0 ${avatarBg(candidate.party)}`}
    >
      {getInitials(candidate.name)}
    </div>
    <p className="text-sm font-bold text-white text-center leading-tight mt-1 truncate w-full px-1">
      {candidate.name}
    </p>
    <p className="text-xs text-white/70 text-center leading-tight">
      {candidate.party?.charAt(0)} · {candidate.office}
    </p>
  </div>
);

interface ScoreColProps {
  candidate: CandidateWithOverride;
  resolvedScore: number;
  matchPercent: number | null;
  isLoggedIn: boolean;
}

const ScoreCol = ({ candidate, resolvedScore, matchPercent, isLoggedIn }: ScoreColProps) => (
  <div className="flex flex-col items-center gap-0.5 flex-1 min-w-0">
    <span className={`text-base font-bold font-mono-label ${scoreLabelColor(resolvedScore)}`}>
      {formatScore(resolvedScore)}
    </span>
    <span className="text-[10px] font-bold font-mono-label text-[#9A9EB5] uppercase tracking-widest">
      POLISCORE
    </span>
    {isLoggedIn && matchPercent !== null ? (
      <>
        <span className="text-lg font-black text-[#182B7A] mt-1">{Math.round(matchPercent)}%</span>
        <span className="text-[10px] text-[#9A9EB5] font-mono-label">your match</span>
      </>
    ) : (
      <span className="text-[10px] text-[#9A9EB5] font-mono-label mt-1">
        {candidate.party?.charAt(0) ?? '—'}
      </span>
    )}
  </div>
);

interface StanceBadgeProps {
  kind: StanceKind;
}

const StanceBadge = ({ kind }: StanceBadgeProps) => (
  <span
    className={`text-[10px] font-bold font-mono-label px-2 py-0.5 rounded-full ${stanceBadgeClass(kind)}`}
  >
    {kind}
  </span>
);

// ────────────────────────────────────────────────────────────
// main component
// ────────────────────────────────────────────────────────────

export const CompareView = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const idA = searchParams.get('a') ?? undefined;
  const idB = searchParams.get('b') ?? undefined;

  const { data: candidateA, isLoading: loadingA } = useCandidate(idA);
  const { data: candidateB, isLoading: loadingB } = useCandidate(idB);
  const { data: scoreMapA } = useCandidateScoreMap(idA ? [idA] : undefined);
  const { data: scoreMapB } = useCandidateScoreMap(idB ? [idB] : undefined);
  const { data: personalizedA } = useCandidatePersonalizedScore(idA);
  const { data: personalizedB } = useCandidatePersonalizedScore(idB);
  const { data: profile } = useProfile();

  const isLoading = loadingA || loadingB;

  if (!idA || !idB) {
    return (
      <div className="min-h-screen bg-[#F5F6FA] flex flex-col items-center justify-center gap-4 px-4">
        <p className="text-[#182B7A] font-mono-label text-sm font-bold uppercase tracking-widest text-center">
          Select two politicians to compare
        </p>
        <Link
          to="/candidates"
          className="text-sm text-[#182B7A] underline underline-offset-2"
        >
          Browse politicians →
        </Link>
      </div>
    );
  }

  if (isLoading) return <Spinner />;

  if (!candidateA || !candidateB) {
    return (
      <div className="min-h-screen bg-[#F5F6FA] flex flex-col items-center justify-center gap-4 px-4">
        <p className="text-[#C8102E] font-mono-label text-sm font-bold">CANDIDATE NOT FOUND</p>
        <button
          onClick={() => navigate(-1)}
          className="text-sm text-[#182B7A] underline underline-offset-2"
        >
          Go back
        </button>
      </div>
    );
  }

  const resolvedScoreA = scoreMapA?.get(idA) ?? candidateA.overall_score ?? 0;
  const resolvedScoreB = scoreMapB?.get(idB) ?? candidateB.overall_score ?? 0;

  const userScore = profile?.overall_score ?? 0;
  const isLoggedIn = !!profile;

  const matchPercentA = isLoggedIn ? calculateMatchScore(userScore, resolvedScoreA) : null;
  const matchPercentB = isLoggedIn ? calculateMatchScore(userScore, resolvedScoreB) : null;

  // Build shared-topic list from topicScores on both candidates
  const topicsA = candidateA.topicScores ?? [];
  const topicsB = candidateB.topicScores ?? [];

  const topicMapB = new Map(topicsB.map((ts) => [ts.topic_id, ts]));

  const sharedTopics = topicsA
    .filter((ts) => topicMapB.has(ts.topic_id))
    .map((tsA) => {
      const tsB = topicMapB.get(tsA.topic_id)!;
      const topicName = tsA.topics?.name ?? tsA.topic_id;
      const kind = compareStances(tsA.score, tsB.score);
      return { topic_id: tsA.topic_id, topicName, scoreA: tsA.score, scoreB: tsB.score, kind };
    });

  return (
    <div className="bg-[#F5F6FA] min-h-screen">
      {/* Navy gradient header */}
      <div className="bg-gradient-to-br from-[#182B7A] to-[#0C1A52] pt-12 pb-20 px-4">
        {/* Top bar */}
        <div className="flex items-center justify-between mb-8">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-1 text-white/80 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="text-sm font-semibold">Back</span>
          </button>
          <span className="font-mono-label text-xs font-bold text-white/60 uppercase tracking-widest">
            COMPARE
          </span>
          {/* spacer to center label */}
          <div className="w-12" />
        </div>

        {/* Candidate identity blocks */}
        <div className="flex items-start justify-between gap-4">
          <CandidateBlock candidate={candidateA} />
          <span className="font-mono-label text-sm font-bold text-white/40 mt-4 flex-shrink-0">
            VS
          </span>
          <CandidateBlock candidate={candidateB} />
        </div>
      </div>

      {/* Score card — overlaps header */}
      <div className="bg-white -mt-8 mx-4 rounded-2xl shadow-lg p-5">
        <div className="flex items-stretch gap-4">
          <ScoreCol
            candidate={candidateA}
            resolvedScore={resolvedScoreA}
            matchPercent={matchPercentA}
            isLoggedIn={isLoggedIn}
          />
          <div className="w-px bg-[#E8E9F0] flex-shrink-0" />
          <ScoreCol
            candidate={candidateB}
            resolvedScore={resolvedScoreB}
            matchPercent={matchPercentB}
            isLoggedIn={isLoggedIn}
          />
        </div>
        {!isLoggedIn && (
          <p className="text-[10px] text-[#9A9EB5] font-mono-label text-center mt-3">
            <Link to="/auth" className="underline text-[#182B7A]">Sign in</Link> to see your match %
          </p>
        )}
      </div>

      {/* Issue-by-issue section */}
      <p className="font-mono-label text-xs font-bold text-[#C8102E] uppercase tracking-widest mb-3 px-4 mt-4">
        ISSUE BY ISSUE
      </p>

      {sharedTopics.length === 0 ? (
        <div className="bg-white rounded-xl mx-4 mb-4 p-4 shadow-sm text-center">
          <p className="text-sm text-[#9A9EB5]">No shared topics available for these politicians.</p>
        </div>
      ) : (
        sharedTopics.map(({ topic_id, topicName, kind }) => (
          <div
            key={topic_id}
            className="bg-white rounded-xl mx-4 mb-2 p-4 shadow-sm flex items-center justify-between gap-3"
          >
            <span className="text-sm font-semibold text-[#3A3E5C] flex-1 min-w-0 truncate">
              {topicName}
            </span>
            <div className="flex items-center gap-2 flex-shrink-0">
              <StanceBadge kind={kind} />
              <span className="text-[#E8E9F0] text-xs">|</span>
              <StanceBadge kind={kind} />
            </div>
          </div>
        ))
      )}

      {/* AI Compare card */}
      <div className="bg-[#F4F6FB] border border-[#182B7A]/10 rounded-xl mx-4 mb-3 p-4">
        <p className="font-mono-label text-[10px] font-bold text-[#182B7A] uppercase tracking-widest mb-2">
          AI COMPARISON
        </p>
        <p className="text-sm text-[#3A3E5C]">
          {idA && idB
            ? `${candidateA.name} and ${candidateB.name} differ most on fiscal and social policy. ${candidateA.name} leans ${resolvedScoreA < 0 ? 'progressive' : 'conservative'} while ${candidateB.name} leans ${resolvedScoreB < 0 ? 'progressive' : 'conservative'}.`
            : 'Select both candidates to see AI comparison analysis.'}
        </p>
      </div>

      {/* Verdict box */}
      <div className="bg-[#F4F6FB] rounded-xl mx-4 mb-4 p-4">
        <p className="font-mono-label text-[10px] font-bold text-[#182B7A] uppercase tracking-widest mb-2">
          VERDICT
        </p>
        <p className="text-sm text-[#3A3E5C]">
          {sharedTopics.length > 0
            ? `${candidateA.name} and ${candidateB.name} align on ${sharedTopics.filter((t) => t.kind === 'ALIGNS').length} of ${sharedTopics.length} shared issues.`
            : `Compare ${candidateA.name} and ${candidateB.name} across the issues that matter most to you.`}
        </p>
      </div>

      {/* CTA buttons */}
      <div className="px-4 flex gap-3 mb-8">
        <Link
          to={`/candidate/${idA}/profile`}
          className="border border-[#182B7A] text-[#182B7A] rounded-xl h-12 flex-1 text-sm font-semibold flex items-center justify-center text-center leading-tight px-2"
        >
          View {candidateA.name.split(' ').pop()}'s profile →
        </Link>
        <Link
          to={`/candidate/${idB}/profile`}
          className="bg-[#182B7A] text-white rounded-xl h-12 flex-1 text-sm font-semibold flex items-center justify-center text-center leading-tight px-2"
        >
          View {candidateB.name.split(' ').pop()}'s profile →
        </Link>
      </div>
    </div>
  );
};
