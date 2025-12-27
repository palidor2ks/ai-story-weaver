import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, RotateCcw, AlertCircle } from 'lucide-react';
import { useUpsertCandidateOverride, useDeleteCandidateOverride, useCandidateOverride } from '@/hooks/useCandidateOverrides';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';
import { FecIdsPanel } from './FecIdsPanel';

const PARTIES = ['Democrat', 'Republican', 'Independent', 'Other'] as const;
const TIERS = ['tier_1', 'tier_2', 'tier_3'] as const;
const CONFIDENCE_LEVELS = ['high', 'medium', 'low'] as const;

interface CandidateEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  candidateId: string;
  candidateName: string;
  currentData: {
    name: string;
    party: string;
    office: string;
    state: string;
    district: string | null;
    image_url: string | null;
    overall_score: number | null;
    coverage_tier: string;
    confidence: string;
  };
}

interface FormData {
  name: string;
  party: string;
  office: string;
  state: string;
  district: string;
  image_url: string;
  overall_score: string;
  coverage_tier: string;
  confidence: string;
  notes: string;
}

export function CandidateEditDialog({
  open,
  onOpenChange,
  candidateId,
  candidateName,
  currentData,
}: CandidateEditDialogProps) {
  const { data: existingOverride } = useCandidateOverride(candidateId);
  const upsertMutation = useUpsertCandidateOverride();
  const deleteMutation = useDeleteCandidateOverride();

  const [formData, setFormData] = useState<FormData>({
    name: currentData.name,
    party: currentData.party,
    office: currentData.office,
    state: currentData.state,
    district: currentData.district || '',
    image_url: currentData.image_url || '',
    overall_score: currentData.overall_score?.toString() || '',
    coverage_tier: currentData.coverage_tier,
    confidence: currentData.confidence,
    notes: '',
  });

  // Track which fields are overridden
  const isFieldOverridden = (field: keyof typeof currentData) => {
    if (!existingOverride) return false;
    const overrideValue = existingOverride[field];
    return overrideValue !== null && overrideValue !== undefined && overrideValue !== currentData[field];
  };

  // Update form when dialog opens or override data changes
  useEffect(() => {
    if (open) {
      setFormData({
        name: existingOverride?.name ?? currentData.name,
        party: existingOverride?.party ?? currentData.party,
        office: existingOverride?.office ?? currentData.office,
        state: existingOverride?.state ?? currentData.state,
        district: existingOverride?.district ?? currentData.district ?? '',
        image_url: existingOverride?.image_url ?? currentData.image_url ?? '',
        overall_score: (existingOverride?.overall_score ?? currentData.overall_score)?.toString() || '',
        coverage_tier: existingOverride?.coverage_tier ?? currentData.coverage_tier,
        confidence: existingOverride?.confidence ?? currentData.confidence,
        notes: existingOverride?.notes || '',
      });
    }
  }, [open, existingOverride, currentData]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    await upsertMutation.mutateAsync({
      candidate_id: candidateId,
      name: formData.name || null,
      party: formData.party || null,
      office: formData.office || null,
      state: formData.state || null,
      district: formData.district || null,
      image_url: formData.image_url || null,
      overall_score: formData.overall_score ? parseFloat(formData.overall_score) : null,
      coverage_tier: formData.coverage_tier || null,
      confidence: formData.confidence || null,
      notes: formData.notes || null,
    });
    
    onOpenChange(false);
  };

  const handleRevert = async () => {
    await deleteMutation.mutateAsync(candidateId);
    onOpenChange(false);
  };

  const FieldLabel = ({ field, label }: { field: keyof typeof currentData; label: string }) => (
    <div className="flex items-center gap-2">
      <Label htmlFor={field}>{label}</Label>
      {isFieldOverridden(field) && (
        <Badge variant="outline" className="text-[10px] px-1 py-0 h-4 border-primary/50 text-primary">
          Overridden
        </Badge>
      )}
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Edit Candidate: {candidateName}
            {existingOverride && (
              <Badge variant="outline" className="text-xs border-primary text-primary">
                Has Overrides
              </Badge>
            )}
          </DialogTitle>
          <DialogDescription>
            Override data from the API. Changes will persist through API syncs.
          </DialogDescription>
        </DialogHeader>

        {existingOverride && (
          <div className="flex items-center gap-2 p-2 bg-primary/5 border border-primary/20 rounded text-sm">
            <AlertCircle className="h-4 w-4 text-primary shrink-0" />
            <div className="flex-1">
              <span className="font-medium">Override active</span>
              {existingOverride.updated_at && (
                <span className="text-muted-foreground ml-2">
                  Last updated {formatDistanceToNow(new Date(existingOverride.updated_at), { addSuffix: true })}
                </span>
              )}
            </div>
          </div>
        )}

        <Tabs defaultValue="details" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="details">Profile Details</TabsTrigger>
            <TabsTrigger value="fec">FEC Campaign IDs</TabsTrigger>
          </TabsList>
          
          <TabsContent value="details">
            <form onSubmit={handleSubmit} className="space-y-4 mt-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <FieldLabel field="name" label="Name" />
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="Full name"
                    className={cn(isFieldOverridden('name') && 'border-primary/50')}
                  />
                  {isFieldOverridden('name') && (
                    <p className="text-xs text-muted-foreground">
                      API value: {currentData.name}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <FieldLabel field="party" label="Party" />
                  <Select
                    value={formData.party}
                    onValueChange={(value) => setFormData({ ...formData, party: value })}
                  >
                    <SelectTrigger className={cn(isFieldOverridden('party') && 'border-primary/50')}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PARTIES.map((party) => (
                        <SelectItem key={party} value={party}>{party}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {isFieldOverridden('party') && (
                    <p className="text-xs text-muted-foreground">
                      API value: {currentData.party}
                    </p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <FieldLabel field="office" label="Office" />
                  <Input
                    id="office"
                    value={formData.office}
                    onChange={(e) => setFormData({ ...formData, office: e.target.value })}
                    placeholder="e.g., U.S. Senator"
                    className={cn(isFieldOverridden('office') && 'border-primary/50')}
                  />
                </div>

                <div className="space-y-2">
                  <FieldLabel field="state" label="State" />
                  <Input
                    id="state"
                    value={formData.state}
                    onChange={(e) => setFormData({ ...formData, state: e.target.value.toUpperCase() })}
                    placeholder="e.g., CA"
                    maxLength={2}
                    className={cn(isFieldOverridden('state') && 'border-primary/50')}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <FieldLabel field="district" label="District" />
                  <Input
                    id="district"
                    value={formData.district}
                    onChange={(e) => setFormData({ ...formData, district: e.target.value })}
                    placeholder="e.g., CA-12"
                    className={cn(isFieldOverridden('district') && 'border-primary/50')}
                  />
                </div>

                <div className="space-y-2">
                  <FieldLabel field="overall_score" label="Overall Score (-10 to 10)" />
                  <Input
                    id="overall_score"
                    type="number"
                    min="-10"
                    max="10"
                    step="0.1"
                    value={formData.overall_score}
                    onChange={(e) => setFormData({ ...formData, overall_score: e.target.value })}
                    placeholder="e.g., 5.5"
                    className={cn(isFieldOverridden('overall_score') && 'border-primary/50')}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <FieldLabel field="image_url" label="Image URL" />
                <Input
                  id="image_url"
                  type="url"
                  value={formData.image_url}
                  onChange={(e) => setFormData({ ...formData, image_url: e.target.value })}
                  placeholder="https://..."
                  className={cn(isFieldOverridden('image_url') && 'border-primary/50')}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <FieldLabel field="coverage_tier" label="Coverage Tier" />
                  <Select
                    value={formData.coverage_tier}
                    onValueChange={(value) => setFormData({ ...formData, coverage_tier: value })}
                  >
                    <SelectTrigger className={cn(isFieldOverridden('coverage_tier') && 'border-primary/50')}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TIERS.map((tier) => (
                        <SelectItem key={tier} value={tier}>{tier}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <FieldLabel field="confidence" label="Confidence" />
                  <Select
                    value={formData.confidence}
                    onValueChange={(value) => setFormData({ ...formData, confidence: value })}
                  >
                    <SelectTrigger className={cn(isFieldOverridden('confidence') && 'border-primary/50')}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CONFIDENCE_LEVELS.map((level) => (
                        <SelectItem key={level} value={level}>{level}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="notes">Admin Notes</Label>
                <Textarea
                  id="notes"
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="Internal notes explaining the override..."
                  rows={3}
                />
              </div>

              <DialogFooter className="gap-2 sm:gap-0">
                {existingOverride && (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button type="button" variant="outline" className="gap-2">
                        <RotateCcw className="h-4 w-4" />
                        Revert to API Data
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Revert to API Data?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This will delete all overrides for {candidateName} and revert to the original API data.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={handleRevert}>
                          Revert
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
                
                <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={upsertMutation.isPending}>
                  {upsertMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Save Override
                </Button>
              </DialogFooter>
            </form>
          </TabsContent>
          
          <TabsContent value="fec" className="mt-4">
            <FecIdsPanel 
              candidateId={candidateId} 
              candidateName={candidateName}
              candidateState={currentData.state}
            />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
