import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const OPEN_STATES_API_KEY = Deno.env.get('OPEN_STATES_API_KEY');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

// GitHub Pages URL for executive data
const EXECUTIVE_URL = 'https://unitedstates.github.io/congress-legislators/executive.json';

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

interface Executive {
  id: { bioguide?: string; govtrack?: number };
  name: { official_full?: string; first: string; last: string };
  terms: Array<{
    type: 'prez' | 'viceprez';
    start: string;
    end: string;
    party: string;
  }>;
}

// Cached executives data
let cachedExecutives: Executive[] | null = null;
let cacheTimestamp = 0;
const CACHE_DURATION = 1000 * 60 * 60; // 1 hour

// Map party names to our types
function mapParty(party: string | undefined): 'Democrat' | 'Republican' | 'Independent' | 'Other' {
  if (!party) return 'Other';
  const normalizedParty = party.toLowerCase();
  if (normalizedParty.includes('democrat')) return 'Democrat';
  if (normalizedParty.includes('republican')) return 'Republican';
  if (normalizedParty.includes('independent') || normalizedParty.includes('nonpartisan')) return 'Independent';
  return 'Other';
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

// Fetch federal executives from GitHub (unitedstates/congress-legislators)
async function fetchFederalExecutiveFromGitHub(): Promise<OfficialInfo[]> {
  const now = Date.now();
  
  try {
    // Use cache if available
    if (cachedExecutives && (now - cacheTimestamp) < CACHE_DURATION) {
      console.log('[Cache] Using cached executives data');
    } else {
      console.log('[Fetch] Downloading executives from GitHub...');
      const response = await fetch(EXECUTIVE_URL);
      if (!response.ok) {
        throw new Error(`Failed to fetch executives: ${response.status}`);
      }
      cachedExecutives = await response.json();
      cacheTimestamp = now;
      console.log(`[Fetch] Downloaded ${cachedExecutives!.length} executives`);
    }

    // Get current date for filtering
    const today = new Date();
    
    // Find current President and VP
    const currentExecutives: OfficialInfo[] = [];
    
    for (const exec of cachedExecutives!) {
      const currentTerm = exec.terms?.find(term => {
        const start = new Date(term.start);
        const end = new Date(term.end);
        return today >= start && today <= end;
      });

      if (currentTerm) {
        const bioguideId = exec.id.bioguide || `exec_${exec.name.last.toLowerCase()}`;
        const isPrez = currentTerm.type === 'prez';
        
        // Construct image URL
        const imageUrl = exec.id.bioguide 
          ? `https://bioguide.congress.gov/bioguide/photo/${bioguideId[0]}/${bioguideId}.jpg`
          : '';

        currentExecutives.push({
          id: bioguideId,
          name: exec.name.official_full || `${exec.name.first} ${exec.name.last}`,
          party: mapParty(currentTerm.party),
          office: isPrez ? 'President' : 'Vice President',
          level: 'federal_executive',
          state: 'US',
          image_url: imageUrl,
          is_incumbent: true,
          overall_score: null,
          coverage_tier: 'tier_1',
          confidence: 'high',
        });
      }
    }

    console.log(`[GitHub] Found ${currentExecutives.length} current federal executives`);
    return currentExecutives;
  } catch (error) {
    console.error('[GitHub] Error fetching executives:', error);
    // Fall back to database if GitHub fails
    return fetchFederalExecutiveFromDB();
  }
}

// Fallback: Fetch federal executive from database
async function fetchFederalExecutiveFromDB(): Promise<OfficialInfo[]> {
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    
    const { data, error } = await supabase
      .from('static_officials')
      .select('*')
      .eq('level', 'federal_executive')
      .eq('is_active', true);

    if (error) {
      console.error('[DB Fallback] Error fetching federal executive:', error);
      return [];
    }

    console.log(`[DB Fallback] Found ${data?.length || 0} federal executive officials`);
    
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
    console.error('[DB Fallback] Exception fetching federal executive:', error);
    return [];
  }
}

