import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Loader2, ShieldCheck, CheckCircle2, Mail, MapPin, Calendar } from "lucide-react";
import { Separator } from "@/components/ui/separator";

interface Props {
  userId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AdminUserDetailDialog({ userId, open, onOpenChange }: Props) {
  const { data, isLoading } = useQuery({
    queryKey: ["admin", "user-detail", userId],
    enabled: !!userId && open,
    queryFn: async () => {
      if (!userId) return null;
      const [profileRes, rolesRes, topicsRes, scoresRes, answersRes] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", userId).maybeSingle(),
        supabase.from("user_roles").select("role").eq("user_id", userId),
        supabase.from("user_topics").select("weight, topics(name, icon)").eq("user_id", userId).order("weight", { ascending: false }),
        supabase.from("user_topic_scores").select("score, topics(name, icon)").eq("user_id", userId),
        supabase.from("quiz_answers").select("id", { count: "exact", head: true }).eq("user_id", userId),
      ]);
      if (profileRes.error) throw profileRes.error;
      return {
        profile: profileRes.data,
        roles: (rolesRes.data || []).map((r) => r.role),
        topics: topicsRes.data || [],
        scores: scoresRes.data || [],
        answerCount: answersRes.count || 0,
      };
    },
  });

  const profile = data?.profile;
  const isAdmin = data?.roles.includes("admin");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>User Profile</DialogTitle>
          <DialogDescription>Admin view of this user's profile and activity.</DialogDescription>
        </DialogHeader>

        {isLoading || !profile ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-5">
            {/* Header */}
            <div className="flex items-start gap-4">
              <Avatar className="h-16 w-16">
                <AvatarImage src={profile.avatar_url ?? undefined} />
                <AvatarFallback>{(profile.name || "?").slice(0, 2).toUpperCase()}</AvatarFallback>
              </Avatar>
              <div className="flex-1 space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-lg font-semibold">{profile.name || "Unnamed user"}</h3>
                  {isAdmin && (
                    <Badge variant="default" className="gap-1">
                      <ShieldCheck className="h-3 w-3" /> Admin
                    </Badge>
                  )}
                  {profile.identity_verified && (
                    <Badge variant="outline" className="gap-1 text-xs">
                      <CheckCircle2 className="h-3 w-3" /> ID
                    </Badge>
                  )}
                  {profile.voter_verified && (
                    <Badge variant="outline" className="gap-1 text-xs">
                      <CheckCircle2 className="h-3 w-3" /> Voter
                    </Badge>
                  )}
                </div>
                {profile.email && (
                  <div className="flex items-center gap-1 text-sm text-muted-foreground">
                    <Mail className="h-3 w-3" /> {profile.email}
                  </div>
                )}
                {profile.location && (
                  <div className="flex items-center gap-1 text-sm text-muted-foreground">
                    <MapPin className="h-3 w-3" /> {profile.location}
                  </div>
                )}
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Calendar className="h-3 w-3" /> Joined {new Date(profile.created_at).toLocaleDateString()}
                </div>
              </div>
            </div>

            <Separator />

            {/* Demographics */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
              <Field label="Party" value={profile.political_party} />
              <Field label="Age" value={profile.age?.toString()} />
              <Field label="Sex" value={profile.sex} />
              <Field label="Income" value={profile.income} />
              <Field label="Religion" value={profile.religion} />
              <Field label="Voter state" value={profile.voter_state} />
              <Field label="Address" value={profile.address} />
              <Field label="Overall score" value={profile.overall_score?.toFixed?.(2)} />
              <Field label="Quiz answers" value={String(data.answerCount)} />
            </div>

            {/* Top topics */}
            {data.topics.length > 0 && (
              <>
                <Separator />
                <div>
                  <h4 className="text-sm font-medium mb-2">Top topics</h4>
                  <div className="flex flex-wrap gap-2">
                    {data.topics.map((t: any, i: number) => (
                      <Badge key={i} variant="secondary" className="gap-1">
                        <span>{t.topics?.icon}</span>
                        {t.topics?.name}
                        <span className="text-muted-foreground">· {t.weight}</span>
                      </Badge>
                    ))}
                  </div>
                </div>
              </>
            )}

            {/* Topic scores */}
            {data.scores.length > 0 && (
              <>
                <Separator />
                <div>
                  <h4 className="text-sm font-medium mb-2">Topic scores</h4>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    {data.scores.map((s: any, i: number) => (
                      <div key={i} className="flex justify-between rounded-md border px-2 py-1">
                        <span>
                          {s.topics?.icon} {s.topics?.name}
                        </span>
                        <span className="font-mono">{Number(s.score).toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="truncate">{value || "—"}</div>
    </div>
  );
}
