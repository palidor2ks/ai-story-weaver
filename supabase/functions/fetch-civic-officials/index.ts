import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Declare EdgeRuntime for background processing
declare const EdgeRuntime: {
  waitUntil: (promise: Promise<unknown>) => void;
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const OPEN_STATES_API_KEY = Deno.env.get('OPEN_STATES_API_KEY');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// GitHub Pages URLs for congress-legislators data
const EXECUTIVE_URL = 'https://unitedstates.github.io/congress-legislators/executive.json';
const LEGISLATORS_URL = 'https://unitedstates.github.io/congress-legislators/legislators-current.json';

// Office level categorization
type OfficeLevelType = 'federal_executive' | 'federal_legislative' | 'state_executive' | 'state_legislative' | 'local';

// Transition status for officials
type TransitionStatusType = 'current' | 'incoming' | 'outgoing' | 'candidate';

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
  // New transition fields
  transition_status?: TransitionStatusType;
  new_office?: string;
  inauguration_date?: string;
}

interface OfficialTransition {
  id: string;
  official_name: string;
  current_office: string | null;
  new_office: string;
  state: string;
  district: string | null;
  party: string | null;
  election_date: string;
  inauguration_date: string;
  transition_type: string;
  ai_confidence: string | null;
  verified: boolean | null;
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

// Normalize name for comparison (removes suffixes, middle initials, punctuation)
function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[.,]/g, '') // Remove punctuation
    .replace(/\s+(jr|sr|iii|ii|iv|v)$/i, '') // Remove suffixes
    .split(/\s+/)
    .filter(token => token.length > 1) // Remove single-letter tokens (middle initials)
    .join(' ')
    .trim();
}

// Generate multiple match keys for a name (handles variations)
function generateNameMatchKeys(name: string): string[] {
  const normalized = normalizeName(name);
  const parts = normalized.split(' ');
  
  const keys: string[] = [normalized];
  
  // Add first + last name key if we have at least 2 parts
  if (parts.length >= 2) {
    keys.push(`${parts[0]} ${parts[parts.length - 1]}`);
  }
  
  // Add first initial + last name
  if (parts.length >= 2 && parts[0].length > 0) {
    keys.push(`${parts[0][0]} ${parts[parts.length - 1]}`);
  }
  
  return keys;
}

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

