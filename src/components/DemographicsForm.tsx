import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ArrowRight, ArrowLeft, User } from 'lucide-react';

export interface DemographicsData {
  address: string;
  political_party: string;
  age: number | null;
  income: string;
  sex: string;
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
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(formData);
  };

  const isFormValid = formData.address && formData.political_party && formData.age && formData.income && formData.sex;

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
            <Input
              id="address"
              type="text"
              placeholder="City, State or ZIP code"
              value={formData.address}
              onChange={(e) => setFormData(prev => ({ ...prev, address: e.target.value }))}
              className="bg-background"
            />
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
