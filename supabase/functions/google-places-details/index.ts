import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { placeId, sessionToken } = await req.json();

    if (!placeId || typeof placeId !== 'string') {
      return new Response(
        JSON.stringify({ error: 'Place ID is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const apiKey = Deno.env.get('GOOGLE_PLACES_API_KEY');
    if (!apiKey) {
      console.error('GOOGLE_PLACES_API_KEY not configured');
      return new Response(
        JSON.stringify({ error: 'Google Places API not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Fetching place details for placeId:', placeId);

    // Use the new Places API (New) endpoint
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': 'id,formattedAddress,addressComponents,location',
    };

    if (sessionToken) {
      headers['X-Goog-Session-Token'] = sessionToken;
    }

    const response = await fetch(`https://places.googleapis.com/v1/places/${placeId}`, {
      method: 'GET',
      headers,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Google API error:', response.status, errorText);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch place details' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const result = await response.json();
    console.log('Place details received for:', result.formattedAddress);
    
    const components = result.addressComponents || [];
    
    // Extract address components using the new format
    const getComponent = (types: string[]) => {
      const comp = components.find((c: any) => 
        types.some(type => c.types?.includes(type))
      );
      return comp?.longText || '';
    };

    const getComponentShort = (types: string[]) => {
      const comp = components.find((c: any) => 
        types.some(type => c.types?.includes(type))
      );
      return comp?.shortText || '';
    };

    const addressDetails = {
      formattedAddress: result.formattedAddress || '',
      streetNumber: getComponent(['street_number']),
      street: getComponent(['route']),
      city: getComponent(['locality']) || getComponent(['sublocality']),
      county: getComponent(['administrative_area_level_2']),
      state: getComponentShort(['administrative_area_level_1']),
      stateFull: getComponent(['administrative_area_level_1']),
      zipCode: getComponent(['postal_code']),
      country: getComponentShort(['country']),
      lat: result.location?.latitude,
      lng: result.location?.longitude,
    };

    return new Response(
      JSON.stringify({ address: addressDetails }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in google-places-details:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
