import { useState, useMemo } from 'react';
import { Header } from '@/components/Header';
import { CandidateCard } from '@/components/CandidateCard';
import { useCandidates, calculateMatchScore } from '@/hooks/useCandidates';
import { useProfile } from '@/hooks/useProfile';
import { useRepresentatives } from '@/hooks/useRepresentatives';
import { useAllPoliticians } from '@/hooks/useAllPoliticians';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Search, SlidersHorizontal, Users, MapPin, Building } from 'lucide-react';
import { Candidate } from '@/types';

export const Candidates = () => {
  const { data: profile, isLoading: profileLoading } = useProfile();
  const { data: dbCandidates = [], isLoading: candidatesLoading } = useCandidates();
  const { data: repsData, isLoading: representativesLoading } = useRepresentatives(profile?.address);
  const { data: allPoliticians = [], isLoading: allPoliticiansLoading } = useAllPoliticians();
  
  const userReps = repsData?.representatives ?? [];
  
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'match' | 'name' | 'party'>('name');
  const [partyFilter, setPartyFilter] = useState<string>('all');
  const [officeFilter, setOfficeFilter] = useState<string>('all');
  const [activeTab, setActiveTab] = useState<string>('all');

  // Transform representatives to Candidate type
  const transformRepToCandidate = (member: any): Candidate => ({
    id: member.bioguide_id || member.id,
    name: member.name,
    party: member.party as 'Democrat' | 'Republican' | 'Independent' | 'Other',
    office: member.office,
    state: member.state,
    district: member.district || undefined,
    imageUrl: member.image_url || '',
    overallScore: member.overall_score,
    topicScores: [],
    lastUpdated: new Date(),
    coverageTier: (member.coverage_tier || 'tier_3') as 'tier_1' | 'tier_2' | 'tier_3',
    confidence: (member.confidence || 'low') as 'high' | 'medium' | 'low',
    isIncumbent: member.is_incumbent ?? true,
    scoreVersion: 'v1.0',
  });

  // User's representatives (filtered by their district)
  const userRepresentatives: Candidate[] = useMemo(() => {
    return userReps.map(transformRepToCandidate);
  }, [userReps]);

  // All Congress members
  const allCongressCandidates: Candidate[] = useMemo(() => {
    return allPoliticians.map(transformRepToCandidate);
  }, [allPoliticians]);

  // Database candidates (local/state officials, running candidates)
  const dbTransformed: Candidate[] = useMemo(() => {
    return dbCandidates.map(c => ({
      id: c.id,
      name: c.name,
      party: c.party,
      office: c.office,
      state: c.state,
      district: c.district || undefined,
      imageUrl: c.image_url || '',
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
  }, [dbCandidates]);

  // All candidates combined (deduplicated)
  const allCandidates: Candidate[] = useMemo(() => {
    const congressIds = new Set(allCongressCandidates.map(c => c.id));
    const uniqueDb = dbTransformed.filter(c => !congressIds.has(c.id));
    return [...allCongressCandidates, ...uniqueDb];
  }, [allCongressCandidates, dbTransformed]);

  // Get unique offices for filter
  const uniqueOffices = useMemo(() => {
    const offices = new Set(allCandidates.map(c => c.office));
    return Array.from(offices).sort();
  }, [allCandidates]);

  // Get candidates based on active tab
  const tabCandidates = useMemo(() => {
    switch (activeTab) {
      case 'my-reps':
        return userRepresentatives;
      case 'senators':
        return allCandidates.filter(c => c.office === 'Senator');
      case 'representatives':
        return allCandidates.filter(c => c.office === 'Representative');
      case 'all':
      default:
        return allCandidates;
    }
  }, [activeTab, userRepresentatives, allCandidates]);

  const filteredCandidates = useMemo(() => {
    let result = [...tabCandidates];

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(c => 
        c.name.toLowerCase().includes(query) ||
        c.state.toLowerCase().includes(query) ||
        c.office.toLowerCase().includes(query)
      );
    }

    if (partyFilter !== 'all') {
      result = result.filter(c => c.party === partyFilter);
    }

    if (officeFilter !== 'all') {
      result = result.filter(c => c.office === officeFilter);
    }

    const userScore = profile?.overall_score ?? 0;
    switch (sortBy) {
      case 'match':
        result.sort((a, b) => calculateMatchScore(userScore, b.overallScore) - calculateMatchScore(userScore, a.overallScore));
        break;
      case 'name':
        result.sort((a, b) => a.name.localeCompare(b.name));
        break;
      case 'party':
        result.sort((a, b) => a.party.localeCompare(b.party));
        break;
    }

    return result;
  }, [searchQuery, sortBy, partyFilter, officeFilter, tabCandidates, profile]);

  const isLoading = profileLoading || candidatesLoading || representativesLoading || allPoliticiansLoading;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          <p className="text-muted-foreground text-sm">Loading all Congress members...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      <main className="container py-8 px-4">
        <div className="mb-8">
          <h1 className="font-display text-3xl md:text-4xl font-bold text-foreground mb-2">
            All Politicians
          </h1>
          <p className="text-muted-foreground">
            Browse all {allCandidates.length} current members of Congress, your representatives, and candidates in our database.
          </p>
        </div>

        {/* Tabs for different views */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="mb-6">
          <TabsList className="grid w-full grid-cols-4 lg:w-auto lg:inline-flex">
            <TabsTrigger value="all" className="gap-2">
              <Building className="w-4 h-4 hidden sm:inline" />
              All ({allCandidates.length})
            </TabsTrigger>
            <TabsTrigger value="my-reps" className="gap-2">
              <MapPin className="w-4 h-4 hidden sm:inline" />
              My Reps ({userRepresentatives.length})
            </TabsTrigger>
            <TabsTrigger value="senators" className="gap-2">
              <Users className="w-4 h-4 hidden sm:inline" />
              Senators ({allCandidates.filter(c => c.office === 'Senator').length})
            </TabsTrigger>
            <TabsTrigger value="representatives" className="gap-2">
              <Users className="w-4 h-4 hidden sm:inline" />
              House ({allCandidates.filter(c => c.office === 'Representative').length})
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-4 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
            <Input
              placeholder="Search by name, state, or office..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          <div className="flex gap-2 flex-wrap">
            <Select value={sortBy} onValueChange={(v: 'match' | 'name' | 'party') => setSortBy(v)}>
              <SelectTrigger className="w-[140px]">
                <SlidersHorizontal className="w-4 h-4 mr-2" />
                <SelectValue placeholder="Sort by" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="name">Name</SelectItem>
                <SelectItem value="match">Best Match</SelectItem>
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
            {activeTab === 'all' && (
              <Select value={officeFilter} onValueChange={setOfficeFilter}>
                <SelectTrigger className="w-[160px]">
                  <SelectValue placeholder="Office" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Offices</SelectItem>
                  {uniqueOffices.map(office => (
                    <SelectItem key={office} value={office}>{office}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        </div>

        <p className="text-sm text-muted-foreground mb-4">
          Showing {filteredCandidates.length} politician{filteredCandidates.length !== 1 ? 's' : ''}
        </p>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredCandidates.map((candidate, index) => (
            <CandidateCard 
              key={candidate.id} 
              candidate={candidate}
              index={index}
            />
          ))}
        </div>

        {filteredCandidates.length === 0 && (
          <div className="text-center py-16">
            <p className="text-muted-foreground">
              {activeTab === 'my-reps' && !profile?.address 
                ? 'Add your address in your profile to see your representatives.' 
                : 'No politicians found.'}
            </p>
            <Button variant="ghost" className="mt-4" onClick={() => {
              setSearchQuery('');
              setPartyFilter('all');
              setOfficeFilter('all');
            }}>
              Clear Filters
            </Button>
          </div>
        )}
      </main>
    </div>
  );
};
