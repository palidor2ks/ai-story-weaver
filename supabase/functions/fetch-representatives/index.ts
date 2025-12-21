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

// Reverse mapping for state name to code
const stateNameToCode: Record<string, string> = Object.entries(stateNames).reduce(
  (acc, [code, name]) => ({ ...acc, [name]: code }), {}
);

async function fetchAllMembers(apiKey: string, currentOnly: boolean = true): Promise<any[]> {
  const allMembers: any[] = [];
  let offset = 0;
  const limit = 250;
  let hasMore = true;
  
  while (hasMore) {
    const url = currentOnly 
      ? `https://api.congress.gov/v3/member?currentMember=true&api_key=${apiKey}&limit=${limit}&offset=${offset}`
      : `https://api.congress.gov/v3/member?api_key=${apiKey}&limit=${limit}&offset=${offset}`;
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
    
    // Safety limit - for all members we allow more
    if (currentOnly && offset > 1000) {
      hasMore = false;
    }
    if (!currentOnly && offset > 2000) {
      hasMore = false;
    }
  }
  
  return allMembers;
}

function mapMemberToRepresentative(member: any): any {
  // Get the latest term to determine chamber
  const terms = member.terms?.item || [];
  const sortedTerms = [...terms].sort((a: any, b: any) => (b.startYear || 0) - (a.startYear || 0));
  const latestTerm = sortedTerms[0] || {};
  const chamber = latestTerm.chamber;
  const isSenator = chamber === 'Senate';
  
  // Get state code
  const memberState = String(member.state || '').trim();
  const stateCode = stateNameToCode[memberState] || memberState;
  
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
    state: stateCode,
    district: memberDistrict ? `${stateCode}-${memberDistrict}` : null,
    image_url: member.depiction?.imageUrl || '',
    is_incumbent: true,
    bioguide_id: member.bioguideId,
    overall_score: null,
    coverage_tier: 'tier_3',
    confidence: 'low',
  };
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { state, district, fetchAll, includePrevious } = await req.json();
    
    console.log(`Fetching representatives - fetchAll: ${fetchAll}, state: ${state}, district: ${district}, includePrevious: ${includePrevious}`);

    if (!CONGRESS_API_KEY) {
      throw new Error('Congress.gov API key not configured');
    }

    // Fetch all current members of Congress (with pagination)
    const allMembers = await fetchAllMembers(CONGRESS_API_KEY, !includePrevious);
    console.log(`Found ${allMembers.length} total members in Congress`);

    // If fetchAll is true, return all Congress members
    if (fetchAll) {
      const representatives = allMembers.map(mapMemberToRepresentative);
      console.log(`Returning all ${representatives.length} Congress members`);
      
      return new Response(JSON.stringify({ 
        representatives,
        total: representatives.length,
        state: null,
        district: null 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Otherwise filter by state/district as before
    const normalizedStateCode = String(state || '').toUpperCase();
    const fullStateName = stateNames[normalizedStateCode] || normalizedStateCode;
    
    console.log(`Looking for state: ${fullStateName}`);

    // Filter by state (using full state name from API response)
    const stateMembers = allMembers.filter((member: any) => {
      const memberState = String(member.state || '').trim();
      return memberState === fullStateName;
    });

    console.log(`Filtered to ${stateMembers.length} members for ${fullStateName}`);

    const representatives = stateMembers.map(mapMemberToRepresentative);

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
