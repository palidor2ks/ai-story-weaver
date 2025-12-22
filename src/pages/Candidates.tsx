import { useState, useMemo, useCallback } from 'react';
import { Header } from '@/components/Header';
import { CandidateCard } from '@/components/CandidateCard';
import { ComparePanel } from '@/components/ComparePanel';
import { useCandidates, calculateMatchScore } from '@/hooks/useCandidates';
import { useProfile } from '@/hooks/useProfile';
import { useRepresentatives } from '@/hooks/useRepresentatives';
import { useAllPoliticians } from '@/hooks/useAllPoliticians';
import { useCivicOfficials, CivicOfficial } from '@/hooks/useCivicOfficials';
import { useCandidateScoreMap } from '@/hooks/useCandidateScoreMap';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Search, SlidersHorizontal, Users, MapPin, Building, Crown, Landmark, GitCompare, X } from 'lucide-react';
import { Candidate } from '@/types';
import { cn } from '@/lib/utils';


export const Candidates = () => {
  const { data: profile, isLoading: profileLoading } = useProfile();
  const { data: dbCandidates = [], isLoading: candidatesLoading } = useCandidates();
  const { data: repsData, isLoading: representativesLoading } = useRepresentatives(profile?.address);
  const { data: allPoliticians = [], isLoading: allPoliticiansLoading } = useAllPoliticians();
  const { data: civicData, isLoading: civicLoading } = useCivicOfficials(profile?.address);
  const { data: scoreMap } = useCandidateScoreMap();
  
  const userReps = repsData?.representatives ?? [];
  
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'match' | 'name' | 'party'>('name');
  const [partyFilter, setPartyFilter] = useState<string>('all');
  const [officeFilter, setOfficeFilter] = useState<string>('all');
  const [activeTab, setActiveTab] = useState<string>('all');
  
  // Compare mode state
  const [compareMode, setCompareMode] = useState(false);
  const [selectedCandidates, setSelectedCandidates] = useState<Candidate[]>([]);

  const handleToggleSelect = useCallback((candidate: Candidate) => {
    setSelectedCandidates(prev => {
      const exists = prev.find(c => c.id === candidate.id);
      if (exists) {
        return prev.filter(c => c.id !== candidate.id);
      }
      if (prev.length >= 4) {
        return prev; // Max 4 candidates
      }
      return [...prev, candidate];
    });
  }, []);

  const handleRemoveFromCompare = useCallback((id: string) => {
    setSelectedCandidates(prev => prev.filter(c => c.id !== id));
  }, []);

  const handleClearCompare = useCallback(() => {
    setSelectedCandidates([]);
  }, []);

  const handleCloseCompare = useCallback(() => {
    setCompareMode(false);
    setSelectedCandidates([]);
  }, []);

  // Transform representatives to Candidate type (with saved scores)
  const transformRepToCandidate = useCallback((member: any): Candidate => {
    const savedScore = scoreMap?.get(member.bioguide_id || member.id);
    return {
      id: member.bioguide_id || member.id,
      name: member.name,
      party: member.party as 'Democrat' | 'Republican' | 'Independent' | 'Other',
      office: member.office,
      state: member.state,
      district: member.district || undefined,
      imageUrl: member.image_url || undefined,
      overallScore: savedScore ?? member.overall_score ?? 0,
      topicScores: [],
      lastUpdated: new Date(),
      coverageTier: (member.coverage_tier || 'tier_3') as 'tier_1' | 'tier_2' | 'tier_3',
      confidence: (member.confidence || 'low') as 'high' | 'medium' | 'low',
      isIncumbent: member.is_incumbent ?? true,
      scoreVersion: 'v1.0',
    };
  }, [scoreMap]);

  // Transform civic official to Candidate type (with saved scores)
  const transformCivicToCandidate = useCallback((official: CivicOfficial): Candidate => {
    const savedScore = scoreMap?.get(official.id);
    return {
      id: official.id,
      name: official.name,
      party: official.party,
      office: official.office,
      state: official.state,
      district: official.district,
      imageUrl: official.image_url || undefined,
      overallScore: savedScore ?? official.overall_score ?? 0,
      topicScores: [],
      lastUpdated: new Date(),
      coverageTier: (official.coverage_tier || 'tier_3') as 'tier_1' | 'tier_2' | 'tier_3',
      confidence: (official.confidence || 'low') as 'high' | 'medium' | 'low',
      isIncumbent: official.is_incumbent ?? true,
      scoreVersion: 'v1.0',
    };
  }, [scoreMap]);

  // User's federal representatives (filtered by their district)
  const userRepresentatives: Candidate[] = useMemo(() => {
    return userReps.map(transformRepToCandidate);
  }, [userReps, transformRepToCandidate]);

  // All Congress members
  const allCongressCandidates: Candidate[] = useMemo(() => {
    return allPoliticians.map(transformRepToCandidate);
  }, [allPoliticians, transformRepToCandidate]);

  // Civic officials (President, VP, Governors, State/Local)
  const federalExecutiveCandidates: Candidate[] = useMemo(() => {
    return (civicData?.federalExecutive || []).map(transformCivicToCandidate);
  }, [civicData?.federalExecutive, transformCivicToCandidate]);

  const stateExecutiveCandidates: Candidate[] = useMemo(() => {
    return (civicData?.stateExecutive || []).map(transformCivicToCandidate);
  }, [civicData?.stateExecutive, transformCivicToCandidate]);

  const stateLegislativeCandidates: Candidate[] = useMemo(() => {
    return (civicData?.stateLegislative || []).map(transformCivicToCandidate);
  }, [civicData?.stateLegislative, transformCivicToCandidate]);

  const localCandidates: Candidate[] = useMemo(() => {
    return (civicData?.local || []).map(transformCivicToCandidate);
  }, [civicData?.local, transformCivicToCandidate]);

  // Database candidates (local/state officials, running candidates)
  const dbTransformed: Candidate[] = useMemo(() => {
    return dbCandidates.map(c => ({
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
  }, [dbCandidates]);

  // All candidates combined (deduplicated)
  const allCandidates: Candidate[] = useMemo(() => {
    const seen = new Set<string>();
    const result: Candidate[] = [];
    
    // Add federal executive first (President, VP)
    for (const c of federalExecutiveCandidates) {
      if (!seen.has(c.id)) {
        seen.add(c.id);
        result.push(c);
      }
    }
    
    // Add Congress members (from Congress.gov API - more detailed)
    for (const c of allCongressCandidates) {
      if (!seen.has(c.id)) {
        seen.add(c.id);
        result.push(c);
      }
    }
    
    // Add state executive (Governors, etc.)
    for (const c of stateExecutiveCandidates) {
      if (!seen.has(c.id)) {
        seen.add(c.id);
        result.push(c);
      }
    }
    
    // Add state legislative
    for (const c of stateLegislativeCandidates) {
      if (!seen.has(c.id)) {
        seen.add(c.id);
        result.push(c);
      }
    }
    
    // Add local officials
    for (const c of localCandidates) {
      if (!seen.has(c.id)) {
        seen.add(c.id);
        result.push(c);
      }
    }
    
    // Add database candidates
    for (const c of dbTransformed) {
      if (!seen.has(c.id)) {
        seen.add(c.id);
        result.push(c);
      }
    }
    
    return result;
  }, [federalExecutiveCandidates, allCongressCandidates, stateExecutiveCandidates, stateLegislativeCandidates, localCandidates, dbTransformed]);

  // My Reps combined (federal + state + local for user's address)
  const myRepsCombined: Candidate[] = useMemo(() => {
    const seen = new Set<string>();
    const result: Candidate[] = [];
    
    // Add federal executive
    for (const c of federalExecutiveCandidates) {
      if (!seen.has(c.id)) {
        seen.add(c.id);
        result.push(c);
      }
    }
    
    // Add user's federal reps (from Congress.gov)
    for (const c of userRepresentatives) {
      if (!seen.has(c.id)) {
        seen.add(c.id);
        result.push(c);
      }
    }
    
    // Add state executive
    for (const c of stateExecutiveCandidates) {
      if (!seen.has(c.id)) {
        seen.add(c.id);
        result.push(c);
      }
    }
    
    // Add state legislative
    for (const c of stateLegislativeCandidates) {
      if (!seen.has(c.id)) {
        seen.add(c.id);
        result.push(c);
      }
    }
    
    // Add local
    for (const c of localCandidates) {
      if (!seen.has(c.id)) {
        seen.add(c.id);
        result.push(c);
      }
    }
    
    return result;
  }, [federalExecutiveCandidates, userRepresentatives, stateExecutiveCandidates, stateLegislativeCandidates, localCandidates]);

  // Get unique offices for filter
  const uniqueOffices = useMemo(() => {
    const offices = new Set(allCandidates.map(c => c.office));
    return Array.from(offices).sort();
  }, [allCandidates]);

  // Get candidates based on active tab
  const tabCandidates = useMemo(() => {
    switch (activeTab) {
      case 'my-reps':
        return myRepsCombined;
      case 'executive':
        return [...federalExecutiveCandidates, ...stateExecutiveCandidates];
      case 'senators':
        return allCandidates.filter(c => c.office === 'Senator');
      case 'representatives':
        return allCandidates.filter(c => c.office === 'Representative');
      case 'state':
        return [...stateExecutiveCandidates, ...stateLegislativeCandidates];
      case 'local':
        return localCandidates;
      case 'all':
      default:
        return allCandidates;
    }
  }, [activeTab, myRepsCombined, federalExecutiveCandidates, stateExecutiveCandidates, stateLegislativeCandidates, localCandidates, allCandidates]);

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

  const isLoading = profileLoading || candidatesLoading || representativesLoading || allPoliticiansLoading || civicLoading;

  // Count for tabs
  const executiveCount = federalExecutiveCandidates.length + stateExecutiveCandidates.length;
  const stateCount = stateExecutiveCandidates.length + stateLegislativeCandidates.length;
  const localCount = localCandidates.length;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          <p className="text-muted-foreground text-sm">Loading all officials...</p>
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
            Browse {allCandidates.length} officials including the President, Congress, Governors, and local representatives.
          </p>
        </div>

        {/* Tabs for different views */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="mb-6">
          <TabsList className="flex flex-wrap h-auto gap-1 w-full lg:w-auto lg:inline-flex">
            <TabsTrigger value="all" className="gap-2">
              <Building className="w-4 h-4 hidden sm:inline" />
              All ({allCandidates.length})
            </TabsTrigger>
            <TabsTrigger value="my-reps" className="gap-2">
              <MapPin className="w-4 h-4 hidden sm:inline" />
              My Reps ({myRepsCombined.length})
            </TabsTrigger>
            <TabsTrigger value="executive" className="gap-2">
              <Crown className="w-4 h-4 hidden sm:inline" />
              Executive ({executiveCount})
            </TabsTrigger>
            <TabsTrigger value="senators" className="gap-2">
              <Users className="w-4 h-4 hidden sm:inline" />
              Senators ({allCandidates.filter(c => c.office === 'Senator').length})
            </TabsTrigger>
            <TabsTrigger value="representatives" className="gap-2">
              <Users className="w-4 h-4 hidden sm:inline" />
              House ({allCandidates.filter(c => c.office === 'Representative').length})
            </TabsTrigger>
            <TabsTrigger value="state" className="gap-2">
              <Landmark className="w-4 h-4 hidden sm:inline" />
              State ({stateCount})
            </TabsTrigger>
            <TabsTrigger value="local" className="gap-2">
              <MapPin className="w-4 h-4 hidden sm:inline" />
              Local ({localCount})
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
            {/* Compare Mode Toggle */}
            <Button 
              variant={compareMode ? "default" : "outline"} 
              size="sm"
              onClick={() => {
                if (compareMode) {
                  handleCloseCompare();
                } else {
                  setCompareMode(true);
                }
              }}
              className={cn("gap-2", compareMode && "bg-primary")}
            >
              {compareMode ? (
                <>
                  <X className="w-4 h-4" />
                  Exit Compare
                </>
              ) : (
                <>
                  <GitCompare className="w-4 h-4" />
                  Compare
                </>
              )}
            </Button>
          </div>
        </div>

        <div className="flex items-center justify-between mb-4">
          <p className="text-sm text-muted-foreground">
            Showing {filteredCandidates.length} politician{filteredCandidates.length !== 1 ? 's' : ''}
          </p>
          {compareMode && (
            <p className="text-sm text-primary font-medium">
              {selectedCandidates.length}/4 selected for comparison
            </p>
          )}
        </div>

        <div className={cn(
          "grid gap-4 md:grid-cols-2 lg:grid-cols-3",
          compareMode && selectedCandidates.length > 0 && "pb-48" // Space for compare panel
        )}>
          {filteredCandidates.map((candidate, index) => (
            <CandidateCard 
              key={candidate.id} 
              candidate={candidate}
              index={index}
              compareMode={compareMode}
              isSelected={selectedCandidates.some(c => c.id === candidate.id)}
              onToggleSelect={handleToggleSelect}
            />
          ))}
        </div>

        {filteredCandidates.length === 0 && (
          <div className="text-center py-16">
            <p className="text-muted-foreground">
              {(activeTab === 'my-reps' || activeTab === 'state' || activeTab === 'local' || activeTab === 'executive') && !profile?.address 
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

        {/* Compare Panel */}
        {compareMode && selectedCandidates.length > 0 && (
          <ComparePanel 
            candidates={selectedCandidates}
            userScore={profile?.overall_score ?? 0}
            onRemove={handleRemoveFromCompare}
            onClear={handleClearCompare}
            onClose={handleCloseCompare}
          />
        )}
      </main>
    </div>
  );
};
