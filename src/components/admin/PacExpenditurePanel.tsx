import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useFetchPacExpenditures, useFetchPacDonors } from '@/hooks/usePacExpenditures';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { DollarSign, RefreshCw, Loader2, Users, Search } from 'lucide-react';

const formatCurrency = (value: number) => {
  if (value >= 1_000_000) {
    return `$${(value / 1_000_000).toFixed(1)}M`;
  }
  if (value >= 1_000) {
    return `$${Math.round(value / 1_000)}K`;
  }
  return `$${value.toLocaleString()}`;
};

export function PacExpenditurePanel() {
  const [fetchingId, setFetchingId] = useState<string | null>(null);
  const [fetchingDonorsId, setFetchingDonorsId] = useState<string | null>(null);
  const [syncingAllDonors, setSyncingAllDonors] = useState(false);
  const [syncProgress, setSyncProgress] = useState<{ current: number; total: number } | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const fetchMutation = useFetchPacExpenditures();
  const fetchDonorsMutation = useFetchPacDonors();

  // Fetch external committees (Super PACs)
  const { data: externalCommittees = [], isLoading } = useQuery({
    queryKey: ['external-committees'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('candidate_committees')
        .select(`
          *,
          pac_candidate_totals:pac_candidate_totals(count)
        `)
        .eq('role', 'external')
        .eq('active', true)
        .order('name');
      
      if (error) throw error;
      return data || [];
    },
  });

  // Fetch pac_expenditures summary
  const { data: expenditureSummary = [] } = useQuery({
    queryKey: ['pac-expenditure-summary'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('pac_candidate_totals')
        .select('committee_id, total_spent, support_total, oppose_total')
        .order('total_spent', { ascending: false });
      
      if (error) throw error;
      
      // Group by committee_id
      const grouped = (data || []).reduce((acc, row) => {
        if (!acc[row.committee_id]) {
          acc[row.committee_id] = { total: 0, support: 0, oppose: 0, candidates: 0 };
        }
        acc[row.committee_id].total += row.total_spent;
        acc[row.committee_id].support += row.support_total;
        acc[row.committee_id].oppose += row.oppose_total;
        acc[row.committee_id].candidates += 1;
        return acc;
      }, {} as Record<string, { total: number; support: number; oppose: number; candidates: number }>);
      
      return grouped;
    },
  });

  const handleFetch = async (committeeId: string) => {
    setFetchingId(committeeId);
    try {
      await fetchMutation.mutateAsync({ committeeId, cycle: '2024' });
    } finally {
      setFetchingId(null);
    }
  };

  const handleFetchDonors = async (committeeId: string) => {
    setFetchingDonorsId(committeeId);
    try {
      await fetchDonorsMutation.mutateAsync({ committeeId, cycle: '2024' });
    } finally {
      setFetchingDonorsId(null);
    }
  };

  const handleSyncAllDonors = async () => {
    if (externalCommittees.length === 0) return;
    
    setSyncingAllDonors(true);
    setSyncProgress({ current: 0, total: externalCommittees.length });
    
    for (let i = 0; i < externalCommittees.length; i++) {
      const committee = externalCommittees[i];
      setSyncProgress({ current: i + 1, total: externalCommittees.length });
      setFetchingDonorsId(committee.fec_committee_id);
      
      try {
        await fetchDonorsMutation.mutateAsync({ committeeId: committee.fec_committee_id, cycle: '2024' });
      } catch (error) {
        console.error(`Failed to fetch donors for ${committee.name}:`, error);
        // Continue with next PAC even if one fails
      }
    }
    
    setFetchingDonorsId(null);
    setSyncingAllDonors(false);
    setSyncProgress(null);
  };

  const filteredCommittees = externalCommittees.filter(c => 
    !searchQuery || 
    c.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.fec_committee_id.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-primary" />
              Super PAC Expenditures
            </CardTitle>
            <CardDescription>
              Fetch and manage Schedule E independent expenditure data for external PACs
            </CardDescription>
          </div>
          {externalCommittees.length > 0 && (
            <Button
              onClick={handleSyncAllDonors}
              disabled={syncingAllDonors}
              className="gap-2"
            >
              {syncingAllDonors ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Syncing {syncProgress?.current}/{syncProgress?.total}...
                </>
              ) : (
                <>
                  <Users className="h-4 w-4" />
                  Sync All PAC Donors
                </>
              )}
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {/* Search */}
        <div className="mb-4 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search PACs..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>

        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : filteredCommittees.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <p>No external PACs found.</p>
            <p className="text-sm mt-1">Import a Super PAC via the Committee Allocation panel first.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>PAC Name</TableHead>
                  <TableHead>FEC ID</TableHead>
                  <TableHead className="text-right">Support</TableHead>
                  <TableHead className="text-right">Oppose</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-center">Candidates</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredCommittees.map((committee) => {
                  const summary = expenditureSummary[committee.fec_committee_id];
                  const hasData = !!summary;
                  
                  return (
                    <TableRow key={committee.id}>
                      <TableCell className="font-medium max-w-[200px] truncate">
                        {committee.name || 'Unknown'}
                      </TableCell>
                      <TableCell>
                        <code className="text-xs bg-muted px-1.5 py-0.5 rounded">
                          {committee.fec_committee_id}
                        </code>
                      </TableCell>
                      <TableCell className="text-right">
                        {hasData ? (
                          <span className="text-agree font-medium">
                            {formatCurrency(summary.support)}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {hasData ? (
                          <span className="text-disagree font-medium">
                            {formatCurrency(summary.oppose)}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {hasData ? (
                          <span className="font-bold">
                            {formatCurrency(summary.total)}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        {hasData ? (
                          <Badge variant="secondary">{summary.candidates}</Badge>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex gap-2 justify-end">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleFetch(committee.fec_committee_id)}
                            disabled={fetchingId === committee.fec_committee_id}
                            title="Fetch expenditures (Schedule E)"
                          >
                            {fetchingId === committee.fec_committee_id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <RefreshCw className="h-4 w-4" />
                            )}
                            <span className="ml-1 hidden sm:inline">{hasData ? 'Refresh' : 'Fetch'}</span>
                          </Button>
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => handleFetchDonors(committee.fec_committee_id)}
                            disabled={fetchingDonorsId === committee.fec_committee_id}
                            title="Fetch donors (Schedule A)"
                          >
                            {fetchingDonorsId === committee.fec_committee_id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Users className="h-4 w-4" />
                            )}
                            <span className="ml-1 hidden sm:inline">Donors</span>
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
