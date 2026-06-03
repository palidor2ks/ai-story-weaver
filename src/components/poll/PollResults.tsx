import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Users, BarChart3, Clock, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface TallyRow { question_id: string; selected_option_id: string; count: number }

interface PollOption { id: string; text: string; value: number; display_order?: number | null }
interface PollResultQuestion {
  id: string;
  question_id?: string;
  questions: { id: string; text: string; question_options?: PollOption[] | null };
}

interface Props {
  poll: { id: string; type: string; title: string };
  questions: PollResultQuestion[];
  tally: TallyRow[];
  userAnswers?: Record<string, string>;
}

export function PollResults({ poll, questions, tally, userAnswers = {} }: Props) {
  // total responses = max sum of any question's option counts (each response answers every question)
  const totalResponses = questions.reduce((max, pq) => {
    const sum = tally
      .filter(t => t.question_id === pq.question_id)
      .reduce((s, t) => s + Number(t.count), 0);
    return Math.max(max, sum);
  }, 0);

  return (
    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
      <Card>
        <CardContent className="pt-6 grid grid-cols-3 gap-4">
          <Stat icon={<Users className="w-4 h-4" />} label="Responses" value={totalResponses.toLocaleString()} />
          <Stat icon={<BarChart3 className="w-4 h-4" />} label="Questions" value={String(questions.length)} />
          <Stat icon={<Clock className="w-4 h-4" />} label="Updated" value="Live" />
        </CardContent>
      </Card>

      {questions.map((pq, idx) => {
        const q = pq.questions;
        const opts = (q.question_options || [])
          .slice()
          .sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0));
        const qTally = tally.filter(t => t.question_id === q.id);
        const total = qTally.reduce((s, t) => s + Number(t.count), 0);
        const userPick = userAnswers[q.id];

        const data = opts.map((o) => {
          const count = Number(qTally.find(t => t.selected_option_id === o.id)?.count || 0);
          const pct = total > 0 ? Math.round((count / total) * 100) : 0;
          return {
            id: o.id,
            name: o.text,
            count,
            pct,
            value: o.value,
            isUser: o.id === userPick,
          };
        });

        const showScoreStrip = poll.type !== 'mc';

        return (
          <Card key={pq.id}>
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-medium">
                {questions.length > 1 && <span className="text-muted-foreground mr-2">{idx + 1}.</span>}
                {q.text}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                {data.map((d) => (
                  <div key={d.id} className={cn('space-y-1.5', d.isUser && 'rounded-md')}>
                    <div className="flex items-start justify-between gap-3">
                      <p className={cn(
                        'text-sm leading-snug flex-1 break-words',
                        d.isUser ? 'text-foreground font-medium' : 'text-foreground/90'
                      )}>
                        {d.isUser && <CheckCircle2 className="inline w-3.5 h-3.5 mr-1 -mt-0.5 text-primary" />}
                        {d.name}
                      </p>
                      <span className="text-sm font-semibold tabular-nums text-foreground shrink-0">
                        {d.pct}%
                      </span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                      <div
                        className={cn(
                          'h-full rounded-full transition-all',
                          d.isUser ? 'bg-primary' : 'bg-primary/40'
                        )}
                        style={{ width: `${d.pct}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>

              <div className="text-xs text-muted-foreground">
                {total.toLocaleString()} {total === 1 ? 'response' : 'responses'}
                {userPick && <span className="ml-2">· Your pick highlighted</span>}
              </div>

              {showScoreStrip && (
                <div className="pt-2">
                  <div className="text-xs text-muted-foreground mb-2">Ideological spread (left ↔ right)</div>
                  <div className="relative h-8 rounded-full bg-gradient-to-r from-primary/10 via-muted to-primary/10 border">
                    <div className="absolute inset-y-0 left-1/2 w-px bg-border" />
                    {data.map((d) => {
                      const v = Math.max(-10, Math.min(10, Number(d.value) || 0));
                      const left = ((v + 10) / 20) * 100;
                      const size = 10 + (d.pct / 100) * 22;
                      return (
                        <div
                          key={d.id}
                          className={cn(
                            'absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-background',
                            d.isUser ? 'bg-primary' : 'bg-primary/50'
                          )}
                          style={{ left: `${left}%`, width: size, height: size }}
                          title={`${d.name} · ${d.pct}%`}
                        />
                      );
                    })}
                  </div>
                  <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
                    <span>-10</span><span>0</span><span>+10</span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex flex-col items-center text-center">
      <div className="flex items-center gap-1.5 text-muted-foreground text-xs">
        {icon}
        <span>{label}</span>
      </div>
      <div className="font-display text-2xl font-bold mt-1">{value}</div>
    </div>
  );
}
