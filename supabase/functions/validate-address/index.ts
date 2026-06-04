import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface AddressValidationResult {
  isValid: boolean;
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
  validationGranularity?: string;
  geocodeGranularity?: string;
  validationSource?: string;
}

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

const parseMatchedAddress = (matchedAddress: string, originalAddress: string): AddressValidationResult => {
  const parts = matchedAddress.split(',').map((part) => part.trim()).filter(Boolean);
  const streetLine = parts[0] || originalAddress;
  const city = parts.length >= 4 ? parts[parts.length - 3] : '';
  const state = parts.length >= 3 ? parts[parts.length - 2] : '';
  const zipCode = parts.length >= 2 ? parts[parts.length - 1] : '';
  const streetMatch = streetLine.match(/^(\S+)\s+(.+)$/);

  return {
    isValid: Boolean(matchedAddress),
    formattedAddress: matchedAddress || originalAddress,
    streetNumber: streetMatch?.[1] || '',
    street: streetMatch?.[2] || streetLine,
    city,
    county: '',
    state,
    stateFull: state,
    zipCode,
    country: 'US',
    validationGranularity: matchedAddress ? 'PREMISE' : 'UNKNOWN',
    geocodeGranularity: matchedAddress ? 'PREMISE' : 'UNKNOWN',
    validationSource: 'census',
  };
};

const validateWithCensus = async (address: string): Promise<AddressValidationResult> => {
  const encodedAddress = encodeURIComponent(address.trim());
  const response = await fetch(
    `https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?address=${encodedAddress}&benchmark=Public_AR_Current&format=json`,
  );

  if (!response.ok) {
    console.error('Census geocoder error:', response.status, await response.text());
    return parseMatchedAddress('', address);
  }

  const data = await response.json();
  const match = data?.result?.addressMatches?.[0];
  const result = parseMatchedAddress(match?.matchedAddress || '', address);
  result.lat = match?.coordinates?.y;
  result.lng = match?.coordinates?.x;
  return result;
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Auth check - require authenticated user
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return jsonResponse({ error: 'Unauthorized' }, 401);
    }
    const userClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return jsonResponse({ error: 'Unauthorized' }, 401);
    }

    const { address } = await req.json();

    if (!address || typeof address !== 'string') {
      return jsonResponse({ error: 'Address is required' }, 400);
    }

    const apiKey = Deno.env.get('GOOGLE_PLACES_API_KEY');
    if (!apiKey) {
      console.error('GOOGLE_PLACES_API_KEY not configured');
      const fallbackResult = await validateWithCensus(address);
      return jsonResponse(fallbackResult);
    }

    console.log('Validating address (length):', address.length);

    // Call Google Address Validation API
    const response = await fetch(
      `https://addressvalidation.googleapis.com/v1:validateAddress?key=${apiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          address: {
            regionCode: 'US',
            addressLines: [address],
          },
          enableUspsCass: true, // Enable USPS validation for US addresses
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Google API error:', response.status, errorText);
      const fallbackResult = await validateWithCensus(address);
      return jsonResponse(fallbackResult);
    }

    const data = await response.json();
    console.log('Address validation response received');

    if (!data.result) {
      const fallbackResult = await validateWithCensus(address);
      return jsonResponse(fallbackResult);
    }

    const result = data.result;
    const addressData = result.address;
    const geocode = result.geocode;
    const verdict = result.verdict;

    // Extract address components
    const components = addressData?.addressComponents || [];
    
    const getComponent = (types: string[]) => {
      const comp = components.find((c: any) => 
        types.some(type => c.componentType === type)
      );
      return comp?.componentName?.text || '';
    };

    // Determine if the address is valid enough
    const validationGranularity = verdict?.validationGranularity || 'UNKNOWN';
    const geocodeGranularity = verdict?.geocodeGranularity || 'UNKNOWN';
    
    // Consider valid if at least PREMISE level or better
    const validGranularities = ['PREMISE', 'SUB_PREMISE', 'PREMISE_PROXIMITY'];
    const isValid = validGranularities.includes(validationGranularity) || 
                   verdict?.addressComplete === true;

    const addressDetails: AddressValidationResult = {
      isValid,
      formattedAddress: addressData?.formattedAddress || address,
      streetNumber: getComponent(['street_number']),
      street: getComponent(['route']),
      city: getComponent(['locality']) || getComponent(['sublocality']),
      county: getComponent(['administrative_area_level_2']),
      state: getComponent(['administrative_area_level_1']),
      stateFull: getComponent(['administrative_area_level_1']),
      zipCode: getComponent(['postal_code']),
      country: getComponent(['country']),
      lat: geocode?.location?.latitude,
      lng: geocode?.location?.longitude,
      validationGranularity,
      geocodeGranularity,
      validationSource: 'google-address-validation',
    };

    console.log('Address validated:', addressDetails.formattedAddress, '- Valid:', isValid);

    return jsonResponse(addressDetails);

  } catch (error) {
    console.error('Error in validate-address:', error);
    return jsonResponse({ error: 'Internal server error' }, 500);
  }
});