// Fetch state legislators and governors from Open States API v3
async function fetchOpenStatesOfficials(state: string, lat?: number, lng?: number): Promise<{ legislators: OfficialInfo[], governors: OfficialInfo[] }> {
  if (!OPEN_STATES_API_KEY) {
    console.error('[Open States] No API key configured');
    return { legislators: [], governors: [] };
  }

  console.log(`[Open States] Fetching officials for state: ${state}, lat: ${lat}, lng: ${lng}`);
  
  const headers = {
    'X-API-KEY': OPEN_STATES_API_KEY,
    'Accept': 'application/json',
  };

  const legislators: OfficialInfo[] = [];
  const governors: OfficialInfo[] = [];

  try {
    // Fetch legislators - use geo endpoint if we have coordinates
    let legislatorsUrl: string;
    if (lat && lng) {
      legislatorsUrl = `https://v3.openstates.org/people.geo?lat=${lat}&lng=${lng}`;
      console.log(`[Open States] Using geo endpoint: ${legislatorsUrl}`);
    } else {
      legislatorsUrl = `https://v3.openstates.org/people?jurisdiction=${state.toLowerCase()}&per_page=100`;
      console.log(`[Open States] Using jurisdiction endpoint: ${legislatorsUrl}`);
    }

    const legislatorsResponse = await fetch(legislatorsUrl, { headers });
    console.log(`[Open States] Legislators response status: ${legislatorsResponse.status}`);

    if (legislatorsResponse.ok) {
      const data = await legislatorsResponse.json();
      const results = data.results || [];
      console.log(`[Open States] Found ${results.length} legislators`);

      for (const person of results) {
        if (!person.current_role) continue;

        const role = person.current_role;
        let office = 'State Legislator';
        
        if (role.org_classification === 'upper') {
          office = 'State Senator';
        } else if (role.org_classification === 'lower') {
          office = 'State Representative';
        }

        const official: OfficialInfo = {
          id: `openstates_${person.id}`,
          name: person.name,
          party: mapParty(person.party),
          office,
          level: 'state_legislative',
          state: state.toUpperCase(),
          district: role.district ? `${state.toUpperCase()}-${role.district}` : undefined,
          image_url: person.image || '',
          urls: person.links?.map((l: { url: string }) => l.url) || [],
          emails: person.email ? [person.email] : [],
          is_incumbent: true,
          overall_score: null,
          coverage_tier: 'tier_3',
          confidence: 'medium',
        };

        legislators.push(official);
      }
    } else {
      const errorText = await legislatorsResponse.text();
      console.error(`[Open States] Legislators API error: ${legislatorsResponse.status} - ${errorText}`);
    }

    // Fetch governors - use jurisdiction search for executive officials
    const governorsUrl = `https://v3.openstates.org/people?jurisdiction=${state.toLowerCase()}&org_classification=executive&per_page=10`;
    console.log(`[Open States] Fetching governors: ${governorsUrl}`);

    const governorsResponse = await fetch(governorsUrl, { headers });
    console.log(`[Open States] Governors response status: ${governorsResponse.status}`);

    if (governorsResponse.ok) {
      const data = await governorsResponse.json();
      const results = data.results || [];
      console.log(`[Open States] Found ${results.length} executive officials`);

      for (const person of results) {
        if (!person.current_role) continue;

        const role = person.current_role;
        const title = (role.title || '').toLowerCase();
        
        // Only include governors and lieutenant governors
        if (!title.includes('governor')) continue;

        const isLtGov = title.includes('lieutenant') || title.includes('lt.');
        
        const official: OfficialInfo = {
          id: `openstates_${person.id}`,
          name: person.name,
          party: mapParty(person.party),
          office: isLtGov ? 'Lieutenant Governor' : 'Governor',
          level: 'state_executive',
          state: state.toUpperCase(),
          image_url: person.image || '',
          urls: person.links?.map((l: { url: string }) => l.url) || [],
          emails: person.email ? [person.email] : [],
          is_incumbent: true,
          overall_score: null,
          coverage_tier: 'tier_2',
          confidence: 'high',
        };

        governors.push(official);
      }
    } else {
      const errorText = await governorsResponse.text();
      console.error(`[Open States] Governors API error: ${governorsResponse.status} - ${errorText}`);
    }

  } catch (error) {
    console.error(`[Open States] Error:`, error);
  }

  console.log(`[Open States] Total: ${legislators.length} legislators, ${governors.length} governors`);
  return { legislators, governors };
}

