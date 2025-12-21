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
    const { address } = await req.json();

    if (typeof address !== 'string' || address.trim().length < 5 || address.trim().length > 200) {
      return new Response(JSON.stringify({ error: 'Address is required (5-200 characters)' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const normalizedAddress = address.trim();

    console.log('Geocoding address:', normalizedAddress);

    const encodedAddress = encodeURIComponent(normalizedAddress);
    const url = `https://geocoding.geo.census.gov/geocoder/geographies/onelineaddress?address=${encodedAddress}&benchmark=Public_AR_Current&vintage=Current_Current&layers=all&format=json`;
    
    console.log('Fetching from Census API');
    
    const response = await fetch(url);
    if (!response.ok) {
      console.error('Census geocoder request failed with status:', response.status);
      return new Response(JSON.stringify({ 
        district: null, 
        state: null,
        error: `Census API error: ${response.status}` 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    
    const data = await response.json();
    const addressMatch = data?.result?.addressMatches?.[0];
    
    if (!addressMatch) {
      console.log('No address matches found in Census response');
      return new Response(JSON.stringify({ 
        district: null, 
        state: null,
        error: 'Address not found' 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const geographies = addressMatch.geographies;
    const matchedAddress = addressMatch.matchedAddress;
    
    console.log('Available geography layers:', Object.keys(geographies || {}));
    
    // Extract state from the matched address
    let state: string | null = null;
    if (matchedAddress) {
      // Census returns addresses like "234 DAVIS AVE, PISCATAWAY, NJ, 08854"
      const parts = matchedAddress.split(',').map((p: string) => p.trim());
      if (parts.length >= 3) {
        state = parts[parts.length - 2]; // State is second to last
      }
    }
    
    // Also try to get state from geographies
    if (!state && geographies?.['States']?.[0]) {
      state = geographies['States'][0].STUSAB || geographies['States'][0].STATE;
    }
    
    // Try multiple possible layer names for congressional districts
    const possibleLayers = [
      '119th Congressional Districts',
      '118th Congressional Districts', 
      'Congressional Districts',
      '2024 Congressional Districts',
      '2022 Congressional Districts'
    ];
    
    let district: string | null = null;
    
    for (const layer of possibleLayers) {
      const congressionalDistrict = geographies?.[layer]?.[0];
      if (congressionalDistrict) {
        // Try multiple possible field names for the district number
        const districtNum = congressionalDistrict.CD119 || 
                           congressionalDistrict.CD118 || 
                           congressionalDistrict.CD || 
                           congressionalDistrict.BASENAME ||
                           congressionalDistrict.NAME ||
                           congressionalDistrict.GEOID;
        if (districtNum) {
          // Extract just the number - handle formats like "06", "6", "NJ-06", "Congressional District 6"
          const numMatch = String(districtNum).match(/\d+$/);
          district = numMatch ? numMatch[0] : String(districtNum);
          console.log(`Found congressional district: ${district} from layer: ${layer}, field value: ${districtNum}`);
          break;
        }
      }
    }

    console.log(`Geocode result - State: ${state}, District: ${district}`);

    return new Response(JSON.stringify({ 
      district, 
      state,
      matchedAddress
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error in geocode-address function:', errorMessage);
    return new Response(JSON.stringify({ 
      district: null,
      state: null,
      error: errorMessage 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