// Extract city from address. Census-style: "234 DAVIS AVE, PISCATAWAY, NJ, 08854"
// or user-typed: "234 Davis Ave, Piscataway, NJ 08854"
function extractCityFromAddress(address: string): string {
  if (!address) return '';
  const parts = address.split(',').map(p => p.trim()).filter(Boolean);
  if (parts.length < 2) return '';
  // Walk from the right looking for the part immediately before "STATE [ZIP]"
  for (let i = parts.length - 1; i >= 1; i--) {
    const seg = parts[i];
    // matches "NJ" or "NJ 08854" or "08854"
    if (/^[A-Z]{2}(\s+\d{5}(-\d{4})?)?$/.test(seg) || /^\d{5}(-\d{4})?$/.test(seg)) {
      const candidate = parts[i - 1];
      if (candidate && !/^\d/.test(candidate)) return candidate;
    }
  }
  // Fallback: second part
  return parts[1] || '';
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
        const isPrez = currentTerm.type === 'prez';
        // Use standardized IDs matching static_officials table
        const standardId = isPrez ? 'federal_president' : 'federal_vice_president';
        const bioguideId = exec.id.bioguide || standardId;
        
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
          coverage_tier: 'tier_3',
          confidence: 'low',
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

// Fetch normalized names of federal legislators for a state (to filter from Open States results)
async function fetchFederalLegislatorNames(state: string): Promise<Set<string>> {
  const federalNameKeys = new Set<string>();
  
  try {
    console.log(`[GitHub] Fetching federal legislators for state: ${state}`);
    const response = await fetch(LEGISLATORS_URL);
    
    if (!response.ok) {
      console.error(`[GitHub] Failed to fetch legislators: ${response.status}`);
      return federalNameKeys;
    }
    
    const legislators = await response.json();
    
    for (const leg of legislators) {
      // Check if this legislator represents the given state
      const currentTerm = leg.terms?.[leg.terms.length - 1];
      if (!currentTerm) continue;
      
      // Check if term is current (end date in future or not set)
      const endDate = currentTerm.end ? new Date(currentTerm.end) : null;
      if (endDate && endDate < new Date()) continue;
      
      // Check if state matches
      if (currentTerm.state?.toUpperCase() !== state.toUpperCase()) continue;
      
      // Add all match keys for this legislator
      const fullName = leg.name?.official_full || `${leg.name?.first || ''} ${leg.name?.last || ''}`.trim();
      if (fullName) {
        const matchKeys = generateNameMatchKeys(fullName);
        for (const key of matchKeys) {
          federalNameKeys.add(key);
        }
        console.log(`[GitHub] Added federal legislator: ${fullName} -> keys: [${matchKeys.join(', ')}]`);
      }
    }
    
    console.log(`[GitHub] Found ${federalNameKeys.size} federal legislator match keys for ${state}`);
  } catch (error) {
    console.error('[GitHub] Error fetching federal legislators:', error);
  }
  
  return federalNameKeys;
}

// Fetch state legislators and governors from Open States API v3
async function fetchOpenStatesOfficials(
  state: string, 
  lat?: number, 
  lng?: number,
  federalLegislatorNames?: Set<string>
): Promise<{ legislators: OfficialInfo[], governors: OfficialInfo[] }> {
  if (!OPEN_STATES_API_KEY) {
    console.error('[Open States] No API key configured');
    return { legislators: [], governors: [] };
  }

  console.log(`[Open States] Fetching officials for state: ${state}, lat: ${lat}, lng: ${lng}`);
  console.log(`[Open States] Federal legislator names to exclude: ${federalLegislatorNames?.size || 0}`);
  
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
      legislatorsUrl = `https://v3.openstates.org/people?jurisdiction=${state.toLowerCase()}&per_page=50`;
      console.log(`[Open States] Using jurisdiction endpoint: ${legislatorsUrl}`);
    }

    const legislatorsResponse = await fetch(legislatorsUrl, { headers });
    console.log(`[Open States] Legislators response status: ${legislatorsResponse.status}`);

    if (legislatorsResponse.ok) {
      const data = await legislatorsResponse.json();
      const results = data.results || [];
      console.log(`[Open States] Found ${results.length} legislators from API`);

      for (const person of results) {
        if (!person.current_role) continue;

        // Check if this person's name matches any federal legislator keys
        const personMatchKeys = generateNameMatchKeys(person.name);
        const matchingKey = personMatchKeys.find(key => federalLegislatorNames?.has(key));
        if (matchingKey) {
          console.log(`[Open States] EXCLUDING ${person.name} - matches federal legislator key: "${matchingKey}"`);
          continue;
        }

        const role = person.current_role;
        let office = 'State Legislator';
        
        if (role.org_classification === 'upper') {
          office = 'State Senator';
        } else if (role.org_classification === 'lower') {
          office = 'State Representative';
        }

        const official: OfficialInfo = {
          id: `openstates_${person.id.replace(/\//g, '_')}`,
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
          confidence: 'low',
        };

        legislators.push(official);
      }
      
      console.log(`[Open States] After filtering: ${legislators.length} state legislators`);
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
        if (!title.includes('governor')) {
          console.log(`[Open States] SKIPPING executive "${person.name}" — title "${role.title}" does not contain "governor"`);
          continue;
        }

        const isLtGov = title.includes('lieutenant') || title.includes('lt.');
        
        const official: OfficialInfo = {
          id: `openstates_${person.id.replace(/\//g, '_')}`,
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
          coverage_tier: 'tier_3',
          confidence: 'low',
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
async function fetchLocalOfficialsFromDB(state: string, city?: string): Promise<OfficialInfo[]> {
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    
    let query = supabase
      .from('static_officials')
      .select('*')
      .eq('level', 'local')
      .eq('state', state.toUpperCase())
      .eq('is_active', true);

    // Match rows that are city-agnostic (city IS NULL) OR match this user's city (case-insensitive)
    if (city && city.trim()) {
      query = query.or(`city.is.null,city.ilike.${city.trim()}`);
    } else {
      query = query.is('city', null);
    }

    const { data, error } = await query;

    if (error) {
      console.error('[DB] Error fetching local officials:', error);
      return [];
    }

    console.log(`[DB] Found ${data?.length || 0} local officials for ${state}${city ? ` / ${city}` : ''}`);
    
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
      confidence: official.confidence || 'low',
    }));
  } catch (error) {
    console.error('[DB] Exception fetching local officials:', error);
    return [];
  }
}

