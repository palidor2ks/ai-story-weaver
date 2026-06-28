import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { toast } from "@/hooks/use-toast";

export const STATES: { code: string; name: string }[] = [
  { code: "AL", name: "Alabama" }, { code: "AK", name: "Alaska" }, { code: "AZ", name: "Arizona" },
  { code: "AR", name: "Arkansas" }, { code: "CA", name: "California" }, { code: "CO", name: "Colorado" },
  { code: "CT", name: "Connecticut" }, { code: "DE", name: "Delaware" }, { code: "DC", name: "D.C." },
  { code: "FL", name: "Florida" }, { code: "GA", name: "Georgia" }, { code: "HI", name: "Hawaii" },
  { code: "ID", name: "Idaho" }, { code: "IL", name: "Illinois" }, { code: "IN", name: "Indiana" },
  { code: "IA", name: "Iowa" }, { code: "KS", name: "Kansas" }, { code: "KY", name: "Kentucky" },
  { code: "LA", name: "Louisiana" }, { code: "ME", name: "Maine" }, { code: "MD", name: "Maryland" },
  { code: "MA", name: "Massachusetts" }, { code: "MI", name: "Michigan" }, { code: "MN", name: "Minnesota" },
  { code: "MS", name: "Mississippi" }, { code: "MO", name: "Missouri" }, { code: "MT", name: "Montana" },
  { code: "NE", name: "Nebraska" }, { code: "NV", name: "Nevada" }, { code: "NH", name: "New Hampshire" },
  { code: "NJ", name: "New Jersey" }, { code: "NM", name: "New Mexico" }, { code: "NY", name: "New York" },
  { code: "NC", name: "North Carolina" }, { code: "ND", name: "North Dakota" }, { code: "OH", name: "Ohio" },
  { code: "OK", name: "Oklahoma" }, { code: "OR", name: "Oregon" }, { code: "PA", name: "Pennsylvania" },
  { code: "RI", name: "Rhode Island" }, { code: "SC", name: "South Carolina" }, { code: "SD", name: "South Dakota" },
  { code: "TN", name: "Tennessee" }, { code: "TX", name: "Texas" }, { code: "UT", name: "Utah" },
  { code: "VT", name: "Vermont" }, { code: "VA", name: "Virginia" }, { code: "WA", name: "Washington" },
  { code: "WV", name: "West Virginia" }, { code: "WI", name: "Wisconsin" }, { code: "WY", name: "Wyoming" },
  { code: "AS", name: "American Samoa" }, { code: "GU", name: "Guam" },
  { code: "MP", name: "N. Mariana Islands" }, { code: "PR", name: "Puerto Rico" },
  { code: "US", name: "National" }, { code: "VI", name: "U.S. Virgin Islands" },
];

export function useHiddenStatesAdmin() {
  return useQuery({
    queryKey: ["hidden-states-admin"],
    queryFn: async () => {
      const { data, error } = await supabase.from("hidden_states").select("state_code");
      if (error) throw error;
      return new Set<string>((data || []).map((r) => r.state_code.toUpperCase()));
    },
  });
}

export function useStateCounts() {
  return useQuery({
    queryKey: ["state-counts"],
    queryFn: async () => {
      const { data, error } = await supabase.from("candidates").select("state").limit(10000);
      if (error) throw error;
      const map = new Map<string, number>();
      for (const r of data || []) {
        const s = (r.state || "").toUpperCase();
        if (s) map.set(s, (map.get(s) || 0) + 1);
      }
      return map;
    },
    staleTime: 10 * 60 * 1000,
  });
}

export function useToggleHiddenState() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({ code, hide }: { code: string; hide: boolean }) => {
      if (hide) {
        const { error } = await supabase
          .from("hidden_states")
          .insert({ state_code: code, hidden_by: user?.id ?? null });
        if (error) throw error;
      } else {
        const { error } = await supabase.from("hidden_states").delete().eq("state_code", code);
        if (error) throw error;
      }
    },
    onSuccess: (_, { code, hide }) => {
      qc.invalidateQueries({ queryKey: ["hidden-states-admin"] });
      qc.invalidateQueries({ queryKey: ["hidden-states"] });
      toast({ title: hide ? `Hid ${code}` : `Showing ${code}` });
    },
    onError: (e: Error) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });
}

export function useBulkHiddenStates() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (mode: "hide-all" | "show-all") => {
      if (mode === "show-all") {
        const { error } = await supabase.from("hidden_states").delete().neq("state_code", "");
        if (error) throw error;
      } else {
        const rows = STATES.map((s) => ({ state_code: s.code, hidden_by: user?.id ?? null }));
        const { error } = await supabase.from("hidden_states").upsert(rows, { onConflict: "state_code" });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hidden-states-admin"] });
      qc.invalidateQueries({ queryKey: ["hidden-states"] });
    },
  });
}
