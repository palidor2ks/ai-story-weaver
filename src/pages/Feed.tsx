import { useState, useMemo } from 'react';
import { Header } from '@/components/Header';
import { CandidateCard } from '@/components/CandidateCard';
import { candidates } from '@/data/mockData';
import { useUser } from '@/context/UserContext';
import { calculateMatchScore } from '@/data/mockData';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, SlidersHorizontal, TrendingUp } from 'lucide-react';

export const Feed = () => {
  const { user } = useUser();
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'match' | 'name' | 'party'>('match');
  const [partyFilter, setPartyFilter] = useState<string>('all');

  const filteredAndSortedCandidates = useMemo(() => {
    let result = [...candidates];

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

    // Sort
    const userScore = user?.overallScore ?? 0;
    switch (sortBy) {
      case 'match':
        result.sort((a, b) => {
          const matchA = calculateMatchScore(userScore, a.overallScore);
          const matchB = calculateMatchScore(userScore, b.overallScore);
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
  }, [searchQuery, sortBy, partyFilter, user]);

  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      <main className="container py-8 px-4">
        {/* Welcome Section */}
        <div className="mb-8">
          <h1 className="font-display text-3xl md:text-4xl font-bold text-foreground mb-2">
            Welcome back, {user?.name || 'Voter'}
          </h1>
          <p className="text-muted-foreground">
            Compare politicians based on your political profile and see who aligns with your values.
          </p>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-card rounded-xl border border-border p-4 shadow-sm">
            <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
              <TrendingUp className="w-4 h-4" />
              Your Score
            </div>
            <div className="text-2xl font-bold text-foreground">
              {user?.overallScore ?? 0 > 0 ? '+' : ''}{user?.overallScore ?? 0}
            </div>
          </div>
          <div className="bg-card rounded-xl border border-border p-4 shadow-sm">
            <div className="text-muted-foreground text-sm mb-1">Candidates</div>
            <div className="text-2xl font-bold text-foreground">{candidates.length}</div>
          </div>
          <div className="bg-card rounded-xl border border-border p-4 shadow-sm">
            <div className="text-muted-foreground text-sm mb-1">Best Match</div>
            <div className="text-2xl font-bold text-agree">
              {Math.max(...candidates.map(c => calculateMatchScore(user?.overallScore ?? 0, c.overallScore)))}%
            </div>
          </div>
          <div className="bg-card rounded-xl border border-border p-4 shadow-sm">
            <div className="text-muted-foreground text-sm mb-1">Topics</div>
            <div className="text-2xl font-bold text-foreground">{user?.topTopics.length ?? 0}</div>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-4 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
            <Input
              placeholder="Search candidates..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          <div className="flex gap-2">
            <Select value={sortBy} onValueChange={(v: any) => setSortBy(v)}>
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
          </div>
        </div>

        {/* Results Count */}
        <p className="text-sm text-muted-foreground mb-4">
          Showing {filteredAndSortedCandidates.length} candidate{filteredAndSortedCandidates.length !== 1 ? 's' : ''}
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
            <p className="text-muted-foreground">No candidates found matching your criteria.</p>
            <Button variant="ghost" className="mt-4" onClick={() => {
              setSearchQuery('');
              setPartyFilter('all');
            }}>
              Clear Filters
            </Button>
          </div>
        )}
      </main>
    </div>
  );
};