// Geocode address to get coordinates
async function geocodeAddress(address: string): Promise<{ lat: number, lng: number } | null> {
  try {
    // Use Census Bureau geocoder (free, no API key needed) — same as geocode-address edge function
    const encodedAddress = encodeURIComponent(address);
    const url = `https://geocoding.geo.census.gov/geocoder/geographies/onelineaddress?address=${encodedAddress}&benchmark=Public_AR_Current&vintage=Current_Current&layers=all&format=json`;
    
    console.log(`[Geocode] Census geocoding for: "${address}"`);
    const response = await fetch(url);
    if (!response.ok) {
      console.error(`[Geocode] Census API HTTP error: ${response.status}`);
      return null;
    }

    const data = await response.json();
    const addressMatch = data?.result?.addressMatches?.[0];
    
    if (!addressMatch) {
      console.log('[Geocode] No address matches from Census');
      return null;
    }

    const coords = addressMatch.coordinates;
    if (coords?.x && coords?.y) {
      console.log(`[Geocode] Found coordinates: ${coords.y}, ${coords.x} (${addressMatch.matchedAddress})`);
      return { lat: coords.y, lng: coords.x };
    }

    console.log('[Geocode] No coordinates in Census response');
    return null;
  } catch (error) {
    console.error('[Geocode] Error:', error);
    return null;
  }
}

// Fetch official transitions from database
async function fetchOfficialTransitions(state: string): Promise<OfficialTransition[]> {
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    
    const { data, error } = await supabase
      .from('official_transitions')
      .select('*')
      .eq('state', state.toUpperCase())
      .eq('is_active', true);

    if (error) {
      console.error('[Transitions] Error fetching transitions:', error);
      return [];
    }

    console.log(`[Transitions] Found ${data?.length || 0} transitions for ${state}`);
    return data || [];
  } catch (error) {
    console.error('[Transitions] Exception:', error);
    return [];
  }
}

