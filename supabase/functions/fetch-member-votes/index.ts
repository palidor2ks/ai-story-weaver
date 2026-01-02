import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const CONGRESS_API_KEY = Deno.env.get('CONGRESS_GOV_API_KEY');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

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

interface VoteRecord {
  id: string;
  bill_id: string;
  bill_name: string;
  candidate_id: string;
  position: 'Yea' | 'Nay' | 'Present' | 'Not Voting' | 'Sponsored' | 'Cosponsored';
  topic: string;
  description: string | null;
  date: string;
  congress?: number;
  policy_area?: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { bioguideId, persistVotes = false } = await req.json();
    
    console.log(`Fetching votes for member: ${bioguideId}, persist=${persistVotes}`);

    if (!CONGRESS_API_KEY) {
      throw new Error('Congress.gov API key not configured');
    }

    if (!bioguideId) {
      throw new Error('bioguideId is required');
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const votes: VoteRecord[] = [];

    // Fetch sponsored legislation to understand member's positions
    const sponsoredUrl = `https://api.congress.gov/v3/member/${bioguideId}/sponsored-legislation?api_key=${CONGRESS_API_KEY}&limit=250`;
    console.log(`Fetching sponsored legislation from: ${sponsoredUrl.replace(CONGRESS_API_KEY, 'REDACTED')}`);
    
    const sponsoredResponse = await fetch(sponsoredUrl);
    
    if (sponsoredResponse.ok) {
      const sponsoredData = await sponsoredResponse.json();
      const sponsoredBills = sponsoredData.sponsoredLegislation || [];
      
      for (const bill of sponsoredBills) {
        const policyArea = bill.policyArea?.name || 'General';
        const mappedTopic = topicMapping[policyArea] || 'Domestic Policy';
        
        votes.push({
          id: `${bioguideId}-${bill.congress || 0}-sponsored-${bill.type}${bill.number}`,
          bill_id: `${bill.type}.${bill.number}`,
          bill_name: bill.title || `${bill.type} ${bill.number}`,
          candidate_id: bioguideId,
          position: 'Sponsored',
          topic: mappedTopic,
          description: bill.latestAction?.text || 'Legislation sponsored by this member',
          date: bill.introducedDate || bill.latestAction?.actionDate || new Date().toISOString().split('T')[0],
          congress: bill.congress,
          policy_area: policyArea,
        });
      }
      console.log(`Found ${sponsoredBills.length} sponsored bills`);
    } else {
      console.error(`Congress API error for sponsored: ${sponsoredResponse.status}`);
    }

    // Fetch cosponsored legislation
    const cosponsoredUrl = `https://api.congress.gov/v3/member/${bioguideId}/cosponsored-legislation?api_key=${CONGRESS_API_KEY}&limit=250`;
    const cosponsoredResponse = await fetch(cosponsoredUrl);
    
    if (cosponsoredResponse.ok) {
      const cosponsoredData = await cosponsoredResponse.json();
      const cosponsoredBills = cosponsoredData.cosponsoredLegislation || [];
      
      for (const bill of cosponsoredBills) {
        const policyArea = bill.policyArea?.name || 'General';
        const mappedTopic = topicMapping[policyArea] || 'Domestic Policy';
        
        votes.push({
          id: `${bioguideId}-${bill.congress || 0}-cosponsored-${bill.type}${bill.number}`,
          bill_id: `${bill.type}.${bill.number}`,
          bill_name: bill.title || `${bill.type} ${bill.number}`,
          candidate_id: bioguideId,
          position: 'Cosponsored',
          topic: mappedTopic,
          description: bill.latestAction?.text || 'Legislation cosponsored by this member',
          date: bill.introducedDate || bill.latestAction?.actionDate || new Date().toISOString().split('T')[0],
          congress: bill.congress,
          policy_area: policyArea,
        });
      }
      console.log(`Found ${cosponsoredBills.length} cosponsored bills`);
    }

    // Sort by date descending
    votes.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    console.log(`Found ${votes.length} legislative actions for ${bioguideId}`);

    // Persist votes to database if requested
    let persisted = 0;
    if (persistVotes && votes.length > 0) {
      console.log(`Persisting ${votes.length} votes to database...`);
      
      // Map to votes table schema (position must be valid enum)
      const votesToInsert = votes
        .filter(v => ['Yea', 'Nay', 'Present', 'Not Voting'].includes(v.position as string) === false)
        .map(v => ({
          id: v.id,
          bill_id: v.bill_id,
          bill_name: v.bill_name.slice(0, 500), // Truncate if needed
          candidate_id: v.candidate_id,
          // Map Sponsored/Cosponsored to Yea (they support the bill)
          position: 'Yea' as const,
          topic: v.topic,
          description: v.description?.slice(0, 1000) || null,
          date: v.date,
        }));

      // Deduplicate by ID to prevent "cannot affect row a second time" error
      const uniqueVotes = Array.from(
        new Map(votesToInsert.map(v => [v.id, v])).values()
      );

      if (uniqueVotes.length > 0) {
        const { error: upsertError } = await supabase
          .from('votes')
          .upsert(uniqueVotes, { 
            onConflict: 'id',
            ignoreDuplicates: false 
          });

        if (upsertError) {
          console.error('Error persisting votes:', upsertError);
        } else {
          persisted = uniqueVotes.length;
          console.log(`Persisted ${persisted} votes for ${bioguideId}`);
        }
      }
    }

    return new Response(JSON.stringify({ 
      votes: votes,
      total: votes.length,
      persisted,
      sponsoredCount: votes.filter(v => v.position === 'Sponsored').length,
      cosponsoredCount: votes.filter(v => v.position === 'Cosponsored').length,
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
