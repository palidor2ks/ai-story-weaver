import { useState, useEffect, useRef, useCallback } from 'react';
import { Input } from '@/components/ui/input';
import { MapPin, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';

interface AddressPrediction {
  placeId: string;
  description: string;
  mainText: string;
  secondaryText: string;
}

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
}

interface AddressAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  onAddressSelect?: (address: AddressDetails) => void;
  placeholder?: string;
  className?: string;
  id?: string;
  disabled?: boolean;
}

export const AddressAutocomplete = ({
  value,
  onChange,
  onAddressSelect,
  placeholder = "Start typing your address...",
  className,
  id,
  disabled = false,
}: AddressAutocompleteProps) => {
  const [predictions, setPredictions] = useState<AddressPrediction[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [isVerified, setIsVerified] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionToken] = useState(() => crypto.randomUUID());
  const wrapperRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<NodeJS.Timeout>();

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const fetchPredictions = useCallback(async (input: string) => {
    if (input.length < 3) {
      setPredictions([]);
      setIsOpen(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const { data, error: fnError } = await supabase.functions.invoke('google-places-autocomplete', {
        body: { input, sessionToken },
      });

      if (fnError) throw fnError;

      if (data?.predictions) {
        setPredictions(data.predictions);
        setIsOpen(data.predictions.length > 0);
      }
    } catch (err) {
      console.error('Error fetching predictions:', err);
      setError('Unable to fetch suggestions');
      setPredictions([]);
    } finally {
      setIsLoading(false);
    }
  }, [sessionToken]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    onChange(newValue);
    setIsVerified(false);
    setError(null);

    // Debounce API calls
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(() => {
      fetchPredictions(newValue);
    }, 300);
  };

  const handleSelectPrediction = async (prediction: AddressPrediction) => {
    setIsOpen(false);
    setIsLoading(true);
    setPredictions([]);

    try {
      const { data, error: fnError } = await supabase.functions.invoke('google-places-details', {
        body: { placeId: prediction.placeId, sessionToken },
      });

      if (fnError) throw fnError;

      if (data?.address) {
        const address = data.address as AddressDetails;
        onChange(address.formattedAddress);
        setIsVerified(true);
        onAddressSelect?.(address);
      }
    } catch (err) {
      console.error('Error fetching place details:', err);
      setError('Unable to verify address');
      onChange(prediction.description);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div ref={wrapperRef} className="relative">
      <div className="relative">
        <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
        <Input
          id={id}
          type="text"
          value={value}
          onChange={handleInputChange}
          onFocus={() => predictions.length > 0 && setIsOpen(true)}
          placeholder={placeholder}
          disabled={disabled}
          className={cn("pl-9 pr-9", className)}
          autoComplete="off"
        />
        <div className="absolute right-3 top-1/2 -translate-y-1/2">
          {isLoading ? (
            <Loader2 className="w-4 h-4 text-muted-foreground animate-spin" />
          ) : isVerified ? (
            <CheckCircle2 className="w-4 h-4 text-green-500" />
          ) : error ? (
            <AlertCircle className="w-4 h-4 text-destructive" />
          ) : null}
        </div>
      </div>

      {isOpen && predictions.length > 0 && (
        <div className="absolute z-50 w-full mt-1 bg-popover border border-border rounded-lg shadow-lg overflow-hidden">
          {predictions.map((prediction) => (
            <button
              key={prediction.placeId}
              type="button"
              className="w-full px-4 py-3 text-left hover:bg-accent transition-colors flex items-start gap-3 border-b border-border last:border-b-0"
              onClick={() => handleSelectPrediction(prediction)}
            >
              <MapPin className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="font-medium text-foreground truncate">
                  {prediction.mainText}
                </p>
                <p className="text-sm text-muted-foreground truncate">
                  {prediction.secondaryText}
                </p>
              </div>
            </button>
          ))}
          <div className="px-4 py-2 bg-muted/50 border-t border-border">
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <img 
                src="https://developers.google.com/static/maps/documentation/images/powered_by_google_on_white.png" 
                alt="Powered by Google" 
                className="h-3 dark:invert"
              />
            </p>
          </div>
        </div>
      )}

      {error && (
        <p className="text-xs text-destructive mt-1">{error}</p>
      )}
    </div>
  );
};
