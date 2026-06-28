import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface ProfileRow {
  id: string;
  name: string | null;
  email: string | null;
  location: string | null;
  voter_state: string | null;
  political_party: string | null;
  age: number | null;
  overall_score: number | null;
  identity_verified: boolean | null;
  voter_verified: boolean | null;
  created_at: string;
}

export function useAdminProfiles() {
  return useQuery({
    queryKey: ["admin", "profiles"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select(
          "id, name, email, location, voter_state, political_party, age, overall_score, identity_verified, voter_verified, created_at",
        )
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as ProfileRow[];
    },
  });
}

export function useAdminUserRoles() {
  return useQuery({
    queryKey: ["admin", "user_roles_all"],
    queryFn: async () => {
      const { data, error } = await supabase.from("user_roles").select("user_id, role");
      if (error) throw error;
      return data as { user_id: string; role: string }[];
    },
  });
}

export function useAdminUserLastSignins() {
  return useQuery({
    queryKey: ["admin", "user_last_signins"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_admin_user_last_signins");
      if (error) throw error;
      return (data || []) as { user_id: string; last_sign_in_at: string | null }[];
    },
    staleTime: 1000 * 60,
  });
}

// The mutation's onMutate/onSettled drive component state (pending row), so the
// useMutation wrapper stays in the panel; this is just its data operation.
export async function setUserAdminRole({ userId, makeAdmin }: { userId: string; makeAdmin: boolean }) {
  if (makeAdmin) {
    const { error } = await supabase
      .from("user_roles")
      .insert({ user_id: userId, role: "admin" });
    if (error && !error.message.includes("duplicate")) throw error;
  } else {
    const { error } = await supabase
      .from("user_roles")
      .delete()
      .eq("user_id", userId)
      .eq("role", "admin");
    if (error) throw error;
  }
}
