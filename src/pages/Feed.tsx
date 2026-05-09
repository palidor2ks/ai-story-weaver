import { useState, useMemo, useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Header } from '@/components/Header';
import { CandidateCard } from '@/components/CandidateCard';
import { QuestionUpdateAlert } from '@/components/QuestionUpdateAlert';
import { calculateMatchScore } from '@/hooks/useCandidates';
import { useProfile, useUserTopics } from '@/hooks/useProfile';
import { useUnifiedCandidates } from '@/hooks/useUnifiedCandidates';
import { useHiddenStates } from '@/hooks/useHiddenStates';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScoreText } from '@/components/ScoreText';
import { Search, SlidersHorizontal, TrendingUp, MapPin, AlertCircle, Sparkles, Building2 } from 'lucide-react';
import { Candidate, GovernmentLevel } from '@/types';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';

export const Feed = () => {
  const queryClient = useQueryClient();

  const { data: profile, isLoading: profileLoading } = useProfile();
  const { data: userTopics = [] } = useUserTopics();
  const unified = useUnifiedCandidates({ address: profile?.address });

  const representativesError = null;

  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'match' | 'name' | 'party'>('match');
  const [partyFilter, setPartyFilter] = useState<string>('all');
  const [levelFilter, setLevelFilter] = useState<GovernmentLevel>('all');
  const [incumbentFilter, setIncumbentFilter] = useState<string>('all');

  // Address-scoped officials only (Feed only shows the user's reps + civic, not all of Congress)
  const transformedCandidates: Candidate[] = useMemo(() => {
    const seen = new Set<string>();
    const out: Candidate[] = [];
    for (const c of [
      ...unified.myReps,
      ...unified.federalExec,
      ...unified.stateExec,
      ...unified.stateLeg,
      ...unified.local,
    ]) {
      if (seen.has(c.id)) continue;
      seen.add(c.id);
      out.push(c);
    }
    return out;
  }, [unified.myReps, unified.federalExec, unified.stateExec, unified.stateLeg, unified.local]);

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

  const candidatesWithScores = transformedCandidates;

  const { isHidden } = useHiddenStates();


  const filteredAndSortedCandidates = useMemo(() => {
    let result = candidatesWithScores.filter(c => !isHidden(c.state));

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
  }, [searchQuery, sortBy, partyFilter, incumbentFilter, levelFilter, candidatesWithScores, profile, isHidden]);

  const userTopicsList = userTopics.map(ut => ({
    id: ut.topics?.id || ut.topic_id,
    name: ut.topics?.name || ut.topic_id,
    icon: ut.topics?.icon || '',
    weight: ut.weight,
  }));

  const bestMatch = useMemo(() => {
    if (candidatesWithScores.length === 0) return 0;
    const matches = candidatesWithScores.map(c => 
      c.matchScore ?? calculateMatchScore(profile?.overall_score ?? 0, c.overallScore)
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

          return (
            <div className="space-y-8">
              {groups.filter(g => g.items.length > 0).map(g => {
                const Icon = g.icon;
                return (
                  <section key={g.key}>
                    <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-3 flex items-center gap-2">
                      <Icon className="w-4 h-4" />
                      {g.title}
                      <span className="text-xs font-normal text-muted-foreground/70">({g.items.length})</span>
                    </h2>
                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                      {g.items.map((candidate, index) => (
                        <CandidateCard key={candidate.id} candidate={candidate} index={index} />
                      ))}
                    </div>
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
