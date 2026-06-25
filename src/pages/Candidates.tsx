import { useState, useMemo, useCallback, useEffect, useRef, useDeferredValue } from 'react';
import { useNavigate } from 'react-router-dom';
import { Seo } from '@/components/Seo';
import { ComparePanel } from '@/components/ComparePanel';
import { calculateMatchScore } from '@/hooks/useCandidates';
import { useProfile } from '@/hooks/useProfile';
import { useUnifiedCandidates } from '@/hooks/useUnifiedCandidates';
import { useHiddenStates } from '@/hooks/useHiddenStates';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination';
import { Search, GitCompare, Loader2 } from 'lucide-react';
import { Candidate } from '@/types';
import { cn } from '@/lib/utils';
import { normalizeOfficeName, toDisplayName } from '@/lib/officeLabel';
import { useCandidatesIE } from '@/hooks/useIndependentExpenditures';
import { formatScore } from '@/lib/scoreFormat';
import { OfficialAvatar } from '@/components/OfficialAvatar';
import { Header } from '@/components/Header';

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

function getPoliScoreColor(score: number | null | undefined): string {
  if (score === null || score === undefined) return 'text-poli-muted';
  if (score <= -3) return 'text-poli-navy';
  if (score >= 3) return 'text-poli-red';
  return 'text-[#7A3FB8]';
}

function getAvatarBg(party: string): string {
  if (party === 'Democrat') return 'bg-[#2A5BD0]';
  if (party === 'Republican') return 'bg-[#C8102E]';
  return 'bg-poli-muted';
}

function getInitials(name: string): string {
  const parts = name.split(' ').filter(Boolean);
  if (parts.length >= 2) return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
  return parts[0]?.[0]?.toUpperCase() ?? '?';
}

type TabKey = 'all' | 'my-reps' | 'senators' | 'representatives';

const TAB_LABELS: { key: TabKey; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'my-reps', label: 'My Reps' },
  { key: 'senators', label: 'Senators' },
  { key: 'representatives', label: 'House' },
];

