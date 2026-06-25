import { useState } from 'react';
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
import { ArrowRight, ArrowLeft, User, Info } from 'lucide-react';
import { AddressAutocomplete } from '@/components/AddressAutocomplete';
import { useHiddenStates } from '@/hooks/useHiddenStates';

export interface DemographicsData {
  address: string;
  political_party: string;
  age: number | null;
  income: string;
  employment_status: string;
  sex: string;
  religion: string;
  education_level: string;
  race: string;
}

interface DemographicsFormProps {
  initialData?: Partial<DemographicsData>;
  onSubmit: (data: DemographicsData) => void;
  onBack: () => void;
  isLoading?: boolean;
}

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

export const DemographicsForm = ({
  initialData,
  onSubmit,
  onBack,
  isLoading = false,
}: DemographicsFormProps) => {
  const [formData, setFormData] = useState<DemographicsData>({
    address: initialData?.address || '',
    political_party: initialData?.political_party || '',
    age: initialData?.age || null,
    income: initialData?.income || '',
    employment_status: initialData?.employment_status || '',
    sex: initialData?.sex || '',
    religion: initialData?.religion || '',
    education_level: initialData?.education_level || '',
    race: initialData?.race || '',
  });

  const [addressState, setAddressState] = useState<{ code: string; name: string } | null>(null);
  const [addressVerified, setAddressVerified] = useState(false);
  const { isHidden } = useHiddenStates();
  const stateNotSupported = addressState ? isHidden(addressState.code) : false;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(formData);
  };

  const isFormValid = addressVerified && formData.address && formData.political_party && formData.age && formData.income && formData.employment_status && formData.sex && formData.religion && formData.education_level && formData.race;

  return (
    <div className="max-w-xl mx-auto animate-fade-in">
      <div className="text-center mb-8">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-poli-navy to-[#B3122F] mx-auto mb-6 flex items-center justify-center shadow-lg">
          <User className="w-8 h-8 text-white" />
        </div>
        <h2 className="font-display text-3xl font-bold text-poli-navy mb-3">
          Tell us about yourself
        </h2>
        <p className="text-poli-muted">
          This helps us personalize your experience and provide better matches.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="bg-white rounded-2xl border border-[rgba(20,23,58,0.1)] p-6 space-y-5">
          <div className="space-y-2">
            <Label htmlFor="address" className="text-poli-body">
              Address / Location
            </Label>
            <AddressAutocomplete
              id="address"
              value={formData.address}
              onChange={(value) => setFormData(prev => ({ ...prev, address: value }))}
              onAddressSelect={(details) => {
                setFormData(prev => ({ ...prev, address: details.formattedAddress }));
                setAddressState({ code: details.state, name: details.stateFull || details.state });
              }}
              onValidationChange={setAddressVerified}
              placeholder="Start typing your address..."
              className="bg-background"
            />
            {stateNotSupported && (
              <div className="flex gap-2 rounded-lg border border-border bg-muted/50 p-3 text-sm text-poli-body">
                <Info className="w-4 h-4 mt-0.5 shrink-0 text-poli-navy" />
                <p>
                  <span className="font-medium">{addressState?.name}</span> isn't fully covered yet — you'll still see your federal officials and members of Congress. We're actively adding more states and will expand to yours soon.
                </p>
              </div>
            )}
            <p className="text-xs text-poli-muted">
              Used to show candidates in your area
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="political_party" className="text-poli-body">
              Political Party Affiliation
            </Label>
            <Select
              value={formData.political_party}
              onValueChange={(value) => setFormData(prev => ({ ...prev, political_party: value }))}
            >
              <SelectTrigger className="bg-background">
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
            <Label htmlFor="age" className="text-poli-body">
              Age
            </Label>
            <Input
              id="age"
              type="number"
              min={18}
              max={120}
              placeholder="Enter your age"
              value={formData.age || ''}
              onChange={(e) => setFormData(prev => ({ 
                ...prev, 
                age: e.target.value ? parseInt(e.target.value, 10) : null 
              }))}
              className="bg-background"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="income" className="text-poli-body">
              Household Income
            </Label>
            <Select
              value={formData.income}
              onValueChange={(value) => setFormData(prev => ({ ...prev, income: value }))}
            >
              <SelectTrigger className="bg-background">
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
            <Label htmlFor="employment_status" className="text-poli-body">
              Employment Status
            </Label>
            <Select
              value={formData.employment_status}
              onValueChange={(value) => setFormData(prev => ({ ...prev, employment_status: value }))}
            >
              <SelectTrigger className="bg-background">
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
            <Label htmlFor="sex" className="text-poli-body">
              Sex
            </Label>
            <Select
              value={formData.sex}
              onValueChange={(value) => setFormData(prev => ({ ...prev, sex: value }))}
            >
              <SelectTrigger className="bg-background">
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
            <Label htmlFor="education_level" className="text-poli-body">
              Education Level
            </Label>
            <Select
              value={formData.education_level}
              onValueChange={(value) => setFormData(prev => ({ ...prev, education_level: value }))}
            >
              <SelectTrigger className="bg-background">
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
            <Label htmlFor="race" className="text-poli-body">
              Race
            </Label>
            <Select
              value={formData.race}
              onValueChange={(value) => setFormData(prev => ({ ...prev, race: value }))}
            >
              <SelectTrigger className="bg-background">
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
            <Label htmlFor="religion" className="text-poli-body">
              Religion
            </Label>
            <Select
              value={formData.religion}
              onValueChange={(value) => setFormData(prev => ({ ...prev, religion: value }))}
            >
              <SelectTrigger className="bg-background">
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

        <div className="flex justify-between mt-8">
          <Button type="button" variant="ghost" onClick={onBack}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
          <Button 
            type="submit"
            size="lg"
            variant="hero"
            disabled={!isFormValid || isLoading}
          >
            {isLoading ? 'Saving...' : 'Continue'}
            <ArrowRight className="w-5 h-5" />
          </Button>
        </div>
      </form>
    </div>
  );
};
