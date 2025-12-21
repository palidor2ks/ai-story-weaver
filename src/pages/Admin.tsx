import { useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { useAdminRole } from "@/hooks/useAdminRole";
import { useStaticOfficials, useCreateStaticOfficial, useUpdateStaticOfficial, useDeleteStaticOfficial, StaticOfficial } from "@/hooks/useStaticOfficials";
import { Header } from "@/components/Header";
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
import { Loader2, Plus, Pencil, Trash2, Shield, Users } from "lucide-react";

const LEVELS = [
  { value: 'federal_executive', label: 'Federal Executive' },
  { value: 'state_executive', label: 'State Executive' },
  { value: 'state_legislative', label: 'State Legislative' },
  { value: 'local', label: 'Local' },
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
  const createMutation = useCreateStaticOfficial();
  const updateMutation = useUpdateStaticOfficial();
  const deleteMutation = useDeleteStaticOfficial();

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingOfficial, setEditingOfficial] = useState<StaticOfficial | null>(null);
  const [formData, setFormData] = useState<OfficialFormData>(defaultFormData);

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
              Add and manage static politician data (executives, governors, etc.)
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

        <Card>
          <CardHeader>
            <CardTitle>Static Officials</CardTitle>
            <CardDescription>
              Politicians managed manually (not from Congress.gov API)
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
                          <Badge className={getPartyColor(official.party)}>
                            {official.party}
                          </Badge>
                        </TableCell>
                        <TableCell>{official.state}</TableCell>
                        <TableCell>
                          <Badge variant={official.is_active ? "default" : "secondary"}>
                            {official.is_active ? 'Active' : 'Inactive'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleOpenEdit(official)}
                            >
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
                                    This action cannot be undone. This will permanently delete the official from the database.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={() => handleDelete(official.id)}
                                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                  >
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
      </main>
    </div>
  );
}
