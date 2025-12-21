import { useState, useMemo } from 'react';
import { Header } from '@/components/Header';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Search, DollarSign, Building2, User as UserIcon } from 'lucide-react';
import { Link } from 'react-router-dom';

interface Donor {
  id: string;
  name: string;
  amount: number;
  type: string;
  cycle: string;
  candidate_id: string;
  candidate?: {
    name: string;
    party: string;
  };
}

export const Donors = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'amount' | 'name'>('amount');

  const { data: donors = [], isLoading } = useQuery({
    queryKey: ['all-donors'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('donors')
        .select(`
          *,
          candidates(name, party)
        `)
        .order('amount', { ascending: false });
      
      if (error) throw error;
      return data.map(d => ({
        ...d,
        candidate: d.candidates
      })) as Donor[];
    },
  });

  const filteredDonors = useMemo(() => {
    let result = [...donors];

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(d => 
        d.name.toLowerCase().includes(query) ||
        d.candidate?.name?.toLowerCase().includes(query)
      );
    }

    if (typeFilter !== 'all') {
      result = result.filter(d => d.type === typeFilter);
    }

    switch (sortBy) {
      case 'amount':
        result.sort((a, b) => b.amount - a.amount);
        break;
      case 'name':
        result.sort((a, b) => a.name.localeCompare(b.name));
        break;
    }

    return result;
  }, [searchQuery, typeFilter, sortBy, donors]);

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

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
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
        <div className="flex flex-col sm:flex-row gap-4 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
            <Input
              placeholder="Search donors or candidates..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          <div className="flex gap-2">
            <Select value={sortBy} onValueChange={(v: 'amount' | 'name') => setSortBy(v)}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="Sort by" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="amount">Amount</SelectItem>
                <SelectItem value="name">Name</SelectItem>
              </SelectContent>
            </Select>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="Individual">Individual</SelectItem>
                <SelectItem value="PAC">PAC</SelectItem>
                <SelectItem value="Organization">Organization</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <p className="text-sm text-muted-foreground mb-4">
          Showing {filteredDonors.length} donor{filteredDonors.length !== 1 ? 's' : ''}
        </p>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredDonors.map((donor) => (
            <Card key={donor.id} className="hover:shadow-md transition-shadow">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    {getTypeIcon(donor.type)}
                    <CardTitle className="text-lg">{donor.name}</CardTitle>
                  </div>
                  <Badge variant="outline">{donor.type}</Badge>
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
                  {donor.candidate && (
                    <div className="pt-2 border-t border-border">
                      <span className="text-muted-foreground text-sm block mb-1">Donated to</span>
                      <Link 
                        to={`/candidate/${donor.candidate_id}`}
                        className="flex items-center gap-2 hover:text-primary transition-colors"
                      >
                        <span className="font-medium">{donor.candidate.name}</span>
                        <Badge className={getPartyColor(donor.candidate.party)} variant="outline">
                          {donor.candidate.party}
                        </Badge>
                      </Link>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {filteredDonors.length === 0 && (
          <div className="text-center py-16">
            <p className="text-muted-foreground">No donors found.</p>
          </div>
        )}
      </main>
    </div>
  );
};
