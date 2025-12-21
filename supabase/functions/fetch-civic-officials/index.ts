import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const GOOGLE_API_KEY = Deno.env.get('GOOGLE_CIVIC_API_KEY') ?? Deno.env.get('GOOGLE_PLACES_API_KEY');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

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

// Extract state from address
function extractStateFromAddress(address: string): string {
  // Common state abbreviations pattern
  const stateMatch = address.match(/,\s*([A-Z]{2})\s+\d{5}/);
  if (stateMatch) return stateMatch[1];
  
  // Try to find state name
  const stateNames: Record<string, string> = {
    'alabama': 'AL', 'alaska': 'AK', 'arizona': 'AZ', 'arkansas': 'AR', 'california': 'CA',
    'colorado': 'CO', 'connecticut': 'CT', 'delaware': 'DE', 'florida': 'FL', 'georgia': 'GA',
    'hawaii': 'HI', 'idaho': 'ID', 'illinois': 'IL', 'indiana': 'IN', 'iowa': 'IA',
    'kansas': 'KS', 'kentucky': 'KY', 'louisiana': 'LA', 'maine': 'ME', 'maryland': 'MD',
    'massachusetts': 'MA', 'michigan': 'MI', 'minnesota': 'MN', 'mississippi': 'MS', 'missouri': 'MO',
    'montana': 'MT', 'nebraska': 'NE', 'nevada': 'NV', 'new hampshire': 'NH', 'new jersey': 'NJ',
    'new mexico': 'NM', 'new york': 'NY', 'north carolina': 'NC', 'north dakota': 'ND', 'ohio': 'OH',
    'oklahoma': 'OK', 'oregon': 'OR', 'pennsylvania': 'PA', 'rhode island': 'RI', 'south carolina': 'SC',
    'south dakota': 'SD', 'tennessee': 'TN', 'texas': 'TX', 'utah': 'UT', 'vermont': 'VT',
    'virginia': 'VA', 'washington': 'WA', 'west virginia': 'WV', 'wisconsin': 'WI', 'wyoming': 'WY'
  };
  
  const lowerAddress = address.toLowerCase();
  for (const [name, abbr] of Object.entries(stateNames)) {
    if (lowerAddress.includes(name)) return abbr;
  }
  
  // Look for abbreviation anywhere
  const abbrevMatch = address.match(/\b([A-Z]{2})\b/);
  if (abbrevMatch && Object.values(stateNames).includes(abbrevMatch[1])) {
    return abbrevMatch[1];
  }
  
  return '';
}

// Create a unique ID for an official
function createOfficialId(name: string, office: string, state: string): string {
  const cleanName = name.toLowerCase().replace(/[^a-z0-9]/g, '');
  const cleanOffice = office.toLowerCase().replace(/[^a-z0-9]/g, '');
  return `civic_${cleanName}_${cleanOffice}_${state}`.substring(0, 50);
}

