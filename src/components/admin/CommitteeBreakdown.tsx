import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Loader2, Building2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

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

  const fetchCommittees = async () => {
    const { data, error } = await supabase
      .from('candidate_committees')
      .select('*')
      .eq('candidate_id', candidateId)
      .order('role', { ascending: true });

    if (error) {
      console.error('[CommitteeBreakdown] Error:', error);
      return;
    }

    setCommittees(data || []);
    setLoading(false);
  };

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
        return <Badge variant="outline" className="text-[10px]">Joint</Badge>;
      case 'U':
        return <Badge variant="outline" className="text-[10px]">Unauthorized</Badge>;
      default:
        return <Badge variant="outline" className="text-[10px]">{designation || '?'}</Badge>;
    }
  };

  const formatCurrency = (value: number | null) => {
    if (value === null || value === undefined) return '—';
    return `$${Math.round(value).toLocaleString()}`;
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

  const activeCount = committees.filter(c => c.active).length;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Building2 className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">{candidateName}</span>
          <Badge variant="outline" className="text-xs">
            {activeCount}/{committees.length} active
          </Badge>
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

      <div className="space-y-2">
        {committees.map(committee => (
          <div 
            key={committee.id} 
            className={`flex items-center justify-between p-2 rounded-md border ${
              committee.active ? 'bg-background' : 'bg-muted/50 opacity-60'
            }`}
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                {getDesignationBadge(committee.designation)}
                <span className="text-xs font-mono text-muted-foreground">
                  {committee.fec_committee_id}
                </span>
              </div>
              <p className="text-sm font-medium truncate mt-0.5">
                {committee.name || 'Unknown Committee'}
              </p>
              <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                <span>Local: {formatCurrency(committee.local_itemized_total)}</span>
                {committee.fec_itemized_total !== null && (
                  <span>FEC: {formatCurrency(committee.fec_itemized_total)}</span>
                )}
                {committee.last_sync_completed_at && (
                  <span className="text-green-600">✓ Synced</span>
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

      {committees.some(c => c.designation === 'A') && (
        <p className="text-xs text-amber-600 bg-amber-50 dark:bg-amber-950/30 p-2 rounded">
          ⚠️ Authorized committees may include transfers from the Principal committee. 
          Enabling both could result in double-counted contributions.
        </p>
      )}
    </div>
  );
}
