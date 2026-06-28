import { useEffect, useState, useMemo } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Seo } from '@/components/Seo';
import { ScoreText } from '@/components/ScoreText';
import { Badge } from '@/components/ui/badge';
import { ShareCardModal } from '@/components/share/ShareCardModal';
import { useProfile, useUserTopicScores, useUserTopics } from '@/hooks/useProfile';
import { useRepresentatives } from '@/hooks/useRepresentatives';
import { useCivicOfficials, CivicOfficial, OfficeLevelType } from '@/hooks/useCivicOfficials';
import { useHiddenStates } from '@/hooks/useHiddenStates';
import { usePersonalizedScoreMap } from '@/hooks/usePersonalizedScoreMap';
import { useUpcomingElections } from '@/hooks/useUpcomingElections';
import { RepresentativeComparisonCard } from '@/components/RepresentativeComparisonCard';
import { unifiedCandidateNameKey } from '@/hooks/useUnifiedCandidates';
import { formatRunningForOffice } from '@/lib/officeLabel';
import { BRAND_HOST } from '@/lib/brand';
import { invokeEdgeFunction } from '@/lib/edgeFunctions';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { formatScore, getScoreLabel } from '@/lib/scoreFormat';
import { Loader2, Sparkles, ArrowRight, BarChart3, Users, Share2, Building2, MapPin, Calendar, Vote } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ProfileAnalysis {
  summary: string;
  keyInsights: string[];
  partyComparison?: string;
  strongestPositions?: string[];
  democratAlignment: number;
  republicanAlignment: number;
  greenAlignment: number;
  libertarianAlignment: number;
  overallScore: number;
}

