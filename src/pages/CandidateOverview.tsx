import { useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Heart, Share2 } from 'lucide-react';
import { Seo } from '@/components/Seo';
import { OfficialAvatar } from '@/components/OfficialAvatar';
import { AIExplanation } from '@/components/AIExplanation';
import { CandidatePositions } from '@/components/CandidatePositions';
import { useCandidate, useCandidateVotes, calculateMatchScore } from '@/hooks/useCandidates';
import { useCandidatePersonalizedScore } from '@/hooks/useCandidatePersonalizedScore';
import { useCandidateScoreMap } from '@/hooks/useCandidateScoreMap';
import { useBillSponsors } from '@/hooks/useBillSponsors';
import { useProfile, useUserTopicScores } from '@/hooks/useProfile';
import { formatScore, getScoreLabelProgCon } from '@/lib/scoreFormat';
import { normalizeOfficeName } from '@/lib/officeLabel';

const getOfficeAbbrev = (office: string | null | undefined): string => {
  if (!office) return 'OFF';
  if (office.toLowerCase().includes('senator')) return 'SEN';
  if (office.toLowerCase().includes('representative')) return 'REP';
  if (office.toLowerCase().includes('governor')) return 'GOV';
  return office.slice(0, 3).toUpperCase();
};

const sliderPositionFromScore = (score: number | null | undefined): number => {
  const clamped = Math.max(-10, Math.min(10, score ?? 0));
  return Math.round(((clamped + 10) / 20) * 90 + 5);
};

