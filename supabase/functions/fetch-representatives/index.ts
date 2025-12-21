import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// GitHub Pages URLs for unitedstates/congress-legislators data
const LEGISLATORS_URL = 'https://unitedstates.github.io/congress-legislators/legislators-current.json';
const EXECUTIVE_URL = 'https://unitedstates.github.io/congress-legislators/executive.json';
const SOCIAL_MEDIA_URL = 'https://unitedstates.github.io/congress-legislators/legislators-social-media.json';
const DISTRICT_OFFICES_URL = 'https://unitedstates.github.io/congress-legislators/legislators-district-offices.json';

// Cached data to avoid repeated fetches
let cachedLegislators: any[] | null = null;
let cachedExecutives: any[] | null = null;
let cachedSocialMedia: Map<string, SocialMedia> | null = null;
let cachedDistrictOffices: Map<string, DistrictOffice[]> | null = null;
let cacheTimestamp = 0;
const CACHE_DURATION = 1000 * 60 * 60; // 1 hour

interface SocialMedia {
  twitter?: string;
  facebook?: string;
  youtube?: string;
  instagram?: string;
}

interface DistrictOffice {
  address: string;
  city: string;
  state: string;
  zip: string;
  phone?: string;
  fax?: string;
  building?: string;
  suite?: string;
  hours?: string;
  latitude?: number;
  longitude?: number;
}

interface LegislatorTerm {
  type: 'sen' | 'rep';
  start: string;
  end: string;
  state: string;
  district?: number;
  party: string;
  url?: string;
  address?: string;
  phone?: string;
  fax?: string;
  contact_form?: string;
  office?: string;
  rss_url?: string;
}