export const QuizResults = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { session } = useAuth();
  const { data: profile, isLoading: profileLoading } = useProfile();
  const { data: userTopicScores = [] } = useUserTopicScores();
  const { data: userTopics = [] } = useUserTopics();
  const { data: repsData, isLoading: repsLoading } = useRepresentatives(profile?.address);
  const { data: civicDataRaw, isLoading: civicLoading } = useCivicOfficials(profile?.address);
  const { data: upcomingElectionsRaw, isLoading: upcomingLoading } = useUpcomingElections(profile?.address);
  const { isHidden } = useHiddenStates();
  const [profileAnalysis, setProfileAnalysis] = useState<ProfileAnalysis | null>(null);
  const [isLoadingAI, setIsLoadingAI] = useState(false);
  const [resultsShareOpen, setResultsShareOpen] = useState(false);
  const [inviteShareOpen, setInviteShareOpen] = useState(false);

  // The user's own officials come from the Civic API (external), so RLS can't gate them — scope
  // them to visible states client-side, matching the rest of the app. National / empty-state
  // offices are kept (isHidden('') and isHidden(null) are false).
  const federalReps = useMemo(
    () => (repsData?.representatives ?? []).filter(r => !isHidden(r.state)),
    [repsData, isHidden],
  );
  const civicData = useMemo(() => {
    if (!civicDataRaw) return civicDataRaw;
    const keep = (o: CivicOfficial) => !isHidden(o.state);
    return {
      ...civicDataRaw,
      federalExecutive: civicDataRaw.federalExecutive.filter(keep),
      stateExecutive: civicDataRaw.stateExecutive.filter(keep),
      stateLegislative: civicDataRaw.stateLegislative.filter(keep),
      local: civicDataRaw.local.filter(keep),
    };
  }, [civicDataRaw, isHidden]);
  // "Candidates on Your Ballot" comes from the fetch-upcoming-elections edge function (service_role,
  // bypasses RLS), so it must be filtered here too. Drop hidden-state candidates and any election
  // left with none.
  const upcomingElections = useMemo(() => {
    if (!upcomingElectionsRaw) return upcomingElectionsRaw;
    const filterGroup = (arr: typeof upcomingElectionsRaw.federal) =>
      arr
        .map(e => ({ ...e, candidates: e.candidates.filter(c => !isHidden(c.state)) }))
        .filter(e => e.candidates.length > 0);
    return {
      ...upcomingElectionsRaw,
      federal: filterGroup(upcomingElectionsRaw.federal),
      state: filterGroup(upcomingElectionsRaw.state),
      local: filterGroup(upcomingElectionsRaw.local),
    };
  }, [upcomingElectionsRaw, isHidden]);
  const allRepsLoading = repsLoading || civicLoading;

  // Build set of name keys already shown in Representatives so we can dedupe
  const repNameKeys = useMemo(() => {
    const set = new Set<string>();
    federalReps.forEach(r => set.add(unifiedCandidateNameKey(r.name, r.office)));
    if (civicData) {
      [...civicData.federalExecutive, ...civicData.stateExecutive, ...civicData.stateLegislative, ...civicData.local]
        .forEach(o => set.add(unifiedCandidateNameKey(o.name, o.office)));
    }
    return set;
  }, [federalReps, civicData]);

  // Collect all official IDs for score resolution
  const allOfficialIds = useMemo(() => {
    const ids: string[] = [];
    federalReps.forEach(rep => ids.push(rep.bioguide_id || rep.id));
    if (civicData) {
      civicData.federalExecutive.forEach(o => ids.push(o.id));
      civicData.stateExecutive.forEach(o => ids.push(o.id));
      civicData.stateLegislative.forEach(o => ids.push(o.id));
      civicData.local.forEach(o => ids.push(o.id));
    }
    if (upcomingElections) {
      [...upcomingElections.federal, ...upcomingElections.state, ...upcomingElections.local]
        .forEach(e => e.candidates.forEach(c => ids.push(c.candidate_id)));
    }
    return ids.filter(Boolean);
  }, [federalReps, civicData, upcomingElections]);

  const { data: scoreMap } = usePersonalizedScoreMap(allOfficialIds);

  // Sort topic scores by weight (user's ranking) for the share card
  const topTopicsForShare = useMemo(() => {
    return [...userTopicScores]
      .sort((a, b) => {
        const aw = userTopics.find(ut => ut.topic_id === a.topic_id)?.weight || 0;
        const bw = userTopics.find(ut => ut.topic_id === b.topic_id)?.weight || 0;
        return bw - aw;
      })
      .slice(0, 4)
      .map(ts => ({
        topicName: ts.topics?.name || ts.topic_id,
        score: ts.score,
      }));
  }, [userTopicScores, userTopics]);

  // Personalized: returns rep's score averaged only across the questions the
  // user answered. Returns null (NA) when there is no overlap.
  const getResolvedScore = (id: string, _fallbackScore: number | null): number | null => {
    return scoreMap?.get(id) ?? null;
  };

  // Fetch AI profile analysis on mount
  useEffect(() => {
    const fetchProfileAnalysis = async () => {
      if (!session || !profile || userTopicScores.length === 0) return;

      setIsLoadingAI(true);
      try {
        const topicScoresForAI = userTopicScores.map(ts => ({
          topicId: ts.topic_id,
          topicName: ts.topics?.name || ts.topic_id,
          score: ts.score,
        }));

        const { data, error } = await invokeEdgeFunction('user-profile-analysis', {
          body: {
            overallScore: profile.overall_score,
            topicScores: topicScoresForAI,
            userName: profile.name,
          },
        });

        if (error) throw error;
        setProfileAnalysis(data);
      } catch (error) {
        console.error('Failed to fetch profile analysis:', error);
        toast({
          title: 'AI Analysis',
          description: 'Could not load AI analysis. Scores are still displayed.',
          variant: 'destructive',
        });
      } finally {
        setIsLoadingAI(false);
      }
    };

    fetchProfileAnalysis();
  }, [session, profile, userTopicScores, toast]);

  if (profileLoading) {
    return (
      <div className="min-h-screen bg-[#F5F6FA] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-poli-navy" />
      </div>
    );
  }

  if (!profile) {
    navigate('/onboarding');
    return null;
  }

  // Sort topic scores by weight (user's ranking)
  const sortedTopicScores = [...userTopicScores].sort((a, b) => {
    const aWeight = userTopics.find(ut => ut.topic_id === a.topic_id)?.weight || 0;
    const bWeight = userTopics.find(ut => ut.topic_id === b.topic_id)?.weight || 0;
    return bWeight - aWeight;
  });

  const getScoreBarWidth = (score: number) => {
    return ((score + 10) / 20) * 100;
  };

  const shareUrl = typeof window !== 'undefined' ? window.location.href : '';
  const inviteUrl = typeof window !== 'undefined' ? window.location.origin : '';
  const brandHost = BRAND_HOST;

  // Derive score label for the overlap card (e.g. "L8 Progressive")
  const scoreLabel = getScoreLabel(profile.overall_score);

  // Donut chart percentage — map overall_score (-100..100) to 0..100%
  const donutPct = Math.round(((profile.overall_score ?? 0) + 100) / 2);

  return (
    <div className="bg-[#F5F6FA] min-h-screen pb-20">
      <Seo
        title="Your Political Profile — Pulse"
        description="See your personalized political profile based on your quiz responses, and compare your views with candidates and parties."
        path="/results"
        noIndex
      />

      {/* Navy gradient header */}
      <div className="bg-gradient-to-br from-poli-navy to-poli-dark pt-12 pb-16 px-4">
        <div className="max-w-3xl mx-auto">
          <p className="font-mono-label text-xs font-bold text-poli-red/80 uppercase tracking-widest">
            Your Results
          </p>
          <h1 className="text-2xl font-black text-white mt-1">Pulse Score</h1>
          <p className="text-sm text-white/60">Answers locked in — quiz complete</p>

          {/* Share buttons in header */}
          <div className="flex flex-wrap items-center gap-2 mt-4">
            <button
              onClick={() => setResultsShareOpen(true)}
              className="flex items-center gap-1.5 text-xs font-semibold text-white/80 border border-white/20 rounded-lg px-3 py-1.5"
            >
              <Share2 className="w-3.5 h-3.5" />
              Share results
            </button>
            <button
              onClick={() => setInviteShareOpen(true)}
              className="flex items-center gap-1.5 text-xs font-semibold text-white/80 border border-white/20 rounded-lg px-3 py-1.5"
            >
              <Users className="w-3.5 h-3.5" />
              Invite others
            </button>
          </div>
        </div>
      </div>

      <ShareCardModal
        open={resultsShareOpen}
        onOpenChange={setResultsShareOpen}
        url={shareUrl}
        data={{
          kind: 'user-profile',
          brandHost,
          userName: profile?.name,
          userScore: profile?.overall_score ?? null,
          topTopics: topTopicsForShare,
        }}
        caption={{
          surface: 'quiz_results',
          kind: 'user-profile',
          userName: profile?.name,
          userScore: profile?.overall_score ?? null,
          topTopics: topTopicsForShare,
          url: shareUrl,
        }}
      />
      <ShareCardModal
        open={inviteShareOpen}
        onOpenChange={setInviteShareOpen}
        url={inviteUrl}
        data={{
          kind: 'invite',
          brandHost,
        }}
        caption={{ kind: 'invite', url: inviteUrl, surface: 'quiz_results_invite' }}
      />

      {/* Score overlap card — -mt-6 pulls it up over the header */}
      <div className="mx-4 max-w-3xl lg:mx-auto -mt-6 bg-white rounded-2xl shadow-lg p-5 flex items-center gap-4">
        {/* Donut */}
        <div
          className="w-16 h-16 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-black text-poli-navy"
          style={{
            background: `conic-gradient(#182B7A ${donutPct}%, #F0EFF4 ${donutPct}%)`,
          }}
        >
          <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center text-[10px] font-black text-poli-navy">
            {profile.overall_score > 0 ? '+' : ''}{profile.overall_score}
          </div>
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-lg font-black text-poli-navy leading-tight">{scoreLabel}</p>
          <p className="text-xs text-poli-muted mt-0.5">
            Score Version: {profile.score_version || 'v1.0'}
          </p>
          <div className="flex gap-3 mt-3">
            <button
              onClick={() => navigate('/profile')}
              className="flex items-center gap-1 text-xs font-bold text-white px-3 py-1.5 rounded-lg"
              style={{ background: '#182B7A' }}
            >
              View full profile
              <ArrowRight className="w-3 h-3" />
            </button>
            <Link
              to="/quiz"
              className="text-xs font-semibold text-poli-muted underline flex items-center"
            >
              Retake quiz
            </Link>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="max-w-3xl mx-auto mt-6 pb-12">

        {/* AI Profile Summary */}
        <div className="mx-4 mb-3">
          <p className="font-mono-label text-xs font-bold text-poli-red uppercase tracking-widest mb-2">
            AI Profile Summary
          </p>
          <div className="bg-white rounded-xl shadow-sm p-4">
            <div className="flex items-center gap-2 mb-3">
              <Sparkles className="w-4 h-4 text-poli-navy" />
              <span className="text-sm font-bold text-poli-body">AI Profile Summary</span>
            </div>
            {isLoadingAI ? (
              <div className="flex items-center gap-3 text-poli-muted py-4">
                <Loader2 className="w-5 h-5 animate-spin" />
                <span className="text-sm">Analyzing your political profile...</span>
              </div>
            ) : profileAnalysis ? (
              <div className="space-y-4">
                <p className="text-sm text-poli-body leading-relaxed">{profileAnalysis.summary}</p>

                {profileAnalysis.keyInsights && profileAnalysis.keyInsights.length > 0 && (
                  <div className="pt-4 border-t border-poli-surface">
                    <h4 className="text-xs font-bold text-poli-body mb-3 uppercase tracking-wide">Key Insights</h4>
                    <ul className="space-y-2">
                      {profileAnalysis.keyInsights.map((insight, index) => (
                        <li key={index} className="flex items-start gap-2 text-sm text-poli-muted">
                          <span className="text-poli-navy mt-1">•</span>
                          <span>{insight}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {profileAnalysis.strongestPositions && profileAnalysis.strongestPositions.length > 0 && (
                  <div className="pt-4 border-t border-poli-surface">
                    <h4 className="text-xs font-bold text-poli-body mb-3 uppercase tracking-wide">Your Strongest Positions</h4>
                    <div className="flex flex-wrap gap-2">
                      {profileAnalysis.strongestPositions.map((position, index) => (
                        <span
                          key={index}
                          className="px-3 py-1 bg-poli-navy/10 text-poli-navy text-xs rounded-full font-medium"
                        >
                          {position}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-poli-muted italic">
                AI summary unavailable. Your scores are displayed below.
              </p>
            )}
          </div>
        </div>

        {/* Your Representatives */}
        <div className="mx-4 mb-3">
          <p className="font-mono-label text-xs font-bold text-poli-red uppercase tracking-widest mb-2">
            Your Representatives
          </p>
          <div className="bg-white rounded-xl shadow-sm p-4">
            <div className="flex items-center gap-2 mb-3">
              <Users className="w-4 h-4 text-poli-navy" />
              <span className="text-sm font-bold text-poli-body">Your Representatives</span>
            </div>
            {!profile.address ? (
              <div className="text-center py-6">
                <p className="text-sm text-poli-muted mb-4">
                  Add your address in your profile to see your representatives and how they match with your views.
                </p>
                <button
                  onClick={() => navigate('/profile')}
                  className="border border-poli-navy text-poli-navy rounded-xl px-4 py-2 text-sm font-semibold"
                >
                  Go to Profile
                </button>
              </div>
            ) : allRepsLoading ? (
              <div className="flex items-center gap-3 text-poli-muted py-4">
                <Loader2 className="w-5 h-5 animate-spin" />
                <span className="text-sm">Finding your representatives...</span>
              </div>
            ) : (federalReps.length > 0 || (civicData && (civicData.federalExecutive.length > 0 || civicData.stateExecutive.length > 0 || civicData.stateLegislative.length > 0 || civicData.local.length > 0))) ? (
              <div className="space-y-6">
                {civicData && civicData.federalExecutive.length > 0 && (
                  <div>
                    <h4 className="text-xs font-semibold text-poli-muted mb-3 flex items-center gap-2 uppercase tracking-wide">
                      <Building2 className="w-4 h-4" />
                      Federal Executive
                    </h4>
                    <div className="space-y-3">
                      {civicData.federalExecutive.map((official) => (
                        <RepresentativeComparisonCard
                          key={official.id}
                          official={official}
                          resolvedScore={getResolvedScore(official.id, official.overall_score)}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {federalReps.length > 0 && (
                  <div>
                    <h4 className="text-xs font-semibold text-poli-muted mb-3 flex items-center gap-2 uppercase tracking-wide">
                      <Building2 className="w-4 h-4" />
                      U.S. Congress
                    </h4>
                    <div className="space-y-3">
                      {federalReps.map((rep) => {
                        const repId = rep.bioguide_id || rep.id;
                        const official: CivicOfficial = {
                          id: repId,
                          name: rep.name,
                          office: rep.office,
                          party: rep.party,
                          image_url: rep.image_url || '',
                          overall_score: rep.overall_score,
                          level: 'federal' as OfficeLevelType,
                          state: '',
                          is_incumbent: true,
                          coverage_tier: 'tier_3',
                          confidence: 'low',
                        };
                        return (
                          <RepresentativeComparisonCard
                            key={repId}
                            official={official}
                            resolvedScore={getResolvedScore(repId, rep.overall_score)}
                          />
                        );
                      })}
                    </div>
                  </div>
                )}

                {civicData && civicData.stateExecutive.length > 0 && (
                  <div>
                    <h4 className="text-xs font-semibold text-poli-muted mb-3 flex items-center gap-2 uppercase tracking-wide">
                      <Building2 className="w-4 h-4" />
                      State Executive
                    </h4>
                    <div className="space-y-3">
                      {civicData.stateExecutive.map((official) => (
                        <RepresentativeComparisonCard
                          key={official.id}
                          official={official}
                          resolvedScore={getResolvedScore(official.id, official.overall_score)}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {civicData && civicData.stateLegislative.length > 0 && (
                  <div>
                    <h4 className="text-xs font-semibold text-poli-muted mb-3 flex items-center gap-2 uppercase tracking-wide">
                      <Building2 className="w-4 h-4" />
                      State Legislature
                    </h4>
                    <div className="space-y-3">
                      {civicData.stateLegislative.map((official) => (
                        <RepresentativeComparisonCard
                          key={official.id}
                          official={official}
                          resolvedScore={getResolvedScore(official.id, official.overall_score)}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {civicData && civicData.local.length > 0 && (
                  <div>
                    <h4 className="text-xs font-semibold text-poli-muted mb-3 flex items-center gap-2 uppercase tracking-wide">
                      <MapPin className="w-4 h-4" />
                      Local Officials
                    </h4>
                    <div className="space-y-3">
                      {civicData.local.map((official) => (
                        <RepresentativeComparisonCard
                          key={official.id}
                          official={official}
                          resolvedScore={getResolvedScore(official.id, official.overall_score)}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-poli-muted text-center py-4">
                No representatives found for your address.
              </p>
            )}
          </div>
        </div>

        {/* Candidates on Your Ballot */}
        {profile.address && (upcomingLoading || (upcomingElections && [...upcomingElections.federal, ...upcomingElections.state, ...upcomingElections.local].length > 0)) && (
          <div className="mx-4 mb-3">
            <p className="font-mono-label text-xs font-bold text-poli-red uppercase tracking-widest mb-2">
              Candidates on Your Ballot
            </p>
            <div className="bg-white rounded-xl shadow-sm p-4">
              <div className="flex items-center gap-2 mb-3">
                <Vote className="w-4 h-4 text-poli-navy" />
                <span className="text-sm font-bold text-poli-body">Candidates on Your Ballot</span>
              </div>
              {upcomingLoading ? (
                <div className="flex items-center gap-3 text-poli-muted py-4">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span className="text-sm">Finding upcoming elections...</span>
                </div>
              ) : (
                <div className="space-y-6">
                  {(['federal', 'state', 'local'] as const).flatMap(level =>
                    (upcomingElections?.[level] ?? []).map(election => {
                      const newCandidates = election.candidates.filter(
                        c => !repNameKeys.has(unifiedCandidateNameKey(c.name, c.office)),
                      );
                      if (newCandidates.length === 0) return null;
                      const dateStr = new Date(election.election_date).toLocaleDateString(undefined, {
                        month: 'short', day: 'numeric', year: 'numeric',
                      });
                      return (
                        <div key={election.id}>
                          <h4 className="text-xs font-semibold text-poli-muted mb-3 flex items-center gap-2 uppercase tracking-wide">
                            <Calendar className="w-4 h-4" />
                            {election.name} — {dateStr}
                          </h4>
                          <div className="space-y-3">
                            {newCandidates.map(c => {
                              const official: CivicOfficial = {
                                id: c.candidate_id,
                                name: c.name,
                                office: c.office,
                                party: (c.party as CivicOfficial['party']) || 'Other',
                                image_url: c.image_url || '',
                                overall_score: c.overall_score ?? 0,
                                level: (level === 'federal' ? 'federal' : level === 'state' ? 'state' : 'local') as OfficeLevelType,
                                state: c.state,
                                district: c.district || undefined,
                                is_incumbent: c.is_incumbent,
                                coverage_tier: (c.coverage_tier as CivicOfficial['coverage_tier']) || 'tier_3',
                                confidence: (c.confidence as CivicOfficial['confidence']) || 'low',
                              };
                              const levelLabel = level === 'federal' ? 'Federal' : level === 'state' ? 'State' : 'Local';
                              const officeLabel = formatRunningForOffice(c.office, c.state, c.district);
                              return (
                                <div key={c.candidate_id} className="space-y-1.5">
                                  <div className="flex flex-wrap items-center gap-2 text-xs">
                                    <Badge variant="secondary" className="gap-1">
                                      <Vote className="w-3 h-3" />
                                      Running for {officeLabel}
                                    </Badge>
                                    <Badge variant="outline">{levelLabel}</Badge>
                                  </div>
                                  <RepresentativeComparisonCard
                                    official={official}
                                    resolvedScore={getResolvedScore(c.candidate_id, c.overall_score)}
                                  />
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    }),
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Topic Breakdown */}
        <div className="mx-4 mb-3">
          <p className="font-mono-label text-xs font-bold text-poli-red uppercase tracking-widest mb-2">
            Topic Breakdown
          </p>
          <div className="bg-white rounded-xl shadow-sm p-4">
            <div className="flex items-center gap-2 mb-1">
              <BarChart3 className="w-4 h-4 text-poli-navy" />
              <span className="text-sm font-bold text-poli-body">Topic Breakdown</span>
            </div>
            <p className="text-xs text-poli-muted mb-5">
              Your scores across your top 5 priority topics
            </p>

            <div className="space-y-4">
              {sortedTopicScores.slice(0, 5).map((ts, index) => {
                const topicName = ts.topics?.name || ts.topic_id;

                return (
                  <div key={ts.topic_id} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="w-6 h-6 rounded-full bg-poli-navy/10 text-poli-navy text-xs font-bold flex items-center justify-center">
                          {index + 1}
                        </span>
                        <span className="text-sm font-medium text-poli-body">{topicName}</span>
                      </div>
                      <span className={cn(
                        "font-mono text-sm font-semibold",
                        ts.score < 0 ? "text-blue-600" : ts.score > 0 ? "text-red-600" : "text-poli-navy"
                      )}>
                        {formatScore(ts.score)}
                      </span>
                    </div>

                    <div className="relative h-2 bg-poli-surface rounded-full overflow-hidden">
                      <div className="absolute inset-0 flex">
                        <div className="w-1/2 bg-blue-100" />
                        <div className="w-1/2 bg-red-100" />
                      </div>
                      <div
                        className="absolute top-0 bottom-0 w-1 bg-poli-body rounded-full transition-all"
                        style={{ left: `${getScoreBarWidth(ts.score)}%`, transform: 'translateX(-50%)' }}
                      />
                    </div>

                    <div className="flex justify-between text-xs text-poli-muted">
                      <span>Left</span>
                      <span>Center</span>
                      <span>Right</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* CTA */}
        <div className="mx-4 mt-6 flex flex-col items-center gap-3">
          <button
            onClick={() => navigate('/profile')}
            className="w-full h-12 rounded-xl font-bold text-white text-sm flex items-center justify-center gap-2"
            style={{ background: 'linear-gradient(90deg, #182B7A, #B3122F)' }}
          >
            Find Your Candidates
            <ArrowRight className="w-4 h-4" />
          </button>
          <p className="text-xs text-poli-muted text-center">
            Compare your positions with candidates in your district
          </p>
        </div>
      </div>
    </div>
  );
};
