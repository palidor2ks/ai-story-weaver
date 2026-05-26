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
    sex: initialData?.sex || '',
    religion: initialData?.religion || '',
    education_level: initialData?.education_level || '',
    race: initialData?.race || '',
  });

  const [addressState, setAddressState] = useState<{ code: string; name: string } | null>(null);
  const { isHidden } = useHiddenStates();
  const stateNotSupported = addressState ? isHidden(addressState.code) : false;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(formData);
  };

  const isFormValid = formData.address && formData.political_party && formData.age && formData.income && formData.sex && formData.religion && formData.education_level && formData.race;

  return (
    <div className="max-w-xl mx-auto animate-fade-in">
      <div className="text-center mb-8">
        <div className="w-16 h-16 rounded-2xl bg-gradient-hero mx-auto mb-6 flex items-center justify-center shadow-glow">
          <User className="w-8 h-8 text-primary-foreground" />
        </div>
        <h2 className="font-display text-3xl font-bold text-foreground mb-3">
          Tell us about yourself
        </h2>
        <p className="text-muted-foreground">
          This helps us personalize your experience and provide better matches.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="bg-card rounded-2xl border border-border p-6 space-y-5">
          <div className="space-y-2">
            <Label htmlFor="address" className="text-foreground">
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
              placeholder="Start typing your address..."
              className="bg-background"
            />
            {stateNotSupported && (
              <div className="flex gap-2 rounded-lg border border-border bg-muted/50 p-3 text-sm text-foreground">
                <Info className="w-4 h-4 mt-0.5 shrink-0 text-primary" />
                <p>
                  <span className="font-medium">{addressState?.name}</span> isn't fully supported yet. You can still complete the quiz, see national candidates (President, etc.), and your local candidate requests will be saved for when we launch in your state.
                </p>
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              Used to show candidates in your area
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="political_party" className="text-foreground">
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
            <Label htmlFor="age" className="text-foreground">
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
            <Label htmlFor="income" className="text-foreground">
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
            <Label htmlFor="sex" className="text-foreground">
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
            <Label htmlFor="education_level" className="text-foreground">
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
            <Label htmlFor="race" className="text-foreground">
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
            <Label htmlFor="religion" className="text-foreground">
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
