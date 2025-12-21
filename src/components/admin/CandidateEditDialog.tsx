import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Loader2, RotateCcw } from 'lucide-react';
import { useUpsertCandidateOverride, useDeleteCandidateOverride, useCandidateOverride } from '@/hooks/useCandidateOverrides';

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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Candidate: {candidateName}</DialogTitle>
          <DialogDescription>
            Override data from the API. Changes will persist through API syncs.
            {existingOverride && (
              <span className="block mt-1 text-primary">
                This candidate has existing overrides.
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Full name"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="party">Party</Label>
              <Select
                value={formData.party}
                onValueChange={(value) => setFormData({ ...formData, party: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PARTIES.map((party) => (
                    <SelectItem key={party} value={party}>{party}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="office">Office</Label>
              <Input
                id="office"
                value={formData.office}
                onChange={(e) => setFormData({ ...formData, office: e.target.value })}
                placeholder="e.g., U.S. Senator"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="state">State</Label>
              <Input
                id="state"
                value={formData.state}
                onChange={(e) => setFormData({ ...formData, state: e.target.value.toUpperCase() })}
                placeholder="e.g., CA"
                maxLength={2}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="district">District</Label>
              <Input
                id="district"
                value={formData.district}
                onChange={(e) => setFormData({ ...formData, district: e.target.value })}
                placeholder="e.g., CA-12"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="overall_score">Overall Score (-10 to 10)</Label>
              <Input
                id="overall_score"
                type="number"
                min="-10"
                max="10"
                step="0.1"
                value={formData.overall_score}
                onChange={(e) => setFormData({ ...formData, overall_score: e.target.value })}
                placeholder="e.g., 5.5"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="image_url">Image URL</Label>
            <Input
              id="image_url"
              type="url"
              value={formData.image_url}
              onChange={(e) => setFormData({ ...formData, image_url: e.target.value })}
              placeholder="https://..."
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="coverage_tier">Coverage Tier</Label>
              <Select
                value={formData.coverage_tier}
                onValueChange={(value) => setFormData({ ...formData, coverage_tier: value })}
              >
                <SelectTrigger>
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
              <Label htmlFor="confidence">Confidence</Label>
              <Select
                value={formData.confidence}
                onValueChange={(value) => setFormData({ ...formData, confidence: value })}
              >
                <SelectTrigger>
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
      </DialogContent>
    </Dialog>
  );
}
