import { useState, useMemo, useCallback, useEffect, useRef, useDeferredValue } from 'react';
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
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination';
import { Search, SlidersHorizontal, Users, MapPin, Building, Crown, Landmark, GitCompare, X, Loader2 } from 'lucide-react';
import { Candidate } from '@/types';
import { cn } from '@/lib/utils';
import { normalizeOfficeName } from '@/lib/officeLabel';
import { useCandidatesIE } from '@/hooks/useIndependentExpenditures';

const PAGE_SIZE = 25;

/** Compact page list with ellipses, e.g. [1, 'ellipsis', 9, 10, 11, 'ellipsis', 40]. */
const getPageList = (current: number, total: number): (number | 'ellipsis')[] => {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages: (number | 'ellipsis')[] = [1];
  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);
  if (start > 2) pages.push('ellipsis');
  for (let i = start; i <= end; i++) pages.push(i);
  if (end < total - 1) pages.push('ellipsis');
  pages.push(total);
  return pages;
};


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
  const [statusFilter, setStatusFilter] = useState<'all' | 'incumbent' | 'challenger'>('all');
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
  const federalExecutiveCandidates = unified.federalExec;
  const stateExecutiveCandidates = unified.stateExec;
  const stateLegislativeCandidates = unified.stateLeg;
  const localCandidates = unified.local;

  const myRepsCombined = useMemo(() => {
    const combined = unified.myReps.concat(
      unified.federalExec,
      unified.stateExec,
      unified.stateLeg,
      unified.local,
    );
    return combined.filter((c, i, arr) => arr.findIndex(x => x.id === c.id) === i);
  }, [unified.myReps, unified.federalExec, unified.stateExec, unified.stateLeg, unified.local]);

  // Pre-compute office counts once instead of filtering allCandidates per tab label
  const officeCounts = useMemo(() => {
    let senator = 0;
    let rep = 0;
    const offices = new Set<string>();
    for (const c of allCandidates) {
      // Use the canonical label so the same role isn't split across raw variants
      // (e.g. "Representative" vs "U.S. House FL-01" are both counted as U.S. House).
      const office = normalizeOfficeName(c.office);
      offices.add(office);
      if (office === 'U.S. Senate') senator++;
      else if (office === 'U.S. House') rep++;
    }
    return { senator, rep, uniqueOffices: Array.from(offices).sort() };
  }, [allCandidates]);

  const uniqueOffices = officeCounts.uniqueOffices;

  // Get candidates based on active tab
  const tabCandidates = useMemo(() => {
    switch (activeTab) {
      case 'my-reps':
        return myRepsCombined;
      case 'executive':
        return [...federalExecutiveCandidates, ...stateExecutiveCandidates];
      case 'senators':
        return allCandidates.filter(c => normalizeOfficeName(c.office) === 'U.S. Senate');
      case 'representatives':
        return allCandidates.filter(c => normalizeOfficeName(c.office) === 'U.S. House');
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
      // officeFilter holds a canonical label from `uniqueOffices`, so compare
      // against the normalized office rather than the raw per-district value.
      result = result.filter(c => normalizeOfficeName(c.office) === officeFilter);
    }

    if (statusFilter !== 'all') {
      // isIncumbent defaults to true when unknown (see useUnifiedCandidates).
      const wantIncumbent = statusFilter === 'incumbent';
      result = result.filter(c => (c.isIncumbent ?? true) === wantIncumbent);
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
  }, [searchQuery, sortBy, partyFilter, officeFilter, statusFilter, tabCandidates, profile, isHidden]);

  // Pagination: only ever mount one fixed-size page of cards, so the DOM stays
  // small no matter how many candidates exist (it doesn't grow with the dataset).
  const [currentPage, setCurrentPage] = useState(1);
  const resultsTopRef = useRef<HTMLDivElement | null>(null);

  const totalPages = Math.max(1, Math.ceil(filteredCandidates.length / PAGE_SIZE));

  // Reset to page 1 whenever the result set changes (tab/search/filter/sort).
  useEffect(() => {
    setCurrentPage(1);
  }, [activeTab, searchQuery, partyFilter, officeFilter, statusFilter, sortBy]);

  // Clamp the page if the result set shrinks (e.g. async reps finish loading).
  useEffect(() => {
    setCurrentPage((p) => Math.min(p, totalPages));
  }, [totalPages]);

  const goToPage = useCallback((page: number) => {
    setCurrentPage(page);
    resultsTopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  const pageCandidates = useMemo(
    () => filteredCandidates.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE),
    [filteredCandidates, currentPage],
  );

  // Defer IE lookup so typing/filter changes don't synchronously refire
  const visibleIds = useMemo(
    () => pageCandidates.map((c) => c.id),
    [pageCandidates],
  );
  const deferredVisibleIds = useDeferredValue(visibleIds);
  const { data: ieMap } = useCandidatesIE(deferredVisibleIds);

  // Only block the page on the fast sources (DB + all-Congress when requested).
  // Civic + address-based reps stream in progressively.
  const coreLoading = unified.dbLoading || unified.allLoading || profileLoading;
  const reposLoading = unified.civicLoading || unified.repsLoading;

  // Count for tabs
  const executiveCount = federalExecutiveCandidates.length + stateExecutiveCandidates.length;
  const stateCount = stateExecutiveCandidates.length + stateLegislativeCandidates.length;
  const localCount = localCandidates.length;


  if (coreLoading) {
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
        jsonLd={{
          "@context": "https://schema.org",
          "@type": "CollectionPage",
          name: "All Politicians",
          url: "https://www.polipulseapp.com/candidates",
          mainEntity: {
            "@type": "ItemList",
            numberOfItems: allCandidates.length,
            itemListElement: allCandidates.slice(0, 20).map((c, i) => ({
              "@type": "ListItem",
              position: i + 1,
              url: `https://www.polipulseapp.com/candidate/${c.id}`,
              name: c.name,
            })),
          },
        }}
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

        <h2 className="sr-only">Politicians directory</h2>
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
              Senators ({officeCounts.senator})
            </TabsTrigger>
            <TabsTrigger value="representatives" className="gap-2">
              <Users className="w-4 h-4 hidden sm:inline" />
              House ({officeCounts.rep})
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
              aria-label="Search politicians"
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
            <Select value={statusFilter} onValueChange={(v: 'all' | 'incumbent' | 'challenger') => setStatusFilter(v)}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Candidates</SelectItem>
                <SelectItem value="incumbent">Incumbents</SelectItem>
                <SelectItem value="challenger">Challengers</SelectItem>
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
                  <X className="w-4 h-4" aria-hidden="true" />
                  Exit Compare
                </>
              ) : (
                <>
                  <GitCompare className="w-4 h-4" aria-hidden="true" />
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

        <div ref={resultsTopRef} className="flex items-center justify-between mb-4 gap-3 flex-wrap scroll-mt-24">
          <p className="text-sm text-muted-foreground">
            {filteredCandidates.length > 0 && (
              <>Showing {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, filteredCandidates.length)} of {filteredCandidates.length} politician{filteredCandidates.length !== 1 ? 's' : ''}</>
            )}
          </p>
          <div className="flex items-center gap-3">
            {reposLoading && (
              <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                <Loader2 className="w-3 h-3 animate-spin" />
                Loading your representatives…
              </span>
            )}
            {compareMode && (
              <p className="text-sm text-primary font-medium">
                {selectedCandidates.length}/4 selected for comparison
              </p>
            )}
          </div>
        </div>

        <div className={cn(
          "grid gap-4 md:grid-cols-2 lg:grid-cols-3",
          compareMode && compareReady && selectedCandidates.length > 0 && "pb-[80vh] sm:pb-48"
        )}>
          {pageCandidates.map((candidate, index) => (
            <CandidateCard
              key={candidate.id}
              candidate={candidate}
              index={index}
              compareMode={compareMode}
              isSelected={selectedCandidates.some(c => c.id === candidate.id)}
              onToggleSelect={handleToggleSelect}
              ieTotals={ieMap?.get(candidate.id)}
            />
          ))}
        </div>

        {totalPages > 1 && (
          <Pagination className="mt-8">
            <PaginationContent>
              <PaginationItem>
                <PaginationPrevious
                  onClick={() => currentPage > 1 && goToPage(currentPage - 1)}
                  aria-disabled={currentPage === 1}
                  className={cn(currentPage === 1 ? 'pointer-events-none opacity-50' : 'cursor-pointer')}
                />
              </PaginationItem>
              {getPageList(currentPage, totalPages).map((page, i) =>
                page === 'ellipsis' ? (
                  <PaginationItem key={`ellipsis-${i}`} className="hidden sm:block">
                    <PaginationEllipsis />
                  </PaginationItem>
                ) : (
                  <PaginationItem key={page} className={cn(page !== currentPage && 'hidden sm:block')}>
                    <PaginationLink
                      isActive={page === currentPage}
                      onClick={() => goToPage(page)}
                      className="cursor-pointer"
                    >
                      {page}
                    </PaginationLink>
                  </PaginationItem>
                ),
              )}
              <PaginationItem>
                <PaginationNext
                  onClick={() => currentPage < totalPages && goToPage(currentPage + 1)}
                  aria-disabled={currentPage === totalPages}
                  className={cn(currentPage === totalPages ? 'pointer-events-none opacity-50' : 'cursor-pointer')}
                />
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        )}

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
              setStatusFilter('all');
            }}>
              Clear Filters
            </Button>
          </div>
        )}

        {/* Compare Panel */}
        {compareMode && compareReady && selectedCandidates.length > 0 && (
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
