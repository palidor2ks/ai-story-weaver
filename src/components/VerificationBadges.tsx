import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ShieldCheck, Vote, ExternalLink, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';

interface Profile {
  id: string;
  name: string;
  address?: string | null;
  identity_verified?: boolean | null;
  identity_verified_at?: string | null;
  identity_provider?: string | null;
  voter_verified?: boolean | null;
  voter_verified_at?: string | null;
  voter_registration_status?: string | null;
  voter_state?: string | null;
  birth_date?: string | null;
}

interface VerificationBadgesProps {
  profile: Profile;
}

const US_STATES = [
  { value: 'AL', label: 'Alabama' }, { value: 'AK', label: 'Alaska' },
  { value: 'AZ', label: 'Arizona' }, { value: 'AR', label: 'Arkansas' },
  { value: 'CA', label: 'California' }, { value: 'CO', label: 'Colorado' },
  { value: 'CT', label: 'Connecticut' }, { value: 'DE', label: 'Delaware' },
  { value: 'DC', label: 'Washington DC' }, { value: 'FL', label: 'Florida' },
  { value: 'GA', label: 'Georgia' }, { value: 'HI', label: 'Hawaii' },
  { value: 'ID', label: 'Idaho' }, { value: 'IL', label: 'Illinois' },
  { value: 'IN', label: 'Indiana' }, { value: 'IA', label: 'Iowa' },
  { value: 'KS', label: 'Kansas' }, { value: 'KY', label: 'Kentucky' },
  { value: 'LA', label: 'Louisiana' }, { value: 'ME', label: 'Maine' },
  { value: 'MD', label: 'Maryland' }, { value: 'MA', label: 'Massachusetts' },
  { value: 'MI', label: 'Michigan' }, { value: 'MN', label: 'Minnesota' },
  { value: 'MS', label: 'Mississippi' }, { value: 'MO', label: 'Missouri' },
  { value: 'MT', label: 'Montana' }, { value: 'NE', label: 'Nebraska' },
  { value: 'NV', label: 'Nevada' }, { value: 'NH', label: 'New Hampshire' },
  { value: 'NJ', label: 'New Jersey' }, { value: 'NM', label: 'New Mexico' },
  { value: 'NY', label: 'New York' }, { value: 'NC', label: 'North Carolina' },
  { value: 'ND', label: 'North Dakota' }, { value: 'OH', label: 'Ohio' },
  { value: 'OK', label: 'Oklahoma' }, { value: 'OR', label: 'Oregon' },
  { value: 'PA', label: 'Pennsylvania' }, { value: 'RI', label: 'Rhode Island' },
  { value: 'SC', label: 'South Carolina' }, { value: 'SD', label: 'South Dakota' },
  { value: 'TN', label: 'Tennessee' }, { value: 'TX', label: 'Texas' },
  { value: 'UT', label: 'Utah' }, { value: 'VT', label: 'Vermont' },
  { value: 'VA', label: 'Virginia' }, { value: 'WA', label: 'Washington' },
  { value: 'WV', label: 'West Virginia' }, { value: 'WI', label: 'Wisconsin' },
  { value: 'WY', label: 'Wyoming' },
];

