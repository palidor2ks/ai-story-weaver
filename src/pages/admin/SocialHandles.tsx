import { useMemo, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, Landmark, RefreshCw, Save, Search } from "lucide-react";
import { useAdminRole } from "@/hooks/useAdminRole";
import { LoadingScreen } from "@/components/LoadingScreen";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface CandidateRow {
  id: string;
  name: string;
  office: string | null;
  state: string | null;
  district: string | null;
  party: string | null;
  x_handle: string | null;
}

interface PostStat {
  candidate_id: string;
  last_posted_at: string | null;
  post_count: number;
}

const HANDLE_RE = /^[A-Za-z0-9_]{1,15}$/;

function HandleRow({
  candidate,
  stat,
  onSaved,
}: {
  candidate: CandidateRow;
  stat?: PostStat;
  onSaved: () => void;
}) {
  const [value, setValue] = useState(candidate.x_handle ?? "");
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [discovering, setDiscovering] = useState(false);

  const dirty = (value.trim().replace(/^@/, "")) !== (candidate.x_handle ?? "");

  const save = async () => {
    const clean = value.trim().replace(/^@/, "");
    if (clean && !HANDLE_RE.test(clean)) {
      toast.error("Invalid handle. Letters, numbers, underscore, up to 15 chars.");
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from("candidates")
      .update({ x_handle: clean || null })
      .eq("id", candidate.id);
    setSaving(false);
    if (error) {
      toast.error(`Save failed: ${error.message}`);
      return;
    }
    toast.success("Handle saved");
    onSaved();
  };

  const sync = async () => {
    setSyncing(true);
    const { data, error } = await supabase.functions.invoke("sync-representative-x-posts", {
      body: { candidate_id: candidate.id, per_candidate: 10 },
    });
    setSyncing(false);
    if (error) {
      toast.error(`Sync failed: ${error.message}`);
      return;
    }
    toast.success("Sync started");
    setTimeout(onSaved, 3000);
    console.log("sync result", data);
  };

  const discover = async () => {
    setDiscovering(true);
    const { data, error } = await supabase.functions.invoke("discover-representative-x-handles", {
      body: { candidate_id: candidate.id, overwrite: false },
    });
    setDiscovering(false);
    if (error) {
      toast.error(`Discovery failed: ${error.message}`);
      return;
    }
    const result = (data?.results ?? [])[0];
    if (result?.status === "updated") {
      toast.success(`Found @${result.handle}`);
      onSaved();
    } else if (result?.status === "skipped_existing") {
      toast.info("Already has a handle");
    } else if (result?.status === "rate_limited") {
      toast.error("X rate limited; try again later");
    } else {
      toast.warning(`No confident match (${result?.reason ?? "unknown"})`);
    }
  };

  return (
    <TableRow>
      <TableCell>
        <Link to={`/candidate/${candidate.id}`} className="font-medium hover:underline">
          {candidate.name}
        </Link>
        <div className="text-xs text-muted-foreground">
          {[candidate.office, candidate.state, candidate.district, candidate.party]
            .filter(Boolean)
            .join(" · ")}
        </div>
      </TableCell>
      <TableCell>
        <div className="flex gap-2 items-center">
          <span className="text-muted-foreground">@</span>
          <Input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="RepHandle"
            className="h-8 w-40"
          />
        </div>
      </TableCell>
      <TableCell className="text-sm">
        {stat?.last_posted_at ? new Date(stat.last_posted_at).toLocaleString() : "—"}
      </TableCell>
      <TableCell className="text-sm">{stat?.post_count ?? 0}</TableCell>
      <TableCell>
        <div className="flex gap-2 justify-end">
          <Button
            size="sm"
            variant="outline"
            onClick={discover}
            disabled={discovering || !!candidate.x_handle}
            title={candidate.x_handle ? "Already has a handle" : "Discover handle from X"}
          >
            <Search className={`h-3 w-3 mr-1 ${discovering ? "animate-pulse" : ""}`} />
            {discovering ? "Searching" : "Discover"}
          </Button>
          <Button size="sm" variant="outline" onClick={save} disabled={!dirty || saving}>
            <Save className="h-3 w-3 mr-1" />
            {saving ? "Saving" : "Save"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={sync}
            disabled={syncing || !candidate.x_handle}
          >
            <RefreshCw className={`h-3 w-3 mr-1 ${syncing ? "animate-spin" : ""}`} />
            Sync
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}

export default function SocialHandles() {
  const { data: adminData, isLoading: adminLoading } = useAdminRole();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "with" | "without">("all");
  const [syncingAll, setSyncingAll] = useState(false);
  const [discoveringAll, setDiscoveringAll] = useState(false);

  const candidatesQuery = useQuery({
    queryKey: ["admin-social-handles"],
    enabled: !!adminData?.isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("candidates")
        .select("id, name, office, state, district, party, x_handle")
        .order("name", { ascending: true })
        .limit(1000);
      if (error) throw error;
      return data as CandidateRow[];
    },
  });

  const statsQuery = useQuery({
    queryKey: ["admin-social-handle-stats"],
    enabled: !!adminData?.isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("representative_social_posts")
        .select("candidate_id, posted_at")
        .order("posted_at", { ascending: false })
        .limit(5000);
      if (error) throw error;
      const map = new Map<string, PostStat>();
      for (const row of data as any[]) {
        const entry = map.get(row.candidate_id);
        if (!entry) {
          map.set(row.candidate_id, {
            candidate_id: row.candidate_id,
            last_posted_at: row.posted_at,
            post_count: 1,
          });
        } else {
          entry.post_count += 1;
          if (!entry.last_posted_at || row.posted_at > entry.last_posted_at) {
            entry.last_posted_at = row.posted_at;
          }
        }
      }
      return map;
    },
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["admin-social-handles"] });
    qc.invalidateQueries({ queryKey: ["admin-social-handle-stats"] });
  };

  const filtered = useMemo(() => {
    const rows = candidatesQuery.data ?? [];
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (filter === "with" && !r.x_handle) return false;
      if (filter === "without" && r.x_handle) return false;
      if (!q) return true;
      return (
        r.name.toLowerCase().includes(q) ||
        (r.x_handle ?? "").toLowerCase().includes(q) ||
        (r.state ?? "").toLowerCase().includes(q) ||
        (r.office ?? "").toLowerCase().includes(q)
      );
    });
  }, [candidatesQuery.data, search, filter]);

  const syncAll = async () => {
    setSyncingAll(true);
    const { error } = await supabase.functions.invoke("sync-representative-x-posts", {
      body: { max_candidates: 25, per_candidate: 10 },
    });
    setSyncingAll(false);
    if (error) {
      toast.error(`Batch sync failed: ${error.message}`);
      return;
    }
    toast.success("Batch sync started");
    setTimeout(refresh, 5000);
  };

  const discoverAll = async () => {
    setDiscoveringAll(true);
    const { error } = await supabase.functions.invoke("discover-representative-x-handles", {
      body: { limit: 100, overwrite: false },
    });
    setDiscoveringAll(false);
    if (error) {
      toast.error(`Discovery failed: ${error.message}`);
      return;
    }
    toast.success("Discovery running in background. Refresh in a minute to see results.");
    setTimeout(refresh, 60000);
  };

  if (adminLoading) return <LoadingScreen />;
  if (!adminData?.isAdmin) return <Navigate to="/" replace />;

  return (
    <div className="container mx-auto py-6 max-w-7xl">
      <Button asChild variant="ghost" size="sm" className="mb-4">
        <Link to="/admin">
          <ArrowLeft className="h-4 w-4 mr-1" /> Back to admin
        </Link>
      </Button>

      <Card>
        <CardHeader>
          <div className="flex justify-between items-start flex-wrap gap-3">
            <div>
              <CardTitle>Representative social handles</CardTitle>
              <CardDescription>
                Set the X (Twitter) handle for each candidate. Saved handles are used by the
                Latest from X feed on candidate profiles.
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={discoverAll} disabled={discoveringAll}>
                <Search className={`h-4 w-4 mr-2 ${discoveringAll ? "animate-pulse" : ""}`} />
                Discover all missing
              </Button>
              <Button onClick={syncAll} disabled={syncingAll}>
                <RefreshCw className={`h-4 w-4 mr-2 ${syncingAll ? "animate-spin" : ""}`} />
                Sync all with handles
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2 mb-4 flex-wrap">
            <Input
              placeholder="Search name, handle, state, office…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="max-w-sm"
            />
            <Select value={filter} onValueChange={(v) => setFilter(v as any)}>
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All candidates</SelectItem>
                <SelectItem value="with">With handle</SelectItem>
                <SelectItem value="without">Without handle</SelectItem>
              </SelectContent>
            </Select>
            <div className="text-sm text-muted-foreground self-center ml-auto">
              {filtered.length} of {candidatesQuery.data?.length ?? 0}
            </div>
          </div>

          {candidatesQuery.isLoading ? (
            <div className="py-12 text-center text-muted-foreground">Loading…</div>
          ) : (
            <div className="border rounded-md overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Candidate</TableHead>
                    <TableHead>X handle</TableHead>
                    <TableHead>Last post</TableHead>
                    <TableHead>Posts</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((c) => (
                    <HandleRow
                      key={c.id}
                      candidate={c}
                      stat={statsQuery.data?.get(c.id)}
                      onSaved={refresh}
                    />
                  ))}
                  {filtered.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                        No candidates match.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
