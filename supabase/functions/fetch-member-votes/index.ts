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
    
    console.log(`Fetching votes for member: ${bioguideId}`);

    if (!CONGRESS_API_KEY) {
      throw new Error('Congress.gov API key not configured');
    }

    if (!bioguideId) {
      throw new Error('bioguideId is required');
    }

    // Fetch sponsored legislation to understand member's positions
    const sponsoredUrl = `https://api.congress.gov/v3/member/${bioguideId}/sponsored-legislation?api_key=${CONGRESS_API_KEY}&limit=20`;
    console.log(`Fetching sponsored legislation from: ${sponsoredUrl.replace(CONGRESS_API_KEY, 'REDACTED')}`);
    
    const sponsoredResponse = await fetch(sponsoredUrl);
    
    if (!sponsoredResponse.ok) {
      console.error(`Congress API error for sponsored: ${sponsoredResponse.status}`);
    }
    
    const sponsoredData = await sponsoredResponse.json();
    const sponsoredBills = sponsoredData.sponsoredLegislation || [];

    // Fetch cosponsored legislation
    const cosponsoredUrl = `https://api.congress.gov/v3/member/${bioguideId}/cosponsored-legislation?api_key=${CONGRESS_API_KEY}&limit=20`;
    const cosponsoredResponse = await fetch(cosponsoredUrl);
    const cosponsoredData = await cosponsoredResponse.json();
    const cosponsoredBills = cosponsoredData.cosponsoredLegislation || [];

    // Map policy areas to our topics
    const topicMapping: Record<string, string> = {
      'Health': 'Healthcare',
      'Economics and Public Finance': 'Economy',
      'Taxation': 'Economy',
      'Education': 'Education',
      'Environmental Protection': 'Environment',
      'Energy': 'Environment',
      'Immigration': 'Immigration',
      'Crime and Law Enforcement': 'Criminal Justice',
      'Civil Rights and Liberties, Minority Issues': 'Civil Rights',
      'Armed Forces and National Security': 'Foreign Policy',
      'International Affairs': 'Foreign Policy',
      'Government Operations and Politics': 'Government Reform',
      'Congress': 'Government Reform',
      'Social Welfare': 'Social Issues',
      'Families': 'Social Issues',
      'Labor and Employment': 'Economy',
      'Science, Technology, Communications': 'Technology',
    };

    // Transform sponsored bills into vote-like records
    const votes = sponsoredBills.slice(0, 10).map((bill: any) => {
      const policyArea = bill.policyArea?.name || 'General';
      const mappedTopic = topicMapping[policyArea] || 'Domestic Policy';
      
      return {
        id: `${bioguideId}-${bill.number}`,
        bill_id: `${bill.type}.${bill.number}`,
        bill_name: bill.title || `${bill.type} ${bill.number}`,
        candidate_id: bioguideId,
        position: 'Sponsored',
        topic: mappedTopic,
        description: bill.latestAction?.text || 'Legislation sponsored by this member',
        date: bill.introducedDate || bill.latestAction?.actionDate || new Date().toISOString(),
        congress: bill.congress,
        policy_area: policyArea,
      };
    });

    // Add cosponsored bills
    const cosponsoredVotes = cosponsoredBills.slice(0, 10).map((bill: any) => {
      const policyArea = bill.policyArea?.name || 'General';
      const mappedTopic = topicMapping[policyArea] || 'Domestic Policy';
      
      return {
        id: `${bioguideId}-co-${bill.number}`,
        bill_id: `${bill.type}.${bill.number}`,
        bill_name: bill.title || `${bill.type} ${bill.number}`,
        candidate_id: bioguideId,
        position: 'Cosponsored',
        topic: mappedTopic,
        description: bill.latestAction?.text || 'Legislation cosponsored by this member',
        date: bill.introducedDate || bill.latestAction?.actionDate || new Date().toISOString(),
        congress: bill.congress,
        policy_area: policyArea,
      };
    });

    const allVotes = [...votes, ...cosponsoredVotes];
    
    // Sort by date descending
    allVotes.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    console.log(`Found ${allVotes.length} legislative actions for ${bioguideId}`);

    return new Response(JSON.stringify({ 
      votes: allVotes,
      total: allVotes.length,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error in fetch-member-votes function:', errorMessage);
    return new Response(JSON.stringify({ 
      error: errorMessage,
      votes: [] 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
