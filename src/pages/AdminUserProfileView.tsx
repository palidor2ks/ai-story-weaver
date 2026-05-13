import { useMemo } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Header } from '@/components/Header';
import { useAdminRole } from '@/hooks/useAdminRole';
import { useAuth } from '@/context/AuthContext';
import { useProfile, useUserTopics, useUserTopicScores } from '@/hooks/useProfile';
import { usePartyMatchScores } from '@/hooks/usePartyMatchScores';
import { useRepresentatives } from '@/hooks/useRepresentatives';
import { useCivicOfficials } from '@/hooks/useCivicOfficials';
import { useCandidateScoreMap } from '@/hooks/useCandidateScoreMap';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { ScoreText } from '@/components/ScoreText';
import {
  ArrowLeft,
  ShieldAlert,
  Mail,
  MapPin,
  Calendar,
  CheckCircle2,
  ShieldCheck,
  Users,
  Building2,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export default function AdminUserProfileView() {
  const { userId = '' } = useParams<{ userId: string }>();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { data: adminData, isLoading: adminLoading } = useAdminRole();

  const { data: profile, isLoading: profileLoading } = useProfile(userId);
  const { data: userTopics = [] } = useUserTopics(userId);
  const { data: topicScores = [] } = useUserTopicScores(userId);
  const { data: partyScores } = usePartyMatchScores(userId);
  const { data: repsData, isLoading: repsLoading } = useRepresentatives(profile?.address);
  const { data: civicData, isLoading: civicLoading } = useCivicOfficials(profile?.address);

  // Quiz answer count
  const { data: answerCount } = useQuery({
    queryKey: ['admin', 'user-answer-count', userId],
    enabled: !!userId,
    queryFn: async () => {
      const { count, error } = await supabase
        .from('quiz_answers')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId);
      if (error) throw error;
      return count ?? 0;
    },
  });

  const allOfficialIds = useMemo(() => {
    const ids: string[] = [];
    repsData?.representatives?.forEach((rep) => ids.push(rep.bioguide_id || rep.id));
    if (civicData) {
      civicData.federalExecutive.forEach((o) => ids.push(o.id));
      civicData.stateExecutive.forEach((o) => ids.push(o.id));
      civicData.stateLegislative.forEach((o) => ids.push(o.id));
      civicData.local.forEach((o) => ids.push(o.id));
    }
    return ids.filter(Boolean);
  }, [repsData, civicData]);

  const { data: scoreMap } = useCandidateScoreMap(allOfficialIds);

  if (authLoading || adminLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="container mx-auto px-4 py-12">
          <Skeleton className="h-32 w-full" />
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="container mx-auto px-4 py-12 text-center">
          <p>Please sign in.</p>
        </div>
      </div>
    );
  }

  if (!adminData?.isAdmin) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="container mx-auto px-4 py-12 text-center space-y-4">
          <ShieldAlert className="h-10 w-10 mx-auto text-destructive" />
          <p className="text-lg font-medium">Admin access required</p>
          <Button onClick={() => navigate('/')}>Go home</Button>
        </div>
      </div>
    );
  }

  const allReps = [
    ...(repsData?.representatives ?? []).map((r) => ({
      id: r.bioguide_id || r.id,
      name: r.name,
      office: r.office ?? 'Representative',
      party: r.party ?? '',
      image_url: r.image_url ?? null,
    })),
    ...(civicData?.federalExecutive ?? []),
    ...(civicData?.stateExecutive ?? []),
    ...(civicData?.stateLegislative ?? []),
    ...(civicData?.local ?? []),
  ];

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <div className="container mx-auto px-4 py-6 max-w-5xl space-y-6">
        {/* Admin banner */}
        <div className="flex items-center justify-between rounded-md border border-amber-500/30 bg-amber-500/10 px-4 py-2">
          <div className="flex items-center gap-2 text-sm">
            <ShieldAlert className="h-4 w-4 text-amber-600" />
            <span>
              Admin view — read-only profile for{' '}
              <span className="font-medium">{profile?.name || profile?.email || userId}</span>
            </span>
          </div>
          <Button variant="ghost" size="sm" onClick={() => navigate('/admin')}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Back to admin
          </Button>
        </div>

        {profileLoading || !profile ? (
          <Skeleton className="h-48 w-full" />
        ) : (
          <>
            {/* Header card */}
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-start gap-4 flex-wrap">
                  <Avatar className="h-20 w-20">
                    <AvatarImage src={profile.avatar_url ?? undefined} />
                    <AvatarFallback className="text-lg">
                      {(profile.name || '?').slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0 space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h1 className="text-2xl font-bold">{profile.name || 'Unnamed user'}</h1>
                      {profile.identity_verified && (
                        <Badge variant="outline" className="gap-1">
                          <CheckCircle2 className="h-3 w-3" /> Identity
                        </Badge>
                      )}
                      {profile.voter_verified && (
                        <Badge variant="outline" className="gap-1">
                          <ShieldCheck className="h-3 w-3" /> Voter
                        </Badge>
                      )}
                    </div>
                    <div className="grid sm:grid-cols-2 gap-1 text-sm text-muted-foreground">
                      {profile.email && (
                        <div className="flex items-center gap-1">
                          <Mail className="h-3 w-3" /> {profile.email}
                        </div>
                      )}
                      {profile.address && (
                        <div className="flex items-center gap-1">
                          <MapPin className="h-3 w-3" /> {profile.address}
                        </div>
                      )}
                      <div className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" /> Joined{' '}
                        {new Date(profile.created_at).toLocaleDateString()}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-muted-foreground">Overall score</div>
                    <div className="text-2xl font-bold">
                      {profile.overall_score != null ? (
                        <ScoreText score={Number(profile.overall_score)} />
                      ) : (
                        '—'
                      )}
                    </div>
                  </div>
                </div>

                <Separator className="my-4" />

                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 text-sm">
                  <Field label="Party" value={profile.political_party} />
                  <Field label="Age" value={profile.age?.toString()} />
                  <Field label="Sex" value={profile.sex} />
                  <Field label="Income" value={profile.income} />
                  <Field label="Religion" value={profile.religion} />
                  <Field label="Voter state" value={profile.voter_state} />
                  <Field label="Quiz answers" value={String(answerCount ?? 0)} />
                  <Field label="Score version" value={profile.score_version} />
                </div>
              </CardContent>
            </Card>

            {/* Top topics */}
            {userTopics.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Priority topics</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2">
                    {userTopics.map((t, i) => (
                      <Badge key={i} variant="secondary" className="gap-1">
                        <span>{t.topics?.icon}</span>
                        {t.topics?.name}
                        <span className="text-muted-foreground">· w {t.weight}</span>
                      </Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Topic scores */}
            {topicScores.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Topic scores</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid sm:grid-cols-2 gap-2 text-sm">
                    {topicScores.map((s, i) => (
                      <div
                        key={i}
                        className="flex justify-between rounded-md border px-3 py-2"
                      >
                        <span>
                          {s.topics?.icon} {s.topics?.name}
                        </span>
                        <span className="font-mono">
                          <ScoreText score={Number(s.score)} />
                        </span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Party match */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Party match scores</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                  {(['democrat', 'republican', 'green', 'libertarian'] as const).map((p) => {
                    const v = partyScores?.[p];
                    return (
                      <div key={p} className="rounded-md border px-3 py-3 text-center">
                        <div className="text-xs uppercase text-muted-foreground">{p}</div>
                        <div className="font-semibold mt-1">
                          {v != null ? <ScoreText score={v} /> : '—'}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            {/* Representatives */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Users className="h-4 w-4" /> Representatives
                  {(repsLoading || civicLoading) && (
                    <span className="text-xs text-muted-foreground">loading…</span>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {!profile.address ? (
                  <p className="text-sm text-muted-foreground">
                    No address on file — representatives unavailable.
                  </p>
                ) : allReps.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No representatives found.</p>
                ) : (
                  <div className="grid gap-2">
                    {allReps.map((rep, i) => {
                      const score = scoreMap?.get(rep.id) ?? null;
                      return (
                        <Link
                          key={`${rep.id}-${i}`}
                          to={`/candidate/${rep.id}`}
                          className="flex items-center gap-3 rounded-md border px-3 py-2 hover:bg-accent transition-colors"
                        >
                          <Avatar className="h-9 w-9">
                            <AvatarImage src={rep.image_url ?? undefined} />
                            <AvatarFallback className="text-xs">
                              <Building2 className="h-4 w-4" />
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex-1 min-w-0">
                            <div className="font-medium truncate">{rep.name}</div>
                            <div className="text-xs text-muted-foreground truncate">
                              {rep.office} {rep.party && `· ${rep.party}`}
                            </div>
                          </div>
                          <div className="text-sm font-mono">
                            {score != null ? <ScoreText score={score} /> : '—'}
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="truncate">{value || '—'}</div>
    </div>
  );
}
