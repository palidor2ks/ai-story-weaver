import { useState, useMemo, useCallback } from 'react';
import { Header } from '@/components/Header';
import { Seo } from '@/components/Seo';
import { CandidateCard } from '@/components/CandidateCard';
import { ComparePanel } from '@/components/ComparePanel';
import { calculateMatchScore } from '@/hooks/useCandidates';
import { useProfile } from '@/hooks/useProfile';
import { useUnifiedCandidates } from '@/hooks/useUnifiedCandidates';
import { useHiddenStates } from '@/hooks/useHiddenStates';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Search, SlidersHorizontal, Users, MapPin, Building, Crown, Landmark, GitCompare, X } from 'lucide-react';
import { Candidate } from '@/types';
import { cn } from '@/lib/utils';


export const Candidates = () => {
  const { data: profile, isLoading: profileLoading } = useProfile();
  const unified = useUnifiedCandidates({
    address: profile?.address,
    includeAllCongress: true,
  });

  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'match' | 'name' | 'party'>('name');
  const [partyFilter, setPartyFilter] = useState<string>('all');
  const [officeFilter, setOfficeFilter] = useState<string>('all');
  const [activeTab, setActiveTab] = useState<string>('all');

  // Compare mode state
  const [compareMode, setCompareMode] = useState(false);
  const [selectedCandidates, setSelectedCandidates] = useState<Candidate[]>([]);
  const [compareReady, setCompareReady] = useState(false);

  const handleToggleSelect = useCallback((candidate: Candidate) => {
    setSelectedCandidates(prev => {
      const exists = prev.find(c => c.id === candidate.id);
      if (exists) return prev.filter(c => c.id !== candidate.id);
      if (prev.length >= 4) return prev;
      return [...prev, candidate];
    });
  }, []);

  const handleRemoveFromCompare = useCallback((id: string) => {
    setSelectedCandidates(prev => prev.filter(c => c.id !== id));
  }, []);

  const handleClearCompare = useCallback(() => {
    setCompareReady(false);
    setSelectedCandidates([]);
  }, []);

  const handleCloseCompare = useCallback(() => {
    setCompareMode(false);
    setCompareReady(false);
    setSelectedCandidates([]);
  }, []);

  const allCandidates = unified.all;
  const myRepsCombined = unified.myReps.concat(
    unified.federalExec,
    unified.stateExec,
    unified.stateLeg,
    unified.local,
  ).filter((c, i, arr) => arr.findIndex(x => x.id === c.id) === i);
  const federalExecutiveCandidates = unified.federalExec;
  const stateExecutiveCandidates = unified.stateExec;
  const stateLegislativeCandidates = unified.stateLeg;
  const localCandidates = unified.local;

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

  const { isHidden } = useHiddenStates();

  const filteredCandidates = useMemo(() => {
    let result = tabCandidates.filter(c => !isHidden(c.state));

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
  }, [searchQuery, sortBy, partyFilter, officeFilter, tabCandidates, profile, isHidden]);

  const isLoading = profileLoading || unified.isLoading;

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
      <Seo
        title="All Politicians — Pulse"
        description="Browse the President, Congress members, governors, and local representatives. Filter by office, party, and state to find leaders who match your values."
        path="/candidates"
      />
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
                  setCompareReady(false);
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
            {compareMode && (
              <Button
                size="sm"
                onClick={() => setCompareReady(true)}
                disabled={selectedCandidates.length < 2}
                aria-label="Show comparison panel"
                className="gap-2"
              >
                Done ({selectedCandidates.length})
              </Button>
            )}
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
