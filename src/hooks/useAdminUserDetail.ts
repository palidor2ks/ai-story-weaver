import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// Aggregated admin view of a user: profile, roles, weighted topics, topic scores,
// and quiz-answer count.
export function useAdminUserDetail(userId: string | null | undefined, open: boolean) {
  return useQuery({
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
}
