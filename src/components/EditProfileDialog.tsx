import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { RELIGION_GROUPS } from '@/data/religionOptions';
import { Pencil } from 'lucide-react';
import { Profile } from '@/hooks/useProfile';

const POLITICAL_PARTIES = [
  'Democrat',
  'Republican',
  'Independent',
  'Libertarian',
  'Green Party',
  'Other',
  'Prefer not to say',
];

const INCOME_RANGES = [
  'Under $25,000',
  '$25,000 - $49,999',
  '$50,000 - $74,999',
  '$75,000 - $99,999',
  '$100,000 - $149,999',
  '$150,000 - $199,999',
  '$200,000+',
  'Prefer not to say',
];

const SEX_OPTIONS = [
  'Male',
  'Female',
  'Non-binary',
  'Other',
  'Prefer not to say',
];



interface EditProfileDialogProps {
  profile: Profile;
  onSave: (data: Partial<Profile>) => Promise<void>;
  isLoading?: boolean;
}

export const EditProfileDialog = ({ profile, onSave, isLoading }: EditProfileDialogProps) => {
  const [open, setOpen] = useState(false);
  const [formData, setFormData] = useState({
    name: profile.name || '',
    age: profile.age || null,
    sex: profile.sex || '',
    income: profile.income || '',
    political_party: profile.political_party || '',
    religion: profile.religion || '',
  });

  const handleOpen = (isOpen: boolean) => {
    if (isOpen) {
      // Reset form data when opening
      setFormData({
        name: profile.name || '',
        age: profile.age || null,
        sex: profile.sex || '',
        income: profile.income || '',
        political_party: profile.political_party || '',
        religion: profile.religion || '',
      });
    }
    setOpen(isOpen);
  };

  const handleSave = async () => {
    await onSave({
      name: formData.name,
      age: formData.age,
      sex: formData.sex || null,
      income: formData.income || null,
      political_party: formData.political_party || null,
      religion: formData.religion || null,
    });
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-1.5 text-xs h-7">
          <Pencil className="w-3 h-3" />
          Edit Profile
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Your Profile</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
              placeholder="Your name"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="age">Age</Label>
            <Input
              id="age"
              type="number"
              min={18}
              max={120}
              value={formData.age || ''}
              onChange={(e) => setFormData(prev => ({ 
                ...prev, 
                age: e.target.value ? parseInt(e.target.value, 10) : null 
              }))}
              placeholder="Your age"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="sex">Sex</Label>
            <Select
              value={formData.sex}
              onValueChange={(value) => setFormData(prev => ({ ...prev, sex: value }))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select your sex" />
              </SelectTrigger>
              <SelectContent>
                {SEX_OPTIONS.map((option) => (
                  <SelectItem key={option} value={option}>
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="income">Household Income</Label>
            <Select
              value={formData.income}
              onValueChange={(value) => setFormData(prev => ({ ...prev, income: value }))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select income range" />
              </SelectTrigger>
              <SelectContent>
                {INCOME_RANGES.map((range) => (
                  <SelectItem key={range} value={range}>
                    {range}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="political_party">Political Party</Label>
            <Select
              value={formData.political_party}
              onValueChange={(value) => setFormData(prev => ({ ...prev, political_party: value }))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select your party" />
              </SelectTrigger>
              <SelectContent>
                {POLITICAL_PARTIES.map((party) => (
                  <SelectItem key={party} value={party}>
                    {party}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="religion">Religion</Label>
            <Select
              value={formData.religion}
              onValueChange={(value) => setFormData(prev => ({ ...prev, religion: value }))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select your religion" />
              </SelectTrigger>
              <SelectContent className="max-h-80">
                {RELIGION_GROUPS.map((group) => (
                  <SelectGroup key={group.label}>
                    <SelectLabel>{group.label}</SelectLabel>
                    {group.options.map((option) => (
                      <SelectItem key={option} value={option}>
                        {option}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isLoading || !formData.name.trim()}>
            {isLoading ? 'Saving...' : 'Save Changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
