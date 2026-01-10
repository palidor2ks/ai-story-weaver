import { useState } from 'react';
import { stripHtml } from '@/lib/utils';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AlertTriangle, CheckCircle, RefreshCw, Edit, X, Loader2, Tags, FileStack, FileWarning, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';

// Only use the 10 canonical topics
const ALL_TOPICS = [
  'Economy', 'Healthcare', 'Immigration', 'Environment', 'Defense',
  'Education', 'Civil Rights', 'Government', 'Social Programs', 'Technology'
];

interface FlaggedBill {
  id: string;
  name: string;
  topic: string;
  additional_topics: string[] | null;
  topic_flag: string;
  ai_detected_topics: string[] | null;
  omnibus_type: string | null;
  summary: string | null;
  last_action_date: string | null;
  reviewed_at: string | null;
}

export default function TopicReviewPanel() {
  const queryClient = useQueryClient();
  const [selectedBill, setSelectedBill] = useState<FlaggedBill | null>(null);
  const [editedPrimaryTopic, setEditedPrimaryTopic] = useState('');
  const [editedAdditionalTopics, setEditedAdditionalTopics] = useState<string[]>([]);
  const [filterType, setFilterType] = useState<string>('all');
  const [isScanning, setIsScanning] = useState(false);
  const [scanningBillId, setScanningBillId] = useState<string | null>(null);
  const [approvingBillId, setApprovingBillId] = useState<string | null>(null);

  // Fetch flagged bills from bills table (already deduplicated)
  const { data: flaggedBills, isLoading, refetch } = useQuery({
    queryKey: ['flagged-bills', filterType],
    queryFn: async () => {
      let query = supabase
        .from('bills')
        .select('id, name, topic, additional_topics, topic_flag, ai_detected_topics, omnibus_type, summary, last_action_date, reviewed_at')
        .not('topic_flag', 'is', null)
        .is('reviewed_at', null)
        .order('last_action_date', { ascending: false })
        .limit(200);
      
      if (filterType !== 'all') {
        query = query.eq('topic_flag', filterType);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      
      return (data || []) as FlaggedBill[];
    }
  });

  // Fetch stats
  const { data: stats } = useQuery({
    queryKey: ['topic-review-stats'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bills')
        .select('topic_flag')
        .not('topic_flag', 'is', null)
        .is('reviewed_at', null);
      
      if (error) throw error;
      
      const counts = {
        total: data?.length || 0,
        multi_topic: data?.filter(d => d.topic_flag === 'multi_topic_detected').length || 0,
        mismatch: data?.filter(d => d.topic_flag === 'possible_mismatch').length || 0,
        omnibus: data?.filter(d => d.topic_flag === 'omnibus_detected').length || 0,
        omnibus_major: data?.filter(d => d.topic_flag === 'omnibus_major').length || 0,
      };
      return counts;
    }
  });

  // Update bill mutation - updates the bill record directly
  const updateBill = useMutation({
    mutationFn: async ({ 
      billId, 
      topic, 
      additionalTopics, 
      action 
    }: { 
      billId: string;
      topic?: string; 
      additionalTopics?: string[]; 
      action: 'save' | 'approve' | 'dismiss' 
    }) => {
      const updates: Record<string, unknown> = {
        reviewed_at: new Date().toISOString(),
        topic_flag: 'admin_reviewed',
      };
      
      if (topic) updates.topic = topic;
      if (additionalTopics !== undefined) updates.additional_topics = additionalTopics;
      
      // Update the bill record directly
      const { error } = await supabase
        .from('bills')
        .update(updates)
        .eq('id', billId);
        
      if (error) throw error;
      return { billId };
    },
    onMutate: async ({ billId }) => {
      await queryClient.cancelQueries({ queryKey: ['flagged-bills', filterType] });
      const previousBills = queryClient.getQueryData<FlaggedBill[]>(['flagged-bills', filterType]);
      queryClient.setQueryData<FlaggedBill[]>(['flagged-bills', filterType], (old) => 
        old?.filter(b => b.id !== billId) || []
      );
      return { previousBills };
    },
    onError: (error, _variables, context) => {
      if (context?.previousBills) {
        queryClient.setQueryData(['flagged-bills', filterType], context.previousBills);
      }
      toast.error(`Update failed: ${error.message}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['topic-review-stats'] });
      setSelectedBill(null);
      toast.success('Bill topics updated');
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['flagged-bills'] });
    }
  });

  // Trigger batch scan
  const handleScanBills = async () => {
    setIsScanning(true);
    try {
      const response = await supabase.functions.invoke('scan-bill-topics', {
        body: { batchSize: 100 }
      });
      
      if (response.error) throw response.error;
      
      const result = response.data;
      toast.success(`Scanned ${result.scanned} bills, flagged ${result.flagged}`);
      refetch();
    } catch (error) {
      toast.error(`Scan failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsScanning(false);
    }
  };

  // Rescan single bill with AI
  const rescanBill = useMutation({
    mutationFn: async (billId: string) => {
      const response = await supabase.functions.invoke('scan-bill-topics', {
        body: { bill_id: billId, forceRescan: true }
      });
      if (response.error) throw response.error;
      return response.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['flagged-bills'] });
      queryClient.invalidateQueries({ queryKey: ['topic-review-stats'] });
      const topicCount = data.bill?.ai_detected_topics?.length || 0;
      toast.success(`AI detected ${topicCount} topic${topicCount !== 1 ? 's' : ''}`);
    },
    onError: (error) => {
      toast.error(`Rescan failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    },
    onSettled: () => {
      setScanningBillId(null);
    }
  });

  // Quick approve - apply AI detected topics and mark as reviewed
  const quickApprove = useMutation({
    mutationFn: async (bill: FlaggedBill) => {
      if (!bill.ai_detected_topics || bill.ai_detected_topics.length === 0) {
        throw new Error('No AI-detected topics to approve');
      }
      
      const [primaryTopic, ...additionalTopics] = bill.ai_detected_topics;
      
      // Update the bill record directly
      const { error } = await supabase
        .from('bills')
        .update({
          topic: primaryTopic,
          additional_topics: additionalTopics,
          topic_flag: 'admin_reviewed',
          reviewed_at: new Date().toISOString(),
        })
        .eq('id', bill.id);
        
      if (error) throw error;
      return { billId: bill.id };
    },
    onMutate: async (bill) => {
      await queryClient.cancelQueries({ queryKey: ['flagged-bills', filterType] });
      const previousBills = queryClient.getQueryData<FlaggedBill[]>(['flagged-bills', filterType]);
      queryClient.setQueryData<FlaggedBill[]>(['flagged-bills', filterType], (old) => 
        old?.filter(b => b.id !== bill.id) || []
      );
      return { previousBills };
    },
    onError: (error, _bill, context) => {
      if (context?.previousBills) {
        queryClient.setQueryData(['flagged-bills', filterType], context.previousBills);
      }
      toast.error(`Approve failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['topic-review-stats'] });
      toast.success('AI topics applied');
    },
    onSettled: () => {
      setApprovingBillId(null);
      queryClient.invalidateQueries({ queryKey: ['flagged-bills'] });
    }
  });

  // Open edit dialog
  const handleEditBill = (bill: FlaggedBill) => {
    setSelectedBill(bill);
    setEditedPrimaryTopic(bill.topic);
    setEditedAdditionalTopics(bill.additional_topics || []);
  };

  // Toggle additional topic
  const toggleAdditionalTopic = (topic: string) => {
    if (topic === editedPrimaryTopic) return;
    setEditedAdditionalTopics(prev => 
      prev.includes(topic) 
        ? prev.filter(t => t !== topic)
        : [...prev, topic]
    );
  };

  // Handle primary topic change
  const handlePrimaryTopicChange = (topic: string) => {
    setEditedPrimaryTopic(topic);
    setEditedAdditionalTopics(prev => prev.filter(t => t !== topic));
  };

  // Save changes
  const handleSave = () => {
    if (!selectedBill) return;
    updateBill.mutate({
      billId: selectedBill.id,
      topic: editedPrimaryTopic,
      additionalTopics: editedAdditionalTopics,
      action: 'save'
    });
  };

  // Dismiss without changes
  const handleDismiss = () => {
    if (!selectedBill) return;
    updateBill.mutate({
      billId: selectedBill.id,
      action: 'dismiss'
    });
  };

  // Get flag badge variant
  const getFlagBadge = (flag: string) => {
    switch (flag) {
      case 'possible_mismatch':
        return <Badge variant="destructive" className="gap-1"><AlertTriangle className="h-3 w-3" />Mismatch</Badge>;
      case 'multi_topic_detected':
        return <Badge variant="secondary" className="gap-1"><Tags className="h-3 w-3" />Multi-Topic</Badge>;
      case 'omnibus_detected':
        return <Badge className="gap-1 bg-orange-500 hover:bg-orange-600"><FileStack className="h-3 w-3" />Omnibus</Badge>;
      case 'omnibus_major':
        return <Badge variant="destructive" className="gap-1"><FileWarning className="h-3 w-3" />Major Omnibus</Badge>;
      default:
        return <Badge variant="outline">{flag}</Badge>;
    }
  };

  // Get omnibus type badge
  const getOmnibusTypeBadge = (omnibusType: string | null) => {
    if (!omnibusType) return null;
    const labels: Record<string, string> = {
      'appropriations': 'Appropriations',
      'ndaa': 'NDAA',
      'infrastructure': 'Infrastructure',
      'reconciliation': 'Reconciliation',
      'other': 'Package'
    };
    return <Badge variant="outline" className="text-xs">{labels[omnibusType] || omnibusType}</Badge>;
  };

  return (
    <div className="space-y-6">
      {/* Header with stats and actions */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap gap-3">
          <Card className="px-4 py-2">
            <div className="text-sm text-muted-foreground">Total Flagged</div>
            <div className="text-2xl font-bold">{stats?.total || 0}</div>
          </Card>
          <Card className="px-4 py-2">
            <div className="text-sm text-muted-foreground">Mismatches</div>
            <div className="text-2xl font-bold text-destructive">{stats?.mismatch || 0}</div>
          </Card>
          <Card className="px-4 py-2">
            <div className="text-sm text-muted-foreground">Multi-Topic</div>
            <div className="text-2xl font-bold text-blue-600">{stats?.multi_topic || 0}</div>
          </Card>
          <Card className="px-4 py-2">
            <div className="text-sm text-muted-foreground">Omnibus</div>
            <div className="text-2xl font-bold text-orange-600">{(stats?.omnibus || 0) + (stats?.omnibus_major || 0)}</div>
          </Card>
        </div>
        
        <Button 
          onClick={handleScanBills} 
          disabled={isScanning}
          variant="outline"
        >
          {isScanning ? (
            <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Scanning...</>
          ) : (
            <><RefreshCw className="h-4 w-4 mr-2" />Scan Bills for Topics</>
          )}
        </Button>
      </div>

      {/* Filter tabs */}
      <Tabs value={filterType} onValueChange={setFilterType}>
        <TabsList>
          <TabsTrigger value="all">All ({stats?.total || 0})</TabsTrigger>
          <TabsTrigger value="possible_mismatch">Mismatches ({stats?.mismatch || 0})</TabsTrigger>
          <TabsTrigger value="multi_topic_detected">Multi-Topic ({stats?.multi_topic || 0})</TabsTrigger>
          <TabsTrigger value="omnibus_detected">Omnibus ({stats?.omnibus || 0})</TabsTrigger>
          <TabsTrigger value="omnibus_major">Major ({stats?.omnibus_major || 0})</TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Bills table */}
      <Card>
        <CardHeader>
          <CardTitle>Flagged Bills for Review</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : flaggedBills?.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <CheckCircle className="h-12 w-12 mx-auto mb-2 text-green-500" />
              <p>No flagged bills to review</p>
              <p className="text-sm mt-1">Click "Scan Bills for Topics" to analyze existing bills</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Bill</TableHead>
                    <TableHead>Assigned Topic</TableHead>
                    <TableHead>AI Detected</TableHead>
                    <TableHead>Flag</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {flaggedBills?.map(bill => (
                    <TableRow key={bill.id}>
                      <TableCell>
                        <div className="max-w-xs">
                          <div className="font-medium truncate">{bill.name}</div>
                          <div className="text-xs text-muted-foreground flex items-center gap-2">
                            {bill.id}
                            {getOmnibusTypeBadge(bill.omnibus_type)}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{bill.topic}</Badge>
                        {bill.additional_topics && bill.additional_topics.length > 0 && (
                          <span className="text-xs text-muted-foreground ml-1">
                            +{bill.additional_topics.length}
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        {bill.ai_detected_topics && bill.ai_detected_topics.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {bill.ai_detected_topics.slice(0, 3).map(t => (
                              <Badge key={t} variant="secondary" className="text-xs">{t}</Badge>
                            ))}
                            {bill.ai_detected_topics.length > 3 && (
                              <span className="text-xs text-muted-foreground">
                                +{bill.ai_detected_topics.length - 3}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-muted-foreground text-xs">Not scanned</span>
                        )}
                      </TableCell>
                      <TableCell>{getFlagBadge(bill.topic_flag)}</TableCell>
                      <TableCell className="text-sm">
                        {bill.last_action_date ? format(new Date(bill.last_action_date), 'MMM d, yyyy') : '-'}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          {/* AI Rescan button */}
                          <Button 
                            size="sm" 
                            variant="ghost"
                            disabled={scanningBillId === bill.id}
                            onClick={() => {
                              setScanningBillId(bill.id);
                              rescanBill.mutate(bill.id);
                            }}
                            title="AI Rescan"
                          >
                            {scanningBillId === bill.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Sparkles className="h-4 w-4" />
                            )}
                          </Button>
                          
                          {/* Quick Approve button (only if AI topics exist) */}
                          {bill.ai_detected_topics && bill.ai_detected_topics.length > 0 && (
                            <Button 
                              size="sm" 
                              variant="ghost"
                              disabled={approvingBillId === bill.id}
                              onClick={() => {
                                setApprovingBillId(bill.id);
                                quickApprove.mutate(bill);
                              }}
                              title="Approve AI Topics"
                              className="text-green-600 hover:text-green-700 hover:bg-green-50"
                            >
                              {approvingBillId === bill.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <CheckCircle className="h-4 w-4" />
                              )}
                            </Button>
                          )}
                          
                          {/* Manual Edit button */}
                          <Button 
                            size="sm" 
                            variant="ghost"
                            onClick={() => handleEditBill(bill)}
                            title="Edit Manually"
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={!!selectedBill} onOpenChange={() => setSelectedBill(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Bill Topics</DialogTitle>
          </DialogHeader>
          
          {selectedBill && (
            <div className="space-y-6">
              {/* Bill info */}
              <div className="bg-muted p-4 rounded-lg">
                <div className="font-medium">{selectedBill.name}</div>
                <div className="text-sm text-muted-foreground mt-1 flex items-center gap-2">
                  {selectedBill.id}
                  {getOmnibusTypeBadge(selectedBill.omnibus_type)}
                </div>
                {selectedBill.summary && (
                  <div className="text-sm mt-3 max-h-32 overflow-y-auto border-t pt-2">
                    {stripHtml(selectedBill.summary).substring(0, 500)}
                    {selectedBill.summary.length > 500 && '...'}
                  </div>
                )}
              </div>

              {/* Current flag */}
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Current Flag:</span>
                {getFlagBadge(selectedBill.topic_flag)}
              </div>

              {/* AI Detected Topics (reference) */}
              {selectedBill.ai_detected_topics && selectedBill.ai_detected_topics.length > 0 && (
                <div>
                  <Label className="text-muted-foreground">AI Detected Topics (Reference)</Label>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {selectedBill.ai_detected_topics.map(t => (
                      <Badge key={t} variant="secondary">{t}</Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* Primary topic selector */}
              <div>
                <Label>Primary Topic</Label>
                <Select value={editedPrimaryTopic} onValueChange={handlePrimaryTopicChange}>
                  <SelectTrigger className="mt-2">
                    <SelectValue placeholder="Select primary topic" />
                  </SelectTrigger>
                  <SelectContent>
                    {ALL_TOPICS.map(t => (
                      <SelectItem key={t} value={t}>{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Additional topics multi-select */}
              <div>
                <Label>Additional Topics (click to toggle)</Label>
                <div className="flex flex-wrap gap-2 mt-2">
                  {ALL_TOPICS.filter(t => t !== editedPrimaryTopic).map(t => (
                    <Badge 
                      key={t}
                      variant={editedAdditionalTopics.includes(t) ? "default" : "outline"}
                      className="cursor-pointer hover:opacity-80 transition-opacity"
                      onClick={() => toggleAdditionalTopic(t)}
                    >
                      {editedAdditionalTopics.includes(t) && <CheckCircle className="h-3 w-3 mr-1" />}
                      {t}
                    </Badge>
                  ))}
                </div>
                {editedAdditionalTopics.length > 0 && (
                  <p className="text-xs text-muted-foreground mt-2">
                    Selected: {editedAdditionalTopics.length} additional topic(s)
                  </p>
                )}
              </div>
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button 
              variant="outline" 
              onClick={handleDismiss}
              disabled={updateBill.isPending}
            >
              <X className="h-4 w-4 mr-2" />
              Dismiss (No Change)
            </Button>
            <Button 
              onClick={handleSave}
              disabled={updateBill.isPending}
            >
              {updateBill.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <CheckCircle className="h-4 w-4 mr-2" />
              )}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
