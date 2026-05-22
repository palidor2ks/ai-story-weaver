import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';
import { Loader2, Trash2, RefreshCw, Plus } from 'lucide-react';

interface Vendor {
  id: string;
  name: string;
  category: string | null;
  notes: string | null;
  is_active: boolean;
}

export function VendorRefundsPanel() {
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [category, setCategory] = useState('media');
  const [notes, setNotes] = useState('');
  const [retagging, setRetagging] = useState(false);

  const { data: vendors = [], isLoading } = useQuery({
    queryKey: ['vendor-refund-orgs'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('vendor_refund_organizations')
        .select('*')
        .order('name');
      if (error) throw error;
      return (data as Vendor[]) || [];
    },
  });

  const addMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('vendor_refund_organizations')
        .insert({ name: name.trim().toUpperCase(), category, notes: notes || null });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Vendor added');
      setName(''); setNotes('');
      qc.invalidateQueries({ queryKey: ['vendor-refund-orgs'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase
        .from('vendor_refund_organizations')
        .update({ is_active })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['vendor-refund-orgs'] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('vendor_refund_organizations').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Vendor removed');
      qc.invalidateQueries({ queryKey: ['vendor-refund-orgs'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const handleRetag = async () => {
    setRetagging(true);
    try {
      const { data, error } = await (supabase as any).rpc('retag_vendor_refunds');
      if (error) throw error;
      toast.success(`Re-tagged ${data ?? 0} donor rows`);
      qc.invalidateQueries({ queryKey: ['committee-donors'] });
      qc.invalidateQueries({ queryKey: ['donors-paginated'] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed');
    } finally {
      setRetagging(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
        <p className="text-sm font-medium">Add vendor</p>
        <p className="text-xs text-muted-foreground">
          Media buyers, ad agencies, and consulting firms whose refunds/rebates were being miscounted as donations.
          Matching is case-insensitive and uses substring match on donor name.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="space-y-1 md:col-span-2">
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="WATERFRONT STRATEGIES" />
          </div>
          <div className="space-y-1">
            <Label>Category</Label>
            <Input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="media" />
          </div>
          <div className="space-y-1">
            <Label>Notes</Label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" />
          </div>
        </div>
        <div className="flex justify-between">
          <Button onClick={() => addMutation.mutate()} disabled={!name.trim() || addMutation.isPending} size="sm">
            <Plus className="h-4 w-4 mr-1" /> Add
          </Button>
          <Button onClick={handleRetag} disabled={retagging} variant="outline" size="sm">
            {retagging ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-1" />}
            Re-tag donors
          </Button>
        </div>
      </div>

      {isLoading ? (
        <Loader2 className="h-5 w-5 animate-spin" />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Notes</TableHead>
              <TableHead>Active</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {vendors.map((v) => (
              <TableRow key={v.id}>
                <TableCell className="font-medium">{v.name}</TableCell>
                <TableCell className="text-muted-foreground">{v.category}</TableCell>
                <TableCell className="text-muted-foreground text-xs">{v.notes}</TableCell>
                <TableCell>
                  <Switch
                    checked={v.is_active}
                    onCheckedChange={(checked) => toggleMutation.mutate({ id: v.id, is_active: checked })}
                  />
                </TableCell>
                <TableCell>
                  <Button variant="ghost" size="sm" onClick={() => deleteMutation.mutate(v.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {vendors.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground py-6">
                  No vendors configured.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