export const Candidates = () => {
  const { data: profile } = useProfile();
  const [activeTab, setActiveTab] = useState<string>('all');
  const unified = useUnifiedCandidates({
    address: profile?.address,
    includeAllCongress: true,
    // Only fetch geocode + civic API when on a tab that actually needs local reps.
    // Avoids the 0.5–2s civic round-trip on the default "All" tab.
    fetchCivic: activeTab !== 'all' && activeTab !== 'congress',
  });

  const [searchQuery, setSearchQuery] = useState('');
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const [sortBy, setSortBy] = useState<'match' | 'name' | 'party'>('name');
  const [partyFilter, setPartyFilter] = useState<string>('all');
  const [officeFilter, setOfficeFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'incumbent' | 'challenger'>('all');

  // Compare mode state
  const [compareMode, setCompareMode] = useState(false);
  const [selectedCandidates, setSelectedCandidates] = useState<Candidate[]>([]);
  const [compareReady, setCompareReady] = useState(false);

  const navigate = useNavigate();

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
  const formerExecutiveCandidates = unified.formerExec;
  const stateExecutiveCandidates = unified.stateExec;

  const myRepsCombined = useMemo(() => {
    const combined = unified.myReps.concat(
      unified.federalExec,
      unified.stateExec,
      unified.stateLeg,
      unified.local,
    );
    return combined.filter((c, i, arr) => arr.findIndex(x => x.id === c.id) === i);
  }, [unified.myReps, unified.federalExec, unified.stateExec, unified.stateLeg, unified.local]);

  const { isHidden } = useHiddenStates();

  // Pre-compute office counts once, applying the same hidden-state filter used in
  // filteredCandidates so tab badges match what's actually visible in each tab.
  const officeCounts = useMemo(() => {
    let senator = 0;
    let rep = 0;
    let visibleAll = 0;
    const offices = new Set<string>();
    for (const c of allCandidates) {
      // National offices (President/VP, state='US') are never hidden.
      const isNational = c.state === 'US' || (c.level === 'federal' && /president/i.test(c.office));
      if (!isNational && isHidden(c.state)) continue;
      visibleAll++;
      // Use the canonical label so the same role isn't split across raw variants
      // (e.g. "Representative" vs "U.S. House FL-01" are both counted as U.S. House).
      const office = normalizeOfficeName(c.office);
      offices.add(office);
      if (office === 'U.S. Senate') senator++;
      else if (office === 'U.S. House') rep++;
    }
    return { senator, rep, visibleAll, uniqueOffices: Array.from(offices).sort() };
  }, [allCandidates, isHidden]);

  const uniqueOffices = officeCounts.uniqueOffices;

  // Get candidates based on active tab
  const tabCandidates = useMemo(() => {
    switch (activeTab) {
      case 'my-reps':
        return myRepsCombined;
      case 'executive':
        return [...federalExecutiveCandidates, ...formerExecutiveCandidates, ...stateExecutiveCandidates];
      case 'senators':
        return allCandidates.filter(c => normalizeOfficeName(c.office) === 'U.S. Senate');
      case 'representatives':
        return allCandidates.filter(c => normalizeOfficeName(c.office) === 'U.S. House');
      case 'state':
        return allCandidates.filter(c => c.level === 'state');
      case 'local':
        return allCandidates.filter(c => c.level === 'local');
      case 'all':
      default:
        return allCandidates;
    }
  }, [activeTab, myRepsCombined, federalExecutiveCandidates, formerExecutiveCandidates, stateExecutiveCandidates, allCandidates]);

  const filteredCandidates = useMemo(() => {
    // National offices (President / Vice President) represent the whole country
    // and are tagged with state 'US', not a real state. They must never be
    // dropped by the per-state hiding used to scope the beta to a few states —
    // otherwise the President and VP disappear from the Executive tab while
    // still being counted in its badge.
    const isNationalOffice = (c: Candidate) =>
      c.state === 'US' || (c.level === 'federal' && /president/i.test(c.office));
    let result = tabCandidates.filter(c => isNationalOffice(c) || !isHidden(c.state));

    if (deferredSearchQuery) {
      const query = deferredSearchQuery.toLowerCase();
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
  }, [deferredSearchQuery, sortBy, partyFilter, officeFilter, statusFilter, tabCandidates, profile, isHidden]);

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
  useCandidatesIE(deferredVisibleIds);

  // Block on DB + Congress members so the full list renders in one pass (avoids
  // visible reorder when allPoliticians arrives as a second wave).
  const coreLoading = unified.dbLoading || unified.allLoading;
  const reposLoading = unified.civicLoading || unified.repsLoading;


  if (coreLoading) {
    return (
      <div className="bg-[#F5F6FA] min-h-screen pb-20">
        <Header />
        <div className="bg-gradient-to-br from-poli-navy to-poli-dark pt-12 pb-4 px-4">
          <h1 className="text-2xl font-black text-white">All Politicians</h1>
          <p className="text-sm text-white/60 mt-1">Loading…</p>
        </div>
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-poli-navy" />
          <p className="text-poli-muted text-sm">Loading all officials...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-[#F5F6FA] min-h-screen pb-20">
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

      {/* Navy gradient header */}
      <div className="bg-gradient-to-br from-poli-navy to-poli-dark pt-12 pb-4 px-4">
        <h1 className="text-2xl font-black text-white">All Politicians</h1>
        <p className="text-sm text-white/60 mt-1">{officeCounts.visibleAll} politicians</p>
      </div>

      <h2 className="sr-only">Politicians directory</h2>

      {/* Filter chips row */}
      <div className="flex gap-2 overflow-x-auto px-4 py-3 scrollbar-none">
        {TAB_LABELS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={cn(
              'flex-shrink-0 rounded-full px-4 py-1.5 text-sm font-semibold transition-colors',
              activeTab === key
                ? 'bg-[#14173A] text-white font-bold'
                : 'bg-poli-surface text-poli-body'
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Search + filter row */}
      <div className="px-4 pb-3 flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-poli-muted pointer-events-none" />
          <input
            type="text"
            placeholder="Search by name, state, or office..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            aria-label="Search politicians"
            className="border border-poli-surface/80 rounded-xl h-10 px-4 pl-9 text-sm bg-white text-poli-body placeholder:text-poli-muted w-full outline-none focus:ring-2 focus:ring-poli-navy/30"
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          <Select value={partyFilter} onValueChange={setPartyFilter}>
            <SelectTrigger className="border border-poli-surface/80 rounded-xl h-10 px-3 text-sm bg-white text-poli-body w-[130px]">
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
              <SelectTrigger className="border border-poli-surface/80 rounded-xl h-10 px-3 text-sm bg-white text-poli-body w-[140px]">
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

          <button
            onClick={() => {
              if (compareMode) {
                handleCloseCompare();
              } else {
                setCompareMode(true);
                setCompareReady(false);
              }
            }}
            className="border border-poli-navy text-poli-navy rounded-xl h-10 px-4 text-sm font-semibold flex items-center gap-1.5 hover:bg-poli-navy/5 transition-colors"
          >
            <GitCompare className="w-4 h-4" aria-hidden="true" />
            {compareMode ? 'Exit' : 'Compare'}
          </button>

          {compareMode && (
            <button
              onClick={() => setCompareReady(true)}
              disabled={selectedCandidates.length < 2}
              className="border border-poli-navy bg-poli-navy text-white rounded-xl h-10 px-4 text-sm font-semibold disabled:opacity-50 transition-colors"
            >
              Done ({selectedCandidates.length})
            </button>
          )}
        </div>
      </div>

      {/* Info banner for My Reps tab */}
      {activeTab === 'my-reps' && (
        <div className="mx-4 mb-3 bg-[#F4F6FB] rounded-xl p-3 text-xs text-poli-muted border border-poli-surface">
          {profile?.address
            ? 'Showing politicians who represent your registered address.'
            : 'Add your address in your profile to see your local representatives.'}
        </div>
      )}

      {/* Results meta row */}
      <div ref={resultsTopRef} className="flex items-center justify-between px-4 pb-2 scroll-mt-24">
        <p className="text-xs text-poli-muted">
          {filteredCandidates.length > 0 && (
            <>
              {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, filteredCandidates.length)} of {filteredCandidates.length}
            </>
          )}
        </p>
        {reposLoading && (
          <span className="inline-flex items-center gap-1 text-xs text-poli-muted">
            <Loader2 className="w-3 h-3 animate-spin" />
            Loading your representatives…
          </span>
        )}
        {compareMode && (
          <p className="text-xs text-poli-navy font-semibold">
            {selectedCandidates.length}/4 selected
          </p>
        )}
      </div>

      {/* Politician list rows */}
      <div
        className={cn(
          'pb-6',
          compareMode && compareReady && selectedCandidates.length > 0 && 'pb-[80vh] sm:pb-48'
        )}
      >
        {pageCandidates.map((candidate) => {
          const isSelected = selectedCandidates.some(c => c.id === candidate.id);
          const isFormer = /^former\b/i.test(candidate.office ?? '');
          const isIncumbent = candidate.isIncumbent ?? true;

          const handleRowClick = () => {
            if (compareMode) {
              handleToggleSelect(candidate);
              return;
            }
            navigate(`/candidate/${candidate.id}`);
          };

          return (
            <div
              key={candidate.id}
              role="button"
              tabIndex={0}
              onClick={handleRowClick}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleRowClick(); }}
              aria-label={`View ${toDisplayName(candidate.name)}`}
              className={cn(
                'bg-white rounded-xl mb-2 mx-4 p-4 flex items-center gap-3 shadow-sm cursor-pointer transition-shadow hover:shadow-md',
                compareMode && isSelected && 'ring-2 ring-poli-navy'
              )}
            >
              {/* Avatar */}
              {candidate.imageUrl ? (
                <OfficialAvatar
                  imageUrl={candidate.imageUrl}
                  name={candidate.name}
                  party={candidate.party}
                  size="sm"
                  className="flex-shrink-0 w-[42px] h-[42px] ring-0"
                  loading="lazy"
                />
              ) : (
                <div
                  className={cn(
                    'w-[42px] h-[42px] rounded-full flex items-center justify-center text-white font-bold text-sm flex-shrink-0',
                    getAvatarBg(candidate.party)
                  )}
                  aria-hidden="true"
                >
                  {getInitials(toDisplayName(candidate.name))}
                </div>
              )}

              {/* Name + sub-line */}
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-poli-body text-sm truncate">
                  {toDisplayName(candidate.name)}
                </p>
                <p className="text-xs text-poli-muted truncate">
                  {candidate.party} · {normalizeOfficeName(candidate.office)}
                  {candidate.state && candidate.state !== 'US' ? ` · ${candidate.state}` : ''}
                </p>
                {/* Incumbent badge */}
                {!isFormer && isIncumbent && (
                  <span className="inline-block mt-0.5 text-[10px] font-bold px-2 py-0.5 rounded-full border border-poli-green text-poli-green leading-tight">
                    Incumbent
                  </span>
                )}
                {isFormer && (
                  <span className="inline-block mt-0.5 text-[10px] font-bold px-2 py-0.5 rounded-full border border-amber-500 text-amber-600 leading-tight">
                    Former
                  </span>
                )}
              </div>

              {/* PoliScore */}
              <span
                className={cn(
                  'font-mono-label text-sm font-bold flex-shrink-0',
                  getPoliScoreColor(candidate.overallScore)
                )}
              >
                {formatScore(candidate.overallScore)}
              </span>
            </div>
          );
        })}

        {filteredCandidates.length === 0 && (
          <div className="text-center py-16 px-4">
            <p className="text-poli-muted text-sm">
              {(activeTab === 'my-reps') && !profile?.address
                ? 'Add your address in your profile to see your representatives.'
                : 'No politicians found.'}
            </p>
            <button
              onClick={() => {
                setSearchQuery('');
                setPartyFilter('all');
                setOfficeFilter('all');
                setStatusFilter('all');
              }}
              className="mt-4 text-sm text-poli-navy underline"
            >
              Clear Filters
            </button>
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <Pagination className="mt-2 mb-8">
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
    </div>
  );
};
