import { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useMyClaimForCandidate, useSubmitClaim } from '@/hooks/useProfileClaims';
import { logBadgeEvent } from '@/lib/badges';
import { IconActionButton } from '@/components/ui/icon-action-button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
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

    logBadgeEvent('profile_claimed', { candidate_id: candidateId });

    setIsOpen(false);
    setOfficialEmail('');
    setVerificationInfo('');
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <IconActionButton
          label="Claim This Profile"
          icon={<UserCheck className="h-4 w-4" />}
        />
      </DialogTrigger>
      <DialogContent className="bg-white rounded-2xl p-0 overflow-hidden border-0 gap-0">
        <DialogHeader className="bg-poli-surface px-5 pt-5 pb-4">
          <p className="font-mono-label text-xs font-bold text-poli-red uppercase tracking-widest mb-1">
            Claim Profile
          </p>
          <DialogTitle className="text-lg font-black text-poli-navy">
            {candidateName}
          </DialogTitle>
          <DialogDescription className="text-sm text-poli-muted">
            Are you {candidateName} or their authorized representative? Submit a claim request
            and an admin will verify your identity.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="px-5 pb-5 pt-4 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="official-email" className="text-sm font-semibold text-poli-body">
              Official Email
            </Label>
            <Input
              id="official-email"
              type="email"
              placeholder="e.g., rep.smith@house.gov"
              value={officialEmail}
              onChange={(e) => setOfficialEmail(e.target.value)}
              required
              className="border border-poli-surface rounded-xl h-12 px-4 w-full text-sm text-poli-body focus:ring-1 focus:ring-poli-navy"
            />
            <p className="text-xs text-poli-muted">
              Your official government or campaign email for verification.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="verification-info" className="text-sm font-semibold text-poli-body">
              Verification Information
            </Label>
            <Textarea
              id="verification-info"
              placeholder="Briefly explain how you can verify your identity (e.g., 'I am the representative for CA-12. I can verify via my official social media accounts.')"
              value={verificationInfo}
              onChange={(e) => setVerificationInfo(e.target.value)}
              rows={4}
              required
              className="border border-poli-surface rounded-xl px-4 w-full text-sm text-poli-body focus:ring-1 focus:ring-poli-navy"
            />
          </div>

          <div className="flex flex-col gap-2 pt-2">
            <button
              type="submit"
              disabled={submitClaim.isPending}
              className="w-full h-12 rounded-xl font-bold text-white text-sm flex items-center justify-center gap-2 disabled:opacity-60"
              style={{ background: 'linear-gradient(90deg, #182B7A, #B3122F)' }}
            >
              {submitClaim.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Submit Claim
            </button>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="text-sm text-poli-muted underline text-center py-1"
            >
              Cancel
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