interface Legislator {
  id: { bioguide: string; govtrack?: number };
  name: { official_full?: string; first: string; last: string };
  bio: { birthday?: string; gender?: string };
  terms: LegislatorTerm[];
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

async function fetchLegislators(): Promise<Legislator[]> {
  const now = Date.now();
  if (cachedLegislators && (now - cacheTimestamp) < CACHE_DURATION) {
    console.log('[Cache] Using cached legislators data');
    return cachedLegislators;
  }

  console.log('[Fetch] Downloading legislators from GitHub...');
  const response = await fetch(LEGISLATORS_URL);
  if (!response.ok) {
    throw new Error(`Failed to fetch legislators: ${response.status}`);
  }
  
  cachedLegislators = await response.json();
  cacheTimestamp = now;
  console.log(`[Fetch] Downloaded ${cachedLegislators!.length} current legislators`);
  return cachedLegislators!;
}

async function fetchExecutives(): Promise<Executive[]> {
  const now = Date.now();
  if (cachedExecutives && (now - cacheTimestamp) < CACHE_DURATION) {
    console.log('[Cache] Using cached executives data');
    return cachedExecutives;
  }

  console.log('[Fetch] Downloading executives from GitHub...');
  const response = await fetch(EXECUTIVE_URL);
  if (!response.ok) {
    throw new Error(`Failed to fetch executives: ${response.status}`);
  }
  
  cachedExecutives = await response.json();
  console.log(`[Fetch] Downloaded ${cachedExecutives!.length} executives`);
  return cachedExecutives!;
}

async function fetchSocialMedia(): Promise<Map<string, SocialMedia>> {
  const now = Date.now();
  if (cachedSocialMedia && (now - cacheTimestamp) < CACHE_DURATION) {
    console.log('[Cache] Using cached social media data');
    return cachedSocialMedia;
  }

  console.log('[Fetch] Downloading social media from GitHub...');
  try {
    const response = await fetch(SOCIAL_MEDIA_URL);
    if (!response.ok) {
      console.log(`[Fetch] Social media fetch failed: ${response.status}`);
      return new Map();
    }
    
    const data: Array<{ id: { bioguide: string }; social: SocialMedia }> = await response.json();
    cachedSocialMedia = new Map();
    
    for (const entry of data) {
      if (entry.id?.bioguide && entry.social) {
        cachedSocialMedia.set(entry.id.bioguide, entry.social);
      }
    }
    
    console.log(`[Fetch] Downloaded social media for ${cachedSocialMedia.size} legislators`);
    return cachedSocialMedia;
  } catch (error) {
    console.error('[Fetch] Error fetching social media:', error);
    return new Map();
  }
}

async function fetchDistrictOffices(): Promise<Map<string, DistrictOffice[]>> {
  const now = Date.now();
  if (cachedDistrictOffices && (now - cacheTimestamp) < CACHE_DURATION) {
    console.log('[Cache] Using cached district offices data');
    return cachedDistrictOffices;
  }

  console.log('[Fetch] Downloading district offices from GitHub...');
  try {
    const response = await fetch(DISTRICT_OFFICES_URL);
    if (!response.ok) {
      console.log(`[Fetch] District offices fetch failed: ${response.status}`);
      return new Map();
    }
    
    const data: Array<{ id: { bioguide: string }; offices: DistrictOffice[] }> = await response.json();
    cachedDistrictOffices = new Map();
    
    for (const entry of data) {
      if (entry.id?.bioguide && entry.offices) {
        cachedDistrictOffices.set(entry.id.bioguide, entry.offices);
      }
    }
    
    console.log(`[Fetch] Downloaded district offices for ${cachedDistrictOffices.size} legislators`);
    return cachedDistrictOffices;
  } catch (error) {
    console.error('[Fetch] Error fetching district offices:', error);
    return new Map();
  }
}

function mapParty(party: string): 'Democrat' | 'Republican' | 'Independent' | 'Other' {
  const normalized = party.toLowerCase();
  if (normalized === 'democrat' || normalized === 'democratic') return 'Democrat';
  if (normalized === 'republican') return 'Republican';
  if (normalized === 'independent') return 'Independent';
  return 'Other';
}

function getLatestTerm<T extends { start: string; end: string }>(terms: T[]): T | null {
  if (!terms || terms.length === 0) return null;
  return terms.reduce((latest, term) => 
    new Date(term.start) > new Date(latest.start) ? term : latest
  );
}

function isCurrentTerm(term: { start: string; end: string }): boolean {
  const now = new Date();
  const start = new Date(term.start);
  const end = new Date(term.end);
  return now >= start && now <= end;
}

function mapLegislatorToRepresentative(
  legislator: Legislator,
  socialMediaMap: Map<string, SocialMedia>,
  districtOfficesMap: Map<string, DistrictOffice[]>
): any {
  const latestTerm = getLatestTerm(legislator.terms);
  if (!latestTerm) return null;

  const isSenator = latestTerm.type === 'sen';
  const bioguideId = legislator.id.bioguide;
  
  // Construct image URL from bioguide_id (official Congress.gov pattern)
  const imageUrl = `https://bioguide.congress.gov/bioguide/photo/${bioguideId[0]}/${bioguideId}.jpg`;

  // Get social media
  const socialMedia = socialMediaMap.get(bioguideId) || {};
  
  // Get district offices
  const districtOffices = districtOfficesMap.get(bioguideId) || [];

  return {
    id: bioguideId,
    name: legislator.name.official_full || `${legislator.name.first} ${legislator.name.last}`,
    party: mapParty(latestTerm.party),
    office: isSenator ? 'Senator' : 'Representative',
    state: latestTerm.state,
    district: latestTerm.district !== undefined ? `${latestTerm.state}-${latestTerm.district}` : null,
    image_url: imageUrl,
    is_incumbent: true,
    bioguide_id: bioguideId,
    overall_score: null,
    coverage_tier: 'tier_3',
    confidence: 'low',
    // Contact info from current term
    website_url: latestTerm.url || null,
    phone: latestTerm.phone || null,
    address: latestTerm.address || null,
    contact_form: latestTerm.contact_form || null,
    fax: latestTerm.fax || null,
    rss_url: latestTerm.rss_url || null,
    dc_office: latestTerm.office || null,
    // Social media
    social_media: Object.keys(socialMedia).length > 0 ? socialMedia : null,
    // District offices
    district_offices: districtOffices.length > 0 ? districtOffices : null,
  };
}

function mapExecutiveToRepresentative(executive: Executive): any | null {
  const latestTerm = getLatestTerm(executive.terms);
  if (!latestTerm || !isCurrentTerm(latestTerm)) return null;

  const bioguideId = executive.id.bioguide || `exec_${executive.name.last.toLowerCase()}`;
  const isPrez = latestTerm.type === 'prez';
  
  // For executives, use White House images or fallback
  const imageUrl = executive.id.bioguide 
    ? `https://bioguide.congress.gov/bioguide/photo/${bioguideId[0]}/${bioguideId}.jpg`
    : '';

  return {
    id: bioguideId,
    name: executive.name.official_full || `${executive.name.first} ${executive.name.last}`,
    party: mapParty(latestTerm.party),
    office: isPrez ? 'President' : 'Vice President',
    state: 'US',
    district: null,
    image_url: imageUrl,
    is_incumbent: true,
    bioguide_id: bioguideId,
    overall_score: null,
    coverage_tier: 'tier_1',
    confidence: 'high',
    level: 'federal_executive',
    // Executive contact info
    website_url: isPrez ? 'https://www.whitehouse.gov/' : 'https://www.whitehouse.gov/administration/vice-president-harris/',
    phone: '202-456-1111',
    address: 'The White House, 1600 Pennsylvania Avenue NW, Washington, DC 20500',
    contact_form: 'https://www.whitehouse.gov/contact/',
    fax: null,
    social_media: null,
    district_offices: null,
  };
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { state, district, fetchAll, includeExecutives } = await req.json();
    
    console.log(`=== FETCH REPRESENTATIVES START ===`);
    console.log(`fetchAll: ${fetchAll}, state: ${state}, district: ${district}, includeExecutives: ${includeExecutives}`);

    // Fetch all data from GitHub (cached)
    const [legislators, executives, socialMediaMap, districtOfficesMap] = await Promise.all([
      fetchLegislators(),
      includeExecutives ? fetchExecutives() : Promise.resolve([]),
      fetchSocialMedia(),
      fetchDistrictOffices(),
    ]);

    // Map executives to representatives
    const executiveReps = executives
      .map(mapExecutiveToRepresentative)
      .filter((e): e is NonNullable<typeof e> => e !== null);

    console.log(`Executives found: ${executiveReps.length}`);

    // If fetchAll is true, return all Congress members
    if (fetchAll) {
      const representatives = legislators
        .map(l => mapLegislatorToRepresentative(l, socialMediaMap, districtOfficesMap))
        .filter((r): r is NonNullable<typeof r> => r !== null);
      
      console.log(`Returning all ${representatives.length} legislators`);
      
      return new Response(JSON.stringify({ 
        representatives: [...executiveReps, ...representatives],
        executives: executiveReps,
        total: representatives.length,
        state: null,
        district: null 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Filter by state/district
    const normalizedState = String(state || '').toUpperCase();
    
    if (!normalizedState) {
      console.log('No state provided, returning only executives');
      return new Response(JSON.stringify({ 
        representatives: executiveReps,
        executives: executiveReps,
        total: 0,
        state: null,
        district: null 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`Filtering for state: ${normalizedState}`);

    // Filter legislators by state
    const stateReps = legislators
      .map(l => mapLegislatorToRepresentative(l, socialMediaMap, districtOfficesMap))
      .filter((r): r is NonNullable<typeof r> => r !== null)
      .filter(r => r.state === normalizedState);

    console.log(`Found ${stateReps.length} legislators for ${normalizedState}`);

    // Filter: include all senators for the state, and only the representative for the user's district
    const filtered = stateReps.filter(rep => {
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

    console.log(`Returning ${filtered.length} filtered legislators for ${normalizedState} district ${district}`);
    
    filtered.forEach(rep => {
      console.log(`  - ${rep.name} (${rep.office}) ${rep.district || ''}`);
    });

    const allReps = [...executiveReps, ...filtered];

    return new Response(JSON.stringify({ 
      representatives: allReps,
      executives: executiveReps,
      total: filtered.length,
      state: normalizedState,
      district 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('=== ERROR in fetch-representatives ===');
    console.error('Error:', errorMessage);
    return new Response(JSON.stringify({ 
      error: errorMessage,
      representatives: [],
      executives: [],
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