export const CandidateOverview = () => {
  const { id } = useParams<{ id: string }>();

  const { data: candidate, isLoading: candidateLoading } = useCandidate(id);
  const { data: scoreMap } = useCandidateScoreMap(id ? [id] : undefined);
  const { data: personalized } = useCandidatePersonalizedScore(id);
  const { data: votes = [] } = useCandidateVotes(id);
  const { data: sponsoredBills = [] } = useBillSponsors(id);
  const { data: profile } = useProfile();
  const { data: userTopicScores = [] } = useUserTopicScores();

  const resolvedScore = useMemo(() => {
    if (!id || !candidate) return candidate?.overall_score ?? 0;
    const mapped = scoreMap?.get(id);
    return mapped !== undefined ? mapped : candidate.overall_score;
  }, [id, scoreMap, candidate]);

  const userScore = profile?.overall_score ?? 0;
  const matchScore = calculateMatchScore(userScore, resolvedScore ?? 0);

  const personalizedScore = personalized?.score ?? resolvedScore ?? 0;
  const scoreLabel = formatScore(personalizedScore);
  const scoreDescription = getScoreLabelProgCon(personalizedScore);

  const matchPct = matchScore;
  const sliderPosition = sliderPositionFromScore(personalizedScore);

  const candidateTopicScores = useMemo(
    () =>
      (candidate?.topicScores || []).map((ts) => ({
        topicId: ts.topic_id,
        topicName: ts.topics?.name || ts.topic_id,
        score: ts.score,
      })),
    [candidate],
  );

  const userTopicScoresForAI = useMemo(
    () =>
      userTopicScores.map((ts) => ({
        topicId: ts.topic_id,
        topicName: ts.topics?.name ?? ts.topic_id,
        score: ts.score,
      })),
    [userTopicScores],
  );

  const sponsoredCount = sponsoredBills.filter((b) => b.is_sponsor).length;
  const cosponsoredCount = sponsoredBills.filter((b) => !b.is_sponsor).length;

  if (candidateLoading) {
    return (
      <div className="min-h-screen bg-poli-surface flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-poli-navy" />
      </div>
    );
  }

  if (!candidate) {
    return (
      <div className="min-h-screen bg-poli-surface flex flex-col items-center justify-center gap-4 px-4">
        <p className="text-poli-dim">Candidate not found</p>
        <Link
          to="/candidates"
          className="bg-poli-navy text-white font-bold text-sm rounded-[14px] px-6 py-3"
        >
          Back to Candidates
        </Link>
      </div>
    );
  }

  const officeAbbrev = getOfficeAbbrev(candidate.office);
  const lastName = candidate.name.split(' ').pop() ?? candidate.name;

  return (
    <div className="min-h-screen bg-poli-surface">
      <Seo
        title={`${candidate.name} — Pulse`}
        description={`See ${candidate.name}'s positions, voting record, and how they align with your views on the issues that matter most.`}
        path={`/candidate/${candidate.id}`}
        type="profile"
        image={candidate.image_url || undefined}
        jsonLd={{
          '@context': 'https://schema.org',
          '@type': 'Person',
          name: candidate.name,
          jobTitle: candidate.office,
          ...(candidate.image_url ? { image: candidate.image_url } : {}),
          ...(candidate.party
            ? { affiliation: { '@type': 'Organization', name: candidate.party } }
            : {}),
          ...(candidate.state
            ? { homeLocation: { '@type': 'Place', name: candidate.state } }
            : {}),
          url: `https://www.polipulseapp.com/candidate/${candidate.id}`,
        }}
      />

      <div className="max-w-lg mx-auto">
        {/* Navy gradient header */}
        <div className="bg-gradient-to-br from-poli-navy to-poli-dark text-white pb-10">
          <div className="flex items-center justify-between px-5 pt-4 pb-2">
            <Link to="/candidates">
              <ArrowLeft className="w-5 h-5 text-white/70" />
            </Link>
            <span className="font-mono-label text-xs tracking-widest uppercase text-white/80">
              {officeAbbrev}. {lastName}
            </span>
            <div className="flex gap-3 items-center">
              <button
                type="button"
                className="text-white/70"
                onClick={() =>
                  navigator.share?.({
                    title: candidate.name,
                    url: window.location.href,
                  })
                }
              >
                <Share2 className="w-5 h-5" />
              </button>
              <button type="button" className="text-white/70">
                <Heart className="w-5 h-5" />
              </button>
            </div>
          </div>

          <div className="flex items-center gap-4 px-5 pt-2">
            <OfficialAvatar
              size="lg"
              imageUrl={candidate.image_url}
              name={candidate.name}
              party={candidate.party ?? ''}
              className="!w-[72px] !h-[72px] rounded-full ring-2 ring-white/30 flex-shrink-0"
            />
            <div>
              <h1 className="font-sans font-black text-[23px] leading-tight text-white">
                {candidate.name}
              </h1>
              <p className="text-white/70 text-sm mt-0.5">
                {normalizeOfficeName(candidate.office ?? '')} · {candidate.state}
              </p>
              <div className="flex items-center gap-1.5 mt-1.5">
                <span className="w-2 h-2 rounded-full bg-white/60" />
                <span className="text-white/80 text-sm">{candidate.party}</span>
                {candidate.is_incumbent && (
                  <span className="text-white/50 text-sm">· Incumbent</span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* PoliScore overlap card */}
        <div className="mx-4 -mt-6 bg-white rounded-[22px] shadow-[0_10px_30px_rgba(11,15,34,0.12)] p-5">
          <p className="font-mono-label text-[9.5px] tracking-[2px] text-poli-red mb-2">
            POLISCORE
          </p>
          <div className="flex items-start justify-between">
            <div>
              <span className="font-sans font-black text-[46px] leading-none text-poli-navy">
                {scoreLabel}
              </span>
              <p className="text-sm text-poli-dim mt-1">{scoreDescription}</p>
            </div>
            {/* Donut circle */}
            <div className="relative mt-1">
              <div
                className="relative w-[64px] h-[64px] rounded-full"
                style={{
                  background: `conic-gradient(#182B7A 0 ${matchPct}%, #ECECF2 ${matchPct}% 100%)`,
                }}
              >
                <div className="absolute inset-[8px] bg-white rounded-full flex items-center justify-center">
                  <span className="font-sans font-black text-[13px] text-poli-navy">
                    {matchPct}%
                  </span>
                </div>
              </div>
              <p className="text-center font-mono-label text-[8px] text-poli-muted tracking-wide mt-1">
                YOUR MATCH
              </p>
            </div>
          </div>

          {/* Slider bar */}
          <div className="mt-5 relative">
            <div className="h-[5px] rounded-full bg-gradient-to-r from-[#2E5BFF] via-[#ECECF2] to-[#FF5A6E]" />
            <div
              className="absolute top-[2.5px] -translate-y-1/2"
              style={{ left: `${sliderPosition}%` }}
            >
              <div className="w-[14px] h-[14px] rounded-full bg-poli-navy border-2 border-white shadow -translate-x-1/2" />
            </div>
            <div className="flex justify-between mt-3">
              <span className="font-mono-label text-[8px] text-poli-muted">L · LIBERAL</span>
              <span className="font-mono-label text-[8px] text-poli-muted">CONSERVATIVE · C</span>
            </div>
          </div>
        </div>

        {/* Stat grid */}
        <div className="mx-4 mt-4 grid grid-cols-2 gap-2.5">
          {[
            { value: votes.length || '—', label: 'Key votes cast' },
            { value: '—', label: 'Party unity' },
            { value: sponsoredCount || '—', label: 'Bills sponsored' },
            { value: cosponsoredCount || '—', label: 'Cosponsored' },
          ].map((stat) => (
            <div
              key={stat.label}
              className="border border-[rgba(20,23,58,0.1)] rounded-[16px] p-3.5 bg-white"
            >
              <p className="font-sans font-black text-[22px] text-poli-navy leading-none">
                {stat.value}
              </p>
              <p className="text-[11px] text-poli-dim mt-1">{stat.label}</p>
            </div>
          ))}
        </div>

        {/* AI Analysis card */}
        <div className="mx-4 mt-4 border border-[rgba(24,43,122,0.2)] bg-[rgba(24,43,122,0.04)] rounded-[14px] p-3.5">
          <AIExplanation
            candidateId={candidate.id}
            candidateName={candidate.name}
            topicScores={candidateTopicScores}
            userTopicScores={userTopicScoresForAI}
            matchScore={matchScore}
          />
        </div>

        {/* Top positions preview */}
        <div className="mx-4 mt-4">
          <p className="font-mono-label text-[10px] tracking-[2px] text-poli-red mb-3">
            FOR YOUR ISSUES
          </p>
          <CandidatePositions candidateId={candidate.id} candidateName={candidate.name} />
        </div>

        {/* View full profile CTA */}
        <Link to={`/candidate/${id}/profile`} className="block mx-4 mt-5">
          <button
            type="button"
            className="w-full bg-poli-navy text-white font-bold text-sm rounded-[14px] py-4"
          >
            View full profile →
          </button>
        </Link>

        {/* Footer links */}
        <div className="flex justify-center gap-6 mx-4 mt-5 pb-20">
          <button
            type="button"
            className="font-mono-label text-[10px] tracking-widest text-poli-dim uppercase"
            onClick={() =>
              navigator.share?.({
                title: candidate.name,
                url: window.location.href,
              })
            }
          >
            Share
          </button>
          <Link
            to={`/candidate/${id}/profile`}
            className="font-mono-label text-[10px] tracking-widest text-poli-dim uppercase"
          >
            Bio
          </Link>
          <Link
            to={`/candidate/${id}/profile`}
            className="font-mono-label text-[10px] tracking-widest text-poli-dim uppercase"
          >
            Committee
          </Link>
          <Link
            to={`/candidate/${id}/profile`}
            className="font-mono-label text-[10px] tracking-widest text-poli-dim uppercase"
          >
            Contact
          </Link>
        </div>
      </div>
    </div>
  );
};
