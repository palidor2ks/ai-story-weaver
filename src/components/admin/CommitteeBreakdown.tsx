import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Building2, RefreshCw, Clock, AlertTriangle, CheckCircle2, EyeOff, Landmark } from 'lucide-react';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';
import { formatCompactCurrency } from '@/lib/utils';

interface Committee {
  id: string;
  fec_committee_id: string;
  name: string | null;
  designation: string | null;
  designation_full: string | null;
  role: string;
  active: boolean;
  local_itemized_total: number | null;
  fec_itemized_total: number | null;
  last_sync_completed_at: string | null;
  last_sync_started_at: string | null;
  last_index: string | null;
  has_more: boolean | null;
  cycles: string[] | null;
  is_terminated: boolean | null;
  last_contribution_date: string | null;
}

interface CommitteeBreakdownProps {
  candidateId: string;
  candidateName: string;
  fecCandidateId: string;
  onRefetch?: () => void;
}

export function CommitteeBreakdown({ 
  candidateId, 
  candidateName, 
  fecCandidateId,
  onRefetch 
}: CommitteeBreakdownProps) {
  const [committees, setCommittees] = useState<Committee[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [togglingIds, setTogglingIds] = useState<Set<string>>(new Set());
  const [selectedCycle, setSelectedCycle] = useState<string>(() => {
    const y = new Date().getFullYear();
    return String(y % 2 === 0 ? y : y + 1);
  });
  const [hideInactive, setHideInactive] = useState(true);
  const [designationFilter, setDesignationFilter] = useState<'campaign' | 'external' | 'all'>('campaign');

  // National party committee IDs to filter out by default
  const NATIONAL_PARTY_COMMITTEE_IDS = [
    'C00027466', // NRSC - National Republican Senatorial Committee
    'C00042366', // DSCC - Democratic Senatorial Campaign Committee
    'C00075820', // NRCC - National Republican Congressional Committee
    'C00000935', // DCCC - Democratic Congressional Campaign Committee
  ];

  // Campaign committees (used in FEC reconciliation)
  const CAMPAIGN_DESIGNATIONS = ['P', 'A'];
  // External committees (tracked separately)
  const EXTERNAL_DESIGNATIONS = ['J', 'U', 'B', 'D'];

  const fetchCommittees = async () => {
    const { data, error } = await supabase
      .from('candidate_committees')
      .select('id, fec_committee_id, name, designation, designation_full, role, active, local_itemized_total, fec_itemized_total, last_sync_completed_at, last_sync_started_at, last_index, has_more, cycles, is_terminated, last_contribution_date')
      .eq('candidate_id', candidateId)
      .order('role', { ascending: true });

    if (error) {
      console.error('[CommitteeBreakdown] Error:', error);
      return;
    }

    setCommittees(data || []);
    setLoading(false);
  };

  // Check if a committee is a national party committee
  const isNationalPartyCommittee = (fecId: string) => {
    return NATIONAL_PARTY_COMMITTEE_IDS.includes(fecId);
  };

  // Filter committees based on cycle, inactive status, and designation filter
  const filteredCommittees = useMemo(() => {
    return committees.filter(c => {
      // Designation filter
      const designation = c.designation || '';
      if (designationFilter === 'campaign') {
        // Only show P and A committees
        if (!CAMPAIGN_DESIGNATIONS.includes(designation)) return false;
      } else if (designationFilter === 'external') {
        // Only show J, U, B, D committees
        if (!EXTERNAL_DESIGNATIONS.includes(designation)) return false;
      }
      // 'all' shows everything

      // Cycle filter: skip if "all" selected, otherwise filter by cycle
      if (selectedCycle !== 'all') {
        const matchesCycle = !c.cycles || c.cycles.length === 0 || c.cycles.includes(selectedCycle);
        if (!matchesCycle) return false;
      }
      
      // Hide inactive filter
      if (hideInactive) {
        // Hide if terminated
        if (c.is_terminated) return false;
        // Hide if no contributions at all
        if ((c.local_itemized_total || 0) === 0 && !c.last_contribution_date) return false;
      }
      
      return true;
    });
  }, [committees, selectedCycle, hideInactive, designationFilter]);

  // Derive available cycles from the candidate's committees, plus baseline current/previous federal cycles
  const availableCycles = useMemo(() => {
    const year = new Date().getFullYear();
    const currentCycle = year % 2 === 0 ? year : year + 1;
    const set = new Set<string>([String(currentCycle), String(currentCycle - 2)]);
    committees.forEach(c => (c.cycles || []).forEach(cy => cy && set.add(String(cy))));
    return Array.from(set).sort((a, b) => Number(b) - Number(a));
  }, [committees]);

  // If the selected cycle isn't in the available list, snap to the newest available
  useEffect(() => {
    if (selectedCycle !== 'all' && availableCycles.length > 0 && !availableCycles.includes(selectedCycle)) {
      setSelectedCycle(availableCycles[0]);
    }
  }, [availableCycles, selectedCycle]);

  useEffect(() => {
    fetchCommittees();
  }, [candidateId]);

  const handleRefreshCommittees = async () => {
    setRefreshing(true);
    try {
      const { data, error } = await supabase.functions.invoke('fetch-fec-committees', {
        body: { candidateId, fecCandidateId }
      });

      if (error) throw error;

      if (data?.success) {
        toast.success(`Refreshed ${data.committees?.length || 0} committees`);
        await fetchCommittees();
        onRefetch?.();
      } else {
        toast.error(data?.error || 'Failed to refresh committees');
      }
    } catch (err) {
      console.error('[CommitteeBreakdown] Refresh error:', err);
      toast.error('Failed to refresh committees');
    } finally {
      setRefreshing(false);
    }
  };

  const handleToggleActive = async (committee: Committee) => {
    setTogglingIds(prev => new Set(prev).add(committee.id));
    try {
      const { error } = await supabase
        .from('candidate_committees')
        .update({ active: !committee.active, updated_at: new Date().toISOString() })
        .eq('id', committee.id);

      if (error) throw error;

      setCommittees(prev => 
        prev.map(c => c.id === committee.id ? { ...c, active: !c.active } : c)
      );
      
      toast.success(`${committee.name || committee.fec_committee_id} ${!committee.active ? 'enabled' : 'disabled'} for sync`);
    } catch (err) {
      console.error('[CommitteeBreakdown] Toggle error:', err);
      toast.error('Failed to update committee');
    } finally {
      setTogglingIds(prev => {
        const next = new Set(prev);
        next.delete(committee.id);
        return next;
      });
    }
  };

  const getDesignationBadge = (designation: string | null) => {
    switch (designation) {
      case 'P':
        return <Badge className="bg-blue-600 text-white text-[10px]">Principal</Badge>;
      case 'A':
        return <Badge variant="secondary" className="text-[10px]">Authorized</Badge>;
      case 'J':
        return <Badge variant="outline" className="text-[10px] text-orange-600 border-orange-300">Joint Fundraising</Badge>;
      case 'U':
        return <Badge variant="outline" className="text-[10px] text-purple-600 border-purple-300">Unauthorized (Super PAC)</Badge>;
      case 'B':
        return <Badge variant="outline" className="text-[10px] text-amber-600 border-amber-300">Lobbyist/Bundler</Badge>;
      case 'D':
        return <Badge variant="outline" className="text-[10px] text-teal-600 border-teal-300">Leadership PAC</Badge>;
      default:
        return <Badge variant="outline" className="text-[10px]">{designation || '?'}</Badge>;
    }
  };

  const formatCurrency = (value: number | null) => formatCompactCurrency(value);

  const getSyncStatusBadge = (committee: Committee) => {
    if (committee.has_more) {
      return (
        <TooltipProvider>
          <Tooltip delayDuration={200}>
            <TooltipTrigger asChild>
              <Badge variant="outline" className="text-[10px] px-1 py-0 h-4 text-amber-600 border-amber-300 gap-1">
                <AlertTriangle className="h-2.5 w-2.5" />
                Partial
              </Badge>
            </TooltipTrigger>
            <TooltipContent className="text-xs">
              <div className="space-y-1">
                <div className="font-medium">Sync incomplete</div>
                {committee.last_index && (
                  <div className="text-muted-foreground font-mono">
                    Cursor: {committee.last_index.slice(0, 20)}...
                  </div>
                )}
                {committee.last_sync_started_at && (
                  <div className="text-muted-foreground">
                    Started: {formatDistanceToNow(new Date(committee.last_sync_started_at), { addSuffix: true })}
                  </div>
                )}
              </div>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );
    }

    if (committee.last_sync_completed_at) {
      return (
        <TooltipProvider>
          <Tooltip delayDuration={200}>
            <TooltipTrigger asChild>
              <Badge variant="outline" className="text-[10px] px-1 py-0 h-4 text-green-600 border-green-300 gap-1">
                <CheckCircle2 className="h-2.5 w-2.5" />
                Synced
              </Badge>
            </TooltipTrigger>
            <TooltipContent className="text-xs">
              <div className="space-y-1">
                <div className="font-medium">Sync complete</div>
                <div className="text-muted-foreground">
                  {formatDistanceToNow(new Date(committee.last_sync_completed_at), { addSuffix: true })}
                </div>
              </div>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );
    }

    return (
      <TooltipProvider>
        <Tooltip delayDuration={200}>
          <TooltipTrigger asChild>
            <Badge variant="outline" className="text-[10px] px-1 py-0 h-4 text-muted-foreground gap-1">
              <Clock className="h-2.5 w-2.5" />
              Never
            </Badge>
          </TooltipTrigger>
          <TooltipContent className="text-xs">
            Never synced
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-4">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (committees.length === 0) {
    return (
      <div className="p-4 text-center text-sm text-muted-foreground">
        <p>No committees linked yet.</p>
        <Button
          size="sm"
          variant="outline"
          className="mt-2"
          onClick={handleRefreshCommittees}
          disabled={refreshing}
        >
          {refreshing ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Building2 className="h-3 w-3 mr-1" />}
          Fetch Committees
        </Button>
      </div>
    );
  }

  const activeCount = filteredCommittees.filter(c => c.active).length;
  const totalItemized = filteredCommittees.filter(c => c.active).reduce((sum, c) => sum + (c.local_itemized_total || 0), 0);
  const hiddenCount = committees.length - filteredCommittees.length;
  
  // Calculate separate totals for campaign vs external
  const campaignTotal = committees
    .filter(c => c.active && CAMPAIGN_DESIGNATIONS.includes(c.designation || ''))
    .reduce((sum, c) => sum + (c.local_itemized_total || 0), 0);
  const externalTotal = committees
    .filter(c => c.active && EXTERNAL_DESIGNATIONS.includes(c.designation || ''))
    .reduce((sum, c) => sum + (c.local_itemized_total || 0), 0);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Building2 className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">{candidateName}</span>
          <Badge variant="outline" className="text-xs">
            {activeCount}/{filteredCommittees.length} active
          </Badge>
          {hiddenCount > 0 && (
            <Badge variant="secondary" className="text-xs gap-1">
              <EyeOff className="h-2.5 w-2.5" />
              {hiddenCount} hidden
            </Badge>
          )}
        </div>
        <Button
          size="sm"
          variant="ghost"
          onClick={handleRefreshCommittees}
          disabled={refreshing}
        >
          {refreshing ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
        </Button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 p-2 bg-muted/30 rounded-md">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Cycle:</span>
          <Select value={selectedCycle} onValueChange={setSelectedCycle}>
            <SelectTrigger className="h-7 w-20 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {availableCycles.map(cy => (
                <SelectItem key={cy} value={cy}>{cy}</SelectItem>
              ))}
              <SelectItem value="all">All</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <Switch
            id="hide-inactive"
            checked={hideInactive}
            onCheckedChange={setHideInactive}
            className="h-4 w-7"
          />
          <label htmlFor="hide-inactive" className="text-xs text-muted-foreground cursor-pointer">
            Hide inactive
          </label>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Type:</span>
          <Select value={designationFilter} onValueChange={(v) => setDesignationFilter(v as 'campaign' | 'external' | 'all')}>
            <SelectTrigger className="h-7 w-28 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="campaign">Campaign (P/A)</SelectItem>
              <SelectItem value="external">External (J/U/B/D)</SelectItem>
              <SelectItem value="all">All</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Totals Summary */}
      <div className="p-2 bg-muted/50 rounded text-xs space-y-1">
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Campaign (P/A) total:</span>
          <span className="font-medium text-blue-600">{formatCurrency(campaignTotal)}</span>
        </div>
        {externalTotal > 0 && (
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">External (J/U/B/D) total:</span>
            <span className="font-medium text-purple-600">{formatCurrency(externalTotal)}</span>
          </div>
        )}
        {designationFilter !== 'all' && (
          <div className="flex items-center justify-between pt-1 border-t border-border/50">
            <span className="text-muted-foreground">Filtered view total:</span>
            <span className="font-medium">{formatCurrency(totalItemized)}</span>
          </div>
        )}
      </div>

      <div className="space-y-2">
        {filteredCommittees.map(committee => (
          <div
            key={committee.id} 
            className={`flex items-center justify-between p-2 rounded-md border ${
              committee.active ? 'bg-background' : 'bg-muted/50 opacity-60'
            }`}
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                {getDesignationBadge(committee.designation)}
                <span className="text-xs font-mono text-muted-foreground">
                  {committee.fec_committee_id}
                </span>
                {getSyncStatusBadge(committee)}
                {committee.is_terminated && (
                  <Badge variant="destructive" className="text-[10px] px-1 py-0 h-4">
                    Terminated
                  </Badge>
                )}
                {isNationalPartyCommittee(committee.fec_committee_id) && (
                  <Badge variant="outline" className="text-[10px] px-1 py-0 h-4 text-red-600 border-red-300 gap-1">
                    <Landmark className="h-2.5 w-2.5" />
                    National Party
                  </Badge>
                )}
                {committee.cycles && committee.cycles.length > 0 && (
                  <span className="text-[10px] text-muted-foreground">
                    {committee.cycles.slice(-3).join(', ')}
                  </span>
                )}
              </div>
              <p className="text-sm font-medium truncate mt-0.5">
                {committee.name || 'Unknown Committee'}
              </p>
              <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                <span>Local: {formatCurrency(committee.local_itemized_total)}</span>
                {committee.fec_itemized_total !== null && (
                  <span>FEC: {formatCurrency(committee.fec_itemized_total)}</span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 ml-2">
              <span className="text-xs text-muted-foreground">
                {committee.active ? 'Sync' : 'Skip'}
              </span>
              <Switch
                checked={committee.active}
                onCheckedChange={() => handleToggleActive(committee)}
                disabled={togglingIds.has(committee.id)}
              />
            </div>
          </div>
        ))}
      </div>

      {filteredCommittees.some(c => c.designation === 'A') && (
        <p className="text-xs text-amber-600 bg-amber-50 dark:bg-amber-950/30 p-2 rounded">
          ⚠️ Authorized committees may include transfers from the Principal committee. 
          Enabling both could result in double-counted contributions.
        </p>
      )}
    </div>
  );
}