// Apply transition data to officials list
function applyTransitions(officials: OfficialInfo[], transitions: OfficialTransition[]): OfficialInfo[] {
  if (transitions.length === 0) return officials;

  const today = new Date();
  const transitionMap = new Map<string, OfficialTransition>();
  
  // Build map of transitions by name (normalized)
  for (const t of transitions) {
    transitionMap.set(t.official_name.toLowerCase(), t);
  }

  // Mark officials with transition status
  const updatedOfficials = officials.map(official => {
    const transition = transitionMap.get(official.name.toLowerCase());
    
    if (transition) {
      const inaugDate = new Date(transition.inauguration_date);
      const isBeforeInauguration = today < inaugDate;
      
      // If this official is transitioning TO a different office
      if (transition.current_office && 
          official.office.toLowerCase().includes(transition.current_office.toLowerCase())) {
        // They're running for or elected to a new position
        return {
          ...official,
          transition_status: isBeforeInauguration ? 'candidate' as TransitionStatusType : 'current' as TransitionStatusType,
          new_office: transition.new_office,
          inauguration_date: transition.inauguration_date,
        };
      }
      
      // If this official IS the incumbent being replaced
      const isCurrentIncumbent = official.office.toLowerCase().includes(transition.new_office.toLowerCase());
      if (isCurrentIncumbent && isBeforeInauguration) {
        // Find if there's someone else who won their seat
        const hasReplacement = transitions.some(t => 
          t.new_office.toLowerCase() === official.office.toLowerCase() &&
          t.official_name.toLowerCase() !== official.name.toLowerCase()
        );
        if (hasReplacement) {
          return {
            ...official,
            transition_status: 'outgoing' as TransitionStatusType,
          };
        }
      }
    }
    
    return official;
  });

  // Add incoming officials who aren't yet in the list (pre-inauguration)
  // AND add already-inaugurated officials missing from Open States (data correction)
  const additionalOfficials: OfficialInfo[] = [];
  
  for (const transition of transitions) {
    const inaugDate = new Date(transition.inauguration_date);
    const isBeforeInauguration = today < inaugDate;
    
    // Check if this person is already in our list
    const alreadyInList = updatedOfficials.some(o => 
      o.name.toLowerCase() === transition.official_name.toLowerCase()
    );
    
    if (!alreadyInList) {
      const level: OfficeLevelType = transition.new_office.toLowerCase().includes('governor') 
        ? 'state_executive' 
        : transition.new_office.toLowerCase().includes('senator') || transition.new_office.toLowerCase().includes('representative')
          ? 'state_legislative'
          : 'local';

      if (isBeforeInauguration) {
        // Future inauguration — add as incoming
        additionalOfficials.push({
          id: `transition_${transition.id}`,
          name: transition.official_name,
          party: (transition.party as 'Democrat' | 'Republican' | 'Independent' | 'Other') || 'Other',
          office: transition.new_office,
          level,
          state: transition.state,
          district: transition.district || undefined,
          image_url: '',
          is_incumbent: false,
          overall_score: null,
          coverage_tier: 'tier_2',
          confidence: transition.ai_confidence || 'medium',
          transition_status: 'incoming',
          new_office: transition.new_office,
          inauguration_date: transition.inauguration_date,
        });
      } else {
        // Already inaugurated but missing from Open States — add as current
        console.log(`[Transitions] Adding missing inaugurated official: ${transition.official_name} as ${transition.new_office}`);
        additionalOfficials.push({
          id: `transition_${transition.id}`,
          name: transition.official_name,
          party: (transition.party as 'Democrat' | 'Republican' | 'Independent' | 'Other') || 'Other',
          office: transition.new_office,
          level,
          state: transition.state,
          district: transition.district || undefined,
          image_url: '',
          is_incumbent: true,
          overall_score: null,
          coverage_tier: 'tier_3',
          confidence: transition.ai_confidence || 'medium',
          transition_status: 'current',
        });
      }
    }
  }

  console.log(`[Transitions] Added ${additionalOfficials.length} additional officials (incoming + corrections)`);
  return [...updatedOfficials, ...additionalOfficials];
}

// =============================================================================
// PERSIST OFFICIALS & TRIGGER AI RESEARCH (background)
// =============================================================================

// Max officials to trigger AI research per single request to avoid overloading Perplexity
const MAX_RESEARCH_PER_RUN = 3;
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 2000; // 2s base, exponential backoff

