import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { parse as parseYaml } from "https://deno.land/std@0.224.0/yaml/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface FECCandidate {
  candidate_id: string;
  name: string;
  party: string;
  office: string;
  state: string;
  district?: string;
  cycles: number[];
  principal_committee_id?: string;
  match_score?: number;
  match_method?: 'crosswalk' | 'fec_api';
}

interface Legislator {
  id: {
    bioguide?: string;
    fec?: string | string[];
  };
  name: {
    first: string;
    last: string;
    official_full?: string;
  };
  terms?: Array<{
    type: string;
    state: string;
    district?: number;
  }>;
}

const CROSSWALK_URL = 'https://raw.githubusercontent.com/unitedstates/congress-legislators/main/legislators-current.yaml';

// Cache crosswalk data for 1 hour
let crosswalkCache: { data: Legislator[] | null; timestamp: number } = { data: null, timestamp: 0 };
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

async function fetchCrosswalk(): Promise<Legislator[]> {
  const now = Date.now();
  if (crosswalkCache.data && (now - crosswalkCache.timestamp) < CACHE_TTL_MS) {
    console.log('[FEC] Using cached crosswalk data');
    return crosswalkCache.data;
  }

  console.log('[FEC] Fetching crosswalk from GitHub...');
  const response = await fetch(CROSSWALK_URL);
  if (!response.ok) {
    throw new Error(`Failed to fetch crosswalk: ${response.status}`);
  }

  const yamlText = await response.text();
  const legislators = parseYaml(yamlText) as Legislator[];
  
  crosswalkCache = { data: legislators, timestamp: now };
  console.log('[FEC] Cached', legislators.length, 'legislators from crosswalk');
  
  return legislators;
}

async function lookupFECFromCrosswalk(bioguideId: string): Promise<{ fecIds: string[]; legislator: Legislator } | null> {
  try {
    const legislators = await fetchCrosswalk();
    const match = legislators.find(l => l.id?.bioguide === bioguideId);
    
    if (match?.id?.fec) {
      const fecIds = Array.isArray(match.id.fec) ? match.id.fec : [match.id.fec];
      console.log('[FEC] Crosswalk match for', bioguideId, '→', fecIds);
      return { fecIds, legislator: match };
    }
    
    console.log('[FEC] No crosswalk match for bioguide:', bioguideId);
    return null;
  } catch (error) {
    console.error('[FEC] Crosswalk lookup failed:', error);
    return null;
  }
}

// Calculate name similarity (0-1)
function calculateNameSimilarity(fecName: string, ourName: string): number {
  const normalize = (s: string) => s.toLowerCase().replace(/[^a-z]/g, '');
  const fecNorm = normalize(fecName);
  const ourNorm = normalize(ourName);
  
  // Check if one contains the other
  if (fecNorm.includes(ourNorm) || ourNorm.includes(fecNorm)) {
    return 0.9;
  }
  
  // Extract last name and check
  const fecParts = fecName.toUpperCase().split(/[,\s]+/).filter(Boolean);
  const ourParts = ourName.split(/\s+/).filter(Boolean);
  const ourLastName = ourParts[ourParts.length - 1]?.toUpperCase();
  
  if (fecParts.includes(ourLastName)) {
    return 0.8;
  }
  
  // Simple character overlap ratio
  const longer = fecNorm.length > ourNorm.length ? fecNorm : ourNorm;
  const shorter = fecNorm.length > ourNorm.length ? ourNorm : fecNorm;
  
  let matches = 0;
  for (const char of shorter) {
    if (longer.includes(char)) matches++;
  }
  
  return matches / longer.length;
}

// Score FEC API result against our candidate data
function scoreCandidate(
  fecResult: { name: string; state: string; office: string; district?: string; cycles?: number[]; principal_committee_id?: string },
  ourCandidate: { name: string; state: string; office?: string; district?: string }
): number {
  let score = 0;
  
  // State match (required - return 0 if no match)
  if (fecResult.state !== ourCandidate.state) {
    console.log('[FEC] State mismatch:', fecResult.state, '≠', ourCandidate.state);
    return 0;
  }
  score += 20;
  
  // Office type match
  const isHouse = ourCandidate.office?.toLowerCase().includes('representative') || 
                  ourCandidate.office?.toLowerCase().includes('house');
  const isSenate = ourCandidate.office?.toLowerCase().includes('senator') || 
                   ourCandidate.office?.toLowerCase().includes('senate');
  
  if (isHouse && fecResult.office === 'H') score += 25;
  else if (isSenate && fecResult.office === 'S') score += 25;
  else if (!isHouse && !isSenate) score += 10; // Unknown office, partial credit
  
  // District match (for House members)
  if (isHouse && fecResult.district && ourCandidate.district) {
    const fecDistrict = fecResult.district.replace(/^0+/, '');
    const ourDistrict = ourCandidate.district.replace(/^0+/, '');
    if (fecDistrict === ourDistrict) {
      score += 20;
    }
  }
  
  // Recent election years (2024, 2026)
  const recentYears = [2024, 2025, 2026];
  if (fecResult.cycles?.some(y => recentYears.includes(y))) {
    score += 15;
  }
  
  // Has principal committee
  if (fecResult.principal_committee_id) {
    score += 10;
  }
  
  // Name similarity (up to 10 points)
  const nameSim = calculateNameSimilarity(fecResult.name, ourCandidate.name);
  score += Math.round(nameSim * 10);
  
  return score;
}

