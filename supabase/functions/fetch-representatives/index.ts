import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const CONGRESS_API_KEY = Deno.env.get('CONGRESS_GOV_API_KEY');

// State code to full name mapping
const stateNames: Record<string, string> = {
  'AL': 'Alabama', 'AK': 'Alaska', 'AZ': 'Arizona', 'AR': 'Arkansas',
  'CA': 'California', 'CO': 'Colorado', 'CT': 'Connecticut', 'DE': 'Delaware',
  'FL': 'Florida', 'GA': 'Georgia', 'HI': 'Hawaii', 'ID': 'Idaho',
  'IL': 'Illinois', 'IN': 'Indiana', 'IA': 'Iowa', 'KS': 'Kansas',
  'KY': 'Kentucky', 'LA': 'Louisiana', 'ME': 'Maine', 'MD': 'Maryland',
  'MA': 'Massachusetts', 'MI': 'Michigan', 'MN': 'Minnesota', 'MS': 'Mississippi',
  'MO': 'Missouri', 'MT': 'Montana', 'NE': 'Nebraska', 'NV': 'Nevada',
  'NH': 'New Hampshire', 'NJ': 'New Jersey', 'NM': 'New Mexico', 'NY': 'New York',
  'NC': 'North Carolina', 'ND': 'North Dakota', 'OH': 'Ohio', 'OK': 'Oklahoma',
  'OR': 'Oregon', 'PA': 'Pennsylvania', 'RI': 'Rhode Island', 'SC': 'South Carolina',
  'SD': 'South Dakota', 'TN': 'Tennessee', 'TX': 'Texas', 'UT': 'Utah',
  'VT': 'Vermont', 'VA': 'Virginia', 'WA': 'Washington', 'WV': 'West Virginia',
  'WI': 'Wisconsin', 'WY': 'Wyoming', 'DC': 'District of Columbia',
  'PR': 'Puerto Rico', 'GU': 'Guam', 'VI': 'Virgin Islands',
  'AS': 'American Samoa', 'MP': 'Northern Mariana Islands',
};

async function fetchAllMembers(apiKey: string): Promise<any[]> {
  const allMembers: any[] = [];
  let offset = 0;
  const limit = 250;
  let hasMore = true;
  
  while (hasMore) {
    const url = `https://api.congress.gov/v3/member?currentMember=true&api_key=${apiKey}&limit=${limit}&offset=${offset}`;
    console.log(`Fetching members offset=${offset}...`);
    
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Congress API error: ${response.status}`);
    }
    
    const data = await response.json();
    const members = data.members || [];
    allMembers.push(...members);
    
    // Check if there are more pages
    if (members.length < limit) {
      hasMore = false;
    } else {
      offset += limit;
    }
    
    // Safety limit
    if (offset > 1000) {
      hasMore = false;
    }
  }
  
  return allMembers;
}

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

    const normalizedStateCode = String(state || '').toUpperCase();
    const fullStateName = stateNames[normalizedStateCode] || normalizedStateCode;
    
    console.log(`Looking for state: ${fullStateName}`);

    // Fetch all current members of Congress (with pagination)
    const allMembers = await fetchAllMembers(CONGRESS_API_KEY);
    console.log(`Found ${allMembers.length} total members in Congress`);

    // Filter by state (using full state name from API response)
    const stateMembers = allMembers.filter((member: any) => {
      const memberState = String(member.state || '').trim();
      return memberState === fullStateName;
    });

    console.log(`Filtered to ${stateMembers.length} members for ${fullStateName}`);
    
    // Log all state members for debugging
    stateMembers.forEach((m: any) => {
      console.log(`  State member: ${m.name} - District: ${m.district || 'N/A'} - Terms: ${JSON.stringify(m.terms?.item?.[0]?.chamber || 'unknown')}`);
    });

    const representatives = stateMembers.map((member: any) => {
      // Get the latest term to determine chamber
      // Sort terms by startYear descending to get the most recent
      const terms = member.terms?.item || [];
      const sortedTerms = [...terms].sort((a: any, b: any) => (b.startYear || 0) - (a.startYear || 0));
      const latestTerm = sortedTerms[0] || {};
      const chamber = latestTerm.chamber;
      const isSenator = chamber === 'Senate';
      
      // District is at the root level for House members (null for Senators)
      const memberDistrict = member.district;

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
        state: normalizedStateCode,
        district: memberDistrict ? `${normalizedStateCode}-${memberDistrict}` : null,
        image_url: member.depiction?.imageUrl || '',
        is_incumbent: true,
        bioguide_id: member.bioguideId,
        overall_score: null,
        coverage_tier: 'tier_3',
        confidence: 'low',
      };
    });

    console.log(`Mapped ${representatives.length} representatives`);

    // Filter: include all senators for the state, and only the representative for the user's district
    const filtered = representatives.filter((rep: any) => {
      if (rep.office === 'Senator') {
        return true; // Include all senators for the state
      }
      if (rep.office === 'Representative') {
        if (district) {
          // Match by district number (handle both "01" and "1" formats)
          const repDistrictNum = rep.district?.split('-')[1];
          const normalizedRepDistrict = repDistrictNum ? parseInt(repDistrictNum, 10).toString() : null;
          const normalizedInputDistrict = parseInt(String(district), 10).toString();
          return normalizedRepDistrict === normalizedInputDistrict;
        }
        // If no district provided, don't include any representatives (only senators)
        return false;
      }
      return false;
    });

    console.log(`Returning ${filtered.length} filtered representatives for ${normalizedStateCode} district ${district}`);
    
    // Log who we're returning
    filtered.forEach((rep: any) => {
      console.log(`  - ${rep.name} (${rep.office}) ${rep.district || ''}`);
    });

    return new Response(JSON.stringify({ 
      representatives: filtered,
      total: filtered.length,
      state: normalizedStateCode,
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
