import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

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
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { address } = await req.json();

    if (!address || typeof address !== 'string') {
      return new Response(
        JSON.stringify({ error: 'Address is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const apiKey = Deno.env.get('GOOGLE_PLACES_API_KEY');
    if (!apiKey) {
      console.error('GOOGLE_PLACES_API_KEY not configured');
      return new Response(
        JSON.stringify({ error: 'Google API not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Validating address:', address);

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
      return new Response(
        JSON.stringify({ error: 'Failed to validate address', details: errorText }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const data = await response.json();
    console.log('Address validation response received');

    if (!data.result) {
      return new Response(
        JSON.stringify({ 
          isValid: false, 
          error: 'Could not validate address' 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
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
    };

    console.log('Address validated:', addressDetails.formattedAddress, '- Valid:', isValid);

    return new Response(
      JSON.stringify(addressDetails),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in validate-address:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
