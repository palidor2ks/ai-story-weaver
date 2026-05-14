import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('authorization');
    if (!authHeader) return new Response(JSON.stringify({ error: 'Missing authorization header' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: { user }, error: authError } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
    if (authError || !user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const { donorId, donorName, donorType, amount, recipientCount, transactionCount, nameVariations } = await req.json();
    if (!donorId || !donorName) return new Response(JSON.stringify({ error: 'Missing donorId or donorName' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const apiKey = Deno.env.get('LOVABLE_API_KEY');
    if (!apiKey) throw new Error('LOVABLE_API_KEY is not configured');

    const { data: donorRows } = await supabase
      .from('donors')
      .select('name, amount, type, cycle, candidates(party, name, office, state)')
      .or(`id.eq.${donorId},display_name.eq.${donorName},name.eq.${donorName}`)
      .limit(300);

    const partyTotals = new Map<string, number>();
    for (const row of donorRows || []) {
      const party = (row as any)?.candidates?.party || 'Unknown';
      partyTotals.set(party, (partyTotals.get(party) || 0) + Number((row as any)?.amount || 0));
    }

    const topPartyBreakdown = [...partyTotals.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6)
      .map(([party, total]) => `${party}: $${Math.round(total).toLocaleString()}`).join('\n');

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          {
            role: 'system',
            content: `You are a rigorous, non-partisan donor researcher. Use any relevant source available to you, including public reporting, social media statements, official statements, and campaign-finance patterns. Separate FACTS from INFERENCE. If information is thin, explicitly say: "There isn't enough reliable information." Do not fabricate links. Return JSON with keys summary, analysis, partySupport, causes, motivationHypotheses, confidence, insufficientInfo, sources.`,
          },
          {
            role: 'user',
            content: `Donor: ${donorName}\nType: ${donorType || 'Unknown'}\nShown total: ${amount ?? 'unknown'}\nRecipients: ${recipientCount ?? 'unknown'}\nTransactions: ${transactionCount ?? 'unknown'}\nMerged names: ${Array.isArray(nameVariations) ? nameVariations.join(', ') : 'none'}\nRows found: ${(donorRows || []).length}\nParty breakdown:\n${topPartyBreakdown || 'No reliable mapping available'}\n\nAnalyze likely party support, causes, and motivations. Include caveats and confidence, and cite useful source links when possible.`,
          },
        ],
        response_format: { type: 'json_object' },
      }),
    });

    if (!response.ok) throw new Error(`AI Gateway error: ${response.status}`);
    const payload = await response.json();
    const content = payload.choices?.[0]?.message?.content;
    return new Response(content || '{}', { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: errorMessage }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
