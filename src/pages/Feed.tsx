import { useState, useMemo, useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Header } from '@/components/Header';
import { CandidateCard } from '@/components/CandidateCard';
import { useCandidates, calculateMatchScore } from '@/hooks/useCandidates';
import { useProfile, useUserTopics } from '@/hooks/useProfile';
import { useRepresentatives } from '@/hooks/useRepresentatives';
import { useCivicOfficials } from '@/hooks/useCivicOfficials';
import { useCandidateScoreMap } from '@/hooks/useCandidateScoreMap';
import { useUserQuizQuestionIds, useRepresentativeAnswersAndScores } from '@/hooks/useRepresentativeScores';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScoreText } from '@/components/ScoreText';
import { Search, SlidersHorizontal, TrendingUp, MapPin, AlertCircle, Sparkles } from 'lucide-react';
import { Candidate, GovernmentLevel } from '@/types';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';

export const Feed = () => {
  const queryClient = useQueryClient();

  const { data: profile, isLoading: profileLoading } = useProfile();
  const { data: userTopics = [] } = useUserTopics();
  const { data: dbCandidates = [], isLoading: candidatesLoading } = useCandidates();
  const { data: repsData, isLoading: representativesLoading, error: representativesError } = useRepresentatives(profile?.address);
  const { data: civicData, isLoading: civicLoading } = useCivicOfficials(profile?.address);
  const { data: userQuizAnswers = [] } = useUserQuizQuestionIds();
  const congressMembers = repsData?.representatives ?? [];
  const civicOfficials = civicData?.officials ?? [];
  
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'match' | 'name' | 'party'>('match');
  const [partyFilter, setPartyFilter] = useState<string>('all');
  const [levelFilter, setLevelFilter] = useState<GovernmentLevel>('all');
  const [incumbentFilter, setIncumbentFilter] = useState<string>('all');

  // Combine database candidates with Congress API data and Civic API data
  const transformedCandidates: Candidate[] = useMemo(() => {
    // Transform Congress API members (federal)
    const congressCandidates: Candidate[] = congressMembers.map(member => ({
      id: member.bioguide_id || member.id,
      name: member.name,
      party: member.party as 'Democrat' | 'Republican' | 'Independent' | 'Other',
      office: member.office,
      state: member.state,
      district: member.district || undefined,
      imageUrl: member.image_url || undefined,
      overallScore: member.overall_score,
      topicScores: [],
      lastUpdated: new Date(),
      coverageTier: (member.coverage_tier || 'tier_3') as 'tier_1' | 'tier_2' | 'tier_3',
      confidence: (member.confidence || 'low') as 'high' | 'medium' | 'low',
      isIncumbent: member.is_incumbent ?? true,
      scoreVersion: 'v1.0',
      level: member.office === 'President' || member.office === 'Vice President' 
        ? 'federal' 
        : 'federal',
    }));

    // Transform Civic API officials (state and local)
    const civicCandidates: Candidate[] = civicOfficials
      .filter(official => {
        // Exclude federal legislative (we get those from Congress API)
        const isFederalLegislative = official.level === 'federal_legislative' ||
          official.office.toLowerCase().includes('senator') ||
          official.office.toLowerCase().includes('representative');
        return !isFederalLegislative;
      })
      .map(official => ({
        id: official.id,
        name: official.name,
        party: official.party,
        office: official.office,
        state: official.state,
        district: official.district,
        imageUrl: official.image_url || undefined,
        overallScore: official.overall_score,
        topicScores: [],
        lastUpdated: new Date(),
        coverageTier: (official.coverage_tier || 'tier_3') as 'tier_1' | 'tier_2' | 'tier_3',
        confidence: (official.confidence || 'low') as 'high' | 'medium' | 'low',
        isIncumbent: official.is_incumbent ?? true,
        scoreVersion: 'v1.0',
        level: official.level?.includes('state') ? 'state' : 
               official.level === 'local' ? 'local' : 'federal',
        // Transition fields
        transitionStatus: official.transition_status,
        newOffice: official.new_office,
        inaugurationDate: official.inauguration_date,
      }));

    // Transform database candidates (as fallback)
    const dbTransformed: Candidate[] = dbCandidates.map(c => ({
      id: c.id,
      name: c.name,
      party: c.party,
      office: c.office,
      state: c.state,
      district: c.district || undefined,
      imageUrl: c.image_url || undefined,
      overallScore: c.overall_score,
      topicScores: (c.topicScores || []).map(ts => ({
        topicId: ts.topic_id,
        topicName: ts.topics?.name || ts.topic_id,
        score: ts.score,
      })),
      lastUpdated: new Date(c.last_updated),
      coverageTier: c.coverage_tier,
      confidence: c.confidence,
      isIncumbent: c.is_incumbent,
      scoreVersion: c.score_version,
    }));

      // Combine: Congress data + Civic data (deduplicate by name + office + state + district + level)
      const allCandidates = [...congressCandidates, ...civicCandidates];
      const uniqueKeys = new Set<string>();
      const deduped = allCandidates.filter(c => {
        // Include state, district, and level to prevent legitimate candidates from being filtered out
        const key = `${c.name}-${c.office}-${c.state}-${c.district || ''}-${(c as any).level || ''}`;
        if (uniqueKeys.has(key)) return false;
        uniqueKeys.add(key);
        return true;
      });

    // Use combined data if available, otherwise fall back to DB
    return deduped.length > 0 ? deduped : dbTransformed;
  }, [congressMembers, civicOfficials, dbCandidates]);

  // Get representative info for score generation
  const representativeInfoList = useMemo(() => {
    return transformedCandidates.map(c => ({
      id: c.id,
      name: c.name,
      party: c.party,
      office: c.office,
      state: c.state,
    }));
  }, [transformedCandidates]);

  // Source-of-truth scores (saved to DB via get-candidate-answers)
  const { data: scoreMap } = useCandidateScoreMap(representativeInfoList.map(r => r.id));

  // Fetch/generate answers and calculate match scores for representatives
  const { data: scoresData } = useRepresentativeAnswersAndScores(
    representativeInfoList,
    userQuizAnswers
  );

  // Track if we've shown the toast this session to avoid duplicates
  const toastShownRef = useRef(false);

  // Show toast when NEW answers are generated (only once per session)
  useEffect(() => {
    if (scoresData?.answersGenerated && scoresData.answersGenerated > 0 && !toastShownRef.current) {
      toastShownRef.current = true;
      toast.success(`Generated ${scoresData.answersGenerated} AI-predicted positions for your representatives`, {
        icon: <Sparkles className="w-4 h-4" />,
      });

      // Pull freshly-saved overall scores from the DB so all pages stay consistent
      queryClient.invalidateQueries({ queryKey: ['candidate-score-map'] });
      queryClient.invalidateQueries({ queryKey: ['candidates'] });
    }
  }, [scoresData?.answersGenerated, queryClient]);

  // Merge DB-saved overall scores + per-user matchScore into candidates
  const candidatesWithScores = useMemo(() => {
    const base = transformedCandidates.map((candidate) => {
      const stored = scoreMap?.get(candidate.id);
      return stored !== undefined ? { ...candidate, overallScore: stored } : candidate;
    });

    if (!scoresData?.scores) return base;

    return base.map((candidate) => {
      const scoreInfo = scoresData.scores[candidate.id];
      if (scoreInfo && scoreInfo.answerCount > 0) {
        return {
          ...candidate,
          matchScore: scoreInfo.score,
          hasAIAnswers: scoreInfo.generated,
          answerCount: scoreInfo.answerCount,
        };
      }
      return candidate;
    });
  }, [transformedCandidates, scoreMap, scoresData]);

  const filteredAndSortedCandidates = useMemo(() => {
    let result = [...candidatesWithScores];

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
        const candidateLevel = (c as any).level;
        
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
          const matchA = (a as any).matchScore ?? calculateMatchScore(userScore, a.overallScore);
          const matchB = (b as any).matchScore ?? calculateMatchScore(userScore, b.overallScore);
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
  }, [searchQuery, sortBy, partyFilter, incumbentFilter, levelFilter, candidatesWithScores, profile]);

  const userTopicsList = userTopics.map(ut => ({
    id: ut.topics?.id || ut.topic_id,
    name: ut.topics?.name || ut.topic_id,
    icon: ut.topics?.icon || '',
    weight: ut.weight,
  }));

  const bestMatch = useMemo(() => {
    if (candidatesWithScores.length === 0) return 0;
    const matches = candidatesWithScores.map(c => 
      (c as any).matchScore ?? calculateMatchScore(profile?.overall_score ?? 0, c.overallScore)
    );
    return Math.max(...matches);
  }, [candidatesWithScores, profile?.overall_score]);

  const isLoading = profileLoading || candidatesLoading || representativesLoading || civicLoading;

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

        {representativesError && (
          <Alert variant="destructive" className="mb-6">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Failed to load representatives. Showing cached data.
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

        {/* Results Count */}
        <p className="text-sm text-muted-foreground mb-4">
          Showing {filteredAndSortedCandidates.length} representative{filteredAndSortedCandidates.length !== 1 ? 's' : ''}
          {hasAddress && congressMembers.length > 0 && ' from Congress.gov'}
        </p>

        {/* Candidate Grid */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredAndSortedCandidates.map((candidate, index) => (
            <CandidateCard 
              key={candidate.id} 
              candidate={candidate}
              index={index}
            />
          ))}
        </div>

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