// Fetch local officials from database (no free API exists)
async function fetchLocalOfficialsFromDB(state: string): Promise<OfficialInfo[]> {
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    
    const { data, error } = await supabase
      .from('static_officials')
      .select('*')
      .eq('level', 'local')
      .eq('state', state.toUpperCase())
      .eq('is_active', true);

    if (error) {
      console.error('[DB] Error fetching local officials:', error);
      return [];
    }

    console.log(`[DB] Found ${data?.length || 0} local officials for ${state}`);
    
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
      coverage_tier: official.coverage_tier || 'tier_3',
      confidence: official.confidence || 'medium',
    }));
  } catch (error) {
    console.error('[DB] Exception fetching local officials:', error);
    return [];
  }
}

// Geocode address to get coordinates
async function geocodeAddress(address: string): Promise<{ lat: number, lng: number } | null> {
  const GOOGLE_API_KEY = Deno.env.get('GOOGLE_PLACES_API_KEY');
  if (!GOOGLE_API_KEY) {
    console.log('[Geocode] No Google API key available');
    return null;
  }

  try {
    const encodedAddress = encodeURIComponent(address);
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodedAddress}&key=${GOOGLE_API_KEY}`;
    
    const response = await fetch(url);
    if (!response.ok) {
      console.error('[Geocode] API error:', response.status);
      return null;
    }

    const data = await response.json();
    if (data.status === 'OK' && data.results?.length > 0) {
      const location = data.results[0].geometry.location;
      console.log(`[Geocode] Found coordinates: ${location.lat}, ${location.lng}`);
      return { lat: location.lat, lng: location.lng };
    }

    console.log('[Geocode] No results found');
    return null;
  } catch (error) {
    console.error('[Geocode] Error:', error);
    return null;
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
    console.log(`OPEN_STATES_API_KEY set: ${!!OPEN_STATES_API_KEY}`);

    if (!address) {
      throw new Error('Address is required');
    }

    // Extract state from address
    const state = extractStateFromAddress(address);
    console.log(`State extracted from address: ${state}`);

    if (!state) {
      console.error('Could not extract state from address');
      // Still try to get federal executive even without state
      const federalExecutive = await fetchFederalExecutiveFromGitHub();
      return new Response(JSON.stringify({ 
        officials: federalExecutive,
        federalExecutive,
        stateExecutive: [],
        stateLegislative: [],
        local: [],
        state: null,
        error: 'Could not determine state from address',
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get coordinates for geo-based lookup
    const coords = await geocodeAddress(address);

    // Fetch from all sources in parallel
    const [federalExecutive, openStatesResult, localOfficials] = await Promise.all([
      fetchFederalExecutiveFromGitHub(),
      fetchOpenStatesOfficials(state, coords?.lat, coords?.lng),
      fetchLocalOfficialsFromDB(state),
    ]);

    const { legislators: stateLegislative, governors: stateExecutiveFromAPI } = openStatesResult;

    console.log(`=== RESULTS ===`);
    console.log(`Federal Executive: ${federalExecutive.length} (from GitHub unitedstates/congress-legislators)`);
    console.log(`State Executive: ${stateExecutiveFromAPI.length} (from Open States API)`);
    console.log(`State Legislative: ${stateLegislative.length} (from Open States API)`);
    console.log(`Local: ${localOfficials.length} (from DB - no free API exists)`);
    console.log(`=== FETCH CIVIC OFFICIALS END ===`);

    const allOfficials = [
      ...federalExecutive,
      ...stateExecutiveFromAPI,
      ...stateLegislative,
      ...localOfficials,
    ];

    return new Response(JSON.stringify({ 
      officials: allOfficials,
      federalExecutive,
      stateExecutive: stateExecutiveFromAPI,
      stateLegislative,
      local: localOfficials,
      state,
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
      federalExecutive = await fetchFederalExecutiveFromGitHub();
    } catch {
      console.error('Failed to fetch federal executive on error recovery');
    }
    
    return new Response(JSON.stringify({ 
      error: errorMessage,
      officials: federalExecutive,
      federalExecutive,
      stateExecutive: [],
      stateLegislative: [],
      local: [],
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
