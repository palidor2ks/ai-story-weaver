import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Header } from '@/components/Header';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useCandidates, calculateMatchScore } from '@/hooks/useCandidates';
import { useProfile } from '@/hooks/useProfile';
import { ScoreDisplay } from '@/components/ScoreDisplay';
import { ComparisonSpectrum } from '@/components/ComparisonSpectrum';
import { CoverageTierBadge, ConfidenceBadge, IncumbentBadge } from '@/components/CoverageTierBadge';
import { Search as SearchIcon, User, MapPin, Filter, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CoverageTier, ConfidenceLevel } from '@/lib/scoreFormat';

export const Search = () => {
  const { data: candidates = [], isLoading } = useCandidates();
  const { data: profile } = useProfile();
  const userScore = profile?.overall_score ?? 0;

  const [searchQuery, setSearchQuery] = useState('');
  const [partyFilter, setPartyFilter] = useState<string>('all');
  const [officeFilter, setOfficeFilter] = useState<string>('all');
  const [stateFilter, setStateFilter] = useState<string>('all');

  // Get unique values for filters
  const offices = useMemo(() => 
    [...new Set(candidates.map(c => c.office))].sort(),
    [candidates]
  );
  
  const states = useMemo(() => 
    [...new Set(candidates.map(c => c.state))].sort(),
    [candidates]
  );

  // Filter candidates
  const filteredCandidates = useMemo(() => {
    return candidates.filter(candidate => {
      // Search query
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const matchesName = candidate.name.toLowerCase().includes(query);
        const matchesOffice = candidate.office.toLowerCase().includes(query);
        const matchesState = candidate.state.toLowerCase().includes(query);
        if (!matchesName && !matchesOffice && !matchesState) return false;
      }

      // Party filter
      if (partyFilter !== 'all' && candidate.party !== partyFilter) return false;

      // Office filter
      if (officeFilter !== 'all' && candidate.office !== officeFilter) return false;

      // State filter
      if (stateFilter !== 'all' && candidate.state !== stateFilter) return false;

      return true;
    });
  }, [candidates, searchQuery, partyFilter, officeFilter, stateFilter]);

  const clearFilters = () => {
    setSearchQuery('');
    setPartyFilter('all');
    setOfficeFilter('all');
    setStateFilter('all');
  };

  const hasActiveFilters = searchQuery || partyFilter !== 'all' || officeFilter !== 'all' || stateFilter !== 'all';

  const getPartyColor = (party: string) => {
    switch (party) {
      case 'Democrat': return 'bg-blue-500/10 text-blue-700 border-blue-500/30';
      case 'Republican': return 'bg-red-500/10 text-red-700 border-red-500/30';
      case 'Independent': return 'bg-purple-500/10 text-purple-700 border-purple-500/30';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      <main className="container py-8 px-4">
        <div className="max-w-4xl mx-auto">
          {/* Search Header */}
          <div className="mb-8">
            <h1 className="font-display text-3xl font-bold text-foreground mb-2">
              Search Candidates
            </h1>
            <p className="text-muted-foreground">
              Find and compare candidates by name, office, state, or party
            </p>
          </div>

          {/* Search Input */}
          <div className="relative mb-6">
            <SearchIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search by name, office, or state..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-12 h-12 text-lg"
            />
          </div>

          {/* Filters */}
          <div className="flex flex-wrap gap-3 mb-6">
            <Select value={partyFilter} onValueChange={setPartyFilter}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Party" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Parties</SelectItem>
                <SelectItem value="Democrat">Democrat</SelectItem>
                <SelectItem value="Republican">Republican</SelectItem>
                <SelectItem value="Independent">Independent</SelectItem>
              </SelectContent>
            </Select>

            <Select value={officeFilter} onValueChange={setOfficeFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Office" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Offices</SelectItem>
                {offices.map(office => (
                  <SelectItem key={office} value={office}>{office}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={stateFilter} onValueChange={setStateFilter}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="State" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All States</SelectItem>
                {states.map(state => (
                  <SelectItem key={state} value={state}>{state}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {hasActiveFilters && (
              <Button variant="ghost" size="sm" onClick={clearFilters} className="gap-1">
                <X className="w-4 h-4" />
                Clear filters
              </Button>
            )}
          </div>

          {/* Results Count */}
          <div className="mb-4 text-sm text-muted-foreground">
            {filteredCandidates.length} candidate{filteredCandidates.length !== 1 ? 's' : ''} found
          </div>

          {/* Results */}
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
            </div>
          ) : filteredCandidates.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground">No candidates found matching your criteria.</p>
              {hasActiveFilters && (
                <Button variant="link" onClick={clearFilters} className="mt-2">
                  Clear all filters
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {filteredCandidates.map((candidate, index) => {
                const matchScore = calculateMatchScore(userScore, candidate.overall_score);
                const coverageTier = (candidate.coverage_tier || 'tier_3') as CoverageTier;
                const confidence = (candidate.confidence || 'medium') as ConfidenceLevel;

                return (
                  <Link to={`/candidate/${candidate.id}`} key={candidate.id}>
                    <Card className="group hover:shadow-lg transition-all duration-200 hover:-translate-y-0.5 animate-slide-up" style={{ animationDelay: `${index * 50}ms` }}>
                      <CardContent className="p-5">
                        <div className="flex items-start gap-4">
                          <div className="w-14 h-14 rounded-full bg-gradient-hero flex items-center justify-center flex-shrink-0">
                            <User className="w-7 h-7 text-primary-foreground" />
                          </div>

                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <h3 className="font-display text-lg font-semibold text-foreground group-hover:text-primary transition-colors">
                                  {candidate.name}
                                </h3>
                                <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
                                  <span>{candidate.office}</span>
                                  <span>•</span>
                                  <span className="flex items-center gap-1">
                                    <MapPin className="w-3 h-3" />
                                    {candidate.state}
                                  </span>
                                </div>
                              </div>
                              <div className="w-24 flex-shrink-0">
                                <ComparisonSpectrum 
                                  userScore={userScore} 
                                  repScore={candidate.overall_score ?? 0} 
                                  repName={candidate.name.split(' ').pop() || 'Rep'}
                                  size="sm"
                                />
                              </div>
                            </div>

                            <div className="mt-2">
                              <ScoreDisplay score={candidate.overall_score} size="sm" />
                            </div>

                            <div className="flex flex-wrap items-center gap-2 mt-3">
                              <Badge variant="outline" className={cn("border", getPartyColor(candidate.party))}>
                                {candidate.party}
                              </Badge>
                              <IncumbentBadge isIncumbent={candidate.is_incumbent} />
                              <CoverageTierBadge tier={coverageTier} showTooltip={false} />
                              <ConfidenceBadge confidence={confidence} />
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </main>
    </div>
  );
};
