import { useState } from "react";
import { Navigate, Link } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { useAdminRole } from "@/hooks/useAdminRole";
import { useStaticOfficials, useCreateStaticOfficial, useUpdateStaticOfficial, useDeleteStaticOfficial, StaticOfficial } from "@/hooks/useStaticOfficials";
import { useCandidateOverrides, useDeleteCandidateOverride, CandidateOverride } from "@/hooks/useCandidateOverrides";
import { Header } from "@/components/Header";
import { AnswerCoveragePanel } from "@/components/admin/AnswerCoveragePanel";
import { ClaimReviewPanel } from "@/components/admin/ClaimReviewPanel";
import { DonorAliasesPanel } from "@/components/admin/DonorAliasesPanel";
import { ScoreFixesTab } from "@/pages/admin/tabs/ScoreFixesTab";
import { BillSummaryDashboard } from "@/components/admin/BillSummaryDashboard";
import { HiddenStatesPanel } from "@/components/admin/HiddenStatesPanel";
import { BackgroundProcessingProvider } from "@/context/BackgroundProcessingContext";


import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Plus, Pencil, Trash2, Shield, Users, FileEdit, UserCheck, Building2, BarChart3, DollarSign, HelpCircle, ExternalLink, AlertTriangle, FileText, Tags, CheckCircle2, Upload } from "lucide-react";
import { QuestionManagementPanel } from "@/components/admin/QuestionManagementPanel";
import { PartyAnswersPanel } from "@/components/admin/PartyAnswersPanel";
import { EvidenceReviewPanel } from "@/components/admin/EvidenceReviewPanel";
import TopicReviewPanel from "@/components/admin/TopicReviewPanel";
import { DonorImportPanel } from "@/components/admin/DonorImportPanel";
import { BulkAnswerValidation } from "@/components/admin/BulkAnswerValidation";


// Only levels that require manual entry (no API available)
const LEVELS = [
  { value: 'federal_executive', label: 'Federal Executive (President/VP)' },
  { value: 'local', label: 'Local (Mayor, City Council, etc.)' },
];

const PARTIES = ['Democrat', 'Republican', 'Independent', 'Other'] as const;
const TIERS = ['tier_1', 'tier_2', 'tier_3'];

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

export default function Admin() {
  const { user, loading: authLoading } = useAuth();
  const { data: adminData, isLoading: adminLoading } = useAdminRole();
  const { data: officials, isLoading: officialsLoading } = useStaticOfficials();
  const { data: overrides, isLoading: overridesLoading } = useCandidateOverrides();
  const createMutation = useCreateStaticOfficial();
  const updateMutation = useUpdateStaticOfficial();
  const deleteMutation = useDeleteStaticOfficial();
  const deleteOverrideMutation = useDeleteCandidateOverride();

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingOfficial, setEditingOfficial] = useState<StaticOfficial | null>(null);
  const [formData, setFormData] = useState<OfficialFormData>(defaultFormData);
  const [activeTab, setActiveTab] = useState("officials");

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
              Manage Politicians
            </h1>
            <p className="text-muted-foreground mt-1">
              Manage officials without API coverage (President/VP, local officials)
            </p>
            <p className="text-sm text-muted-foreground mt-0.5">
              Note: State legislators and governors are fetched automatically from Open States API
            </p>
          </div>
          
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={handleOpenCreate}>
                <Plus className="h-4 w-4 mr-2" />
                Add Official
              </Button>
            </DialogTrigger>
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

        <AnswerCoveragePanel />

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="mb-6">
            <TabsTrigger value="officials" className="gap-2">
              <Users className="h-4 w-4" />
              Static Officials
            </TabsTrigger>
            <TabsTrigger value="overrides" className="gap-2">
              <FileEdit className="h-4 w-4" />
              Overrides ({overrides?.length || 0})
            </TabsTrigger>
            <TabsTrigger value="claims" className="gap-2">
              <UserCheck className="h-4 w-4" />
              Claims
            </TabsTrigger>
            <TabsTrigger value="parties" className="gap-2">
              <Building2 className="h-4 w-4" />
              Party Answers
            </TabsTrigger>
            <TabsTrigger value="scores" className="gap-2">
              <BarChart3 className="h-4 w-4" />
              Score Fixes
            </TabsTrigger>
            <TabsTrigger value="donor-aliases" className="gap-2">
              <DollarSign className="h-4 w-4" />
              Donor Aliases
            </TabsTrigger>
            <TabsTrigger value="questions" className="gap-2">
              <HelpCircle className="h-4 w-4" />
              Questions
            </TabsTrigger>
            <TabsTrigger value="evidence" className="gap-2">
              <AlertTriangle className="h-4 w-4" />
              Evidence Review
            </TabsTrigger>
            <TabsTrigger value="voting-records" className="gap-2">
              <FileText className="h-4 w-4" />
              Voting Records
            </TabsTrigger>
            <TabsTrigger value="topic-review" className="gap-2">
              <Tags className="h-4 w-4" />
              Topic Review
            </TabsTrigger>
            <TabsTrigger value="bulk-validation" className="gap-2">
              <CheckCircle2 className="h-4 w-4" />
              Bulk Validation
            </TabsTrigger>
            <TabsTrigger value="donor-import" className="gap-2">
              <Upload className="h-4 w-4" />
              Donor Import
            </TabsTrigger>
            <TabsTrigger value="visible-states" className="gap-2">
              <Shield className="h-4 w-4" />
              Visible States
            </TabsTrigger>
          </TabsList>

          <TabsContent value="visible-states">
            <HiddenStatesPanel />
          </TabsContent>

          <TabsContent value="officials">
            <Card>
              <CardHeader>
                <CardTitle>Manual Entry Officials</CardTitle>
                <CardDescription>
                  Officials without API coverage: President, Vice President, and local officials
                </CardDescription>
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
            <ClaimReviewPanel />
          </TabsContent>

          <TabsContent value="parties">
            <PartyAnswersPanel />
          </TabsContent>


          {/* Score Fixes - lazy loaded only when tab is active */}
          <TabsContent value="scores">
            {activeTab === 'scores' && <ScoreFixesTab />}
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
                <DonorAliasesPanel />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="questions">
            <QuestionManagementPanel />
          </TabsContent>

          <TabsContent value="evidence">
            <EvidenceReviewPanel />
          </TabsContent>

          <TabsContent value="voting-records">
            <BillSummaryDashboard />
          </TabsContent>

          <TabsContent value="topic-review">
            <TopicReviewPanel />
          </TabsContent>

          <TabsContent value="bulk-validation">
            <BulkAnswerValidation />
          </TabsContent>

          <TabsContent value="donor-import">
            <DonorImportPanel />
          </TabsContent>

        </Tabs>
      </main>
    </div>
    </BackgroundProcessingProvider>
  );
}
