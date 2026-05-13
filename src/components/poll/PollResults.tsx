import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { motion } from 'framer-motion';
import { BarChart, Bar, XAxis, YAxis, Cell, ResponsiveContainer, LabelList } from 'recharts';
import { Users, BarChart3, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';

interface TallyRow { question_id: string; selected_option_id: string; count: number }

interface Props {
  poll: { id: string; type: string; title: string };
  questions: any[];
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
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="space-y-4"
    >
      <Card>
        <CardContent className="pt-6 grid grid-cols-3 gap-4">
          <Stat icon={<Users className="w-4 h-4" />} label="Responses" value={totalResponses.toLocaleString()} />
          <Stat icon={<BarChart3 className="w-4 h-4" />} label="Questions" value={String(questions.length)} />
          <Stat icon={<Clock className="w-4 h-4" />} label="Updated" value="Live" />
        </CardContent>
      </Card>

      {questions.map((pq: any, idx: number) => {
        const q = pq.questions;
        const opts = (q.question_options || [])
          .slice()
          .sort((a: any, b: any) => (a.display_order ?? 0) - (b.display_order ?? 0));
        const qTally = tally.filter(t => t.question_id === q.id);
        const total = qTally.reduce((s, t) => s + Number(t.count), 0);
        const userPick = userAnswers[q.id];

        const data = opts.map((o: any) => {
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
              <div style={{ width: '100%', height: Math.max(140, opts.length * 44) }}>
                <ResponsiveContainer>
                  <BarChart data={data} layout="vertical" margin={{ left: 0, right: 48, top: 4, bottom: 4 }}>
                    <XAxis type="number" hide domain={[0, Math.max(1, total)]} />
                    <YAxis
                      type="category"
                      dataKey="name"
                      width={140}
                      tick={{ fill: 'hsl(var(--foreground))', fontSize: 12 }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <Bar dataKey="count" radius={[4, 4, 4, 4]} background={{ fill: 'hsl(var(--muted))', radius: 4 } as any}>
                      {data.map((d) => (
                        <Cell
                          key={d.id}
                          fill={d.isUser ? 'hsl(var(--primary))' : 'hsl(var(--primary) / 0.4)'}
                        />
                      ))}
                      <LabelList
                        dataKey="pct"
                        position="right"
                        formatter={(v: number) => `${v}%`}
                        style={{ fill: 'hsl(var(--foreground))', fontSize: 12, fontWeight: 500 }}
                      />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
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
    </motion.div>
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
