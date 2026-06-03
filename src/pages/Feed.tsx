import { useState, useMemo, useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Header } from '@/components/Header';
import { Seo } from '@/components/Seo';
import { CandidateCard } from '@/components/CandidateCard';
import { QuestionUpdateAlert } from '@/components/QuestionUpdateAlert';
import { calculateMatchScore } from '@/hooks/useCandidates';
import { useProfile, useUserTopics } from '@/hooks/useProfile';
import { useUnifiedCandidates, unifiedCandidateNameKey } from '@/hooks/useUnifiedCandidates';
import { useUpcomingElections } from '@/hooks/useUpcomingElections';
import { RelevantNewsFeed } from '@/components/RelevantNewsFeed';
import { useHiddenStates } from '@/hooks/useHiddenStates';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScoreText } from '@/components/ScoreText';
import { Search, SlidersHorizontal, TrendingUp, MapPin, Sparkles, Building2 } from 'lucide-react';
import { Candidate, GovernmentLevel } from '@/types';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { usePersonalizedScoreMap } from '@/hooks/usePersonalizedScoreMap';

export const Feed = () => {
  const queryClient = useQueryClient();

  const { data: profile, isLoading: profileLoading } = useProfile();
  const { data: userTopics = [] } = useUserTopics();
  const { data: userQuestionIds = [] } = useQuery({
    queryKey: ['feed-user-question-ids'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('quiz_answers')
        .select('question_id')
        .order('created_at', { ascending: false })
        .limit(150);

      if (error) throw error;
      return Array.from(new Set((data ?? []).map((row) => row.question_id).filter(Boolean)));
    },
    staleTime: 5 * 60 * 1000,
  });
  const unified = useUnifiedCandidates({ address: profile?.address });
  const { data: upcomingElections } = useUpcomingElections(profile?.address);

  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'match' | 'name' | 'party'>('match');
  const [partyFilter, setPartyFilter] = useState<string>('all');
  const [levelFilter, setLevelFilter] = useState<GovernmentLevel>('all');
  const [incumbentFilter, setIncumbentFilter] = useState<string>('all');

  // Robust dedup that consistently considers BOTH the person and the seat
  // (office + state + district), so "Frank Pallone, Jr." (Representative) and
  // "PALLONE, FRANK JR" (U.S. House NJ-06) collapse into one profile.
  const SUFFIXES = new Set(['jr', 'sr', 'ii', 'iii', 'iv']);
  const tokensOf = (name: string): string[] => {
    return (name || '')
      .toLowerCase()
      .replace(/[.,]/g, ' ')
      .split(/\s+/)
      .map(t => t.replace(/[^a-z0-9]/g, ''))
      .filter(t => t && t.length > 1 && !SUFFIXES.has(t));
  };
  const personKey = (name: string): string =>
    Array.from(new Set(tokensOf(name))).sort().join(' ');
  const lastNameOf = (name: string): string => {
    // For "Last, First" the last name is the first token; otherwise the longest
    // trailing token. Falls back to whole personKey.
    const raw = (name || '').trim();
    if (raw.includes(',')) {
      const head = raw.split(',')[0];
      const t = tokensOf(head);
      if (t.length) return t[0];
    }
    const t = tokensOf(raw);
    return t.length ? t[t.length - 1] : personKey(raw);
  };
  const chamberOf = (office: string): string => {
    const o = (office || '').toLowerCase();
    if (/senate|senator/.test(o)) return 'senate';
    if (/house|representative|congress/.test(o)) return 'house';
    if (/president/.test(o)) return 'president';
    if (/governor/.test(o)) return 'governor';
    if (/mayor/.test(o)) return 'mayor';
    return o.replace(/[^a-z0-9]+/g, ' ').trim();
  };
  // Pull a district number from the explicit field OR the office string
  // (e.g. "U.S. House NJ-06", "NJ-6", "District 6", "06").
  const districtNumber = (office: string, district?: string | null): string => {
    const fromField = (district || '').toString().replace(/\D/g, '');
    if (fromField) return String(parseInt(fromField, 10));
    const o = (office || '');
    const m =
      o.match(/[A-Za-z]{2}[-\s]?(\d{1,2})\b/) ||
      o.match(/district\s+(\d{1,2})\b/i) ||
      o.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+district\b/i);
    if (m) return String(parseInt(m[1], 10));
    return '';
  };
  const seatBase = (office: string, state?: string | null) =>
    `${chamberOf(office)}|${(state || '').toLowerCase()}`;
  const seatKey = (office: string, state?: string | null, district?: string | null) => {
    const ch = chamberOf(office);
    const d = ch === 'house' ? districtNumber(office, district) : '';
    return `${seatBase(office, state)}|${d}`;
  };
  // Loose seat key WITHOUT district — used as a fallback so an incumbent
  // record with no district collapses with an upcoming-candidate record
  // that does specify the district (same chamber + same state).
  const seatKeyLoose = (office: string, state?: string | null) => seatBase(office, state);

  // Parallel keys for fuzzy-but-consistent matching:
  //   nameSeatKey  = full normalized name + seat (chamber+state+district)
  //   lastSeatKey  = last name + seat — catches "First Last" vs "LAST, FIRST"
  //   *Loose       = same, but ignores district (chamber+state only)
  const nameSeatKey = (name: string, office: string, state?: string | null, district?: string | null) =>
    `${personKey(name)}::${seatKey(office, state, district)}`;
  const lastSeatKey = (name: string, office: string, state?: string | null, district?: string | null) =>
    `${lastNameOf(name)}::${seatKey(office, state, district)}`;
  const nameSeatKeyLoose = (name: string, office: string, state?: string | null) =>
    `${personKey(name)}::${seatKeyLoose(office, state)}`;
  const lastSeatKeyLoose = (name: string, office: string, state?: string | null) =>
    `${lastNameOf(name)}::${seatKeyLoose(office, state)}`;

  // Address-scoped officials only (Feed only shows the user's reps + civic, not all of Congress)
  const transformedCandidates: Candidate[] = useMemo(() => {
    const seenIds = new Set<string>();
    const seenNameSeat = new Set<string>();
    const seenLastSeat = new Set<string>();
    const seenNameSeatLoose = new Set<string>();
    const seenLastSeatLoose = new Set<string>();
    const out: Candidate[] = [];
    const register = (name: string, office: string, state?: string | null, district?: string | null) => {
      seenNameSeat.add(nameSeatKey(name, office, state, district));
      seenLastSeat.add(lastSeatKey(name, office, state, district));
      seenNameSeatLoose.add(nameSeatKeyLoose(name, office, state));
      seenLastSeatLoose.add(lastSeatKeyLoose(name, office, state));
    };
    const isDuplicate = (name: string, office: string, state?: string | null, district?: string | null) =>
      seenNameSeat.has(nameSeatKey(name, office, state, district)) ||
      seenLastSeat.has(lastSeatKey(name, office, state, district)) ||
      seenNameSeatLoose.has(nameSeatKeyLoose(name, office, state)) ||
      seenLastSeatLoose.has(lastSeatKeyLoose(name, office, state));

    for (const c of [
      ...unified.myReps,
      ...unified.federalExec,
      ...unified.stateExec,
      ...unified.stateLeg,
      ...unified.local,
    ]) {
      if (seenIds.has(c.id)) continue;
      seenIds.add(c.id);
      register(c.name, c.office, c.state, c.district);
      out.push(c);
    }

    if (upcomingElections) {
      const levels: Array<'federal' | 'state' | 'local'> = ['federal', 'state', 'local'];
      for (const level of levels) {
        for (const election of upcomingElections[level] ?? []) {
          for (const c of election.candidates) {
            if (seenIds.has(c.candidate_id)) continue;
            if (isDuplicate(c.name, c.office, c.state, c.district)) continue;
            seenIds.add(c.candidate_id);
            register(c.name, c.office, c.state, c.district);
            const partyVal = (c.party as Candidate['party']) || 'Other';
            out.push({
              id: c.candidate_id,
              name: c.name,
              party: partyVal,
              office: c.office,
              state: c.state,
              district: c.district || undefined,
              imageUrl: c.image_url || undefined,
              overallScore: c.overall_score ?? 0,
              topicScores: [],
              lastUpdated: new Date(),
              coverageTier: (c.coverage_tier as 'tier_1' | 'tier_2' | 'tier_3') || 'tier_3',
              confidence: (c.confidence as 'high' | 'medium' | 'low') || 'low',
              isIncumbent: c.is_incumbent,
              transitionStatus: 'candidate',
              level,
            });
          }
        }
      }
    }

    return out;
  }, [unified.myReps, unified.federalExec, unified.stateExec, unified.stateLeg, unified.local, upcomingElections]);

  // Personalized score: rep's avg across ONLY the questions the user answered.
  // Falls back to the rep's global overallScore when there is no overlap so the
  // feed still renders something meaningful for unscored reps.
  const allCandidateIds = useMemo(
    () => transformedCandidates.map((c) => c.id),
    [transformedCandidates],
  );
  const { data: personalizedScoreMap } = usePersonalizedScoreMap(allCandidateIds);

  const personalizedCandidates: Candidate[] = useMemo(() => {
    if (!personalizedScoreMap || personalizedScoreMap.size === 0) {
      return transformedCandidates;
    }
    return transformedCandidates.map((c) => {
      const personalized = personalizedScoreMap.get(c.id);
      return personalized !== undefined ? { ...c, overallScore: personalized } : c;
    });
  }, [transformedCandidates, personalizedScoreMap]);

  // Track if we've shown the toast this session to avoid duplicates
  const toastShownRef = useRef(false);
  const aiAnswersGenerated = useMemo(
    () => transformedCandidates.filter(c => c.hasAIAnswers).length,
    [transformedCandidates],
  );

  useEffect(() => {
    if (aiAnswersGenerated > 0 && !toastShownRef.current) {
      toastShownRef.current = true;
      toast.success(`Generated AI-predicted positions for ${aiAnswersGenerated} of your representatives`, {
        icon: <Sparkles className="w-4 h-4" />,
      });
      queryClient.invalidateQueries({ queryKey: ['candidate-score-map'] });
      queryClient.invalidateQueries({ queryKey: ['candidates'] });
    }
  }, [aiAnswersGenerated, queryClient]);

  const { isHidden } = useHiddenStates();

  const filteredAndSortedCandidates = useMemo(() => {
    let result = personalizedCandidates.filter(c => !isHidden(c.state));

    // Filter by search query
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(c => 
        c.name.toLowerCase().includes(query) ||
        c.state.toLowerCase().includes(query) ||
        c.office.toLowerCase().includes(query)
      );
    }

    // Filter by party
    if (partyFilter !== 'all') {
      result = result.filter(c => c.party === partyFilter);
    }

    // Filter by incumbent/challenger
    if (incumbentFilter !== 'all') {
      const isIncumbent = incumbentFilter === 'incumbent';
      result = result.filter(c => c.isIncumbent === isIncumbent);
    }

    // Filter by government level (based on office or level property)
    if (levelFilter !== 'all') {
      result = result.filter(c => {
        const office = c.office.toLowerCase();
        const candidateLevel = c.level;
        
        if (levelFilter === 'federal') {
          return candidateLevel === 'federal' ||
            office.includes('president') ||
            office.includes('vice president') ||
            office.includes('senator') || 
            office.includes('representative') ||
            office.includes('u.s.');
        }
        if (levelFilter === 'state') {
          return candidateLevel === 'state' ||
            office.includes('governor') || 
            office.includes('state') ||
            office.includes('lieutenant') ||
            office.includes('attorney general') ||
            office.includes('secretary of state');
        }
        if (levelFilter === 'local') {
          return candidateLevel === 'local' ||
            office.includes('mayor') || 
            office.includes('council') || 
            office.includes('county') || 
            office.includes('sheriff') ||
            office.includes('commissioner') ||
            office.includes('supervisor') ||
            office.includes('school board');
        }
        return true;
      });
    }

    // Sort
    const userScore = profile?.overall_score ?? 0;
    switch (sortBy) {
      case 'match':
        result.sort((a, b) => {
          // Use calculated matchScore if available, otherwise fall back to overall score comparison
          const matchA = a.matchScore ?? calculateMatchScore(userScore, a.overallScore);
          const matchB = b.matchScore ?? calculateMatchScore(userScore, b.overallScore);
          return matchB - matchA;
        });
        break;
      case 'name':
        result.sort((a, b) => a.name.localeCompare(b.name));
        break;
      case 'party':
        result.sort((a, b) => a.party.localeCompare(b.party));
        break;
    }

    return result;
  }, [searchQuery, sortBy, partyFilter, incumbentFilter, levelFilter, personalizedCandidates, profile, isHidden]);

  const userTopicsList = userTopics.map(ut => ({
    id: ut.topics?.id || ut.topic_id,
    name: ut.topics?.name || ut.topic_id,
    icon: ut.topics?.icon || '',
    weight: ut.weight,
  }));

  const bestMatch = useMemo(() => {
    if (personalizedCandidates.length === 0) return 0;
    const matches = personalizedCandidates.map(c =>
      c.matchScore ?? calculateMatchScore(profile?.overall_score ?? 0, c.overallScore)
    );
    return Math.max(...matches);
  }, [personalizedCandidates, profile?.overall_score]);

  const newsPeople = useMemo(() => {
    const seen = new Set<string>();
    return [...unified.myReps, ...unified.federalExec].filter((person) => {
      const key = `${person.name.toLowerCase()}|${person.office.toLowerCase()}|${person.state.toLowerCase()}|${(person.district || '').toLowerCase()}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).map((person) => ({
      name: person.name,
      office: person.office,
      state: person.state,
      district: person.district,
    }));
  }, [unified.myReps, unified.federalExec]);

  const isLoading = profileLoading || unified.isLoading;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          <p className="text-muted-foreground text-sm">Loading your representatives...</p>
        </div>
      </div>
    );
  }

  const hasAddress = !!profile?.address;

  return (
    <div className="min-h-screen bg-background">
      <Seo
        title="Your Feed — Pulse"
        description="Compare your political views with your representatives and discover candidates who match your values on the issues that matter to you."
        path="/feed"
        noIndex
      />
      <Header />
      
      <main className="container py-8 px-4">
        {/* Welcome Section */}
        <div className="mb-8">
          <h1 className="font-display text-3xl md:text-4xl font-bold text-foreground mb-2">
            Welcome back, {profile?.name || 'Voter'}
          </h1>
          <p className="text-muted-foreground">
            {hasAddress 
              ? 'Compare your congressional representatives based on your political profile.'
              : 'Add your address to see your local representatives.'}
          </p>
        </div>

        {/* Question Update Notifications */}
        <QuestionUpdateAlert className="mb-6" />

        {/* Address Status */}
        {!hasAddress && (
          <Alert className="mb-6">
            <MapPin className="h-4 w-4" />
            <AlertDescription className="flex items-center justify-between">
              <span>Add your address in your profile to see your congressional representatives.</span>
              <Button asChild variant="outline" size="sm">
                <Link to="/profile">Update Profile</Link>
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {/* Quick Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-card rounded-xl border border-border p-4 shadow-sm">
            <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
              <TrendingUp className="w-4 h-4" />
              Your Score
            </div>
            <ScoreText score={profile?.overall_score} size="lg" />
          </div>
          <div className="bg-card rounded-xl border border-border p-4 shadow-sm">
            <div className="text-muted-foreground text-sm mb-1">Representatives</div>
            <div className="text-2xl font-bold text-foreground">{transformedCandidates.length}</div>
          </div>
          <div className="bg-card rounded-xl border border-border p-4 shadow-sm">
            <div className="text-muted-foreground text-sm mb-1">Best Match</div>
            <div className="text-2xl font-bold text-agree">
              {bestMatch}%
            </div>
          </div>
          <div className="bg-card rounded-xl border border-border p-4 shadow-sm">
            <div className="text-muted-foreground text-sm mb-1">Topics</div>
            <div className="text-2xl font-bold text-foreground">{userTopicsList.length}</div>
          </div>
        </div>

        {/* Government Level Tabs */}
        <Tabs value={levelFilter} onValueChange={(v) => setLevelFilter(v as GovernmentLevel)} className="mb-6">
          <TabsList>
            <TabsTrigger value="all">All Levels</TabsTrigger>
            <TabsTrigger value="federal">Federal</TabsTrigger>
            <TabsTrigger value="state">State</TabsTrigger>
            <TabsTrigger value="local">Local</TabsTrigger>
          </TabsList>
        </Tabs>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-4 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
            <Input
              placeholder="Search representatives..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          <div className="flex gap-2">
            <Select value={sortBy} onValueChange={(v: 'match' | 'name' | 'party') => setSortBy(v)}>
              <SelectTrigger className="w-[140px]">
                <SlidersHorizontal className="w-4 h-4 mr-2" />
                <SelectValue placeholder="Sort by" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="match">Best Match</SelectItem>
                <SelectItem value="name">Name</SelectItem>
                <SelectItem value="party">Party</SelectItem>
              </SelectContent>
            </Select>
            <Select value={partyFilter} onValueChange={setPartyFilter}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="Party" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Parties</SelectItem>
                <SelectItem value="Democrat">Democrat</SelectItem>
                <SelectItem value="Republican">Republican</SelectItem>
                <SelectItem value="Independent">Independent</SelectItem>
              </SelectContent>
            </Select>
            <Select value={incumbentFilter} onValueChange={setIncumbentFilter}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="incumbent">Incumbents</SelectItem>
                <SelectItem value="challenger">Challengers</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Relevant News Feed */}
        {newsPeople.length > 0 && (
          <div className="mb-6">
            <RelevantNewsFeed
              people={newsPeople}
              topics={(userTopics as Array<{ topic_id?: string; name?: string }>).map(t => t.topic_id || t.name).filter(Boolean)}
              questionIds={userQuestionIds}
              state={unified.myReps[0]?.state}
              district={unified.myReps.find(r => r.district)?.district}
              title="Relevant News for Your Representatives"
              maxItems={10}
            />
          </div>
        )}

        {/* Results Count */}
        <p className="text-sm text-muted-foreground mb-4">
          Showing {filteredAndSortedCandidates.length} representative{filteredAndSortedCandidates.length !== 1 ? 's' : ''}
          {hasAddress && unified.myReps.length > 0 && ' from Congress.gov'}
        </p>

        {/* Grouped Sections */}
        {(() => {
          const isExec = (o: string) => /president|vice president/i.test(o);
          const isStateExec = (o: string) => /governor|lieutenant|attorney general|secretary of state|treasurer|comptroller/i.test(o);

          const groups: { key: string; title: string; icon: typeof Building2; items: typeof filteredAndSortedCandidates }[] = [
            { key: 'fed-exec', title: 'Federal Executive', icon: Building2, items: [] },
            { key: 'congress', title: 'U.S. Congress', icon: Building2, items: [] },
            { key: 'state-exec', title: 'State Executive', icon: Building2, items: [] },
            { key: 'state-leg', title: 'State Legislature', icon: Building2, items: [] },
            { key: 'local', title: 'Local Officials', icon: MapPin, items: [] },
          ];

          for (const c of filteredAndSortedCandidates) {
            if (c.level === 'federal' && isExec(c.office)) groups[0].items.push(c);
            else if (c.level === 'federal') groups[1].items.push(c);
            else if (c.level === 'state' && isStateExec(c.office)) groups[2].items.push(c);
            else if (c.level === 'state') groups[3].items.push(c);
            else if (c.level === 'local') groups[4].items.push(c);
            else groups[1].items.push(c);
          }

          // When the user has an address, render every group — including
          // empty ones — so it's clear that "State Legislature" or "Local
          // Officials" weren't found, instead of looking like the Feed only
          // covers federal seats.
          const showEmpty = hasAddress;
          return (
            <div className="space-y-8">
              {groups.filter(g => showEmpty || g.items.length > 0).map(g => {
                const Icon = g.icon;
                const empty = g.items.length === 0;
                return (
                  <section key={g.key}>
                    <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-3 flex items-center gap-2">
                      <Icon className="w-4 h-4" />
                      {g.title}
                      <span className="text-xs font-normal text-muted-foreground">({g.items.length})</span>
                    </h2>
                    {empty ? (
                      <div className="rounded-lg border border-dashed border-border bg-muted/30 px-4 py-6 text-sm text-muted-foreground">
                        We don't have {g.title.toLowerCase()} for your area yet.
                        {g.key === 'local' && ' Local data is being added state-by-state.'}
                        {g.key === 'state-leg' && ' Try refreshing — the state legislator lookup occasionally times out.'}
                      </div>
                    ) : (
                      <div className="space-y-6">
                        {[
                          {
                            key: 'incumbents',
                            title: 'Incumbents',
                            items: g.items.filter(candidate => candidate.isIncumbent),
                          },
                          {
                            key: 'new-candidates',
                            title: 'New Candidates',
                            items: g.items.filter(candidate => !candidate.isIncumbent),
                          },
                        ].map(subgroup => (
                          subgroup.items.length > 0 && (
                            <div key={subgroup.key} className="space-y-3">
                              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                {subgroup.title}
                                <span className="ml-1 text-muted-foreground">({subgroup.items.length})</span>
                              </h3>
                              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                                {subgroup.items.map((candidate, index) => (
                                  <CandidateCard key={candidate.id} candidate={candidate} index={index} />
                                ))}
                              </div>
                            </div>
                          )
                        ))}
                      </div>
                    )}
                  </section>
                );
              })}
            </div>
          );
        })()}

        {filteredAndSortedCandidates.length === 0 && (
          <div className="text-center py-16">
            <p className="text-muted-foreground">
              {hasAddress 
                ? 'No representatives found matching your criteria.' 
                : 'Add your address to see your representatives.'}
            </p>
            {hasAddress && (
              <Button variant="ghost" className="mt-4" onClick={() => {
                setSearchQuery('');
                setPartyFilter('all');
              }}>
                Clear Filters
              </Button>
            )}
          </div>
        )}
      </main>
    </div>
  );
};
