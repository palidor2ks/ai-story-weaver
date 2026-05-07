import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Loader2, ExternalLink, Trash2, Pencil } from 'lucide-react';
import { useDeleteCandidateOverride } from '@/hooks/useCandidateOverrides';
import { toast } from 'sonner';

interface CivicOfficial {
  id: string;
  candidate_id: string;
  name: string | null;
  party: string | null;
  office: string | null;
  state: string | null;
  district: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  overall_score: number | null;
}

const useCivicOfficials = () => {
  return useQuery({
    queryKey: ['civic-officials-admin'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('candidate_overrides')
        .select('*')
        .like('candidate_id', 'openstates_%')
        .order('name', { ascending: true });

      if (error) throw error;
      return data as CivicOfficial[];
    },
  });
};

const useAnswerCounts = (candidateIds: string[]) => {
  return useQuery({
    queryKey: ['civic-officials-answer-counts', candidateIds],
    queryFn: async () => {
      if (candidateIds.length === 0) return {};
      const { data, error } = await supabase
        .from('candidate_answers')
        .select('candidate_id')
        .in('candidate_id', candidateIds);

      if (error) throw error;
      const counts: Record<string, number> = {};
      (data || []).forEach((row: { candidate_id: string }) => {
        counts[row.candidate_id] = (counts[row.candidate_id] || 0) + 1;
      });
      return counts;
    },
    enabled: candidateIds.length > 0,
  });
};

function getPartyColor(party: string | null) {
  switch (party) {
    case 'Democrat': return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
    case 'Republican': return 'bg-red-500/20 text-red-400 border-red-500/30';
    case 'Independent': return 'bg-purple-500/20 text-purple-400 border-purple-500/30';
    default: return 'bg-muted text-muted-foreground';
  }
}

export function CivicOfficialsPanel() {
  const { data: officials, isLoading } = useCivicOfficials();
  const candidateIds = (officials || []).map(o => o.candidate_id);
  const { data: answerCounts = {} } = useAnswerCounts(candidateIds);
  const deleteOverride = useDeleteCandidateOverride();

  const handleDelete = async (candidateId: string) => {
    try {
      await deleteOverride.mutateAsync(candidateId);
      toast.success('Civic official removed');
    } catch {
      toast.error('Failed to delete');
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Civic Officials (from Open States API)</CardTitle>
        <CardDescription>
          State and local officials added when users look up their address. These are managed the same way as federal candidates — click to edit profile, view answers, or trigger research.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : officials && officials.length > 0 ? (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Office</TableHead>
                  <TableHead>Party</TableHead>
                  <TableHead>State</TableHead>
                  <TableHead>District</TableHead>
                  <TableHead>Answers</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {officials.map((official) => (
                  <TableRow key={official.id}>
                    <TableCell className="font-medium">
                      <Link to={`/candidate/${official.candidate_id}`} className="hover:underline flex items-center gap-1">
                        {official.name || official.candidate_id}
                        <ExternalLink className="h-3 w-3" />
                      </Link>
                    </TableCell>
                    <TableCell>{official.office || '-'}</TableCell>
                    <TableCell>
                      {official.party ? (
                        <Badge className={getPartyColor(official.party)}>{official.party}</Badge>
                      ) : '-'}
                    </TableCell>
                    <TableCell>{official.state || '-'}</TableCell>
                    <TableCell>{official.district || '-'}</TableCell>
                    <TableCell>
                      <Badge variant={answerCounts[official.candidate_id] > 0 ? 'default' : 'secondary'}>
                        {answerCounts[official.candidate_id] || 0}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={official.is_active ? 'default' : 'secondary'}>
                        {official.is_active ? 'Active' : 'Inactive'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Link to={`/candidate/${official.candidate_id}`}>
                          <Button variant="ghost" size="icon">
                            <Pencil className="h-4 w-4" />
                          </Button>
                        </Link>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="icon" className="text-destructive">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete {official.name || 'this official'}?</AlertDialogTitle>
                              <AlertDialogDescription>
                                This will remove the civic official and their override data. Their answers will remain in the database.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction onClick={() => handleDelete(official.candidate_id)} className="bg-destructive text-destructive-foreground">
                                Delete
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            No civic officials yet. They are automatically added when users look up their address.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
