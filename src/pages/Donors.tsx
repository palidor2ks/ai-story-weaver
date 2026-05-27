import { useEffect, useMemo, useState } from 'react';
import { Header } from '@/components/Header';
import { Seo } from '@/components/Seo';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, ChevronsRight, Loader2 } from 'lucide-react';
import { DonorFilters } from '@/components/DonorFilters';
import { DonorCard } from '@/components/DonorCard';
import { useDonorsPaginated, useAvailableDonorFilters, type DonorFilters as DonorFiltersType } from '@/hooks/useDonorsPaginated';
import { getDonorCause, useDonorCauses } from '@/hooks/useDonorCauses';

export const Donors = () => {
  const { data: filterOptions, isLoading: optionsLoading } = useAvailableDonorFilters();

  const [filters, setFilters] = useState<Partial<DonorFiltersType>>({
    page: 1,
    pageSize: 24,
    sortBy: 'amount',
    sortOrder: 'desc',
    cycle: 'all',
    type: 'all',
    search: '',
    state: 'all',
    minAmount: null,
    maxAmount: null,
    includeTransfers: true,
    includeConduitOrgs: true,
    candidateId: null,
    party: 'all',
  });

  const [debouncedSearch, setDebouncedSearch] = useState(filters.search || '');

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setDebouncedSearch(filters.search || '');
    }, 300);

    return () => window.clearTimeout(timeout);
  }, [filters.search]);

  const effectiveCycle = filters.cycle || 'all';
  const effectiveFilters = useMemo(() => ({
    ...filters,
    search: debouncedSearch,
    cycle: effectiveCycle,
    sortBy: filters.sortBy ?? 'amount',
    sortOrder: filters.sortOrder ?? 'desc',
  }), [filters, debouncedSearch, effectiveCycle]);

  const { data, isLoading, error } = useDonorsPaginated(effectiveFilters);

  const donors = data?.donors || [];
  const totalCount = data?.totalCount || 0;
  const pageSize = filters.pageSize || 24;
  const currentPage = filters.page || 1;
  const totalPages = Math.ceil(totalCount / pageSize);

  const { data: donorCauseMap } = useDonorCauses(
    donors.map(donor => ({ name: donor.name, type: donor.type }))
  );

  const goToPage = (page: number) => {
    if (page >= 1 && page <= totalPages) {
      setFilters(prev => ({ ...prev, page }));
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  if (optionsLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Seo
        title="Campaign Donors — Pulse"
        description="Explore individual and PAC contributions to political candidates. Filter by cycle, state, and donor type to follow the money."
        path="/donors"
        jsonLd={{
          "@context": "https://schema.org",
          "@type": "CollectionPage",
          name: "Campaign Donors",
          description: "Individual and PAC contributions to political candidates, filterable by cycle, state, and donor type.",
          url: "https://www.polipulseapp.com/donors",
        }}
      />
      <Header />
      
      <main className="container py-8 px-4">
        {/* Page header */}
        <div className="mb-8">
          <h1 className="font-display text-3xl md:text-4xl font-bold text-foreground mb-2">
            Campaign Donors
          </h1>
          <p className="text-muted-foreground">
            Explore campaign contributions to political candidates. Similar donors are automatically grouped.
          </p>
        </div>

        {/* Filters */}
        <div className="mb-6">
          <DonorFilters
            filters={effectiveFilters}
            onFiltersChange={setFilters}
            availableCycles={filterOptions?.cycles || []}
            availableStates={filterOptions?.states || []}
            isLoading={isLoading}
          />
        </div>

        {/* Results count */}
        <div className="flex items-center justify-between mb-6">
          <p className="text-sm text-muted-foreground">
            {isLoading ? (
              'Loading...'
            ) : (
              <>
                Showing {((currentPage - 1) * pageSize) + 1}–{Math.min(currentPage * pageSize, totalCount)} of{' '}
                <span className="font-medium text-foreground">{totalCount.toLocaleString()}</span> donors
              </>
            )}
          </p>
          {totalPages > 1 && (
            <p className="text-sm text-muted-foreground hidden sm:block">
              Page {currentPage} of {totalPages}
            </p>
          )}
        </div>

        {/* Error state */}
        {error && (
          <div className="text-center py-16">
            <p className="text-destructive">Error loading donors: {error.message}</p>
          </div>
        )}

        {/* Loading state with skeleton cards */}
        {isLoading && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <Card key={i} className="animate-pulse">
                <CardContent className="p-5">
                  <div className="flex items-start justify-between mb-4">
                    <div className="h-10 w-10 bg-muted rounded-lg" />
                    <div className="h-5 w-16 bg-muted rounded" />
                  </div>
                  <div className="h-5 bg-muted rounded w-3/4 mb-4" />
                  <div className="flex justify-between">
                    <div className="space-y-2">
                      <div className="h-3 w-16 bg-muted rounded" />
                      <div className="h-6 w-12 bg-muted rounded" />
                    </div>
                    <div className="text-right space-y-2">
                      <div className="h-3 w-12 bg-muted rounded ml-auto" />
                      <div className="h-7 w-20 bg-muted rounded" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Donor cards grid */}
        {!isLoading && !error && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
            {donors.map((donor) => (
              <DonorCard
                key={donor.id}
                id={donor.id}
                name={donor.name}
                type={donor.type as 'Individual' | 'PAC' | 'Organization' | 'Unknown'}
                types={donor.types}
                amount={donor.amount}
                transactionCount={donor.transaction_count || 1}
                isConsolidated={donor.is_consolidated}
                nameVariations={donor.name_variations}
                recipientCount={donor.recipient_count}
                cycle={effectiveCycle}
                primaryCauseLabel={getDonorCause(donorCauseMap, donor.name, donor.type)?.label}
              />
            ))}
          </div>
        )}

        {/* Empty state */}
        {!isLoading && !error && donors.length === 0 && (
          <div className="text-center py-16">
            <p className="text-muted-foreground">No donors found matching your filters.</p>
          </div>
        )}

        {/* Pagination */}
        {!isLoading && totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 mt-8">
            <Button
              variant="outline"
              size="sm"
              onClick={() => goToPage(currentPage - 1)}
              disabled={currentPage === 1}
            >
              <ChevronLeft className="h-4 w-4" />
              <span className="hidden sm:inline ml-1">Previous</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => goToPage(currentPage + 1)}
              disabled={currentPage === totalPages}
            >
              <span className="hidden sm:inline mr-1">Next</span>
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => goToPage(totalPages)}
              disabled={currentPage === totalPages}
              aria-label="Go to last page"
            >
              <ChevronsRight className="h-4 w-4" />
              <span className="sr-only">Last page</span>
            </Button>
          </div>
        )}
      </main>
    </div>
  );
};
