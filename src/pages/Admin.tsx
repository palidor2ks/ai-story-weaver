import { Suspense, lazy, useState } from "react";
import { Navigate, Link } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { useAdminRole } from "@/hooks/useAdminRole";
import { useStaticOfficials, useCreateStaticOfficial, useUpdateStaticOfficial, useDeleteStaticOfficial, StaticOfficial } from "@/hooks/useStaticOfficials";
import { useCandidateOverrides, useDeleteCandidateOverride, CandidateOverride } from "@/hooks/useCandidateOverrides";
import { Header } from "@/components/Header";
import { BackgroundProcessingProvider } from "@/context/BackgroundProcessingContext";


import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Loader2, Plus, Pencil, Trash2, Shield, Users, FileEdit, UserCheck, Building2, BarChart3, DollarSign, HelpCircle, ExternalLink, AlertTriangle, FileText, Tags, CheckCircle2, Upload, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";


// Only levels that require manual entry (no API available)
const LEVELS = [
  { value: 'federal_executive', label: 'Federal Executive (President/VP)' },
  { value: 'local', label: 'Local (Mayor, City Council, etc.)' },
];

const PARTIES = ['Democrat', 'Republican', 'Independent', 'Other'] as const;
const TIERS = ['tier_1', 'tier_2', 'tier_3'];

const AnswerCoveragePanel = lazy(() => import("@/components/admin/AnswerCoveragePanel").then((m) => ({ default: m.AnswerCoveragePanel })));
const ClaimReviewPanel = lazy(() => import("@/components/admin/ClaimReviewPanel").then((m) => ({ default: m.ClaimReviewPanel })));
const DonorAliasesPanel = lazy(() => import("@/components/admin/DonorAliasesPanel").then((m) => ({ default: m.DonorAliasesPanel })));
const VendorRefundsPanel = lazy(() => import("@/components/admin/VendorRefundsPanel").then((m) => ({ default: m.VendorRefundsPanel })));
const ScoreFixesTab = lazy(() => import("@/pages/admin/tabs/ScoreFixesTab").then((m) => ({ default: m.ScoreFixesTab })));
const HiddenStatesPanel = lazy(() => import("@/components/admin/HiddenStatesPanel").then((m) => ({ default: m.HiddenStatesPanel })));
const EvidenceReviewPanel = lazy(() => import("@/components/admin/EvidenceReviewPanel").then((m) => ({ default: m.EvidenceReviewPanel })));
const BillSummaryDashboard = lazy(() => import("@/components/admin/BillSummaryDashboard").then((m) => ({ default: m.BillSummaryDashboard })));
const PollsPanel = lazy(() => import("@/components/admin/PollsPanel").then((m) => ({ default: m.PollsPanel })));
const QuestionManagementPanel = lazy(() => import("@/components/admin/QuestionManagementPanel").then((m) => ({ default: m.QuestionManagementPanel })));
const PartyAnswersPanel = lazy(() => import("@/components/admin/PartyAnswersPanel").then((m) => ({ default: m.PartyAnswersPanel })));
const TopicReviewPanel = lazy(() => import("@/components/admin/TopicReviewPanel"));
const DonorImportPanel = lazy(() => import("@/components/admin/DonorImportPanel").then((m) => ({ default: m.DonorImportPanel })));
const BulkDonorSyncCard = lazy(() => import("@/components/admin/BulkDonorSyncCard").then((m) => ({ default: m.BulkDonorSyncCard })));
const AutomatedJobsCard = lazy(() => import("@/components/admin/AutomatedJobsCard").then((m) => ({ default: m.AutomatedJobsCard })));
const BulkCommitteeTotalsCard = lazy(() => import("@/components/admin/BulkCommitteeTotalsCard").then((m) => ({ default: m.BulkCommitteeTotalsCard })));
const BulkAnswerValidation = lazy(() => import("@/components/admin/BulkAnswerValidation").then((m) => ({ default: m.BulkAnswerValidation })));
const IndependentExpenditureImportCard = lazy(() => import("@/components/admin/IndependentExpenditureImportCard").then((m) => ({ default: m.IndependentExpenditureImportCard })));
const IndependentExpenditureImportHistory = lazy(() => import("@/components/admin/IndependentExpenditureImportHistory").then((m) => ({ default: m.IndependentExpenditureImportHistory })));
const AdminUsersPanel = lazy(() => import("@/components/admin/AdminUsersPanel").then((m) => ({ default: m.AdminUsersPanel })));
const IEExclusionsPanel = lazy(() => import("@/components/admin/IEExclusionsPanel").then((m) => ({ default: m.IEExclusionsPanel })));
const CommitteeTopicsPanel = lazy(() => import("@/components/admin/CommitteeTopicsPanel").then((m) => ({ default: m.CommitteeTopicsPanel })));
const CommitteeAliasesPanel = lazy(() => import("@/components/admin/CommitteeAliasesPanel").then((m) => ({ default: m.CommitteeAliasesPanel })));


