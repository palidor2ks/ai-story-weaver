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

    // Resolve the canonical candidate ID to store in votes (prefer local candidate primary key)
    const { data: candidateRecord } = await supabase
      .from('candidates')
      .select('id, bioguide_id')
      .or(`id.eq.${bioguideId},bioguide_id.eq.${bioguideId}`)
      .maybeSingle();

    const targetCandidateId = candidateRecord?.id || bioguideId;
    const votes: VoteRecord[] = [];

    // Fetch ALL sponsored legislation with pagination
    let sponsoredOffset = 0;
    let totalSponsored = 0;
    let hasMoreSponsored = true;
    
    console.log(`Fetching sponsored legislation with pagination...`);
    
    while (hasMoreSponsored) {
      const sponsoredUrl = `https://api.congress.gov/v3/member/${bioguideId}/sponsored-legislation?api_key=${CONGRESS_API_KEY}&limit=250&offset=${sponsoredOffset}`;
      console.log(`Fetching sponsored page at offset ${sponsoredOffset}`);
      
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
            candidate_id: targetCandidateId,
            position: 'Sponsored',
            topic: mappedTopic,
            description: bill.latestAction?.text || 'Legislation sponsored by this member',
            date: bill.introducedDate || bill.latestAction?.actionDate || new Date().toISOString().split('T')[0],
            congress: bill.congress,
            policy_area: policyArea,
          });
        }
        
        totalSponsored += sponsoredBills.length;
        
        // Check if there are more pages (API returned full 250 results)
        if (sponsoredBills.length === 250) {
          sponsoredOffset += 250;
          // Add small delay to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 100));
        } else {
          hasMoreSponsored = false;
        }
      } else {
        console.error(`Congress API error for sponsored: ${sponsoredResponse.status}`);
        hasMoreSponsored = false;
      }
    }
    console.log(`Found ${totalSponsored} total sponsored bills`);

    // Fetch ALL cosponsored legislation with pagination
    let cosponsoredOffset = 0;
    let totalCosponsored = 0;
    let hasMoreCosponsored = true;
    
    console.log(`Fetching cosponsored legislation with pagination...`);
    
    while (hasMoreCosponsored) {
      const cosponsoredUrl = `https://api.congress.gov/v3/member/${bioguideId}/cosponsored-legislation?api_key=${CONGRESS_API_KEY}&limit=250&offset=${cosponsoredOffset}`;
      console.log(`Fetching cosponsored page at offset ${cosponsoredOffset}`);
      
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
            candidate_id: targetCandidateId,
            position: 'Cosponsored',
            topic: mappedTopic,
            description: bill.latestAction?.text || 'Legislation cosponsored by this member',
            date: bill.introducedDate || bill.latestAction?.actionDate || new Date().toISOString().split('T')[0],
            congress: bill.congress,
            policy_area: policyArea,
          });
        }
        
        totalCosponsored += cosponsoredBills.length;
        
        // Check if there are more pages
        if (cosponsoredBills.length === 250) {
          cosponsoredOffset += 250;
          await new Promise(resolve => setTimeout(resolve, 100));
        } else {
          hasMoreCosponsored = false;
        }
      } else {
        console.error(`Congress API error for cosponsored: ${cosponsoredResponse.status}`);
        hasMoreCosponsored = false;
      }
    }
    console.log(`Found ${totalCosponsored} total cosponsored bills`);

    // Sort by date descending
    votes.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    console.log(`Found ${votes.length} total legislative actions for ${bioguideId}`);

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
        const CHUNK_SIZE = 500;

        for (let i = 0; i < uniqueVotes.length; i += CHUNK_SIZE) {
          const chunk = uniqueVotes.slice(i, i + CHUNK_SIZE);

          const { error: upsertError } = await supabase
            .from('votes')
            .upsert(chunk, { 
              onConflict: 'id',
              ignoreDuplicates: false 
            });

          if (upsertError) {
            console.error('Error persisting votes chunk:', upsertError);
            throw new Error(upsertError.message || 'Failed to persist votes');
          }

          persisted += chunk.length;
          console.log(`Persisted ${persisted}/${uniqueVotes.length} votes for ${bioguideId}`);
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
