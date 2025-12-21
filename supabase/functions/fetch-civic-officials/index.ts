import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const GOOGLE_API_KEY = Deno.env.get('GOOGLE_PLACES_API_KEY');

// Office level categorization
type OfficeLevelType = 'federal_executive' | 'federal_legislative' | 'state_executive' | 'state_legislative' | 'local';

interface OfficialInfo {
  id: string;
  name: string;
  party: 'Democrat' | 'Republican' | 'Independent' | 'Other';
  office: string;
  level: OfficeLevelType;
  state: string;
  district?: string;
  image_url: string;
  phones?: string[];
  urls?: string[];
  emails?: string[];
  is_incumbent: boolean;
  overall_score: number | null;
  coverage_tier: string;
  confidence: string;
}

// Map Google Civic party names to our party types
function mapParty(party: string | undefined): 'Democrat' | 'Republican' | 'Independent' | 'Other' {
  if (!party) return 'Other';
  const normalizedParty = party.toLowerCase();
  if (normalizedParty.includes('democrat')) return 'Democrat';
  if (normalizedParty.includes('republican')) return 'Republican';
  if (normalizedParty.includes('independent') || normalizedParty.includes('nonpartisan')) return 'Independent';
  return 'Other';
}

// Categorize office by level
function categorizeOffice(officeName: string, divisionId: string): { level: OfficeLevelType; normalizedOffice: string } {
  const lowerName = officeName.toLowerCase();
  
  // Federal Executive
  if (lowerName.includes('president') && !lowerName.includes('vice')) {
    return { level: 'federal_executive', normalizedOffice: 'President' };
  }
  if (lowerName.includes('vice president')) {
    return { level: 'federal_executive', normalizedOffice: 'Vice President' };
  }
  
  // Federal Legislative - skip these as we get them from Congress.gov with more detail
  if (lowerName.includes('u.s. senator') || lowerName.includes('united states senator')) {
    return { level: 'federal_legislative', normalizedOffice: 'Senator' };
  }
  if (lowerName.includes('u.s. representative') || lowerName.includes('united states representative')) {
    return { level: 'federal_legislative', normalizedOffice: 'Representative' };
  }
  
  // State Executive
  if (lowerName.includes('governor') && !lowerName.includes('lieutenant')) {
    return { level: 'state_executive', normalizedOffice: 'Governor' };
  }
  if (lowerName.includes('lieutenant governor') || lowerName.includes('lt. governor')) {
    return { level: 'state_executive', normalizedOffice: 'Lieutenant Governor' };
  }
  if (lowerName.includes('attorney general') && divisionId.includes('state:')) {
    return { level: 'state_executive', normalizedOffice: 'State Attorney General' };
  }
  if (lowerName.includes('secretary of state') && divisionId.includes('state:')) {
    return { level: 'state_executive', normalizedOffice: 'Secretary of State' };
  }
  if (lowerName.includes('state treasurer') || (lowerName.includes('treasurer') && divisionId.includes('state:'))) {
    return { level: 'state_executive', normalizedOffice: 'State Treasurer' };
  }
  if (lowerName.includes('state comptroller') || lowerName.includes('state controller')) {
    return { level: 'state_executive', normalizedOffice: 'State Comptroller' };
  }
  
  // State Legislative
  if (lowerName.includes('state senator') || (lowerName.includes('senator') && divisionId.includes('sldl'))) {
    return { level: 'state_legislative', normalizedOffice: 'State Senator' };
  }
  if (lowerName.includes('state representative') || lowerName.includes('state assembly') || 
      lowerName.includes('assemblymember') || lowerName.includes('state delegate') ||
      divisionId.includes('sldu')) {
    return { level: 'state_legislative', normalizedOffice: 'State Representative' };
  }
  
  // Local - Mayor
  if (lowerName.includes('mayor')) {
    return { level: 'local', normalizedOffice: 'Mayor' };
  }
  
  // Local - City Council
  if (lowerName.includes('city council') || lowerName.includes('councilmember') || 
      lowerName.includes('councilperson') || lowerName.includes('alderman') ||
      lowerName.includes('alderwoman')) {
    return { level: 'local', normalizedOffice: 'City Council Member' };
  }
  
  // Local - County
  if (lowerName.includes('county commissioner') || lowerName.includes('county supervisor') ||
      lowerName.includes('county executive') || lowerName.includes('county council')) {
    return { level: 'local', normalizedOffice: 'County Official' };
  }
  if (lowerName.includes('county clerk')) {
    return { level: 'local', normalizedOffice: 'County Clerk' };
  }
  if (lowerName.includes('sheriff')) {
    return { level: 'local', normalizedOffice: 'Sheriff' };
  }
  if (lowerName.includes('district attorney') || lowerName.includes('county attorney')) {
    return { level: 'local', normalizedOffice: 'District Attorney' };
  }
  
  // Local - School Board
  if (lowerName.includes('school board') || lowerName.includes('board of education')) {
    return { level: 'local', normalizedOffice: 'School Board Member' };
  }
  
  // Default based on division
  if (divisionId.includes('place:') || divisionId.includes('county:')) {
    return { level: 'local', normalizedOffice: officeName };
  }
  if (divisionId.includes('state:') && !divisionId.includes('cd:')) {
    return { level: 'state_executive', normalizedOffice: officeName };
  }
  
  return { level: 'local', normalizedOffice: officeName };
}

