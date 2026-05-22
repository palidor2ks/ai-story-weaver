import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Loader2, RotateCcw, EyeOff } from 'lucide-react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { useIEExclusions, useRestoreCommittee } from '@/hooks/useIEExclusions';

export function IEExclusionsPanel() {
  const { data: exclusions = [], isLoading } = useIEExclusions();
  const restore = useRestoreCommittee();
  const [restoringId, setRestoringId] = useState<string | null>(null);

  const handleRestore = async (fecCommitteeId: string) => {
    setRestoringId(fecCommitteeId);
    try {
      await restore.mutateAsync(fecCommitteeId);
      toast.success('Committee restored to IE rollups');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to restore');
    } finally {
      setRestoringId(null);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <EyeOff className="w-5 h-5" /> IE Exclusions
        </CardTitle>
        <CardDescription>
          Committees hidden from all Independent Expenditure rollups and lists across the platform. Excluded committees do not appear on Top Spenders, candidate IE summaries, or election dialogs for any user.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
        ) : exclusions.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">No committees are currently excluded.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Committee FEC ID</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead>Excluded</TableHead>
                <TableHead className="w-[120px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {exclusions.map((e) => (
                <TableRow key={e.fec_committee_id}>
                  <TableCell className="font-mono text-xs">
                    <Link to={`/committee/${e.fec_committee_id}`} className="text-primary hover:underline">
                      {e.fec_committee_id}
                    </Link>
                  </TableCell>
                  <TableCell className="text-sm">{e.reason}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {new Date(e.excluded_at).toLocaleString()}
                  </TableCell>
                  <TableCell>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button size="sm" variant="outline" disabled={restoringId === e.fec_committee_id}>
                          {restoringId === e.fec_committee_id ? (
                            <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                          ) : (
                            <RotateCcw className="w-3 h-3 mr-1" />
                          )}
                          Restore
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Restore committee?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This will re-include {e.fec_committee_id} in all IE rollups and public lists immediately.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={() => handleRestore(e.fec_committee_id)}>
                            Restore
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
