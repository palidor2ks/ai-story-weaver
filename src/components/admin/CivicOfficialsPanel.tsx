import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Loader2, ExternalLink, Trash2, Pencil, Brain, Sparkles, ImagePlus } from 'lucide-react';
import { useDeleteCandidateOverride } from '@/hooks/useCandidateOverrides';
import { OfficialAvatar } from '@/components/OfficialAvatar';
import { toast } from 'sonner';

interface CivicOfficial {
  id: string;
  candidate_id: string;
  name: string | null;
  party: string | null;
  office: string | null;
  state: string | null;
  district: string | null;
  image_url: string | null;
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
        .or('candidate_id.like.openstates_%,candidate_id.like.nj_%,candidate_id.like.ny_%,candidate_id.like.ca_%,candidate_id.like.tx_%,candidate_id.like.fl_%,candidate_id.like.pa_%')
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
  const queryClient = useQueryClient();
  const [populatingIds, setPopulatingIds] = useState<Set<string>>(new Set());
  const [populatingAll, setPopulatingAll] = useState(false);
  const [editingImage, setEditingImage] = useState<CivicOfficial | null>(null);
  const [imageUrl, setImageUrl] = useState('');
  const [savingImage, setSavingImage] = useState(false);
  const [enrichingPhotos, setEnrichingPhotos] = useState(false);

  const handleEnrichPhotos = async () => {
    setEnrichingPhotos(true);
    try {
      const { data, error } = await supabase.functions.invoke('enrich-official-photos', {
        body: { limit: 25 },
      });
      if (error) throw error;
      const updated = data?.updated ?? 0;
      const attempted = data?.attempted ?? 0;
      toast.success(`Photo enrichment: ${updated}/${attempted} updated`);
      queryClient.invalidateQueries({ queryKey: ['civic-officials-admin'] });
    } catch (err) {
      console.error('Error enriching photos:', err);
      toast.error('Failed to enrich photos');
    } finally {
      setEnrichingPhotos(false);
    }
  };

  const handleDelete = async (candidateId: string) => {
    try {
      await deleteOverride.mutateAsync(candidateId);
      toast.success('Civic official removed');
    } catch {
      toast.error('Failed to delete');
    }
  };

  const handlePopulateAnswers = async (candidateId: string, name: string) => {
    setPopulatingIds(prev => new Set(prev).add(candidateId));
    try {
      const { data, error } = await supabase.functions.invoke('populate-civic-answers', {
        body: { candidateId },
      });

      if (error) throw error;
      toast.success(`AI research started for ${name}. Check edge function logs for progress.`);
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['civic-officials-answer-counts'] });
      }, 30000);
    } catch (err) {
      console.error('Error populating answers:', err);
      toast.error(`Failed to start research for ${name}`);
    } finally {
      setPopulatingIds(prev => {
        const next = new Set(prev);
        next.delete(candidateId);
        return next;
      });
    }
  };

  const handlePopulateAll = async () => {
    setPopulatingAll(true);
    try {
      const { data, error } = await supabase.functions.invoke('populate-civic-answers', {
        body: { batchSize: 5 },
      });

      if (error) throw error;
      toast.success(`Batch research started for civic officials. Check logs for progress.`);
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['civic-officials-answer-counts'] });
      }, 60000);
    } catch (err) {
      console.error('Error batch populating:', err);
      toast.error('Failed to start batch research');
    } finally {
      setPopulatingAll(false);
    }
  };

  const handleOpenImageEdit = (official: CivicOfficial) => {
    setEditingImage(official);
    setImageUrl(official.image_url || '');
  };

  const handleSaveImage = async () => {
    if (!editingImage) return;
    setSavingImage(true);
    try {
      const { error } = await supabase
        .from('candidate_overrides')
        .update({ image_url: imageUrl.trim() || null })
        .eq('candidate_id', editingImage.candidate_id);

      if (error) throw error;
      toast.success(`Image updated for ${editingImage.name}`);
      queryClient.invalidateQueries({ queryKey: ['civic-officials-admin'] });
      setEditingImage(null);
    } catch (err) {
      console.error('Error saving image:', err);
      toast.error('Failed to save image URL');
    } finally {
      setSavingImage(false);
    }
  };

  const officialsWithoutAnswers = (officials || []).filter(o => !answerCounts[o.candidate_id]);

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Civic Officials (State & Local)</CardTitle>
              <CardDescription>
                State and local officials added when users look up their address. Use AI research to populate their positions on quiz questions.
              </CardDescription>
            </div>
            {officialsWithoutAnswers.length > 0 && (
              <Button
                onClick={handlePopulateAll}
                disabled={populatingAll}
                variant="outline"
                size="sm"
                className="gap-2"
              >
                {populatingAll ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                Research All ({officialsWithoutAnswers.length} pending)
              </Button>
            )}
          </div>
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
                    <TableHead>Photo</TableHead>
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
                  {officials.map((official) => {
                    const count = answerCounts[official.candidate_id] || 0;
                    const isPopulating = populatingIds.has(official.candidate_id);
                    return (
                      <TableRow key={official.id}>
                        <TableCell>
                          <div className="cursor-pointer" onClick={() => handleOpenImageEdit(official)} title="Click to edit image">
                            <OfficialAvatar
                              imageUrl={official.image_url}
                              name={official.name || '?'}
                              party={official.party || 'Other'}
                              size="sm"
                            />
                          </div>
                        </TableCell>
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
                          <Badge variant={count > 0 ? 'default' : 'secondary'}>
                            {count}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant={official.is_active ? 'default' : 'secondary'}>
                            {official.is_active ? 'Active' : 'Inactive'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              title="Edit Image"
                              onClick={() => handleOpenImageEdit(official)}
                            >
                              <ImagePlus className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              title="AI Research"
                              disabled={isPopulating}
                              onClick={() => handlePopulateAnswers(official.candidate_id, official.name || 'Unknown')}
                            >
                              {isPopulating ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Brain className="h-4 w-4" />
                              )}
                            </Button>
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
                    );
                  })}
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

      {/* Image Edit Dialog */}
      <Dialog open={!!editingImage} onOpenChange={(open) => !open && setEditingImage(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Photo — {editingImage?.name}</DialogTitle>
            <DialogDescription>
              Paste a direct URL to an official headshot photo for this politician.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="flex justify-center">
              <OfficialAvatar
                imageUrl={imageUrl || null}
                name={editingImage?.name || '?'}
                party={editingImage?.party || 'Other'}
                size="lg"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="image-url">Image URL</Label>
              <Input
                id="image-url"
                placeholder="https://example.com/photo.jpg"
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
              />
            </div>
            {imageUrl && (
              <p className="text-xs text-muted-foreground">
                Preview updates live above. Make sure the image loads correctly before saving.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingImage(null)}>Cancel</Button>
            <Button onClick={handleSaveImage} disabled={savingImage}>
              {savingImage ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
