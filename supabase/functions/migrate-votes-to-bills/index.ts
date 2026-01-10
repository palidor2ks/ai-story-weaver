import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { phase, batchSize = 1000, offset = 0 } = await req.json();

    if (phase === 'bills') {
      // Migrate bills - get unique bill_ids from votes table
      console.log(`Migrating bills batch starting at offset ${offset}`);
      
      // Get unique bill_ids with their most recent data
      const { data: votes, error: fetchError } = await supabase
        .from('votes')
        .select('bill_id, bill_name, bill_summary, topic, additional_topics, ai_detected_topics, omnibus_type, topic_flag, reviewed_at, reviewed_by, congress, session, chamber, description, summary_fetched_at, date')
        .not('bill_id', 'is', null)
        .order('bill_id')
        .order('date', { ascending: false })
        .range(offset, offset + batchSize * 50 - 1); // Get more to account for duplicates

      if (fetchError) {
        throw fetchError;
      }

      // Deduplicate by bill_id, keeping first (most recent) entry
      const billsMap = new Map<string, any>();
      for (const vote of votes || []) {
        if (!billsMap.has(vote.bill_id)) {
          billsMap.set(vote.bill_id, {
            id: vote.bill_id,
            name: vote.bill_name,
            summary: vote.bill_summary === '[NO_SUMMARY]' ? null : vote.bill_summary,
            topic: vote.topic || 'Government',
            additional_topics: vote.additional_topics || [],
            ai_detected_topics: vote.ai_detected_topics || [],
            omnibus_type: vote.omnibus_type,
            topic_flag: vote.topic_flag,
            reviewed_at: vote.reviewed_at,
            reviewed_by: vote.reviewed_by,
            congress: vote.congress,
            session: vote.session,
            chamber: vote.chamber,
            description: vote.description,
            summary_fetched_at: vote.summary_fetched_at,
            last_action_date: vote.date,
          });
        }
      }

      const billsToInsert = Array.from(billsMap.values()).slice(0, batchSize);
      
      if (billsToInsert.length === 0) {
        return new Response(JSON.stringify({
          success: true,
          phase: 'bills',
          inserted: 0,
          done: true,
          message: 'No more bills to migrate'
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // Insert bills
      const { error: insertError, count } = await supabase
        .from('bills')
        .upsert(billsToInsert, { onConflict: 'id', ignoreDuplicates: true });

      if (insertError) {
        throw insertError;
      }

      // Check total bills migrated
      const { count: totalBills } = await supabase
        .from('bills')
        .select('*', { count: 'exact', head: true });

      return new Response(JSON.stringify({
        success: true,
        phase: 'bills',
        inserted: billsToInsert.length,
        totalBills,
        nextOffset: offset + batchSize * 50,
        done: billsToInsert.length < batchSize
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    } else if (phase === 'candidate_votes') {
      // Migrate candidate_votes
      console.log(`Migrating candidate_votes batch starting at offset ${offset}`);

      const { data: votes, error: fetchError } = await supabase
        .from('votes')
        .select('bill_id, candidate_id, action_type, position, vote_number, date')
        .not('bill_id', 'is', null)
        .range(offset, offset + batchSize - 1);

      if (fetchError) {
        throw fetchError;
      }

      if (!votes || votes.length === 0) {
        return new Response(JSON.stringify({
          success: true,
          phase: 'candidate_votes',
          inserted: 0,
          done: true,
          message: 'No more votes to migrate'
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      const votesToInsert = votes.map(v => ({
        bill_id: v.bill_id,
        candidate_id: v.candidate_id,
        action_type: v.action_type || 'unknown',
        position: v.position,
        vote_number: v.vote_number,
        action_date: v.date,
      }));

      // Insert with conflict handling
      const { error: insertError } = await supabase
        .from('candidate_votes')
        .upsert(votesToInsert, { 
          onConflict: 'bill_id,candidate_id,action_type,vote_number',
          ignoreDuplicates: true 
        });

      if (insertError) {
        console.error('Insert error:', insertError);
        // Try inserting one by one for failed batch
        let successCount = 0;
        for (const vote of votesToInsert) {
          const { error } = await supabase
            .from('candidate_votes')
            .insert(vote);
          if (!error) successCount++;
        }
        
        return new Response(JSON.stringify({
          success: true,
          phase: 'candidate_votes',
          inserted: successCount,
          nextOffset: offset + batchSize,
          done: votes.length < batchSize
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // Check total
      const { count: totalVotes } = await supabase
        .from('candidate_votes')
        .select('*', { count: 'exact', head: true });

      return new Response(JSON.stringify({
        success: true,
        phase: 'candidate_votes',
        inserted: votesToInsert.length,
        totalVotes,
        nextOffset: offset + batchSize,
        done: votes.length < batchSize
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    } else if (phase === 'status') {
      // Get migration status
      const { count: billsCount } = await supabase
        .from('bills')
        .select('*', { count: 'exact', head: true });

      const { count: candidateVotesCount } = await supabase
        .from('candidate_votes')
        .select('*', { count: 'exact', head: true });

      const { count: votesCount } = await supabase
        .from('votes')
        .select('*', { count: 'exact', head: true });

      const { count: uniqueBillsCount } = await supabase
        .rpc('count_unique_bill_ids');

      return new Response(JSON.stringify({
        success: true,
        bills: billsCount,
        candidateVotes: candidateVotesCount,
        originalVotes: votesCount,
        uniqueBillsInVotes: uniqueBillsCount,
        billsMigrated: billsCount === uniqueBillsCount,
        votesMigrated: candidateVotesCount === votesCount
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    } else {
      return new Response(JSON.stringify({
        error: 'Invalid phase. Use: bills, candidate_votes, or status'
      }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

  } catch (error: unknown) {
    console.error('Migration error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({
      success: false,
      error: message
    }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