// Extract state from division ID
function extractStateFromDivision(divisionId: string): string {
  // Format: ocd-division/country:us/state:nj/...
  const stateMatch = divisionId.match(/state:([a-z]{2})/i);
  return stateMatch ? stateMatch[1].toUpperCase() : '';
}

// Create a unique ID for an official
function createOfficialId(name: string, office: string, state: string): string {
  const cleanName = name.toLowerCase().replace(/[^a-z0-9]/g, '');
  const cleanOffice = office.toLowerCase().replace(/[^a-z0-9]/g, '');
  return `civic_${cleanName}_${cleanOffice}_${state}`.substring(0, 50);
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { address, includeFederalLegislative = false } = await req.json();
    
    console.log(`Fetching civic officials for address: ${address}`);
    console.log(`Include federal legislative: ${includeFederalLegislative}`);

    if (!GOOGLE_API_KEY) {
      throw new Error('Google Places API key not configured');
    }

    if (!address) {
      throw new Error('Address is required');
    }

    // Call Google Civic Information API
    const encodedAddress = encodeURIComponent(address);
    // Use the canonical googleapis.com base to avoid "Method not found" issues on alternate hosts
    const civicBaseUrl = 'https://www.googleapis.com/civicinfo/v2/representatives';
    const civicUrl = `${civicBaseUrl}?address=${encodedAddress}&key=${GOOGLE_API_KEY}`;

    console.log('Calling Google Civic Information API...');
    console.log(`Civic endpoint: ${civicBaseUrl}`);

    const response = await fetch(civicUrl);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Civic API error:', response.status, errorText);

      let friendlyError = `Civic API error: ${response.status}`;
      if (response.status === 400) {
        friendlyError = 'Invalid address or no officials found for this address';
      } else if (response.status === 403) {
        friendlyError = 'Google Civic Information API access denied. Enable the Civic Information API and/or update your API key restrictions.';
      } else if (response.status === 404) {
        friendlyError = 'Google Civic endpoint returned 404. This usually means the Civic Information API is not enabled for your project.';
      }

      // Return a 200 so the client receives a typed payload (no thrown invoke error)
      return new Response(
        JSON.stringify({
          error: friendlyError,
          officials: [],
          federalExecutive: [],
          stateExecutive: [],
          stateLegislative: [],
          local: [],
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const data = await response.json();
    
    const offices = data.offices || [];
    const officials = data.officials || [];
    const divisions = data.divisions || {};
    
    console.log(`Found ${offices.length} offices and ${officials.length} officials`);

    // Map offices to officials
    const mappedOfficials: OfficialInfo[] = [];
    
    for (const office of offices) {
      const divisionId = office.divisionId || '';
      const { level, normalizedOffice } = categorizeOffice(office.name, divisionId);
      
      // Skip federal legislative unless specifically requested (we get better data from Congress.gov)
      if (level === 'federal_legislative' && !includeFederalLegislative) {
        console.log(`Skipping federal legislative: ${office.name}`);
        continue;
      }
      
      const officialIndices = office.officialIndices || [];
      const state = extractStateFromDivision(divisionId);
      
      for (const idx of officialIndices) {
        const official = officials[idx];
        if (!official) continue;
        
        const officialInfo: OfficialInfo = {
          id: createOfficialId(official.name, normalizedOffice, state),
          name: official.name,
          party: mapParty(official.party),
          office: normalizedOffice,
          level,
          state,
          image_url: official.photoUrl || '',
          phones: official.phones || [],
          urls: official.urls || [],
          emails: official.emails || [],
          is_incumbent: true,
          overall_score: null,
          coverage_tier: level === 'federal_executive' ? 'tier_2' : 'tier_3',
          confidence: 'low',
        };
        
        // Add district info for state legislative
        if (level === 'state_legislative') {
          const districtMatch = divisionId.match(/sld[ul]:(\d+)/i);
          if (districtMatch) {
            officialInfo.district = `${state}-${districtMatch[1]}`;
          }
        }
        
        mappedOfficials.push(officialInfo);
        console.log(`Mapped: ${officialInfo.name} - ${officialInfo.office} (${level})`);
      }
    }

    // Categorize officials by level
    const federalExecutive = mappedOfficials.filter(o => o.level === 'federal_executive');
    const stateExecutive = mappedOfficials.filter(o => o.level === 'state_executive');
    const stateLegislative = mappedOfficials.filter(o => o.level === 'state_legislative');
    const local = mappedOfficials.filter(o => o.level === 'local');

    console.log(`Results: ${federalExecutive.length} federal exec, ${stateExecutive.length} state exec, ${stateLegislative.length} state leg, ${local.length} local`);

    return new Response(JSON.stringify({ 
      officials: mappedOfficials,
      federalExecutive,
      stateExecutive,
      stateLegislative,
      local,
      normalizedAddress: data.normalizedInput?.line1 || address,
      state: extractStateFromDivision(Object.keys(divisions).find(d => d.includes('state:')) || ''),
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error in fetch-civic-officials function:', errorMessage);
    return new Response(JSON.stringify({ 
      error: errorMessage,
      officials: [],
      federalExecutive: [],
      stateExecutive: [],
      stateLegislative: [],
      local: []
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