async function fetchWithRetry(
  url: string, 
  options: RequestInit, 
  officialName: string
): Promise<Response> {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(url, options);
      
      // Retry on 429 (rate limit) or 502/503/504 (server overload)
      if ((response.status === 429 || response.status >= 502) && attempt < MAX_RETRIES) {
        const delay = BASE_DELAY_MS * Math.pow(2, attempt - 1); // 2s, 4s, 8s
        console.log(`[Persist] ${officialName}: ${response.status}, retrying in ${delay}ms (attempt ${attempt}/${MAX_RETRIES})`);
        await response.text(); // consume body
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      
      return response;
    } catch (err) {
      if (attempt < MAX_RETRIES) {
        const delay = BASE_DELAY_MS * Math.pow(2, attempt - 1);
        console.log(`[Persist] ${officialName}: network error, retrying in ${delay}ms (attempt ${attempt}/${MAX_RETRIES})`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      throw err;
    }
  }
  // Should never reach here, but TypeScript needs it
  throw new Error(`Max retries exceeded for ${officialName}`);
}

async function persistAndResearchOfficials(officials: OfficialInfo[], authHeader: string) {
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Filter to state/local officials only (federal are already in candidates table)
    const persistable = officials.filter(o => 
      o.level === 'state_executive' || o.level === 'state_legislative' || o.level === 'local'
    );

    if (persistable.length === 0) {
      console.log('[Persist] No state/local officials to persist');
      return;
    }

    console.log(`[Persist] Upserting ${persistable.length} officials to candidate_overrides`);

    // Map party string to the enum type used in candidate_overrides
    const mapPartyForDb = (party: string): string => {
      if (party === 'Democrat' || party === 'Republican' || party === 'Independent') return party;
      return 'Other';
    };

    // Upsert each official into candidate_overrides
    const overrides = persistable.map(o => ({
      candidate_id: o.id,
      name: o.name,
      party: mapPartyForDb(o.party),
      office: o.office,
      state: o.state,
      district: o.district || null,
      image_url: o.image_url || null,
      is_active: true,
    }));

    const { error: upsertError } = await supabase
      .from('candidate_overrides')
      .upsert(overrides, { onConflict: 'candidate_id', ignoreDuplicates: true });

    if (upsertError) {
      console.error('[Persist] Error upserting officials:', upsertError);
      return;
    }

    console.log(`[Persist] Successfully upserted ${overrides.length} officials`);

    // Check which officials need answer generation
    const officialIds = persistable.map(o => o.id);
    const { data: existingAnswers } = await supabase
      .from('candidate_answers')
      .select('candidate_id')
      .in('candidate_id', officialIds);

    const idsWithAnswers = new Set((existingAnswers || []).map((a: any) => a.candidate_id));
    const officialsNeedingResearch = persistable.filter(o => !idsWithAnswers.has(o.id));

    if (officialsNeedingResearch.length === 0) {
      console.log('[Persist] All officials already have answers cached');
      return;
    }

    // Cap to MAX_RESEARCH_PER_RUN to avoid Perplexity/function overload
    const toProcess = officialsNeedingResearch.slice(0, MAX_RESEARCH_PER_RUN);
    const skipped = officialsNeedingResearch.length - toProcess.length;
    
    console.log(`[Persist] ${officialsNeedingResearch.length} officials need research, processing ${toProcess.length} (max ${MAX_RESEARCH_PER_RUN}/run)${skipped > 0 ? `, ${skipped} deferred to next request` : ''}`);

    let successCount = 0;
    let failCount = 0;

    for (const official of toProcess) {
      try {
        console.log(`[Persist] Triggering answer generation for ${official.name} (${official.id})`);
        
        const response = await fetchWithRetry(
          `${SUPABASE_URL}/functions/v1/get-candidate-answers`,
          {
            method: 'POST',
            headers: {
              'Authorization': authHeader,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              candidateId: official.id,
              candidateName: official.name,
              candidateParty: official.party,
              candidateOffice: official.office,
              candidateState: official.state,
              useBackground: true,
            }),
          },
          official.name
        );

        if (!response.ok) {
          const errorText = await response.text();
          console.error(`[Persist] Failed to trigger answers for ${official.name}: ${response.status} - ${errorText}`);
          failCount++;
        } else {
          await response.text(); // consume body
          console.log(`[Persist] Successfully triggered answer generation for ${official.name}`);
          successCount++;
        }

        // Stagger calls: 3s between triggers to spread Perplexity load
        if (toProcess.indexOf(official) < toProcess.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 3000));
        }
      } catch (err) {
        console.error(`[Persist] Error triggering answers for ${official.name}:`, err);
        failCount++;
      }
    }

    console.log(`[Persist] Research triggers complete: ${successCount} success, ${failCount} failed, ${skipped} deferred`);
  } catch (error) {
    console.error('[Persist] Top-level error:', error);
  }
}

