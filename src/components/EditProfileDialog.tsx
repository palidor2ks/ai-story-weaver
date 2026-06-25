import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
import { logBadgeEvent } from '@/lib/badges';

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
  'Under $50,000',
  '$50,000 - $100,000',
  '$100,000 - $200,000',
  '$200,000 - $500,000',
  '$500,000 - $1M',
  '$1M - $5M',
  '$5M - $20M',
  '$20M - $100M',
  'Over $100M',
  'Prefer not to say',
];

const EMPLOYMENT_STATUSES = [
  'Self-employed',
  'Employed (1 job)',
  'Employed (multiple jobs)',
  'Part-time employed',
  'Student',
  'Prefer not to say',
];

const SEX_OPTIONS = [
  'Male',
  'Female',
  'Non-binary',
  'Other',
  'Prefer not to say',
];

const EDUCATION_LEVELS = [
  'Less than high school',
  'High school diploma or GED',
  'Some college',
  'Associate degree',
  "Bachelor's degree",
  "Master's degree",
  'Doctorate or professional degree',
  'Prefer not to say',
];

const RACE_OPTIONS = [
  'American Indian or Alaska Native',
  'Asian',
  'Black or African American',
  'Hispanic or Latino',
  'Middle Eastern or North African',
  'Native Hawaiian or Other Pacific Islander',
  'White',
  'Multiracial',
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
    employment_status: profile.employment_status || '',
    political_party: profile.political_party || '',
    religion: profile.religion || '',
    education_level: profile.education_level || '',
    race: profile.race || '',
  });

  const handleOpen = (isOpen: boolean) => {
    if (isOpen) {
      // Reset form data when opening
      setFormData({
        name: profile.name || '',
        age: profile.age || null,
        sex: profile.sex || '',
        income: profile.income || '',
        employment_status: profile.employment_status || '',
        political_party: profile.political_party || '',
        religion: profile.religion || '',
        education_level: profile.education_level || '',
        race: profile.race || '',
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
      employment_status: formData.employment_status || null,
      political_party: formData.political_party || null,
      religion: formData.religion || null,
      education_level: formData.education_level || null,
      race: formData.race || null,
    });
    logBadgeEvent('demographics_updated');
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
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-hidden flex flex-col bg-white rounded-2xl p-0 border-0 gap-0">
        <DialogHeader className="bg-poli-surface px-5 pt-5 pb-4 flex-shrink-0">
          <p className="font-mono-label text-xs font-bold text-poli-red uppercase tracking-widest mb-1">
            Edit Profile
          </p>
          <DialogTitle className="text-lg font-black text-poli-navy">
            Your Profile
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 px-5 py-4 overflow-y-auto pr-1">
          <div className="space-y-2">
            <Label htmlFor="name" className="text-sm font-semibold text-poli-body">Name</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
              placeholder="Your name"
              className="border border-poli-surface rounded-xl h-12 px-4 w-full text-sm text-poli-body focus:ring-1 focus:ring-poli-navy"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="age" className="text-sm font-semibold text-poli-body">Age</Label>
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
              className="border border-poli-surface rounded-xl h-12 px-4 w-full text-sm text-poli-body focus:ring-1 focus:ring-poli-navy"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="sex" className="text-sm font-semibold text-poli-body">Sex</Label>
            <Select
              value={formData.sex}
              onValueChange={(value) => setFormData(prev => ({ ...prev, sex: value }))}
            >
              <SelectTrigger className="border border-poli-surface rounded-xl h-12 px-4 text-sm text-poli-body focus:ring-1 focus:ring-poli-navy">
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
            <Label htmlFor="income" className="text-sm font-semibold text-poli-body">Household Income</Label>
            <Select
              value={formData.income}
              onValueChange={(value) => setFormData(prev => ({ ...prev, income: value }))}
            >
              <SelectTrigger className="border border-poli-surface rounded-xl h-12 px-4 text-sm text-poli-body focus:ring-1 focus:ring-poli-navy">
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
            <Label htmlFor="employment_status" className="text-sm font-semibold text-poli-body">Employment Status</Label>
            <Select
              value={formData.employment_status}
              onValueChange={(value) => setFormData(prev => ({ ...prev, employment_status: value }))}
            >
              <SelectTrigger className="border border-poli-surface rounded-xl h-12 px-4 text-sm text-poli-body focus:ring-1 focus:ring-poli-navy">
                <SelectValue placeholder="Select employment status" />
              </SelectTrigger>
              <SelectContent>
                {EMPLOYMENT_STATUSES.map((status) => (
                  <SelectItem key={status} value={status}>
                    {status}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="political_party" className="text-sm font-semibold text-poli-body">Political Party</Label>
            <Select
              value={formData.political_party}
              onValueChange={(value) => setFormData(prev => ({ ...prev, political_party: value }))}
            >
              <SelectTrigger className="border border-poli-surface rounded-xl h-12 px-4 text-sm text-poli-body focus:ring-1 focus:ring-poli-navy">
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
            <Label htmlFor="education_level" className="text-sm font-semibold text-poli-body">Education Level</Label>
            <Select
              value={formData.education_level}
              onValueChange={(value) => setFormData(prev => ({ ...prev, education_level: value }))}
            >
              <SelectTrigger className="border border-poli-surface rounded-xl h-12 px-4 text-sm text-poli-body focus:ring-1 focus:ring-poli-navy">
                <SelectValue placeholder="Select your education level" />
              </SelectTrigger>
              <SelectContent>
                {EDUCATION_LEVELS.map((option) => (
                  <SelectItem key={option} value={option}>
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="race" className="text-sm font-semibold text-poli-body">Race</Label>
            <Select
              value={formData.race}
              onValueChange={(value) => setFormData(prev => ({ ...prev, race: value }))}
            >
              <SelectTrigger className="border border-poli-surface rounded-xl h-12 px-4 text-sm text-poli-body focus:ring-1 focus:ring-poli-navy">
                <SelectValue placeholder="Select your race" />
              </SelectTrigger>
              <SelectContent>
                {RACE_OPTIONS.map((option) => (
                  <SelectItem key={option} value={option}>
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="religion" className="text-sm font-semibold text-poli-body">Religion</Label>
            <Select
              value={formData.religion}
              onValueChange={(value) => setFormData(prev => ({ ...prev, religion: value }))}
            >
              <SelectTrigger className="border border-poli-surface rounded-xl h-12 px-4 text-sm text-poli-body focus:ring-1 focus:ring-poli-navy">
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

        <div className="flex flex-col gap-2 px-5 pb-5 pt-3 border-t border-poli-surface flex-shrink-0">
          <button
            type="button"
            onClick={handleSave}
            disabled={isLoading || !formData.name.trim()}
            className="w-full h-12 rounded-xl font-bold text-white text-sm flex items-center justify-center disabled:opacity-60"
            style={{ background: 'linear-gradient(90deg, #182B7A, #B3122F)' }}
          >
            {isLoading ? 'Saving...' : 'Save Changes'}
          </button>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="text-sm text-poli-muted underline text-center py-1"
          >
            Cancel
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
