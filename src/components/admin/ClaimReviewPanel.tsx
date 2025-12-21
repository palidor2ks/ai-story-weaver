import { useState } from 'react';
import { Link } from 'react-router-dom';
import { usePendingClaims, useAllClaims, useApproveClaim, useRejectClaim, ProfileClaim } from '@/hooks/useProfileClaims';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Loader2, CheckCircle, XCircle, Clock, ExternalLink, Mail, FileText } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

export function ClaimReviewPanel() {
  const { data: pendingClaims, isLoading: pendingLoading } = usePendingClaims();
  const { data: allClaims, isLoading: allLoading } = useAllClaims();
  const approveClaim = useApproveClaim();
  const rejectClaim = useRejectClaim();

  const [selectedClaim, setSelectedClaim] = useState<ProfileClaim | null>(null);
  const [isRejectDialogOpen, setIsRejectDialogOpen] = useState(false);
  const [isApproveDialogOpen, setIsApproveDialogOpen] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');

  const handleApprove = async () => {
    if (!selectedClaim) return;
    await approveClaim.mutateAsync(selectedClaim.id);
    setIsApproveDialogOpen(false);
    setSelectedClaim(null);
  };

  const handleReject = async () => {
    if (!selectedClaim) return;
    await rejectClaim.mutateAsync({
      claimId: selectedClaim.id,
      rejectionReason,
    });
    setIsRejectDialogOpen(false);
    setRejectionReason('');
    setSelectedClaim(null);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return (
          <Badge variant="outline" className="bg-amber-500/10 text-amber-700 border-amber-500/30">
            <Clock className="h-3 w-3 mr-1" />
            Pending
          </Badge>
        );
      case 'approved':
        return (
          <Badge variant="outline" className="bg-agree/10 text-agree border-agree/30">
            <CheckCircle className="h-3 w-3 mr-1" />
            Approved
          </Badge>
        );
      case 'rejected':
        return (
          <Badge variant="outline" className="bg-disagree/10 text-disagree border-disagree/30">
            <XCircle className="h-3 w-3 mr-1" />
            Rejected
          </Badge>
        );
      default:
        return <Badge>{status}</Badge>;
    }
  };

  const ClaimTable = ({ claims, showActions }: { claims: ProfileClaim[]; showActions: boolean }) => (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Candidate ID</TableHead>
            <TableHead>Official Email</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Submitted</TableHead>
            {showActions && <TableHead className="text-right">Actions</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {claims.map((claim) => (
            <TableRow key={claim.id}>
              <TableCell>
                <Link
                  to={`/candidate/${claim.candidate_id}`}
                  className="font-medium text-primary hover:underline flex items-center gap-1"
                >
                  {claim.candidate_id}
                  <ExternalLink className="h-3 w-3" />
                </Link>
              </TableCell>
              <TableCell>
                <a
                  href={`mailto:${claim.official_email}`}
                  className="flex items-center gap-1 text-muted-foreground hover:text-foreground"
                >
                  <Mail className="h-3 w-3" />
                  {claim.official_email}
                </a>
              </TableCell>
              <TableCell>{getStatusBadge(claim.status)}</TableCell>
              <TableCell className="text-muted-foreground">
                {formatDistanceToNow(new Date(claim.created_at), { addSuffix: true })}
              </TableCell>
              {showActions && (
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setSelectedClaim(claim);
                        // Show verification info in a dialog
                      }}
                    >
                      <FileText className="h-4 w-4 mr-1" />
                      View Details
                    </Button>
                    <Button
                      size="sm"
                      variant="default"
                      className="bg-agree hover:bg-agree/90"
                      onClick={() => {
                        setSelectedClaim(claim);
                        setIsApproveDialogOpen(true);
                      }}
                    >
                      <CheckCircle className="h-4 w-4 mr-1" />
                      Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => {
                        setSelectedClaim(claim);
                        setIsRejectDialogOpen(true);
                      }}
                    >
                      <XCircle className="h-4 w-4 mr-1" />
                      Reject
                    </Button>
                  </div>
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Profile Claims</CardTitle>
        <CardDescription>
          Review and approve requests from politicians to claim their profiles.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="pending">
          <TabsList className="mb-4">
            <TabsTrigger value="pending" className="gap-2">
              <Clock className="h-4 w-4" />
              Pending ({pendingClaims?.length || 0})
            </TabsTrigger>
            <TabsTrigger value="all" className="gap-2">
              All Claims ({allClaims?.length || 0})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="pending">
            {pendingLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : pendingClaims && pendingClaims.length > 0 ? (
              <ClaimTable claims={pendingClaims} showActions={true} />
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                No pending claims to review.
              </div>
            )}
          </TabsContent>

          <TabsContent value="all">
            {allLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : allClaims && allClaims.length > 0 ? (
              <ClaimTable claims={allClaims} showActions={false} />
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                No claims have been submitted yet.
              </div>
            )}
          </TabsContent>
        </Tabs>

        {/* Details Dialog */}
        {selectedClaim && !isApproveDialogOpen && !isRejectDialogOpen && (
          <Dialog open={!!selectedClaim} onOpenChange={() => setSelectedClaim(null)}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Claim Details</DialogTitle>
                <DialogDescription>
                  Review the verification information provided by the claimant.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Candidate ID</p>
                  <p className="font-medium">{selectedClaim.candidate_id}</p>
                </div>

                <div>
                  <p className="text-sm font-medium text-muted-foreground">Official Email</p>
                  <a
                    href={`mailto:${selectedClaim.official_email}`}
                    className="text-primary hover:underline"
                  >
                    {selectedClaim.official_email}
                  </a>
                </div>

                <div>
                  <p className="text-sm font-medium text-muted-foreground">Verification Info</p>
                  <p className="bg-muted p-3 rounded-lg text-sm whitespace-pre-wrap">
                    {selectedClaim.verification_info || 'No verification info provided.'}
                  </p>
                </div>

                {selectedClaim.rejection_reason && (
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Rejection Reason</p>
                    <p className="bg-disagree/10 p-3 rounded-lg text-sm text-disagree">
                      {selectedClaim.rejection_reason}
                    </p>
                  </div>
                )}
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setSelectedClaim(null)}>
                  Close
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}

        {/* Approve Confirmation */}
        <AlertDialog open={isApproveDialogOpen} onOpenChange={setIsApproveDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Approve Claim?</AlertDialogTitle>
              <AlertDialogDescription>
                This will grant {selectedClaim?.official_email} edit access to their candidate
                profile. They will be able to update their information via the candidate_overrides
                system.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setSelectedClaim(null)}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleApprove}
                disabled={approveClaim.isPending}
                className="bg-agree hover:bg-agree/90"
              >
                {approveClaim.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Approve
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Reject Dialog */}
        <Dialog open={isRejectDialogOpen} onOpenChange={setIsRejectDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Reject Claim</DialogTitle>
              <DialogDescription>
                Provide a reason for rejecting this claim. This will be visible to the claimant.
              </DialogDescription>
            </DialogHeader>

            <Textarea
              placeholder="Reason for rejection..."
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              rows={4}
            />

            <DialogFooter>
              <Button variant="outline" onClick={() => {
                setIsRejectDialogOpen(false);
                setRejectionReason('');
                setSelectedClaim(null);
              }}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={handleReject}
                disabled={rejectClaim.isPending || !rejectionReason.trim()}
              >
                {rejectClaim.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Reject Claim
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