// Determine office type from FEC office code
function getOfficeFromCode(officeCode: string): string {
  switch (officeCode) {
    case 'P': return 'President';
    case 'S': return 'Senator';
    case 'H': return 'Representative';
    default: return officeCode;
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const fecApiKey = Deno.env.get('FEC_API_KEY');
    if (!fecApiKey) {
      console.error('[FEC] FEC_API_KEY not configured');
      return new Response(
        JSON.stringify({ error: 'FEC API key not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { candidateId, candidateName, state, office, district, updateDatabase } = await req.json();
    console.log('[FEC] Looking up FEC candidate ID for:', { candidateId, candidateName, state, office, district });

    if (!candidateName && !candidateId) {
      return new Response(
        JSON.stringify({ error: 'Either candidateName or candidateId is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let candidates: FECCandidate[] = [];
    let matchMethod: 'crosswalk' | 'fec_api' = 'fec_api';

    // STEP 1: Try crosswalk lookup first (for bioguide IDs)
    if (candidateId) {
      const crosswalkResult = await lookupFECFromCrosswalk(candidateId);
      
      if (crosswalkResult) {
        matchMethod = 'crosswalk';
        console.log('[FEC] Found via crosswalk:', crosswalkResult.fecIds);
        
        // Fetch full details for each FEC ID from crosswalk
        for (const fecId of crosswalkResult.fecIds) {
          try {
            const detailUrl = `https://api.open.fec.gov/v1/candidate/${fecId}/?api_key=${fecApiKey}`;
            const detailResp = await fetch(detailUrl);
            
            if (detailResp.ok) {
              const detailData = await detailResp.json();
              const r = detailData.results?.[0];
              
              if (r) {
                const candidate: FECCandidate = {
                  candidate_id: r.candidate_id,
                  name: r.name,
                  party: r.party_full || r.party,
                  office: r.office_full || r.office,
                  state: r.state,
                  district: r.district,
                  cycles: r.election_years || [],
                  match_score: 100,
                  match_method: 'crosswalk',
                };
                
                // Fetch principal committee
                const committeeUrl = `https://api.open.fec.gov/v1/candidate/${fecId}/committees/?api_key=${fecApiKey}&designation=P`;
                const committeeResp = await fetch(committeeUrl);
                if (committeeResp.ok) {
                  const committeeData = await committeeResp.json();
                  if (committeeData.results?.[0]?.committee_id) {
                    candidate.principal_committee_id = committeeData.results[0].committee_id;
                  }
                }
                
                candidates.push(candidate);
              }
            }
          } catch (err) {
            console.warn('[FEC] Failed to fetch details for', fecId, err);
          }
        }
      }
    }

    // STEP 2: Fallback to FEC API search with strict scoring
    if (candidates.length === 0 && candidateName) {
      console.log('[FEC] No crosswalk match, falling back to FEC API search');
      
      const cleanName = candidateName
        .replace(/^(Rep\.|Sen\.|Hon\.|Dr\.|Mr\.|Mrs\.|Ms\.)\s*/i, '')
        .trim();
      
      const params = new URLSearchParams({
        api_key: fecApiKey,
        per_page: '10',
        sort: '-election_years',
      });
      params.append('q', cleanName);
      if (state) params.append('state', state);

      const searchUrl = `https://api.open.fec.gov/v1/candidates/search/?${params.toString()}`;
      console.log('[FEC] Searching:', searchUrl.replace(fecApiKey, 'REDACTED'));

      const response = await fetch(searchUrl);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('[FEC] API error:', response.status, errorText);
        return new Response(
          JSON.stringify({ error: `FEC API error: ${response.status}` }),
          { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const data = await response.json();
      console.log('[FEC] Found', data.results?.length || 0, 'candidates from FEC API');

      // Score each result
      for (const r of data.results || []) {
        const score = scoreCandidate(
          { 
            name: r.name, 
            state: r.state, 
            office: r.office, 
            district: r.district,
            cycles: r.election_years,
          },
          { name: candidateName, state, office, district }
        );
        
        console.log('[FEC] Scored', r.name, '(', r.candidate_id, '):', score);
        
        // Only include candidates with score >= 50
        if (score >= 50) {
          const candidate: FECCandidate = {
            candidate_id: r.candidate_id,
            name: r.name,
            party: r.party_full || r.party,
            office: r.office_full || r.office,
            state: r.state,
            district: r.district,
            cycles: r.election_years || [],
            match_score: score,
            match_method: 'fec_api',
          };

          // Fetch principal committee
          try {
            const committeeUrl = `https://api.open.fec.gov/v1/candidate/${r.candidate_id}/committees/?api_key=${fecApiKey}&designation=P`;
            const committeeResp = await fetch(committeeUrl);
            if (committeeResp.ok) {
              const committeeData = await committeeResp.json();
              if (committeeData.results?.[0]?.committee_id) {
                candidate.principal_committee_id = committeeData.results[0].committee_id;
                candidate.match_score! += 10; // Bonus for having committee
              }
            }
          } catch (err) {
            console.warn('[FEC] Failed to fetch committee for', r.candidate_id, err);
          }

          candidates.push(candidate);
        }
      }
      
      // Sort by score descending
      candidates.sort((a, b) => (b.match_score || 0) - (a.match_score || 0));
    }

    if (candidates.length === 0) {
      console.log('[FEC] No matches found');
      return new Response(
        JSON.stringify({ found: false, candidates: [], matchMethod }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // STEP 3: Update database if requested
    if (updateDatabase && candidateId && candidates.length > 0) {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      const supabase = createClient(supabaseUrl, supabaseServiceKey);

      const bestMatch = candidates[0];
      const minScoreForAutoUpdate = matchMethod === 'crosswalk' ? 0 : 80;
      
      if ((bestMatch.match_score || 0) >= minScoreForAutoUpdate) {
        console.log('[FEC] Updating candidate', candidateId, 'with FEC data:', {
          fecIds: candidates.map(c => c.candidate_id),
          method: matchMethod
        });

        // Insert ALL found FEC IDs into candidate_fec_ids table
        for (let i = 0; i < candidates.length; i++) {
          const candidate = candidates[i];
          const isPrimary = i === 0; // First one is primary (highest score)
          
          const { error: fecIdError } = await supabase
            .from('candidate_fec_ids')
            .upsert({
              candidate_id: candidateId,
              fec_candidate_id: candidate.candidate_id,
              office: getOfficeFromCode(candidate.office),
              state: candidate.state,
              district: candidate.district,
              is_primary: isPrimary,
              cycle: candidate.cycles?.length > 0 ? String(Math.max(...candidate.cycles)) : null,
              match_method: matchMethod,
              match_score: candidate.match_score,
              updated_at: new Date().toISOString()
            }, {
              onConflict: 'candidate_id,fec_candidate_id'
            });

          if (fecIdError) {
            console.error('[FEC] Failed to insert FEC ID:', candidate.candidate_id, fecIdError);
          } else {
            console.log('[FEC] Inserted FEC ID:', candidate.candidate_id, 'isPrimary:', isPrimary);
          }
        }

        // Still update the main candidates table with the primary FEC ID for backwards compatibility
        const updateData: Record<string, string | null> = { 
          fec_candidate_id: bestMatch.candidate_id 
        };
        
        if (bestMatch.principal_committee_id) {
          updateData.fec_committee_id = bestMatch.principal_committee_id;
        }

        const { error: updateError } = await supabase
          .from('candidates')
          .update(updateData)
          .eq('id', candidateId);

        if (updateError) {
          console.error('[FEC] Failed to update candidate:', updateError);
        } else {
          console.log('[FEC] Successfully updated candidate with FEC ID');
        }

        return new Response(
          JSON.stringify({ 
            found: true, 
            updated: !updateError,
            fecCandidateId: bestMatch.candidate_id,
            fecCommitteeId: bestMatch.principal_committee_id,
            matchScore: bestMatch.match_score,
            matchMethod,
            fecIdsStored: candidates.length,
            candidates 
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      } else {
        console.log('[FEC] Best match score', bestMatch.match_score, 'below threshold', minScoreForAutoUpdate, '- not auto-updating');
        return new Response(
          JSON.stringify({ 
            found: true, 
            updated: false,
            requiresConfirmation: true,
            matchScore: bestMatch.match_score,
            matchMethod,
            candidates 
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    return new Response(
      JSON.stringify({ found: true, matchMethod, candidates }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('[FEC] Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
