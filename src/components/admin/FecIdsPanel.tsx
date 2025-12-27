import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Loader2, Plus, Star, Trash2, ExternalLink, RefreshCw } from 'lucide-react';
import { useCandidateFecIds, useAddCandidateFecId, useDeleteCandidateFecId, useSetPrimaryFecId } from '@/hooks/useCandidateFecIds';
import { useFECIntegration } from '@/hooks/useFECIntegration';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

const OFFICE_TYPES = ['Senator', 'Representative', 'President', 'Governor', 'Other'] as const;

interface FecIdsPanelProps {
  candidateId: string;
  candidateName: string;
  candidateState: string;
}

export function FecIdsPanel({ candidateId, candidateName, candidateState }: FecIdsPanelProps) {
  const { data: fecIds, isLoading } = useCandidateFecIds(candidateId);
  const addMutation = useAddCandidateFecId();
  const deleteMutation = useDeleteCandidateFecId();
  const setPrimaryMutation = useSetPrimaryFecId();
  const { fetchFECCommittees, isCommitteeLoading } = useFECIntegration();
  
  const [showAddForm, setShowAddForm] = useState(false);
  const [newFecId, setNewFecId] = useState('');
  const [newOffice, setNewOffice] = useState<string>('');
  const [newCycle, setNewCycle] = useState('');
  
  const handleAdd = async () => {
    if (!newFecId.trim() || !newOffice) {
      toast.error('FEC ID and Office are required');
      return;
    }
    
    await addMutation.mutateAsync({
      candidateId,
      fecCandidateId: newFecId.trim().toUpperCase(),
      office: newOffice,
      state: candidateState,
      isPrimary: !fecIds || fecIds.length === 0, // Make primary if first one
      cycle: newCycle || undefined,
    });
    
    setNewFecId('');
    setNewOffice('');
    setNewCycle('');
    setShowAddForm(false);
  };
  
  const handleFetchCommittees = async (fecCandidateId: string) => {
    const result = await fetchFECCommittees(candidateId, fecCandidateId);
    if (result.success) {
      toast.success(`Linked ${result.committees.length} committees`);
    } else {
      toast.error(result.error || 'Failed to fetch committees');
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg">FEC Campaign IDs</CardTitle>
            <CardDescription>
              Link multiple FEC campaign IDs (Senate, House, Presidential) to combine finance data
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowAddForm(!showAddForm)}
            className="gap-2"
          >
            <Plus className="h-4 w-4" />
            Add FEC ID
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {showAddForm && (
          <div className="p-4 border rounded-lg bg-muted/30 space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-2">
                <Label htmlFor="fec-id">FEC Candidate ID</Label>
                <Input
                  id="fec-id"
                  value={newFecId}
                  onChange={(e) => setNewFecId(e.target.value)}
                  placeholder="e.g., P60006111"
                  className="font-mono"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="office">Office</Label>
                <Select value={newOffice} onValueChange={setNewOffice}>
                  <SelectTrigger id="office">
                    <SelectValue placeholder="Select office" />
                  </SelectTrigger>
                  <SelectContent>
                    {OFFICE_TYPES.map((office) => (
                      <SelectItem key={office} value={office}>{office}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="cycle">Election Cycle</Label>
                <Input
                  id="cycle"
                  value={newCycle}
                  onChange={(e) => setNewCycle(e.target.value)}
                  placeholder="e.g., 2024"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setShowAddForm(false)}>
                Cancel
              </Button>
              <Button 
                size="sm" 
                onClick={handleAdd}
                disabled={addMutation.isPending}
              >
                {addMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Add FEC ID
              </Button>
            </div>
          </div>
        )}

        {fecIds && fecIds.length > 0 ? (
          <div className="space-y-2">
            {fecIds.map((fecId) => (
              <div
                key={fecId.id}
                className={cn(
                  "flex items-center justify-between p-3 rounded-lg border",
                  fecId.is_primary && "border-primary/50 bg-primary/5"
                )}
              >
                <div className="flex items-center gap-3">
                  <div className="flex flex-col">
                    <div className="flex items-center gap-2">
                      <code className="text-sm font-mono font-medium">{fecId.fec_candidate_id}</code>
                      {fecId.is_primary && (
                        <Badge variant="default" className="text-[10px] px-1.5 py-0">
                          Primary
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>{fecId.office}</span>
                      {fecId.state && <span>• {fecId.state}</span>}
                      {fecId.cycle && <span>• Cycle {fecId.cycle}</span>}
                      {fecId.match_method && (
                        <Badge variant="outline" className="text-[10px] px-1 py-0">
                          {fecId.match_method}
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
                
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => handleFetchCommittees(fecId.fec_candidate_id)}
                    disabled={isCommitteeLoading(candidateId)}
                    title="Fetch committees for this FEC ID"
                  >
                    {isCommitteeLoading(candidateId) ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <RefreshCw className="h-4 w-4" />
                    )}
                  </Button>
                  
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    asChild
                  >
                    <a
                      href={`https://www.fec.gov/data/candidate/${fecId.fec_candidate_id}/`}
                      target="_blank"
                      rel="noopener noreferrer"
                      title="View on FEC.gov"
                    >
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  </Button>
                  
                  {!fecId.is_primary && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => setPrimaryMutation.mutate({ id: fecId.id, candidateId })}
                      disabled={setPrimaryMutation.isPending}
                      title="Set as primary"
                    >
                      <Star className="h-4 w-4" />
                    </Button>
                  )}
                  
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        title="Remove FEC ID"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Remove FEC ID?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This will unlink {fecId.fec_candidate_id} from {candidateName}. 
                          Committee data linked to this FEC ID will remain but won't be associated with this campaign.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => deleteMutation.mutate({ id: fecId.id, candidateId })}
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                          Remove
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-6 text-muted-foreground">
            <p>No FEC IDs linked yet.</p>
            <p className="text-sm">Add an FEC ID to track campaign finance data.</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