// Fetch manually-added civic officials from candidate_overrides (non-openstates, non-federal)
async function fetchManualCivicOverrides(state: string): Promise<OfficialInfo[]> {
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const { data, error } = await supabase
      .from('candidate_overrides')
      .select('candidate_id, name, party, office, state, district, image_url')
      .eq('state', state.toUpperCase())
      .eq('is_active', true)
      .not('candidate_id', 'like', 'openstates_%'); // openstates ones are added via Open States API

    if (error) {
      console.error('[Manual Overrides] Error:', error);
      return [];
    }

    return (data || []).filter(o => o.name).map(o => ({
      id: o.candidate_id,
      name: o.name!,
      party: mapParty(o.party || undefined),
      office: o.office || 'Official',
      level: (o.office?.toLowerCase().includes('governor') ? 'state_executive' : 'local') as OfficeLevelType,
      state: o.state || state.toUpperCase(),
      district: o.district || undefined,
      image_url: o.image_url || '',
      is_incumbent: true,
      overall_score: null,
      coverage_tier: 'tier_3',
      confidence: 'low',
    }));
  } catch (error) {
    console.error('[Manual Overrides] Exception:', error);
    return [];
  }
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Auth check - require authenticated user
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const { address, includeFederalLegislative = false } = await req.json();
    
    console.log(`=== FETCH CIVIC OFFICIALS START ===`);
    console.log(`Address: ${address}`);
    console.log(`Include federal legislative: ${includeFederalLegislative}`);
    console.log(`OPEN_STATES_API_KEY set: ${!!OPEN_STATES_API_KEY}`);

    if (!address) {
      throw new Error('Address is required');
    }

    // Extract state and city from address
    const state = extractStateFromAddress(address);
    const city = extractCityFromAddress(address);
    console.log(`State: ${state}, City: ${city}`);

    if (!state) {
      console.error('Could not extract state from address');
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

    // First fetch federal legislator names to filter from Open States results
    const federalLegislatorNames = await fetchFederalLegislatorNames(state);

    // Fetch from all sources in parallel (including transitions and manual overrides)
    const [federalExecutive, openStatesResult, localOfficials, transitions, manualOverrides] = await Promise.all([
      fetchFederalExecutiveFromGitHub(),
      fetchOpenStatesOfficials(state, coords?.lat, coords?.lng, federalLegislatorNames),
      fetchLocalOfficialsFromDB(state, city),
      fetchOfficialTransitions(state),
      fetchManualCivicOverrides(state),
    ]);

    // If we have a city but no Mayor row yet, fire-and-forget AI research (cached after first lookup)
    if (city) {
      const citySlug = city.toLowerCase().replace(/[^a-z0-9]+/g, '_');
      const hasMayor = localOfficials.some(o =>
        (o.office || '').toLowerCase().startsWith('mayor') &&
        (o.id || '').toLowerCase().includes(citySlug)
      );
      if (!hasMayor) {
        console.log(`[Mayor] No mayor cached for ${city}, ${state} — triggering fetch-mayor`);
        fetch(`${SUPABASE_URL}/functions/v1/fetch-mayor`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
            'apikey': Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ state, city, background: true }),
        }).catch((e) => console.error('[Mayor] fetch-mayor invoke failed', e));
      }
    }

    const { legislators: stateLegislative, governors: stateExecutiveFromAPI } = openStatesResult;

    console.log(`=== RESULTS ===`);
    console.log(`Federal Executive: ${federalExecutive.length} (from GitHub unitedstates/congress-legislators)`);
    console.log(`State Executive: ${stateExecutiveFromAPI.length} (from Open States API)`);
    console.log(`State Legislative: ${stateLegislative.length} (from Open States API)`);
    console.log(`Local: ${localOfficials.length} (from DB - no free API exists)`);
    console.log(`Transitions: ${transitions.length} (from DB)`);
    console.log(`Manual Overrides: ${manualOverrides.length} (from candidate_overrides)`);

    // Combine all officials
    let allOfficials = [
      ...federalExecutive,
      ...stateExecutiveFromAPI,
      ...stateLegislative,
      ...localOfficials,
      ...manualOverrides,
    ];

    // Apply transition data (mark outgoing, add incoming officials)
    allOfficials = applyTransitions(allOfficials, transitions);

    console.log(`Total officials after transitions: ${allOfficials.length}`);

    // Persist officials to database and trigger answer generation in background
    EdgeRuntime.waitUntil(persistAndResearchOfficials(allOfficials, authHeader));

    console.log(`=== FETCH CIVIC OFFICIALS END ===`);

    // Re-categorize for response
    const finalFederalExecutive = allOfficials.filter(o => o.level === 'federal_executive');
    const finalStateExecutive = allOfficials.filter(o => o.level === 'state_executive');
    const finalStateLegislative = allOfficials.filter(o => o.level === 'state_legislative');
    const finalLocal = allOfficials.filter(o => o.level === 'local');

    return new Response(JSON.stringify({ 
      officials: allOfficials,
      federalExecutive: finalFederalExecutive,
      stateExecutive: finalStateExecutive,
      stateLegislative: finalStateLegislative,
      local: finalLocal,
      state,
      hasTransitions: transitions.length > 0,
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
