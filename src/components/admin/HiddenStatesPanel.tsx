import { useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Eye, EyeOff } from "lucide-react";
import {
  STATES,
  useHiddenStatesAdmin,
  useStateCounts,
  useToggleHiddenState,
  useBulkHiddenStates,
} from "@/hooks/useHiddenStatesAdmin";

export function HiddenStatesPanel() {
  const [search, setSearch] = useState("");

  const { data: hiddenSet, isLoading } = useHiddenStatesAdmin();
  const { data: counts } = useStateCounts();
  const toggleMutation = useToggleHiddenState();
  const bulkMutation = useBulkHiddenStates();

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
