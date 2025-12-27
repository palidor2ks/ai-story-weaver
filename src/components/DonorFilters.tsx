import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Search, X, Filter, Info } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useState } from 'react';
import type { DonorFilters as DonorFiltersType } from '@/hooks/useDonorsPaginated';

interface DonorFiltersProps {
  filters: Partial<DonorFiltersType>;
  onFiltersChange: (filters: Partial<DonorFiltersType>) => void;
  availableCycles: string[];
  availableStates: string[];
  isLoading?: boolean;
}

const AMOUNT_PRESETS = [
  { label: 'Any amount', min: null, max: null },
  { label: '$1,000+', min: 1000, max: null },
  { label: '$10,000+', min: 10000, max: null },
  { label: '$50,000+', min: 50000, max: null },
  { label: '$100,000+', min: 100000, max: null },
];

export const DonorFilters = ({
  filters,
  onFiltersChange,
  availableCycles,
  availableStates,
  isLoading,
}: DonorFiltersProps) => {
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const updateFilter = <K extends keyof DonorFiltersType>(key: K, value: DonorFiltersType[K]) => {
    onFiltersChange({ ...filters, [key]: value, page: 1 });
  };

  const clearFilters = () => {
    onFiltersChange({
      page: 1,
      pageSize: 50,
      sortBy: 'amount',
      sortOrder: 'desc',
      cycle: availableCycles[0] || '',
      type: 'all',
      search: '',
      state: 'all',
      minAmount: null,
      maxAmount: null,
      includeTransfers: true,
      includeConduitOrgs: true,
      candidateId: null,
      party: 'all',
    });
  };

  const hasActiveFilters = 
    filters.search || 
    (filters.type && filters.type !== 'all') || 
    (filters.state && filters.state !== 'all') ||
    (filters.party && filters.party !== 'all') ||
    filters.minAmount !== null ||
    filters.maxAmount !== null ||
    !filters.includeTransfers ||
    !filters.includeConduitOrgs;

  const currentAmountPreset = AMOUNT_PRESETS.find(
    p => p.min === filters.minAmount && p.max === filters.maxAmount
  ) || AMOUNT_PRESETS[0];

  return (
    <div className="space-y-4">
      {/* Primary filters row */}
      <div className="flex flex-col sm:flex-row gap-3">
        {/* Search */}
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search donors or candidates..."
            value={filters.search || ''}
            onChange={(e) => updateFilter('search', e.target.value)}
            className="pl-9"
            disabled={isLoading}
          />
        </div>

        {/* Cycle */}
        <Select 
          value={filters.cycle || ''} 
          onValueChange={(v) => updateFilter('cycle', v)}
          disabled={isLoading}
        >
          <SelectTrigger className="w-[120px]">
            <SelectValue placeholder="Cycle" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Cycles</SelectItem>
            {availableCycles.map(cycle => (
              <SelectItem key={cycle} value={cycle}>{cycle}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Type */}
        <Select 
          value={filters.type || 'all'} 
          onValueChange={(v) => updateFilter('type', v)}
          disabled={isLoading}
        >
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="Individual">Individual</SelectItem>
            <SelectItem value="PAC">PAC</SelectItem>
            <SelectItem value="Organization">Organization</SelectItem>
            <SelectItem value="Unknown">Unknown</SelectItem>
          </SelectContent>
        </Select>

        {/* Sort */}
        <Select 
          value={filters.sortBy || 'amount'} 
          onValueChange={(v: 'amount' | 'name') => updateFilter('sortBy', v)}
          disabled={isLoading}
        >
          <SelectTrigger className="w-[130px]">
            <SelectValue placeholder="Sort by" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="amount">Top Amount</SelectItem>
            <SelectItem value="name">Name A-Z</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Advanced filters */}
      <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
        <div className="flex items-center gap-2">
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="gap-2">
              <Filter className="h-4 w-4" />
              {advancedOpen ? 'Hide' : 'More'} Filters
              {hasActiveFilters && (
                <span className="bg-primary text-primary-foreground text-xs px-1.5 py-0.5 rounded-full">
                  Active
                </span>
              )}
            </Button>
          </CollapsibleTrigger>
          {hasActiveFilters && (
            <Button variant="ghost" size="sm" onClick={clearFilters} className="gap-1 text-muted-foreground">
              <X className="h-3 w-3" />
              Clear all
            </Button>
          )}
        </div>

        <CollapsibleContent className="pt-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 p-4 bg-muted/30 rounded-lg border">
            {/* State */}
            <div className="space-y-2">
              <Label className="text-sm text-muted-foreground">State</Label>
              <Select 
                value={filters.state || 'all'} 
                onValueChange={(v) => updateFilter('state', v)}
                disabled={isLoading}
              >
                <SelectTrigger>
                  <SelectValue placeholder="All States" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All States</SelectItem>
                  {availableStates.map(st => (
                    <SelectItem key={st} value={st}>{st}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Party */}
            <div className="space-y-2">
              <Label className="text-sm text-muted-foreground">Recipient Party</Label>
              <Select 
                value={filters.party || 'all'} 
                onValueChange={(v) => updateFilter('party', v)}
                disabled={isLoading}
              >
                <SelectTrigger>
                  <SelectValue placeholder="All Parties" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Parties</SelectItem>
                  <SelectItem value="Democrat">Democrat</SelectItem>
                  <SelectItem value="Republican">Republican</SelectItem>
                  <SelectItem value="Independent">Independent</SelectItem>
                  <SelectItem value="Other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Amount range */}
            <div className="space-y-2">
              <Label className="text-sm text-muted-foreground">Amount Range</Label>
              <Select 
                value={`${currentAmountPreset.min ?? 'null'}-${currentAmountPreset.max ?? 'null'}`}
                onValueChange={(v) => {
                  const preset = AMOUNT_PRESETS.find(
                    p => `${p.min ?? 'null'}-${p.max ?? 'null'}` === v
                  );
                  if (preset) {
                    onFiltersChange({ 
                      ...filters, 
                      minAmount: preset.min, 
                      maxAmount: preset.max,
                      page: 1 
                    });
                  }
                }}
                disabled={isLoading}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Any amount" />
                </SelectTrigger>
                <SelectContent>
                  {AMOUNT_PRESETS.map(preset => (
                    <SelectItem 
                      key={`${preset.min}-${preset.max}`} 
                      value={`${preset.min ?? 'null'}-${preset.max ?? 'null'}`}
                    >
                      {preset.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Toggles */}
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="include-transfers" className="text-sm text-muted-foreground cursor-pointer">
                  Include transfers
                </Label>
                <Switch
                  id="include-transfers"
                  checked={filters.includeTransfers !== false}
                  onCheckedChange={(checked) => updateFilter('includeTransfers', checked)}
                  disabled={isLoading}
                />
              </div>
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="include-conduit" className="text-sm text-muted-foreground cursor-pointer">
                  Include conduit orgs
                </Label>
                <Switch
                  id="include-conduit"
                  checked={filters.includeConduitOrgs !== false}
                  onCheckedChange={(checked) => updateFilter('includeConduitOrgs', checked)}
                  disabled={isLoading}
                />
              </div>
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>

      {/* Data source disclaimer */}
      <div className="flex items-start gap-2 text-xs text-muted-foreground bg-muted/30 px-3 py-2 rounded-md">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Info className="h-3.5 w-3.5 mt-0.5 shrink-0 cursor-help" />
            </TooltipTrigger>
            <TooltipContent className="max-w-xs">
              <p>
                Donors are aggregated by name, location, and recipient committee per cycle. 
                Conduit pass-through amounts are excluded to avoid double-counting.
              </p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
        <span>
          Aggregated FEC itemized donors. Amounts exclude conduit pass-throughs to avoid double-counting.
        </span>
      </div>
    </div>
  );
};
