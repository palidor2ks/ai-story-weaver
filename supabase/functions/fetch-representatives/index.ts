import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const CONGRESS_API_KEY = Deno.env.get('CONGRESS_GOV_API_KEY');

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { state, district } = await req.json();
    
    console.log(`Fetching representatives for state: ${state}, district: ${district}`);

    if (!CONGRESS_API_KEY) {
      throw new Error('Congress.gov API key not configured');
    }

    // Fetch current members of Congress
    const currentCongress = 119; // 119th Congress (2025-2027)
    
    // Fetch senators for the state
    const senatorsUrl = `https://api.congress.gov/v3/member?stateCode=${state}&currentMember=true&api_key=${CONGRESS_API_KEY}&limit=100`;
    console.log(`Fetching senators from: ${senatorsUrl.replace(CONGRESS_API_KEY, 'REDACTED')}`);
    
    const senatorsResponse = await fetch(senatorsUrl);
    
    if (!senatorsResponse.ok) {
      const errorText = await senatorsResponse.text();
      console.error(`Congress API error: ${senatorsResponse.status} - ${errorText}`);
      throw new Error(`Congress API error: ${senatorsResponse.status}`);
    }
    
    const senatorsData = await senatorsResponse.json();
    console.log(`Found ${senatorsData.members?.length || 0} members for state ${state}`);

    // Process and format the members
    const members = senatorsData.members || [];
    
    const representatives = members.map((member: any) => {
      // Determine if senator or representative based on chamber
      const latestTerm = member.terms?.item?.[member.terms?.item?.length - 1] || {};
      const chamber = latestTerm.chamber || member.terms?.item?.[0]?.chamber;
      const isSenator = chamber === 'Senate';
      const memberDistrict = latestTerm.district;
      
      // Map party code to full name
      let party = 'Other';
      if (member.partyName === 'Democratic' || member.partyName === 'Democrat') {
        party = 'Democrat';
      } else if (member.partyName === 'Republican') {
        party = 'Republican';
      } else if (member.partyName === 'Independent') {
        party = 'Independent';
      }

      return {
        id: member.bioguideId,
        name: member.name || `${member.firstName} ${member.lastName}`,
        party,
        office: isSenator ? 'Senator' : 'Representative',
        state: member.state,
        district: memberDistrict ? `${member.state}-${memberDistrict}` : null,
        image_url: member.depiction?.imageUrl || '',
        is_incumbent: true,
        bioguide_id: member.bioguideId,
        // These would need to be calculated separately
        overall_score: null,
        coverage_tier: 'tier_3',
        confidence: 'low',
      };
    });

    // Filter: include all senators for the state, and only the representative for the user's district
    const filtered = representatives.filter((rep: any) => {
      if (rep.office === 'Senator') {
        return true; // Include all senators for the state
      }
      if (rep.office === 'Representative' && district) {
        // Match by district number
        const repDistrictNum = rep.district?.split('-')[1];
        return repDistrictNum === String(district);
      }
      return false;
    });

    console.log(`Returning ${filtered.length} filtered representatives`);

    return new Response(JSON.stringify({ 
      representatives: filtered,
      total: filtered.length,
      state,
      district 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error in fetch-representatives function:', errorMessage);
    return new Response(JSON.stringify({ 
      error: errorMessage,
      representatives: [] 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
