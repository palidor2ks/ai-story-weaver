import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const CONGRESS_API_KEY = Deno.env.get('CONGRESS_GOV_API_KEY');

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { bioguideId } = await req.json();
    
    console.log(`Fetching member details for bioguide ID: ${bioguideId}`);

    if (!CONGRESS_API_KEY) {
      throw new Error('Congress.gov API key not configured');
    }

    if (!bioguideId) {
      throw new Error('bioguideId is required');
    }

    // Fetch member details from Congress.gov API
    const memberUrl = `https://api.congress.gov/v3/member/${bioguideId}?api_key=${CONGRESS_API_KEY}`;
    console.log(`Fetching from: ${memberUrl.replace(CONGRESS_API_KEY, 'REDACTED')}`);
    
    const response = await fetch(memberUrl);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Congress API error: ${response.status} - ${errorText}`);
      throw new Error(`Congress API error: ${response.status}`);
    }
    
    const data = await response.json();
    const member = data.member;

    if (!member) {
      return new Response(JSON.stringify({ 
        member: null,
        error: 'Member not found'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get the most recent term
    const terms = member.terms || [];
    const latestTerm = terms[terms.length - 1] || {};
    const isSenator = latestTerm.chamber === 'Senate';

    // Map party
    let party = 'Other';
    if (member.partyHistory) {
      const currentParty = member.partyHistory[member.partyHistory.length - 1];
      if (currentParty?.partyName === 'Democratic') party = 'Democrat';
      else if (currentParty?.partyName === 'Republican') party = 'Republican';
      else if (currentParty?.partyName === 'Independent') party = 'Independent';
    }

    const formattedMember = {
      id: member.bioguideId,
      name: member.directOrderName || member.invertedOrderName || `${member.firstName} ${member.lastName}`,
      party,
      office: isSenator ? 'Senator' : 'Representative',
      state: latestTerm.stateCode || member.state,
      district: latestTerm.district ? `${latestTerm.stateCode}-${latestTerm.district}` : null,
      image_url: member.depiction?.imageUrl || '',
      is_incumbent: true,
      bioguide_id: member.bioguideId,
      overall_score: null,
      coverage_tier: 'tier_3',
      confidence: 'low',
      last_updated: new Date().toISOString(),
      score_version: 'v1.0',
      // Additional details
      birth_year: member.birthYear,
      official_url: member.officialWebsiteUrl,
      terms: terms.map((t: any) => ({
        chamber: t.chamber,
        startYear: t.startYear,
        endYear: t.endYear,
        state: t.stateCode,
        district: t.district,
      })),
    };

    console.log(`Successfully fetched member: ${formattedMember.name}`);

    return new Response(JSON.stringify({ 
      member: formattedMember
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error in fetch-member function:', errorMessage);
    return new Response(JSON.stringify({ 
      error: errorMessage,
      member: null 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
