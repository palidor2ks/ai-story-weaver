import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, Sparkles, Plus, Copy, ExternalLink, Trash2, Share2, Send } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { useTopics } from '@/hooks/useCandidates';
import {
  usePolls, useCreatePoll, useUpdatePollStatus, useDeletePoll,
  useGeneratePollQuestions, useRepostPoll, type PollDraftQuestion, type SharePlatform,
} from '@/hooks/usePolls';

const PLATFORMS: { id: SharePlatform; label: string; note?: string }[] = [
  { id: 'twitter', label: 'X (Twitter)' },
  { id: 'facebook', label: 'Facebook Page', note: 'Connect required' },
  { id: 'linkedin', label: 'LinkedIn', note: 'Connect required' },
  { id: 'instagram', label: 'Instagram', note: 'Connect required' },
];

const TYPE_LABEL: Record<string, string> = {
  mc: 'Multiple choice',
  scored: 'Scored question',
  mini_quiz: 'Mini quiz (3+)',
};

export const PollsPanel = () => {
  const { data: polls = [], isLoading } = usePolls();
  const { data: topics = [] } = useTopics();
  const createPoll = useCreatePoll();
  const updateStatus = useUpdatePollStatus();
  const deletePoll = useDeletePoll();
  const generate = useGeneratePollQuestions();

  const [open, setOpen] = useState(false);
  const [type, setType] = useState<'mc' | 'scored' | 'mini_quiz'>('mc');
  const [topicId, setTopicId] = useState<string>('');
  const [prompt, setPrompt] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [questions, setQuestions] = useState<PollDraftQuestion[]>([]);

  const reset = () => {
    setType('mc'); setTopicId(''); setPrompt(''); setTitle(''); setDescription(''); setQuestions([]);
  };

  const onGenerate = async () => {
    if (!prompt.trim()) return toast.error('Enter a prompt first');
    const topicName = topics.find(t => t.id === topicId)?.name;
    const draft = await generate.mutateAsync({ prompt, type, topic: topicName });
    setTitle(draft.title);
    setDescription(draft.description);
    setQuestions(draft.questions);
  };

  const onSave = async (status: 'draft' | 'published') => {
    if (!title.trim()) return toast.error('Title required');
    if (!questions.length) return toast.error('Generate or add questions first');
    await createPoll.mutateAsync({
      title, description, type, topic_id: topicId || null, questions, status,
    });
    setOpen(false); reset();
  };

  const copyLink = (slug: string) => {
    const url = `${window.location.origin}/p/${slug}`;
    navigator.clipboard.writeText(url);
    toast.success('Link copied');
  };

  const updateQ = (i: number, patch: Partial<PollDraftQuestion>) => {
    setQuestions(qs => qs.map((q, idx) => idx === i ? { ...q, ...patch } : q));
  };
  const updateOpt = (qi: number, oi: number, patch: Partial<PollDraftQuestion['options'][0]>) => {
    setQuestions(qs => qs.map((q, idx) => idx === qi
      ? { ...q, options: q.options.map((o, j) => j === oi ? { ...o, ...patch } : o) }
      : q));
  };
  const addQuestion = () => {
    const blank: PollDraftQuestion = type === 'mc'
      ? { text: '', options: [{ text: '', value: 0 }, { text: '', value: 0 }] }
      : { text: '', options: [-10, -5, 0, 5, 10].map(v => ({ text: '', value: v })) };
    setQuestions(qs => [...qs, blank]);
  };
  const removeQ = (i: number) => setQuestions(qs => qs.filter((_, idx) => idx !== i));

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle>Polls</CardTitle>
          <CardDescription>
            Generate shareable polls. Visitors answer anonymously, then are prompted to sign up.
            Scored poll questions appear in the user Quiz Library but are excluded from the politician quiz.
          </CardDescription>
        </div>
        <Button onClick={() => { reset(); setOpen(true); }}><Plus className="w-4 h-4 mr-2" />New Poll</Button>
      </CardHeader>
      <CardContent>
        {isLoading ? <Loader2 className="animate-spin" /> : polls.length === 0 ? (
          <p className="text-sm text-muted-foreground">No polls yet. Click "New Poll" to draft one.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {polls.map(p => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">{p.title}</TableCell>
                  <TableCell><Badge variant="outline">{TYPE_LABEL[p.type]}</Badge></TableCell>
                  <TableCell>
                    <Badge variant={p.status === 'published' ? 'default' : p.status === 'closed' ? 'secondary' : 'outline'}>
                      {p.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {new Date(p.created_at).toLocaleDateString()}
                  </TableCell>
                  <TableCell className="text-right space-x-1">
                    {p.status === 'draft' && (
                      <Button size="sm" variant="default" onClick={() => updateStatus.mutate({ id: p.id, status: 'published' })}>
                        Publish
                      </Button>
                    )}
                    {p.status === 'published' && (
                      <>
                        <Button size="sm" variant="ghost" onClick={() => copyLink(p.slug)}><Copy className="w-4 h-4" /></Button>
                        <Button size="sm" variant="ghost" asChild>
                          <a href={`/p/${p.slug}`} target="_blank" rel="noreferrer"><ExternalLink className="w-4 h-4" /></a>
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => updateStatus.mutate({ id: p.id, status: 'closed' })}>
                          Close
                        </Button>
                      </>
                    )}
                    <Button size="sm" variant="ghost" onClick={() => {
                      if (confirm('Delete this poll and all its responses?')) deletePoll.mutate(p.id);
                    }}><Trash2 className="w-4 h-4 text-destructive" /></Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>New Poll</DialogTitle></DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Type</Label>
                <Select value={type} onValueChange={(v: any) => { setType(v); setQuestions([]); }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="mc">Multiple choice (opinion)</SelectItem>
                    <SelectItem value="scored">Scored question (-10..+10)</SelectItem>
                    <SelectItem value="mini_quiz">Mini quiz (3 scored questions)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Topic (optional)</Label>
                <Select value={topicId} onValueChange={setTopicId}>
                  <SelectTrigger><SelectValue placeholder="Any topic" /></SelectTrigger>
                  <SelectContent>
                    {topics.map(t => <SelectItem key={t.id} value={t.id}>{t.icon} {t.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label>AI prompt</Label>
              <Textarea
                placeholder="e.g. Should the federal minimum wage be raised to $20?"
                value={prompt}
                onChange={e => setPrompt(e.target.value)}
                rows={2}
              />
              <Button className="mt-2" onClick={onGenerate} disabled={generate.isPending}>
                {generate.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />}
                Draft with AI
              </Button>
            </div>

            <div>
              <Label>Title</Label>
              <Input value={title} onChange={e => setTitle(e.target.value)} />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} />
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Questions</Label>
                <Button variant="outline" size="sm" onClick={addQuestion}><Plus className="w-3 h-3 mr-1" />Add</Button>
              </div>
              {questions.map((q, qi) => (
                <Card key={qi} className="p-3 space-y-2">
                  <div className="flex gap-2">
                    <Input value={q.text} onChange={e => updateQ(qi, { text: e.target.value })} placeholder="Question text" />
                    <Button variant="ghost" size="sm" onClick={() => removeQ(qi)}><Trash2 className="w-4 h-4" /></Button>
                  </div>
                  {q.options.map((o, oi) => (
                    <div key={oi} className="flex gap-2 items-center">
                      <Input value={o.text} onChange={e => updateOpt(qi, oi, { text: e.target.value })} placeholder="Option text" />
                      {type !== 'mc' && (
                        <Badge variant="outline" className="w-12 justify-center">{o.value > 0 ? `+${o.value}` : o.value}</Badge>
                      )}
                    </div>
                  ))}
                </Card>
              ))}
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button variant="secondary" onClick={() => onSave('draft')} disabled={createPoll.isPending}>Save Draft</Button>
            <Button onClick={() => onSave('published')} disabled={createPoll.isPending}>
              {createPoll.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              <Share2 className="w-4 h-4 mr-2" />Publish
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
};