export const VerificationBadges = ({ profile }: VerificationBadgesProps) => {
  const queryClient = useQueryClient();
  const [isIdMeLoading, setIsIdMeLoading] = useState(false);
  const [isVoterDialogOpen, setIsVoterDialogOpen] = useState(false);
  const [isVoterLoading, setIsVoterLoading] = useState(false);
  const [voterForm, setVoterForm] = useState({
    firstName: profile.name?.split(' ')[0] || '',
    lastName: profile.name?.split(' ').slice(1).join(' ') || '',
    birthDate: profile.birth_date || '',
    state: '',
  });
  const [manualVerifyUrl, setManualVerifyUrl] = useState<string | null>(null);

  // Extract state from address if available
  const extractStateFromAddress = (address: string): string => {
    const stateMatch = address.match(/,\s*([A-Z]{2})\s+\d{5}/);
    return stateMatch ? stateMatch[1] : '';
  };

  const handleIdMeVerify = async () => {
    setIsIdMeLoading(true);
    try {
      const redirectUri = `${window.location.origin}/auth/idme-callback`;
      
      const { data, error } = await supabase.functions.invoke('verify-identity-idme', {
        body: { 
          action: 'get_auth_url',
          redirect_uri: redirectUri
        }
      });

      if (error) throw error;

      if (data.error) {
        toast.error(data.message || 'ID.me verification is not configured');
        return;
      }

      // Store state for validation
      sessionStorage.setItem('idme_state', data.state);
      
      // Redirect to ID.me
      window.location.href = data.auth_url;
    } catch (error: any) {
      console.error('ID.me verification error:', error);
      toast.error('Failed to start identity verification');
    } finally {
      setIsIdMeLoading(false);
    }
  };

  const handleVoterVerify = async () => {
    if (!voterForm.firstName || !voterForm.lastName || !voterForm.birthDate || !voterForm.state) {
      toast.error('Please fill in all required fields');
      return;
    }

    setIsVoterLoading(true);
    setManualVerifyUrl(null);
    
    try {
      // Parse address if available
      let city = '';
      let zip = '';
      if (profile.address) {
        const parts = profile.address.split(',');
        if (parts.length >= 2) {
          city = parts[parts.length - 3]?.trim() || '';
          const stateZip = parts[parts.length - 2]?.trim() || '';
          const zipMatch = stateZip.match(/\d{5}/);
          zip = zipMatch ? zipMatch[0] : '';
        }
      }

      const { data, error } = await supabase.functions.invoke('verify-voter-registration', {
        body: {
          first_name: voterForm.firstName,
          last_name: voterForm.lastName,
          birth_date: voterForm.birthDate,
          state: voterForm.state,
          address: profile.address || '',
          city,
          zip,
        }
      });

      if (error) throw error;

      if (data.configured === false) {
        // API not configured - show manual verification option
        setManualVerifyUrl(data.manual_verification_url);
        toast.info('Please verify your registration manually using the link below');
      } else if (data.verified) {
        toast.success('Voter registration verified!');
        queryClient.invalidateQueries({ queryKey: ['profile'] });
        setIsVoterDialogOpen(false);
      } else {
        toast.error(data.message || 'Voter registration not found');
      }
    } catch (error: any) {
      console.error('Voter verification error:', error);
      toast.error('Failed to verify voter registration');
    } finally {
      setIsVoterLoading(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2 mt-4">
      {/* Identity Verification */}
      {profile.identity_verified ? (
        <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-500/30 gap-1">
          <ShieldCheck className="w-3 h-3" />
          Identity Verified
          <span className="text-xs opacity-70">via {profile.identity_provider}</span>
        </Badge>
      ) : (
        <Button
          variant="outline"
          size="sm"
          className="gap-2 text-xs h-7"
          onClick={handleIdMeVerify}
          disabled={isIdMeLoading}
        >
          {isIdMeLoading ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : (
            <ShieldCheck className="w-3 h-3" />
          )}
          Verify Identity
        </Button>
      )}

      {/* Voter Registration Verification */}
      {profile.voter_verified ? (
        <Badge variant="outline" className="bg-blue-500/10 text-blue-600 border-blue-500/30 gap-1">
          <Vote className="w-3 h-3" />
          Registered Voter ({profile.voter_state})
        </Badge>
      ) : (
        <Dialog open={isVoterDialogOpen} onOpenChange={setIsVoterDialogOpen}>
          <DialogTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="gap-2 text-xs h-7"
              onClick={() => {
                // Pre-populate state from address
                if (profile.address) {
                  const state = extractStateFromAddress(profile.address);
                  if (state) {
                    setVoterForm(prev => ({ ...prev, state }));
                  }
                }
              }}
            >
              <Vote className="w-3 h-3" />
              Verify Voter Registration
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Verify Voter Registration</DialogTitle>
              <DialogDescription>
                Enter your information to verify your voter registration status.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="firstName">First Name *</Label>
                  <Input
                    id="firstName"
                    value={voterForm.firstName}
                    onChange={(e) => setVoterForm(prev => ({ ...prev, firstName: e.target.value }))}
                    placeholder="John"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lastName">Last Name *</Label>
                  <Input
                    id="lastName"
                    value={voterForm.lastName}
                    onChange={(e) => setVoterForm(prev => ({ ...prev, lastName: e.target.value }))}
                    placeholder="Doe"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="birthDate">Date of Birth *</Label>
                <Input
                  id="birthDate"
                  type="date"
                  value={voterForm.birthDate}
                  onChange={(e) => setVoterForm(prev => ({ ...prev, birthDate: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="state">State *</Label>
                <Select
                  value={voterForm.state}
                  onValueChange={(value) => setVoterForm(prev => ({ ...prev, state: value }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select your state" />
                  </SelectTrigger>
                  <SelectContent>
                    {US_STATES.map((state) => (
                      <SelectItem key={state.value} value={state.value}>
                        {state.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {manualVerifyUrl && (
                <div className="p-4 bg-muted rounded-lg space-y-2">
                  <p className="text-sm text-muted-foreground">
                    Automatic verification is not available. Please verify manually:
                  </p>
                  <a
                    href={manualVerifyUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 text-sm text-primary hover:underline"
                  >
                    Check your registration on your state's website
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              )}

              <Button
                onClick={handleVoterVerify}
                disabled={isVoterLoading}
                className="w-full"
              >
                {isVoterLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Verifying...
                  </>
                ) : (
                  'Verify Registration'
                )}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
};
