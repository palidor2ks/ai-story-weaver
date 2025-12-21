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
    const { input, sessionToken } = await req.json();

    if (!input || typeof input !== 'string') {
      return new Response(
        JSON.stringify({ error: 'Input is required' }),
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

    console.log('Fetching autocomplete for input:', input);

    // Use the new Places API (New) endpoint
    const requestBody: Record<string, unknown> = {
      input,
      includedRegionCodes: ['us'],
      includedPrimaryTypes: ['street_address', 'subpremise', 'premise', 'geocode'],
    };

    if (sessionToken) {
      requestBody.sessionToken = sessionToken;
    }

    const response = await fetch('https://places.googleapis.com/v1/places:autocomplete', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Google API error:', response.status, errorText);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch suggestions' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const data = await response.json();
    console.log('Autocomplete response received, suggestions count:', data.suggestions?.length || 0);

    const predictions = (data.suggestions || [])
      .filter((s: any) => s.placePrediction)
      .map((s: any) => {
        const p = s.placePrediction;
        return {
          placeId: p.placeId,
          description: p.text?.text || '',
          mainText: p.structuredFormat?.mainText?.text || '',
          secondaryText: p.structuredFormat?.secondaryText?.text || '',
        };
      });

    return new Response(
      JSON.stringify({ predictions }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in google-places-autocomplete:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
