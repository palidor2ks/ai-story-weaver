import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Loader2, ShieldCheck, CheckCircle2, ShieldOff, ShieldPlus } from "lucide-react";
import { AdminUserDetailDialog } from "./AdminUserDetailDialog";

interface ProfileRow {
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

const PAGE_SIZE = 50;

export function AdminUsersPanel() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [partyFilter, setPartyFilter] = useState<string>("all");
  const [stateFilter, setStateFilter] = useState<string>("all");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [page, setPage] = useState(0);
  const [pendingUserId, setPendingUserId] = useState<string | null>(null);
  const [detailUserId, setDetailUserId] = useState<string | null>(null);

  const toggleAdmin = useMutation({
    mutationFn: async ({ userId, makeAdmin }: { userId: string; makeAdmin: boolean }) => {
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
    },
    onMutate: ({ userId }) => setPendingUserId(userId),
    onSettled: () => setPendingUserId(null),
    onSuccess: (_d, vars) => {
      toast.success(vars.makeAdmin ? "Promoted to admin" : "Removed admin role");
      queryClient.invalidateQueries({ queryKey: ["admin", "user_roles_all"] });
      queryClient.invalidateQueries({ queryKey: ["admin-role"] });
    },
    onError: (e: Error) => toast.error(`Failed: ${e.message}`),
  });


  const { data: profiles, isLoading, error } = useQuery({
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

  const { data: roles } = useQuery({
    queryKey: ["admin", "user_roles_all"],
    queryFn: async () => {
      const { data, error } = await supabase.from("user_roles").select("user_id, role");
      if (error) throw error;
      return data as { user_id: string; role: string }[];
    },
  });

  const roleMap = useMemo(() => {
    const m = new Map<string, string[]>();
    (roles || []).forEach((r) => {
      const arr = m.get(r.user_id) || [];
      arr.push(r.role);
      m.set(r.user_id, arr);
    });
    return m;
  }, [roles]);

  const partyOptions = useMemo(
    () => Array.from(new Set((profiles || []).map((p) => p.political_party).filter(Boolean))) as string[],
    [profiles],
  );
  const stateOptions = useMemo(
    () => Array.from(new Set((profiles || []).map((p) => p.voter_state).filter(Boolean))).sort() as string[],
    [profiles],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (profiles || []).filter((p) => {
      if (q) {
        const hay = `${p.name || ""} ${p.email || ""} ${p.location || ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (partyFilter !== "all" && p.political_party !== partyFilter) return false;
      if (stateFilter !== "all" && p.voter_state !== stateFilter) return false;
      if (roleFilter !== "all") {
        const userRoles = roleMap.get(p.id) || [];
        if (roleFilter === "admin" && !userRoles.includes("admin")) return false;
        if (roleFilter === "user" && userRoles.includes("admin")) return false;
      }
      return true;
    });
  }, [profiles, search, partyFilter, stateFilter, roleFilter, roleMap]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageRows = filtered.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

  return (
    <Card>
      <CardHeader>
        <CardTitle>User Profiles</CardTitle>
        <CardDescription>
          Browse and filter every registered user. {profiles ? `${filtered.length} of ${profiles.length} shown.` : ""}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <Input
            placeholder="Search name, email, location…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(0);
            }}
            className="max-w-sm"
          />
          <Select
            value={partyFilter}
            onValueChange={(v) => {
              setPartyFilter(v);
              setPage(0);
            }}
          >
            <SelectTrigger className="w-40"><SelectValue placeholder="Party" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All parties</SelectItem>
              {partyOptions.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select
            value={stateFilter}
            onValueChange={(v) => {
              setStateFilter(v);
              setPage(0);
            }}
          >
            <SelectTrigger className="w-32"><SelectValue placeholder="State" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All states</SelectItem>
              {stateOptions.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select
            value={roleFilter}
            onValueChange={(v) => {
              setRoleFilter(v);
              setPage(0);
            }}
          >
            <SelectTrigger className="w-32"><SelectValue placeholder="Role" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All roles</SelectItem>
              <SelectItem value="admin">Admins</SelectItem>
              <SelectItem value="user">Users</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <p className="text-sm text-destructive">Failed to load profiles: {(error as Error).message}</p>
        ) : (
          <>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Location</TableHead>
                    <TableHead>State</TableHead>
                    <TableHead>Party</TableHead>
                    <TableHead>Age</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Verified</TableHead>
                    <TableHead>Score</TableHead>
                    <TableHead>Joined</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pageRows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={11} className="text-center text-muted-foreground py-8">
                        No users match these filters.
                      </TableCell>
                    </TableRow>
                  ) : (
                    pageRows.map((p) => {
                      const userRoles = roleMap.get(p.id) || [];
                      const isAdmin = userRoles.includes("admin");
                      return (
                        <TableRow
                          key={p.id}
                          className="cursor-pointer"
                          onClick={() => setDetailUserId(p.id)}
                        >
                          <TableCell className="font-medium">{p.name || "—"}</TableCell>
                          <TableCell className="text-muted-foreground">{p.email || "—"}</TableCell>
                          <TableCell>{p.location || "—"}</TableCell>
                          <TableCell>{p.voter_state || "—"}</TableCell>
                          <TableCell>{p.political_party || "—"}</TableCell>
                          <TableCell>{p.age ?? "—"}</TableCell>
                          <TableCell>
                            {isAdmin ? (
                              <Badge variant="default" className="gap-1">
                                <ShieldCheck className="h-3 w-3" /> Admin
                              </Badge>
                            ) : (
                              <Badge variant="secondary">User</Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-1">
                              {p.identity_verified && (
                                <Badge variant="outline" className="gap-1 text-xs">
                                  <CheckCircle2 className="h-3 w-3" /> ID
                                </Badge>
                              )}
                              {p.voter_verified && (
                                <Badge variant="outline" className="gap-1 text-xs">
                                  <CheckCircle2 className="h-3 w-3" /> Voter
                                </Badge>
                              )}
                              {!p.identity_verified && !p.voter_verified && (
                                <span className="text-muted-foreground text-xs">—</span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>{p.overall_score?.toFixed?.(2) ?? "—"}</TableCell>
                          <TableCell className="text-muted-foreground text-xs">
                            {new Date(p.created_at).toLocaleDateString()}
                          </TableCell>
                          <TableCell className="text-right">
                            {p.id === user?.id ? (
                              <span className="text-xs text-muted-foreground">You</span>
                            ) : (
                              <Button
                                size="sm"
                                variant={isAdmin ? "outline" : "default"}
                                disabled={pendingUserId === p.id}
                                onClick={() => toggleAdmin.mutate({ userId: p.id, makeAdmin: !isAdmin })}
                                className="gap-1"
                              >
                                {pendingUserId === p.id ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : isAdmin ? (
                                  <ShieldOff className="h-3 w-3" />
                                ) : (
                                  <ShieldPlus className="h-3 w-3" />
                                )}
                                {isAdmin ? "Demote" : "Promote"}
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">
                  Page {page + 1} of {totalPages}
                </span>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                    disabled={page === 0}
                  >
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                    disabled={page >= totalPages - 1}
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
