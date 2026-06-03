import { useState, useRef, useCallback, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { MapPin, Loader2, CheckCircle2, AlertCircle, Search } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';

interface AddressDetails {
  formattedAddress: string;
  streetNumber: string;
  street: string;
  city: string;
  county: string;
  state: string;
  stateFull: string;
  zipCode: string;
  country: string;
  lat?: number;
  lng?: number;
  isValid?: boolean;
}

interface AddressAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  onAddressSelect?: (address: AddressDetails) => void;
  onValidationChange?: (isValid: boolean) => void;
  placeholder?: string;
  className?: string;
  id?: string;
  disabled?: boolean;
}

// An address only counts as "complete" when it has been verified AND resolves
// to a full street + city + state + ZIP. Partial matches (e.g. a bare street
// line) must not be treated as a usable address.
const isCompleteAddress = (details: AddressDetails | null | undefined): boolean =>
  Boolean(
    details?.isValid &&
    details.city?.trim() &&
    details.state?.trim() &&
    details.zipCode?.trim()
  );

export const AddressAutocomplete = ({
  value,
  onChange,
  onAddressSelect,
  onValidationChange,
  placeholder = "Enter your full address...",
  className,
  id,
  disabled = false,
}: AddressAutocompleteProps) => {
  const [isLoading, setIsLoading] = useState(false);
  const [isVerified, setIsVerified] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [validationResult, setValidationResult] = useState<AddressDetails | null>(null);
  const debounceRef = useRef<NodeJS.Timeout>();
  const initialValueRef = useRef(value);
  const didAutoValidateRef = useRef(false);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    onChange(newValue);
    setIsVerified(false);
    setError(null);
    setValidationResult(null);
    // Editing the field invalidates any previous verification.
    onValidationChange?.(false);
  };

  const validateAddress = useCallback(async () => {
    if (!value || value.length < 5) {
      setError('Please enter a complete address');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const { data, error: fnError } = await supabase.functions.invoke('validate-address', {
        body: { address: value },
      });

      if (fnError) throw fnError;

      if (data?.error) {
        setError(data.error);
        setIsVerified(false);
        onValidationChange?.(false);
        return;
      }

      if (isCompleteAddress(data)) {
        setValidationResult(data);
        setIsVerified(true);
        setError(null);
        onChange(data.formattedAddress);
        onAddressSelect?.(data);
        onValidationChange?.(true);
      } else {
        // Either unverifiable or only a partial match (missing city/state/ZIP).
        // Do NOT surface it as a selected address — that's the gap that let
        // incomplete addresses through.
        setIsVerified(false);
        setValidationResult(null);
        onValidationChange?.(false);
        setError(
          data?.isValid
            ? 'We could only partially verify this address. Please include street, city, state, and ZIP.'
            : 'Could not verify this address. Please check and try again.'
        );
      }
    } catch (err) {
      console.error('Error validating address:', err);
      setError('Unable to validate address. Please try again.');
      onValidationChange?.(false);
    } finally {
      setIsLoading(false);
    }
  }, [value, onChange, onAddressSelect, onValidationChange]);

  // Re-verify a pre-filled address (e.g. a returning user, or existing saved
  // data) once on mount so the parent's validity gate reflects whether the
  // stored address is actually complete.
  useEffect(() => {
    if (didAutoValidateRef.current) return;
    if (initialValueRef.current && initialValueRef.current.trim().length >= 5) {
      didAutoValidateRef.current = true;
      validateAddress();
    }
  }, [validateAddress]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      validateAddress();
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <Input
            id={id}
            type="text"
            value={value}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            disabled={disabled || isLoading}
            className={cn("pl-9 pr-9", className)}
            autoComplete="street-address"
          />
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            {isLoading ? (
              <Loader2 className="w-4 h-4 text-muted-foreground animate-spin" />
            ) : isVerified ? (
              <CheckCircle2 className="w-4 h-4 text-green-500" />
            ) : error ? (
              <AlertCircle className="w-4 h-4 text-amber-500" />
            ) : null}
          </div>
        </div>
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={validateAddress}
          disabled={disabled || isLoading || !value || value.length < 5}
          className="shrink-0"
          title="Validate address"
        >
          {isLoading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Search className="w-4 h-4" />
          )}
        </Button>
      </div>

      {error && (
        <p className="text-xs text-amber-600">{error}</p>
      )}

      {isVerified && validationResult && (
        <div className="text-xs text-green-600 flex items-center gap-1">
          <CheckCircle2 className="w-3 h-3" />
          Address verified: {validationResult.city}, {validationResult.state} {validationResult.zipCode}
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Enter your full address and click the search button to validate
      </p>
    </div>
  );
};
