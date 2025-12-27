import { useState } from 'react';
import { Header } from '@/components/Header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DollarSign, Building2, User as UserIcon, ArrowUpRight, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { DonorFilters } from '@/components/DonorFilters';
import { useDonorsPaginated, useAvailableDonorFilters, type DonorFilters as DonorFiltersType } from '@/hooks/useDonorsPaginated';

export const Donors = () => {
  const { data: filterOptions, isLoading: optionsLoading } = useAvailableDonorFilters();
  
  const [filters, setFilters] = useState<Partial<DonorFiltersType>>({
    page: 1,
    pageSize: 50,
    sortBy: 'amount',
    sortOrder: 'desc',
    cycle: '', // Will be set once options load
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

  // Set default cycle once options are loaded
  const effectiveCycle = filters.cycle || filterOptions?.cycles[0] || '';
  const effectiveFilters = { ...filters, cycle: effectiveCycle };

  const { data, isLoading, error } = useDonorsPaginated(effectiveFilters);

  const donors = data?.donors || [];
  const totalCount = data?.totalCount || 0;
  const pageSize = filters.pageSize || 50;
  const currentPage = filters.page || 1;
  const totalPages = Math.ceil(totalCount / pageSize);

  const formatAmount = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'Individual':
        return <UserIcon className="w-4 h-4" />;
      case 'PAC':
      case 'Organization':
        return <Building2 className="w-4 h-4" />;
      default:
        return <DollarSign className="w-4 h-4" />;
    }
  };

  const getPartyColor = (party: string) => {
    switch (party) {
      case 'Democrat':
        return 'bg-blue-500/10 text-blue-600 border-blue-500/20';
      case 'Republican':
        return 'bg-red-500/10 text-red-600 border-red-500/20';
      default:
        return 'bg-muted text-muted-foreground';
    }
  };

  const goToPage = (page: number) => {
    if (page >= 1 && page <= totalPages) {
      setFilters(prev => ({ ...prev, page }));
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  // Generate page numbers to display
  const getPageNumbers = () => {
    const pages: (number | 'ellipsis')[] = [];
    const showPages = 5;
    
    if (totalPages <= showPages + 2) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      
      if (currentPage > 3) pages.push('ellipsis');
      
      const start = Math.max(2, currentPage - 1);
      const end = Math.min(totalPages - 1, currentPage + 1);
      
      for (let i = start; i <= end; i++) pages.push(i);
      
      if (currentPage < totalPages - 2) pages.push('ellipsis');
      
      pages.push(totalPages);
    }
    
    return pages;
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
      <Header />
      
      <main className="container py-8 px-4">
        <div className="mb-8">
          <h1 className="font-display text-3xl md:text-4xl font-bold text-foreground mb-2">
            Campaign Donors
          </h1>
          <p className="text-muted-foreground">
            View campaign contributions to political candidates.
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

        {/* Results count and pagination info */}
        <div className="flex items-center justify-between mb-4">
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
            <p className="text-sm text-muted-foreground">
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

        {/* Loading state */}
        {isLoading && (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Card key={i} className="animate-pulse">
                <CardHeader className="pb-3">
                  <div className="h-5 bg-muted rounded w-3/4" />
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="h-6 bg-muted rounded w-1/2" />
                    <div className="h-4 bg-muted rounded w-1/3" />
                    <div className="h-4 bg-muted rounded w-2/3" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Donor cards */}
        {!isLoading && !error && (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {donors.map((donor) => (
              <Card key={donor.id} className="hover:shadow-md transition-shadow">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      {getTypeIcon(donor.type)}
                      <CardTitle className="text-lg truncate">
                        <Link to={`/donor/${donor.id}`} className="hover:underline">
                          {donor.name}
                        </Link>
                      </CardTitle>
                    </div>
                    <Badge variant="outline" className="shrink-0 ml-2">{donor.type}</Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground text-sm">Amount</span>
                      <span className="text-xl font-bold text-agree">{formatAmount(donor.amount)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground text-sm">Cycle</span>
                      <span className="font-medium">{donor.cycle}</span>
                    </div>
                    {donor.contributor_state && (
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground text-sm">Location</span>
                        <span className="font-medium">
                          {donor.contributor_city ? `${donor.contributor_city}, ` : ''}{donor.contributor_state}
                        </span>
                      </div>
                    )}
                    {donor.candidate && (
                      <div className="pt-2 border-t border-border">
                        <span className="text-muted-foreground text-sm block mb-1">Donated to</span>
                        <Link 
                          to={`/candidate/${donor.candidate_id}`}
                          className="flex items-center gap-2 hover:text-primary transition-colors"
                        >
                          <span className="font-medium truncate">{donor.candidate.name}</span>
                          <Badge className={getPartyColor(donor.candidate.party)} variant="outline">
                            {donor.candidate.party}
                          </Badge>
                        </Link>
                      </div>
                    )}
                    <Link 
                      to={`/donor/${donor.id}`}
                      className="inline-flex items-center gap-1 text-primary text-sm hover:underline"
                    >
                      <ArrowUpRight className="w-4 h-4" />
                      View donor profile
                    </Link>
                  </div>
                </CardContent>
              </Card>
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
              Previous
            </Button>
            
            <div className="flex items-center gap-1">
              {getPageNumbers().map((page, i) => (
                page === 'ellipsis' ? (
                  <span key={`ellipsis-${i}`} className="px-2 text-muted-foreground">…</span>
                ) : (
                  <Button
                    key={page}
                    variant={page === currentPage ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => goToPage(page)}
                    className="w-9"
                  >
                    {page}
                  </Button>
                )
              ))}
            </div>
            
            <Button
              variant="outline"
              size="sm"
              onClick={() => goToPage(currentPage + 1)}
              disabled={currentPage === totalPages}
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}
      </main>
    </div>
  );
};
