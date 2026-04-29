import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Eye, EyeOff } from "lucide-react";
import { toast } from "@/hooks/use-toast";

const STATES: { code: string; name: string }[] = [
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
];

export function HiddenStatesPanel() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");

  const { data: hiddenSet, isLoading } = useQuery({
    queryKey: ["hidden-states-admin"],
    queryFn: async () => {
      const { data, error } = await supabase.from("hidden_states").select("state_code");
      if (error) throw error;
      return new Set<string>((data || []).map((r) => r.state_code.toUpperCase()));
    },
  });

  const { data: counts } = useQuery({
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

  const toggleMutation = useMutation({
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
    onError: (e: any) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  const bulkMutation = useMutation({
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

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return STATES;
    return STATES.filter((s) => s.name.toLowerCase().includes(q) || s.code.toLowerCase().includes(q));
  }, [search]);

  const hiddenCount = hiddenSet?.size ?? 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <EyeOff className="h-5 w-5" />
          Visible States
        </CardTitle>
        <CardDescription>
          Toggle which US states appear to end users. Hidden states keep all their data — only visibility is affected.
          {" "}
          <Badge variant="secondary" className="ml-2">{hiddenCount} hidden</Badge>
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2 items-center">
          <Input
            placeholder="Search state…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-xs"
          />
          <Button variant="outline" size="sm" onClick={() => bulkMutation.mutate("show-all")}>
            <Eye className="h-4 w-4 mr-1" /> Show all
          </Button>
          <Button variant="outline" size="sm" onClick={() => bulkMutation.mutate("hide-all")}>
            <EyeOff className="h-4 w-4 mr-1" /> Hide all
          </Button>
        </div>

        {isLoading ? (
          <Loader2 className="h-6 w-6 animate-spin" />
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
            {filtered.map((s) => {
              const isHidden = hiddenSet?.has(s.code) ?? false;
              const count = counts?.get(s.code) ?? 0;
              return (
                <div
                  key={s.code}
                  className={`flex items-center justify-between gap-2 rounded-md border p-2 ${
                    isHidden ? "bg-muted/50" : ""
                  }`}
                >
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{s.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {s.code} · {count}
                    </div>
                  </div>
                  <Switch
                    checked={!isHidden}
                    onCheckedChange={(checked) =>
                      toggleMutation.mutate({ code: s.code, hide: !checked })
                    }
                  />
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
