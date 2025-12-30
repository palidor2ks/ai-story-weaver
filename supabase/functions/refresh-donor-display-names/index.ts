import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const BATCH_SIZE = 5000;

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const startTime = Date.now();
    
    // Check if this is a single-alias backfill request
    let body: { alias_id?: string } = {};
    if (req.method === 'POST') {
      try {
        body = await req.json();
      } catch {
        // No body or invalid JSON, continue with full backfill
      }
    }

    // SINGLE ALIAS MODE: Update all donors matching a specific alias
    if (body.alias_id) {
      console.log(`Single alias mode: processing alias_id=${body.alias_id}`);
      
      // Get the specific alias
      const { data: alias, error: aliasError } = await supabase
        .from('donor_aliases')
        .select('canonical_name, alias_pattern, alias_patterns, donor_types')
        .eq('id', body.alias_id)
        .eq('is_active', true)
        .single();

      if (aliasError || !alias) {
        console.error('Error fetching alias:', aliasError);
        return new Response(JSON.stringify({
          success: false,
          error: aliasError?.message || 'Alias not found'
        }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Use alias_patterns if available, otherwise fall back to alias_pattern
      const patterns = alias.alias_patterns?.length ? alias.alias_patterns : [alias.alias_pattern];
      console.log(`Found alias: patterns=${JSON.stringify(patterns)}, canonical="${alias.canonical_name}"`);

      // Update all donors matching any of the alias patterns
      let totalUpdated = 0;
      for (const pattern of patterns) {
        if (!pattern) continue;
        
        const { data: updated, error: updateError } = await supabase
          .from('donors')
          .update({ display_name: alias.canonical_name })
          .ilike('name', pattern)
          .in('type', alias.donor_types || [])
          .select('id');

        if (updateError) {
          console.error(`Error updating donors for pattern "${pattern}":`, updateError);
          continue;
        }
        
        totalUpdated += updated?.length || 0;
      }

      console.log(`Updated ${totalUpdated} donors to display_name="${alias.canonical_name}"`);

      return new Response(JSON.stringify({
        success: true,
        processed: totalUpdated,
        alias: alias.canonical_name,
        patterns: patterns,
        message: `Updated ${totalUpdated} donor(s) to "${alias.canonical_name}"`,
        elapsedMs: Date.now() - startTime
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // FULL BACKFILL MODE: Process all donors with NULL display_name
    // Get count of donors with NULL display_name
    const { count: nullCount, error: countError } = await supabase
      .from('donors')
      .select('*', { count: 'exact', head: true })
      .is('display_name', null);

    if (countError) {
      console.error('Error counting NULL display_names:', countError);
      throw countError;
    }

    console.log(`Found ${nullCount} donors with NULL display_name`);

    if (nullCount === 0) {
      return new Response(JSON.stringify({
        success: true,
        processed: 0,
        remaining: 0,
        totalNull: 0,
        message: 'All display_names are already populated!',
        elapsedMs: Date.now() - startTime
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get a batch of donors with NULL display_name
    const { data: donors, error: fetchError } = await supabase
      .from('donors')
      .select('id, name, type')
      .is('display_name', null)
      .limit(BATCH_SIZE);

    if (fetchError) {
      console.error('Error fetching donors:', fetchError);
      throw fetchError;
    }

    console.log(`Processing batch of ${donors?.length || 0} donors`);

    // Get all active aliases
    const { data: aliases, error: aliasError } = await supabase
      .from('donor_aliases')
      .select('canonical_name, alias_pattern, alias_patterns, donor_types')
      .eq('is_active', true);

    if (aliasError) {
      console.error('Error fetching aliases:', aliasError);
      throw aliasError;
    }

    console.log(`Found ${aliases?.length || 0} active aliases`);

    // Process each donor and determine display_name
    let processed = 0;
    let errors = 0;
    
    for (const donor of donors || []) {
      // Find matching alias
      let displayName = donor.name; // Default to original name
      
      for (const alias of aliases || []) {
        // Check if donor type matches
        if (!alias.donor_types?.includes(donor.type)) continue;
        
        // Use alias_patterns if available, otherwise fall back to alias_pattern
        const patterns = alias.alias_patterns?.length ? alias.alias_patterns : [alias.alias_pattern];
        
        let matched = false;
        for (const pattern of patterns) {
          if (!pattern) continue;
          // Convert SQL ILIKE pattern to regex
          const regexPattern = pattern
            .replace(/%/g, '.*')
            .replace(/_/g, '.');
          const regex = new RegExp(`^${regexPattern}$`, 'i');
          
          if (regex.test(donor.name)) {
            displayName = alias.canonical_name;
            matched = true;
            break;
          }
        }
        
        if (matched) break;
      }

      // Update the donor's display_name
      const { error: updateError } = await supabase
        .from('donors')
        .update({ display_name: displayName })
        .eq('id', donor.id);

      if (updateError) {
        console.error(`Error updating donor ${donor.id}:`, updateError);
        errors++;
      } else {
        processed++;
      }
    }

    const remaining = (nullCount || 0) - processed;
    const elapsedMs = Date.now() - startTime;

    console.log(`Batch complete: processed=${processed}, errors=${errors}, remaining=${remaining}, elapsedMs=${elapsedMs}`);

    return new Response(JSON.stringify({
      success: true,
      processed,
      errors,
      remaining,
      totalNull: nullCount,
      batchSize: BATCH_SIZE,
      message: remaining > 0 
        ? `Processed ${processed} donors. ${remaining} remaining. Run again to continue.`
        : 'All display_names have been populated!',
      elapsedMs
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error in refresh-donor-display-names:', error);
    return new Response(JSON.stringify({ 
      success: false, 
      error: errorMessage 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