interface OfficialFormData {
  id: string;
  name: string;
  party: 'Democrat' | 'Republican' | 'Independent' | 'Other';
  office: string;
  level: 'federal_executive' | 'state_executive' | 'state_legislative' | 'local';
  state: string;
  district: string;
  city: string;
  image_url: string;
  website_url: string;
  is_active: boolean;
  coverage_tier: string;
  confidence: string;
}

const defaultFormData: OfficialFormData = {
  id: '',
  name: '',
  party: 'Democrat',
  office: '',
  level: 'federal_executive',
  state: '',
  district: '',
  city: '',
  image_url: '',
  website_url: '',
  is_active: true,
  coverage_tier: 'tier_2',
  confidence: 'high',
};

function SectionLoader() {
  return (
    <div className="flex justify-center py-8">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );
}

export default function Admin() {
  const { user, loading: authLoading } = useAuth();
  const { data: adminData, isLoading: adminLoading } = useAdminRole();
  const [activeTab, setActiveTab] = useState("overview");
  const { data: officials, isLoading: officialsLoading } = useStaticOfficials(activeTab === "officials");
  const { data: overrides, isLoading: overridesLoading } = useCandidateOverrides(activeTab === "overrides");
  const createMutation = useCreateStaticOfficial();
  const updateMutation = useUpdateStaticOfficial();
  const deleteMutation = useDeleteStaticOfficial();
  const deleteOverrideMutation = useDeleteCandidateOverride();

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingOfficial, setEditingOfficial] = useState<StaticOfficial | null>(null);
  const [formData, setFormData] = useState<OfficialFormData>(defaultFormData);
  const [ieHistoryRefresh, setIeHistoryRefresh] = useState(0);
  const [scrapingPiscataway, setScrapingPiscataway] = useState(false);
  const queryClient = useQueryClient();

  const handleScrapePiscataway = async () => {
    setScrapingPiscataway(true);
    try {
      const { data, error } = await supabase.functions.invoke('scrape-piscataway-officials', {});
      if (error) throw error;
      const updated = data?.updated ?? 0;
      const total = data?.processed ?? 0;
      toast.success(`Piscataway: ${updated}/${total} officials refreshed`);
      queryClient.invalidateQueries({ queryKey: ['static-officials'] });
    } catch (err) {
      console.error('Error scraping Piscataway:', err);
      toast.error('Failed to refresh Piscataway officials');
    } finally {
      setScrapingPiscataway(false);
    }
  };

  // Loading states
  if (authLoading || adminLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Auth guard
  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  // Admin guard
  if (!adminData?.isAdmin) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="container mx-auto px-4 py-8">
          <Card className="max-w-md mx-auto">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-destructive">
                <Shield className="h-6 w-6" />
                Access Denied
              </CardTitle>
              <CardDescription>
                You don't have permission to access this page. Admin privileges are required.
              </CardDescription>
            </CardHeader>
          </Card>
        </main>
      </div>
    );
  }

  const handleOpenCreate = () => {
    setEditingOfficial(null);
    setFormData(defaultFormData);
    setIsDialogOpen(true);
  };

  const handleOpenEdit = (official: StaticOfficial) => {
    setEditingOfficial(official);
    setFormData({
      id: official.id,
      name: official.name,
      party: official.party,
      office: official.office,
      level: official.level,
      state: official.state,
      district: official.district || '',
      city: official.city || '',
      image_url: official.image_url || '',
      website_url: official.website_url || '',
      is_active: official.is_active,
      coverage_tier: official.coverage_tier,
      confidence: official.confidence,
    });
    setIsDialogOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const officialData = {
      ...formData,
      district: formData.district || undefined,
      city: formData.city || undefined,
      image_url: formData.image_url || undefined,
      website_url: formData.website_url || undefined,
    };

    if (editingOfficial) {
      await updateMutation.mutateAsync(officialData);
    } else {
      await createMutation.mutateAsync(officialData);
    }
    
    setIsDialogOpen(false);
    setFormData(defaultFormData);
    setEditingOfficial(null);
  };

  const handleDelete = async (id: string) => {
    await deleteMutation.mutateAsync(id);
  };

  const handleDeleteOverride = async (candidateId: string) => {
    await deleteOverrideMutation.mutateAsync(candidateId);
  };

  const getOverriddenFields = (override: CandidateOverride): string[] => {
    const fields: string[] = [];
    if (override.name) fields.push('name');
    if (override.party) fields.push('party');
    if (override.office) fields.push('office');
    if (override.state) fields.push('state');
    if (override.district) fields.push('district');
    if (override.image_url) fields.push('image');
    if (override.overall_score !== null) fields.push('score');
    if (override.coverage_tier) fields.push('tier');
    if (override.confidence) fields.push('confidence');
    return fields;
  };

  const getPartyColor = (party: string) => {
    switch (party) {
      case 'Democrat': return 'bg-flag-blue text-white';
      case 'Republican': return 'bg-flag-red text-white';
      case 'Independent': return 'bg-purple-600 text-white';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  const getLevelLabel = (level: string) => {
    return LEVELS.find(l => l.value === level)?.label || level;
  };

  return (
    <BackgroundProcessingProvider>
    <div className="min-h-screen bg-background">
      <Header />
      
      <main className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2">
              <Users className="h-8 w-8 text-primary" />
              Admin Console
            </h1>
            <p className="text-muted-foreground mt-1">
              Select one section at a time so charts, review queues, and imports only load when needed.
            </p>
          </div>
          
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            {activeTab === "officials" && (
              <DialogTrigger asChild>
                <Button onClick={handleOpenCreate}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Official
                </Button>
              </DialogTrigger>
            )}
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>
                  {editingOfficial ? 'Edit Official' : 'Add New Official'}
                </DialogTitle>
                <DialogDescription>
                  {editingOfficial ? 'Update the politician\'s information.' : 'Enter the politician\'s details to add them to the database.'}
                </DialogDescription>
              </DialogHeader>
              
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="id">ID (unique)</Label>
                    <Input
                      id="id"
                      value={formData.id}
                      onChange={(e) => setFormData({ ...formData, id: e.target.value })}
                      placeholder="e.g., gov_ca_newsom"
                      required
                      disabled={!!editingOfficial}
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="name">Full Name</Label>
                    <Input
                      id="name"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      placeholder="e.g., Gavin Newsom"
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="party">Party</Label>
                    <Select
                      value={formData.party}
                      onValueChange={(value) => setFormData({ ...formData, party: value as typeof formData.party })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PARTIES.map((party) => (
                          <SelectItem key={party} value={party}>{party}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="level">Level</Label>
                    <Select
                      value={formData.level}
                      onValueChange={(value) => setFormData({ ...formData, level: value as typeof formData.level })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {LEVELS.map((level) => (
                          <SelectItem key={level.value} value={level.value}>{level.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="office">Office</Label>
                    <Input
                      id="office"
                      value={formData.office}
                      onChange={(e) => setFormData({ ...formData, office: e.target.value })}
                      placeholder="e.g., Governor"
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="state">State</Label>
                    <Input
                      id="state"
                      value={formData.state}
                      onChange={(e) => setFormData({ ...formData, state: e.target.value.toUpperCase() })}
                      placeholder="e.g., CA or US"
                      maxLength={2}
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="district">District (optional)</Label>
                    <Input
                      id="district"
                      value={formData.district}
                      onChange={(e) => setFormData({ ...formData, district: e.target.value })}
                      placeholder="e.g., CA-12"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="city">City (required for Mayor / local)</Label>
                    <Input
                      id="city"
                      value={formData.city}
                      onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                      placeholder="e.g., Newark"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="image_url">Image URL (optional)</Label>
                  <Input
                    id="image_url"
                    type="url"
                    value={formData.image_url}
                    onChange={(e) => setFormData({ ...formData, image_url: e.target.value })}
                    placeholder="https://..."
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="website_url">Website URL (optional)</Label>
                  <Input
                    id="website_url"
                    type="url"
                    value={formData.website_url}
                    onChange={(e) => setFormData({ ...formData, website_url: e.target.value })}
                    placeholder="https://..."
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="coverage_tier">Coverage Tier</Label>
                    <Select
                      value={formData.coverage_tier}
                      onValueChange={(value) => setFormData({ ...formData, coverage_tier: value })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {TIERS.map((tier) => (
                          <SelectItem key={tier} value={tier}>{tier}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="confidence">Confidence</Label>
                    <Select
                      value={formData.confidence}
                      onValueChange={(value) => setFormData({ ...formData, confidence: value })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="high">High</SelectItem>
                        <SelectItem value="medium">Medium</SelectItem>
                        <SelectItem value="low">Low</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  <Switch
                    id="is_active"
                    checked={formData.is_active}
                    onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
                  />
                  <Label htmlFor="is_active">Active (visible to users)</Label>
                </div>

                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
                    {(createMutation.isPending || updateMutation.isPending) && (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    )}
                    {editingOfficial ? 'Update' : 'Create'}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <div className="mb-4">
          <Button asChild variant="outline" size="sm">
            <Link to="/admin/x-composer">Post to X</Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link to="/admin/social-composer">Social composer</Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link to="/admin/social-handles">Social handles</Link>
          </Button>
          <Button asChild variant="default" size="sm">
            <Link to="/admin/social-posts">Daily Social Posts</Link>
          </Button>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          {(() => {
            const ADMIN_TABS = [
              { value: "overview", label: "Overview", Icon: Shield },
              { value: "coverage", label: "Answer Coverage", Icon: BarChart3 },
              { value: "officials", label: "Static Officials", Icon: Users },
              { value: "overrides", label: "Overrides", Icon: FileEdit },
              { value: "claims", label: "Claims", Icon: UserCheck },
              { value: "parties", label: "Party Answers", Icon: Building2 },
              { value: "scores", label: "Score Fixes", Icon: BarChart3 },
              { value: "donor-aliases", label: "Donor Entity Resolution", Icon: DollarSign },
              { value: "questions", label: "Questions", Icon: HelpCircle },
              { value: "evidence", label: "Evidence Review", Icon: AlertTriangle },
              { value: "voting-records", label: "Voting Records", Icon: FileText },
              { value: "topic-review", label: "Topic Review", Icon: Tags },
              { value: "bulk-validation", label: "Bulk Validation", Icon: CheckCircle2 },
              { value: "donor-import", label: "Imports & Jobs", Icon: Upload },
              { value: "polls", label: "Polls", Icon: Sparkles },
              { value: "ie-exclusions", label: "IE Exclusions", Icon: AlertTriangle },
              { value: "committee-topics", label: "Committee Topics", Icon: Tags },
              { value: "committee-aliases", label: "Spender Aliases", Icon: Tags },
              { value: "visible-states", label: "Visible States", Icon: Shield },
              { value: "users", label: "Users", Icon: Users },
            ];
            return (
              <div className="mb-6 max-w-xs">
                <Select value={activeTab} onValueChange={setActiveTab}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a section" />
                  </SelectTrigger>
                  <SelectContent>
                    {ADMIN_TABS.map(({ value, label, Icon }) => (
                      <SelectItem key={value} value={value}>
                        <span className="flex items-center gap-2">
                          <Icon className="h-4 w-4" />
                          {label}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            );
          })()}

          <TabsContent value="overview">
            <Card>
              <CardHeader>
                <CardTitle>Admin sections</CardTitle>
                <CardDescription>
                  Choose a section from the dropdown above. Expensive charts, imports, and review queues stay unloaded until you open their section.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 text-sm text-muted-foreground">
                <div>
                  <p className="font-medium text-foreground">Consolidated areas</p>
                  <ul className="mt-2 list-disc space-y-1 pl-5">
                    <li><span className="font-medium text-foreground">Donor Entity Resolution</span> groups donor aliases and vendor refunds because both clean donor-facing finance lists.</li>
                    <li><span className="font-medium text-foreground">Donor Import</span> groups scheduled jobs, bulk syncs, committee totals, independent expenditures, history, and manual imports.</li>
                    <li><span className="font-medium text-foreground">Committee Topics</span> and <span className="font-medium text-foreground">Spender Aliases</span> stay separate but next to related committee data sections in the dropdown.</li>
                  </ul>
                </div>
                <div>
                  <p className="font-medium text-foreground">Reduced redundancy</p>
                  <p className="mt-2">The old always-visible answer coverage panel has moved into its own dropdown section, so the admin landing page no longer loads charts or large data by default.</p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="coverage">
            <Suspense fallback={<SectionLoader />}><AnswerCoveragePanel /></Suspense>
          </TabsContent>

          <TabsContent value="visible-states">
            <Suspense fallback={<SectionLoader />}><HiddenStatesPanel /></Suspense>
          </TabsContent>

          <TabsContent value="users">
            <Suspense fallback={<SectionLoader />}><AdminUsersPanel /></Suspense>
          </TabsContent>

          <TabsContent value="officials">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <CardTitle>Manual Entry Officials</CardTitle>
                    <CardDescription>
                      Officials without API coverage: President, Vice President, and local officials
                    </CardDescription>
                  </div>
                  <Button
                    onClick={handleScrapePiscataway}
                    disabled={scrapingPiscataway}
                    variant="outline"
                    size="sm"
                    className="gap-2 shrink-0"
                  >
                    {scrapingPiscataway ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                    Refresh Piscataway
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {officialsLoading ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  </div>
                ) : officials && officials.length > 0 ? (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Name</TableHead>
                          <TableHead>Office</TableHead>
                          <TableHead>Level</TableHead>
                          <TableHead>Party</TableHead>
                          <TableHead>State</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {officials.map((official) => (
                          <TableRow key={official.id}>
                            <TableCell className="font-medium">{official.name}</TableCell>
                            <TableCell>{official.office}</TableCell>
                            <TableCell>
                              <Badge variant="outline">{getLevelLabel(official.level)}</Badge>
                            </TableCell>
                            <TableCell>
                              <Badge className={getPartyColor(official.party)}>{official.party}</Badge>
                            </TableCell>
                            <TableCell>{official.state}</TableCell>
                            <TableCell>
                              <Badge variant={official.is_active ? "default" : "secondary"}>
                                {official.is_active ? 'Active' : 'Inactive'}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-2">
                                <Button variant="ghost" size="icon" onClick={() => handleOpenEdit(official)}>
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                <AlertDialog>
                                  <AlertDialogTrigger asChild>
                                    <Button variant="ghost" size="icon" className="text-destructive">
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  </AlertDialogTrigger>
                                  <AlertDialogContent>
                                    <AlertDialogHeader>
                                      <AlertDialogTitle>Delete {official.name}?</AlertDialogTitle>
                                      <AlertDialogDescription>
                                        This action cannot be undone.
                                      </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                                      <AlertDialogAction onClick={() => handleDelete(official.id)} className="bg-destructive text-destructive-foreground">
                                        Delete
                                      </AlertDialogAction>
                                    </AlertDialogFooter>
                                  </AlertDialogContent>
                                </AlertDialog>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    No static officials yet. Click "Add Official" to create one.
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="overrides">
            <Card>
              <CardHeader>
                <CardTitle>Candidate Overrides</CardTitle>
                <CardDescription>
                  Admin overrides for candidate data. These take priority over API data.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {overridesLoading ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  </div>
                ) : overrides && overrides.length > 0 ? (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Candidate</TableHead>
                          <TableHead>Overridden Fields</TableHead>
                          <TableHead>Notes</TableHead>
                          <TableHead>Updated</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {overrides.map((override) => (
                          <TableRow key={override.id}>
                            <TableCell className="font-medium">
                              <Link to={`/candidate/${override.candidate_id}`} className="hover:underline flex items-center gap-1">
                                {override.name || override.candidate_id}
                                <ExternalLink className="h-3 w-3" />
                              </Link>
                            </TableCell>
                            <TableCell>
                              <div className="flex flex-wrap gap-1">
                                {getOverriddenFields(override).map((field) => (
                                  <Badge key={field} variant="secondary" className="text-xs">{field}</Badge>
                                ))}
                              </div>
                            </TableCell>
                            <TableCell className="max-w-[200px] truncate text-muted-foreground">
                              {override.notes || '-'}
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {new Date(override.updated_at).toLocaleDateString()}
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-2">
                                <Link to={`/candidate/${override.candidate_id}`}>
                                  <Button variant="ghost" size="icon">
                                    <Pencil className="h-4 w-4" />
                                  </Button>
                                </Link>
                                <AlertDialog>
                                  <AlertDialogTrigger asChild>
                                    <Button variant="ghost" size="icon" className="text-destructive">
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  </AlertDialogTrigger>
                                  <AlertDialogContent>
                                    <AlertDialogHeader>
                                      <AlertDialogTitle>Delete override?</AlertDialogTitle>
                                      <AlertDialogDescription>
                                        This will revert to the original API data.
                                      </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                                      <AlertDialogAction onClick={() => handleDeleteOverride(override.candidate_id)} className="bg-destructive text-destructive-foreground">
                                        Delete
                                      </AlertDialogAction>
                                    </AlertDialogFooter>
                                  </AlertDialogContent>
                                </AlertDialog>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    No overrides yet. Edit a candidate profile to create one.
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="claims">
            <Suspense fallback={<SectionLoader />}><ClaimReviewPanel /></Suspense>
          </TabsContent>

          <TabsContent value="parties">
            <Suspense fallback={<SectionLoader />}><PartyAnswersPanel /></Suspense>
          </TabsContent>


          {/* Score Fixes - lazy loaded only when tab is active */}
          <TabsContent value="scores">
            {activeTab === 'scores' && <Suspense fallback={<SectionLoader />}><ScoreFixesTab /></Suspense>}
          </TabsContent>

          {/* Donor Aliases Tab */}
          <TabsContent value="donor-aliases">
            <Card>
              <CardHeader>
                <CardTitle>Donor Entity Resolution</CardTitle>
                <CardDescription>
                  Manage alias patterns to consolidate donors with similar names. 
                  Changes apply across the entire platform when users enable the "consolidated view" on the Donors page.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Suspense fallback={<SectionLoader />}><DonorAliasesPanel /></Suspense>
              </CardContent>
            </Card>
            <Card className="mt-4">
              <CardHeader>
                <CardTitle>Vendor Refunds</CardTitle>
                <CardDescription>
                  Hide media buyers, ad agencies, and consulting firms (e.g. Waterfront Strategies, GMMB) from donor lists.
                  Their refunds are recorded as Schedule A receipts but aren't real contributions.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Suspense fallback={<SectionLoader />}><VendorRefundsPanel /></Suspense>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="questions">
            <Suspense fallback={<SectionLoader />}><QuestionManagementPanel /></Suspense>
          </TabsContent>

          <TabsContent value="evidence">
            <Suspense fallback={<SectionLoader />}><EvidenceReviewPanel /></Suspense>
          </TabsContent>

          <TabsContent value="voting-records">
            <Suspense fallback={<SectionLoader />}><BillSummaryDashboard /></Suspense>
          </TabsContent>

          <TabsContent value="topic-review">
            <Suspense fallback={<SectionLoader />}><TopicReviewPanel /></Suspense>
          </TabsContent>

          <TabsContent value="bulk-validation">
            <Suspense fallback={<SectionLoader />}><BulkAnswerValidation /></Suspense>
          </TabsContent>

          <TabsContent value="donor-import" className="space-y-6">
            <Suspense fallback={<SectionLoader />}>
              <AutomatedJobsCard />
              <BulkDonorSyncCard />
              <BulkCommitteeTotalsCard />
              <IndependentExpenditureImportCard onImportComplete={() => setIeHistoryRefresh(k => k + 1)} />
              <IndependentExpenditureImportHistory refreshKey={ieHistoryRefresh} />
              <DonorImportPanel />
            </Suspense>
          </TabsContent>

          <TabsContent value="polls">
            <Suspense fallback={<SectionLoader />}><PollsPanel /></Suspense>
          </TabsContent>

          <TabsContent value="ie-exclusions">
            <Suspense fallback={<SectionLoader />}><IEExclusionsPanel /></Suspense>
          </TabsContent>

          <TabsContent value="committee-topics">
            <Suspense fallback={<SectionLoader />}><CommitteeTopicsPanel /></Suspense>
          </TabsContent>

          <TabsContent value="committee-aliases">
            <Suspense fallback={<SectionLoader />}><CommitteeAliasesPanel /></Suspense>
          </TabsContent>




        </Tabs>
      </main>
    </div>
    </BackgroundProcessingProvider>
  );
}
