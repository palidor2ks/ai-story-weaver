import { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useMyClaimForCandidate, useSubmitClaim } from '@/hooks/useProfileClaims';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { UserCheck, Loader2, Clock, CheckCircle, XCircle } from 'lucide-react';

interface ClaimProfileDialogProps {
  candidateId: string;
  candidateName: string;
  isAlreadyClaimed: boolean;
}

export function ClaimProfileDialog({
  candidateId,
  candidateName,
  isAlreadyClaimed,
}: ClaimProfileDialogProps) {
  const { user } = useAuth();
  const { data: existingClaim, isLoading: claimLoading } = useMyClaimForCandidate(candidateId);
  const submitClaim = useSubmitClaim();

  const [isOpen, setIsOpen] = useState(false);
  const [officialEmail, setOfficialEmail] = useState('');
  const [verificationInfo, setVerificationInfo] = useState('');

  // Not logged in
  if (!user) {
    return null;
  }

  // Profile already claimed by someone
  if (isAlreadyClaimed) {
    return null;
  }

  // Loading claim status
  if (claimLoading) {
    return null;
  }

  // User has already submitted a claim
  if (existingClaim) {
    const statusConfig = {
      pending: {
        icon: Clock,
        color: 'bg-amber-500/10 text-amber-700 border-amber-500/30',
        text: 'Claim Pending',
      },
      approved: {
        icon: CheckCircle,
        color: 'bg-agree/10 text-agree border-agree/30',
        text: 'Claim Approved',
      },
      rejected: {
        icon: XCircle,
        color: 'bg-disagree/10 text-disagree border-disagree/30',
        text: 'Claim Rejected',
      },
    };

    const config = statusConfig[existingClaim.status];
    const Icon = config.icon;

    return (
      <Badge variant="outline" className={config.color}>
        <Icon className="h-3 w-3 mr-1" />
        {config.text}
      </Badge>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    await submitClaim.mutateAsync({
      candidateId,
      verificationInfo,
      officialEmail,
    });

    setIsOpen(false);
    setOfficialEmail('');
    setVerificationInfo('');
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <UserCheck className="h-4 w-4" />
          Claim This Profile
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Claim Profile: {candidateName}</DialogTitle>
          <DialogDescription>
            Are you {candidateName} or their authorized representative? Submit a claim request
            and an admin will verify your identity.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="official-email">Official Email</Label>
            <Input
              id="official-email"
              type="email"
              placeholder="e.g., rep.smith@house.gov"
              value={officialEmail}
              onChange={(e) => setOfficialEmail(e.target.value)}
              required
            />
            <p className="text-xs text-muted-foreground">
              Your official government or campaign email for verification.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="verification-info">Verification Information</Label>
            <Textarea
              id="verification-info"
              placeholder="Briefly explain how you can verify your identity (e.g., 'I am the representative for CA-12. I can verify via my official social media accounts.')"
              value={verificationInfo}
              onChange={(e) => setVerificationInfo(e.target.value)}
              rows={4}
              required
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setIsOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitClaim.isPending}>
              {submitClaim.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Submit Claim
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