// Fetch state legislators from Open States API (free, no API key required)
async function fetchOpenStatesLegislators(state: string, lat?: number, lng?: number): Promise<OfficialInfo[]> {
  console.log(`[Open States] Fetching legislators for state: ${state}`);
  
  try {
    // Open States GraphQL API endpoint
    const openStatesUrl = 'https://openstates.org/graphql';
    
    // Build query based on available data
    let query: string;
    let variables: Record<string, unknown>;
    
    if (lat && lng) {
      // Use geo lookup if coordinates available
      query = `
        query PeopleByLocation($lat: Float!, $lng: Float!) {
          people(latitude: $lat, longitude: $lng, first: 20) {
            edges {
              node {
                id
                name
                party
                currentRole {
                  title
                  orgClassification
                  district
                }
                image
                links {
                  url
                }
                email
              }
            }
          }
        }
      `;
      variables = { lat, lng };
    } else {
      // Fall back to state-wide search for current legislators
      query = `
        query PeopleByState($state: String!) {
          people(state: $state, first: 100) {
            edges {
              node {
                id
                name
                party
                currentRole {
                  title
                  orgClassification
                  district
                }
                image
                links {
                  url
                }
                email
              }
            }
          }
        }
      `;
      variables = { state: state.toLowerCase() };
    }

    console.log(`[Open States] Query variables:`, JSON.stringify(variables));

    const response = await fetch(openStatesUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query, variables }),
    });

    console.log(`[Open States] Response status: ${response.status}`);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[Open States] API error: ${response.status} - ${errorText}`);
      return [];
    }

    const data = await response.json();
    console.log(`[Open States] Response received, edges count: ${data.data?.people?.edges?.length || 0}`);

    if (data.errors) {
      console.error(`[Open States] GraphQL errors:`, JSON.stringify(data.errors));
      return [];
    }

    const edges = data.data?.people?.edges || [];
    const legislators: OfficialInfo[] = [];

    for (const edge of edges) {
      const person = edge.node;
      if (!person.currentRole) continue; // Skip if no current role

      const orgClass = person.currentRole.orgClassification?.toLowerCase() || '';
      let office = 'State Legislator';
      
      if (orgClass.includes('upper') || orgClass.includes('senate')) {
        office = 'State Senator';
      } else if (orgClass.includes('lower') || orgClass.includes('house') || orgClass.includes('assembly')) {
        office = 'State Representative';
      }

      const official: OfficialInfo = {
        id: `openstates_${person.id}`,
        name: person.name,
        party: mapParty(person.party),
        office,
        level: 'state_legislative',
        state: state.toUpperCase(),
        district: person.currentRole.district ? `${state.toUpperCase()}-${person.currentRole.district}` : undefined,
        image_url: person.image || '',
        urls: person.links?.map((l: { url: string }) => l.url) || [],
        emails: person.email ? [person.email] : [],
        is_incumbent: true,
        overall_score: null,
        coverage_tier: 'tier_3',
        confidence: 'low',
      };

      legislators.push(official);
      console.log(`[Open States] Mapped: ${official.name} - ${official.office} (${official.district || 'no district'})`);
    }

    console.log(`[Open States] Total legislators found: ${legislators.length}`);
    return legislators;

  } catch (error) {
    console.error(`[Open States] Error fetching legislators:`, error);
    return [];
  }
}

// Fetch federal executive from database (President, VP)
async function fetchFederalExecutiveFromDB(): Promise<OfficialInfo[]> {
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    
    const { data, error } = await supabase
      .from('static_officials')
      .select('*')
      .eq('level', 'federal_executive')
      .eq('is_active', true);

    if (error) {
      console.error('[DB] Error fetching federal executive:', error);
      return [];
    }

    console.log(`[DB] Found ${data?.length || 0} federal executive officials`);
    
    return (data || []).map(official => ({
      id: official.id,
      name: official.name,
      party: official.party as 'Democrat' | 'Republican' | 'Independent' | 'Other',
      office: official.office,
      level: official.level as OfficeLevelType,
      state: official.state,
      district: official.district,
      image_url: official.image_url || '',
      urls: official.website_url ? [official.website_url] : [],
      is_incumbent: true,
      overall_score: null,
      coverage_tier: official.coverage_tier || 'tier_1',
      confidence: official.confidence || 'high',
    }));
  } catch (error) {
    console.error('[DB] Exception fetching federal executive:', error);
    return [];
  }
}

// Fetch state executives from database (Governors, etc.)
async function fetchStateExecutivesFromDB(state: string): Promise<OfficialInfo[]> {
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    
    const { data, error } = await supabase
      .from('static_officials')
      .select('*')
      .eq('level', 'state_executive')
      .eq('state', state.toUpperCase())
      .eq('is_active', true);

    if (error) {
      console.error('[DB] Error fetching state executives:', error);
      return [];
    }

    console.log(`[DB] Found ${data?.length || 0} state executive officials for ${state}`);
    
    return (data || []).map(official => ({
      id: official.id,
      name: official.name,
      party: official.party as 'Democrat' | 'Republican' | 'Independent' | 'Other',
      office: official.office,
      level: official.level as OfficeLevelType,
      state: official.state,
      district: official.district,
      image_url: official.image_url || '',
      urls: official.website_url ? [official.website_url] : [],
      is_incumbent: true,
      overall_score: null,
      coverage_tier: official.coverage_tier || 'tier_2',
      confidence: official.confidence || 'high',
    }));
  } catch (error) {
    console.error('[DB] Exception fetching state executives:', error);
    return [];
  }
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { address, includeFederalLegislative = false } = await req.json();
    
    console.log(`=== FETCH CIVIC OFFICIALS START ===`);
    console.log(`Address: ${address}`);
    console.log(`Include federal legislative: ${includeFederalLegislative}`);
    console.log(`GOOGLE_CIVIC_API_KEY set: ${!!Deno.env.get('GOOGLE_CIVIC_API_KEY')}`);
    console.log(`GOOGLE_PLACES_API_KEY set: ${!!Deno.env.get('GOOGLE_PLACES_API_KEY')}`);
    console.log(`Using API key: ${GOOGLE_API_KEY ? 'Yes (length: ' + GOOGLE_API_KEY.length + ')' : 'No'}`);

    if (!address) {
      throw new Error('Address is required');
    }

    // Extract state from address for fallback
    const stateFromAddress = extractStateFromAddress(address);
    console.log(`State extracted from address: ${stateFromAddress}`);

    let civicApiSuccess = false;
    let mappedOfficials: OfficialInfo[] = [];

    // Try Google Civic API first
    if (GOOGLE_API_KEY) {
      const encodedAddress = encodeURIComponent(address);
      const civicBaseUrl = 'https://www.googleapis.com/civicinfo/v2/representatives';
      const civicUrl = `${civicBaseUrl}?address=${encodedAddress}&key=${GOOGLE_API_KEY}`;

      console.log(`[Google Civic] Calling API...`);
      console.log(`[Google Civic] Endpoint: ${civicBaseUrl}`);
      console.log(`[Google Civic] Full URL (without key): ${civicBaseUrl}?address=${encodedAddress}&key=***`);

      try {
        const response = await fetch(civicUrl);
        console.log(`[Google Civic] Response status: ${response.status}`);
        console.log(`[Google Civic] Response headers:`, JSON.stringify(Object.fromEntries(response.headers.entries())));

        if (!response.ok) {
          const errorText = await response.text();
          console.error(`[Google Civic] ERROR: ${response.status}`);
          console.error(`[Google Civic] Error body: ${errorText}`);
          
          // Parse error for more details
          try {
            const errorJson = JSON.parse(errorText);
            console.error(`[Google Civic] Error code: ${errorJson.error?.code}`);
            console.error(`[Google Civic] Error message: ${errorJson.error?.message}`);
            console.error(`[Google Civic] Error status: ${errorJson.error?.status}`);
            if (errorJson.error?.errors) {
              console.error(`[Google Civic] Error details:`, JSON.stringify(errorJson.error.errors));
            }
          } catch {
            console.error(`[Google Civic] Could not parse error as JSON`);
          }

          // Don't throw, let fallback handle it
        } else {
          const data = await response.json();
          
          const offices = data.offices || [];
          const officials = data.officials || [];
          const divisions = data.divisions || {};
          
          console.log(`[Google Civic] SUCCESS - Found ${offices.length} offices and ${officials.length} officials`);
          civicApiSuccess = true;

          // Map offices to officials
          for (const office of offices) {
            const divisionId = office.divisionId || '';
            const { level, normalizedOffice } = categorizeOffice(office.name, divisionId);
            
            // Skip federal legislative unless specifically requested
            if (level === 'federal_legislative' && !includeFederalLegislative) {
              console.log(`[Google Civic] Skipping federal legislative: ${office.name}`);
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
              console.log(`[Google Civic] Mapped: ${officialInfo.name} - ${officialInfo.office} (${level})`);
            }
          }
        }
      } catch (error) {
        console.error(`[Google Civic] Fetch error:`, error);
      }
    } else {
      console.log(`[Google Civic] Skipping - No API key configured`);
    }

    // Fetch federal executive from database
    const federalExecutive = await fetchFederalExecutiveFromDB();
    console.log(`[DB] Added ${federalExecutive.length} federal executive officials`);

    // Fetch state executives from database if we have a state
    if (stateFromAddress) {
      const dbStateExecutives = await fetchStateExecutivesFromDB(stateFromAddress);
      if (dbStateExecutives.length > 0) {
        console.log(`[DB] Added ${dbStateExecutives.length} state executives for ${stateFromAddress}`);
        mappedOfficials.push(...dbStateExecutives);
      }
    }

    // Use Open States as fallback for state legislators if Google Civic failed or returned none
    const civicStateLegislative = mappedOfficials.filter(o => o.level === 'state_legislative');
    
    if (civicStateLegislative.length === 0 && stateFromAddress) {
      console.log(`[Fallback] No state legislators from Civic API, trying Open States...`);
      const openStatesLegislators = await fetchOpenStatesLegislators(stateFromAddress);
      
      if (openStatesLegislators.length > 0) {
        console.log(`[Fallback] Open States returned ${openStatesLegislators.length} legislators`);
        mappedOfficials.push(...openStatesLegislators);
      }
    }

    // Categorize all officials by level
    const stateExecutive = mappedOfficials.filter(o => o.level === 'state_executive');
    const stateLegislative = mappedOfficials.filter(o => o.level === 'state_legislative');
    const local = mappedOfficials.filter(o => o.level === 'local');

    console.log(`=== RESULTS ===`);
    console.log(`Federal Executive: ${federalExecutive.length} (from DB)`);
    console.log(`State Executive: ${stateExecutive.length}`);
    console.log(`State Legislative: ${stateLegislative.length}`);
    console.log(`Local: ${local.length}`);
    console.log(`Google Civic API success: ${civicApiSuccess}`);
    console.log(`=== FETCH CIVIC OFFICIALS END ===`);

    return new Response(JSON.stringify({ 
      officials: [...federalExecutive, ...mappedOfficials],
      federalExecutive,
      stateExecutive,
      stateLegislative,
      local,
      state: stateFromAddress,
      googleCivicApiSuccess: civicApiSuccess,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('=== ERROR in fetch-civic-officials ===');
    console.error('Error:', errorMessage);
    
    // Try to return federal executive even on error
    let federalExecutive: OfficialInfo[] = [];
    try {
      federalExecutive = await fetchFederalExecutiveFromDB();
    } catch {
      console.error('Failed to fetch federal executive from DB on error recovery');
    }
    
    return new Response(JSON.stringify({ 
      error: errorMessage,
      officials: federalExecutive,
      federalExecutive,
      stateExecutive: [],
      stateLegislative: [],
      local: [],
      googleCivicApiSuccess: false,
    }), {
      status: 200, // Return 200 so client gets the static data
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
