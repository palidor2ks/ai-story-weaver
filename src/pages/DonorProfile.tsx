import { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Header } from '@/components/Header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { ArrowLeft, Building2, DollarSign, MapPin, Sparkles, User as UserIcon } from 'lucide-react';

interface DonorRecord {
  id: string;
  name: string;
  type: 'Individual' | 'PAC' | 'Organization' | 'Unknown';
  amount: number;
  cycle: string;
  candidate_id: string;
  candidates?: {
    id: string;
    name: string;
    party: string;
    office: string;
    state: string;
    district?: string;
    image_url?: string;
  };
}

interface RecipientAggregate {
  candidateId: string;
  total: number;
  cycles: Set<string>;
  candidate?: DonorRecord['candidates'];
}

const getPartyColor = (party: string) => {
  switch (party) {
    case 'Democrat':
      return 'bg-blue-500/10 text-blue-700 border-blue-500/30';
    case 'Republican':
      return 'bg-red-500/10 text-red-700 border-red-500/30';
    case 'Independent':
      return 'bg-purple-500/10 text-purple-700 border-purple-500/30';
    default:
      return 'bg-muted text-muted-foreground';
  }
};

const DonorProfile = () => {
  const { id } = useParams<{ id: string }>();

  const { data: donor, isLoading: donorLoading } = useQuery({
    queryKey: ['donor', id],
    queryFn: async () => {
      if (!id) return null;

      const { data, error } = await supabase
        .from('donors')
        .select('*')
        .eq('id', id)
        .single();

      if (error) throw error;
      return data as DonorRecord;
    },
    enabled: !!id,
  });

  const { data: contributions = [], isLoading: contributionsLoading } = useQuery({
    queryKey: ['donor-contributions', donor?.name],
    queryFn: async () => {
      if (!donor?.name) return [] as DonorRecord[];

      const { data, error } = await supabase
        .from('donors')
        .select(`
          *,
          candidates (id, name, party, office, state, district, image_url)
        `)
        .eq('name', donor.name)
        .order('amount', { ascending: false });

      if (error) throw error;
      return (data || []).map((row) => ({
        ...row,
        candidates: (row as any).candidates,
      })) as DonorRecord[];
    },
    enabled: !!donor?.name,
  });

  const topRecipients = useMemo(() => {
    const aggregates: Record<string, RecipientAggregate> = {};

    contributions.forEach((contribution) => {
      const existing = aggregates[contribution.candidate_id] ?? {
        candidateId: contribution.candidate_id,
        total: 0,
        cycles: new Set<string>(),
        candidate: contribution.candidates,
      };

      existing.total += contribution.amount;
      existing.cycles.add(contribution.cycle);
      existing.candidate = contribution.candidates || existing.candidate;
      aggregates[contribution.candidate_id] = existing;
    });

    return Object.values(aggregates).sort((a, b) => b.total - a.total);
  }, [contributions]);

  const totalContributed = contributions.reduce((sum, c) => sum + c.amount, 0);

  if (donorLoading || contributionsLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      </div>
    );
  }

  if (!donor) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="container py-8 px-4 text-center">
          <p className="text-muted-foreground">Donor not found.</p>
          <Link to="/donors">
            <span className="inline-flex items-center text-primary mt-3">Back to Donors</span>
          </Link>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main className="container py-8 px-4 space-y-8">
        <Link
          to="/donors"
          className="inline-flex items-center text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Donor Directory
        </Link>

        <div className="bg-card rounded-2xl border border-border p-6 md:p-8 shadow-elevated">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                {donor.type === 'Individual' ? (
                  <UserIcon className="w-10 h-10 text-primary" />
                ) : (
                  <Building2 className="w-10 h-10 text-primary" />
                )}
                <div>
                  <h1 className="font-display text-3xl font-bold text-foreground">{donor.name}</h1>
                  <Badge variant="outline" className="mt-2">{donor.type}</Badge>
                </div>
              </div>
              <p className="text-muted-foreground">
                Showing contribution history and top campaign recipients for this donor.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Card className="border-border">
                <CardHeader className="pb-2">
                  <p className="text-sm text-muted-foreground">Total Contributed</p>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold text-agree">${totalContributed.toLocaleString()}</p>
                </CardContent>
              </Card>
              <Card className="border-border">
                <CardHeader className="pb-2">
                  <p className="text-sm text-muted-foreground">Recipients</p>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold text-foreground">{topRecipients.length}</p>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>

        <section>
          <div className="flex items-center gap-3 mb-4">
            <Sparkles className="w-5 h-5 text-primary" />
            <div>
              <h2 className="font-display text-2xl font-bold">Top Recipients</h2>
              <p className="text-sm text-muted-foreground">Campaigns receiving the largest totals from this donor.</p>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {topRecipients.map((recipient) => (
              <Card key={recipient.candidateId} className="hover:shadow-md transition-shadow">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center justify-between gap-3">
                    <div className="space-y-1">
                      <p className="text-lg font-semibold text-foreground">
                        {recipient.candidate?.name || 'Unknown Candidate'}
                      </p>
                      <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                        {recipient.candidate?.office && <span>{recipient.candidate.office}</span>}
                        {recipient.candidate?.state && (
                          <span className="flex items-center gap-1">
                            <MapPin className="w-4 h-4" />
                            {recipient.candidate.state}
                            {recipient.candidate.district && ` (${recipient.candidate.district})`}
                          </span>
                        )}
                      </div>
                    </div>
                    {recipient.candidate?.party && (
                      <Badge variant="outline" className={getPartyColor(recipient.candidate.party)}>
                        {recipient.candidate.party}
                      </Badge>
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground text-sm">Total Received</span>
                    <span className="text-xl font-bold text-foreground">
                      ${recipient.total.toLocaleString()}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground text-sm">Cycles</span>
                    <div className="flex flex-wrap gap-2">
                      {Array.from(recipient.cycles).map((cycle) => (
                        <Badge key={cycle} variant="secondary" className="text-xs">
                          {cycle}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  <Link
                    to={`/candidate/${recipient.candidateId}`}
                    className="inline-flex items-center gap-2 text-primary text-sm hover:underline"
                  >
                    <DollarSign className="w-4 h-4" />
                    View candidate profile
                  </Link>
                </CardContent>
              </Card>
            ))}

            {topRecipients.length === 0 && (
              <Card className="col-span-2">
                <CardContent className="py-10 text-center text-muted-foreground">
                  No recipients found for this donor.
                </CardContent>
              </Card>
            )}
          </div>
        </section>

        <section>
          <div className="flex items-center gap-3 mb-4">
            <DollarSign className="w-5 h-5 text-primary" />
            <div>
              <h2 className="font-display text-2xl font-bold">Contribution History</h2>
              <p className="text-sm text-muted-foreground">All recorded donations associated with this donor.</p>
            </div>
          </div>

          <div className="grid gap-3">
            {contributions.map((contribution) => (
              <Card key={contribution.id} className="border-border">
                <CardContent className="py-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="font-semibold text-foreground">
                        {contribution.candidates?.name || 'Unknown Candidate'}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {contribution.candidates?.office} {contribution.candidates?.state && `• ${contribution.candidates.state}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-6">
                      <div className="text-right">
                        <p className="text-sm text-muted-foreground">Amount</p>
                        <p className="text-lg font-bold text-foreground">${contribution.amount.toLocaleString()}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm text-muted-foreground">Cycle</p>
                        <Badge variant="secondary">{contribution.cycle}</Badge>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}

            {contributions.length === 0 && (
              <Card>
                <CardContent className="py-10 text-center text-muted-foreground">
                  No contributions recorded for this donor.
                </CardContent>
              </Card>
            )}
          </div>
        </section>
      </main>
    </div>
  );
};

export default DonorProfile;
