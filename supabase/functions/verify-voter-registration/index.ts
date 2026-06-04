import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const CIVITECH_API_KEY = Deno.env.get('CIVITECH_API_KEY');
const CIVITECH_API_SECRET = Deno.env.get('CIVITECH_API_SECRET');
const CIVITECH_BASE_URL = 'https://verify.civitech.io/api/v1';

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Get the authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Verify the user from the JWT
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } }
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    
    if (userError || !user) {
      console.error('Auth error:', userError);
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('Processing voter verification for user:', user.id);

    const body = await req.json();
    const { first_name, last_name, address, city, state, zip, birth_date } = body;

    // Validate required fields
    if (!first_name || !last_name || !state || !birth_date) {
      return new Response(JSON.stringify({ 
        error: 'Missing required fields',
        message: 'First name, last name, state, and birth date are required.'
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check if Civitech is configured
    if (!CIVITECH_API_KEY || !CIVITECH_API_SECRET) {
      console.log('Civitech not configured, using fallback verification');
      
      // Fallback: Simple state-based verification link generator
      // This provides a manual verification path when API is not configured
      const stateLinks: Record<string, string> = {
        'AL': 'https://myinfo.alabamavotes.gov/voterview',
        'AK': 'https://myvoterinformation.alaska.gov/',
        'AZ': 'https://my.arizona.vote/PortalList.aspx',
        'AR': 'https://www.voterview.ar-nova.org/VoterView',
        'CA': 'https://voterstatus.sos.ca.gov/',
        'CO': 'https://www.sos.state.co.us/voter/pages/pub/olvr/findVoterReg.xhtml',
        'CT': 'https://portaldir.ct.gov/sots/LookUp.aspx',
        'DE': 'https://ivote.de.gov/voterlogin.aspx',
        'FL': 'https://registration.elections.myflorida.com/CheckVoterStatus',
        'GA': 'https://mvp.sos.ga.gov/',
        'HI': 'https://olvr.hawaii.gov/',
        'ID': 'https://elections.sos.idaho.gov/ElectionLink/ElectionLink/VoterSearch.aspx',
        'IL': 'https://ova.elections.il.gov/',
        'IN': 'https://indianavoters.in.gov/',
        'IA': 'https://sos.iowa.gov/elections/voterinformation/voterregistration.html',
        'KS': 'https://myvoteinfo.voteks.org/voterview',
        'KY': 'https://vrsws.sos.ky.gov/ovrweb/',
        'LA': 'https://voterportal.sos.la.gov/',
        'ME': 'https://www.maine.gov/sos/cec/elec/voter-info/voterguide.html',
        'MD': 'https://voterservices.elections.maryland.gov/VoterSearch',
        'MA': 'https://www.sec.state.ma.us/VoterRegistrationSearch/MyVoterRegStatus.aspx',
        'MI': 'https://mvic.sos.state.mi.us/',
        'MN': 'https://mnvotes.sos.state.mn.us/VoterStatus.aspx',
        'MS': 'https://www.msegov.com/sos/voter_registration/AmIRegistered',
        'MO': 'https://s1.sos.mo.gov/elections/voterlookup/',
        'MT': 'https://prodvoterportal.mt.gov/WhereToVote.aspx',
        'NE': 'https://www.votercheck.necvr.ne.gov/',
        'NV': 'https://www.nvsos.gov/votersearch/',
        'NH': 'https://app.sos.nh.gov/voterinformation',
        'NJ': 'https://voter.svrs.nj.gov/registration-check',
        'NM': 'https://voterportal.servis.sos.state.nm.us/WhereToVote.aspx',
        'NY': 'https://voterlookup.elections.ny.gov/',
        'NC': 'https://vt.ncsbe.gov/RegLkup/',
        'ND': 'https://vip.sos.nd.gov/PortalListDetails.aspx?ptlhPKID=79&ptlPKID=7',
        'OH': 'https://voterlookup.ohiosos.gov/voterlookup.aspx',
        'OK': 'https://okvoterportal.okelections.us/',
        'OR': 'https://secure.sos.state.or.us/orestar/vr/showVoterSearch.do',
        'PA': 'https://www.pavoterservices.pa.gov/pages/voterregistrationstatus.aspx',
        'RI': 'https://vote.sos.ri.gov/',
        'SC': 'https://info.scvotes.sc.gov/eng/voterinquiry/VoterInformationRequest.aspx',
        'SD': 'https://vip.sdsos.gov/VIPLogin.aspx',
        'TN': 'https://tnmap.tn.gov/voterlookup/',
        'TX': 'https://teamrv-mvp.sos.texas.gov/MVP/mvp.do',
        'UT': 'https://votesearch.utah.gov/voter-search/search/search-by-voter/voter-info',
        'VT': 'https://mvp.vermont.gov/',
        'VA': 'https://vote.elections.virginia.gov/VoterInformation',
        'WA': 'https://voter.votewa.gov/WhereToVote.aspx',
        'WV': 'https://apps.sos.wv.gov/Elections/Voter/AmIRegisteredToVote',
        'WI': 'https://myvote.wi.gov/en-us/Register-To-Vote',
        'WY': 'https://sos.wyo.gov/Elections/State/RegisteringToVote.aspx',
        'DC': 'https://www.dcboe.org/Voters/Register-To-Vote/Check-Voter-Registration-Status',
      };

      const verificationUrl = stateLinks[state.toUpperCase()];

      return new Response(JSON.stringify({ 
        configured: false,
        message: 'Automatic voter verification is not configured. Please verify manually.',
        manual_verification_url: verificationUrl || `https://www.vote.org/am-i-registered-to-vote/`,
        state: state
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('Calling Civitech Verify API...');

    // Call Civitech Verify API
    const verifyResponse = await fetch(`${CIVITECH_BASE_URL}/verify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${btoa(`${CIVITECH_API_KEY}:${CIVITECH_API_SECRET}`)}`,
      },
      body: JSON.stringify({
        first_name,
        last_name,
        address: address || '',
        city: city || '',
        state,
        zip: zip || '',
        dob: birth_date, // Format: YYYY-MM-DD
      }),
    });

    if (!verifyResponse.ok) {
      const errorText = await verifyResponse.text();
      console.error('Civitech API error:', errorText);
      return new Response(JSON.stringify({ 
        error: 'Verification failed',
        message: 'Unable to verify voter registration. Please try again or verify manually.'
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const verifyData = await verifyResponse.json();
    console.log('Civitech response received, registered:', verifyData?.registered === true, 'status:', verifyData?.status ?? 'unknown');

    // Interpret the response
    const isRegistered = verifyData.registered === true || verifyData.status === 'Active';
    const registrationStatus = verifyData.status || (isRegistered ? 'Active' : 'Not Found');

    if (isRegistered) {
      // Update the user's profile with voter verification status
      const { error: updateError } = await supabase
        .from('profiles')
        .update({
          voter_verified: true,
          voter_verified_at: new Date().toISOString(),
          voter_registration_status: registrationStatus,
          voter_state: state.toUpperCase(),
          birth_date: birth_date,
        })
        .eq('id', user.id);

      if (updateError) {
        console.error('Failed to update profile:', updateError);
        return new Response(JSON.stringify({ 
          error: 'Database error',
          message: 'Verification succeeded but failed to update profile.'
        }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      console.log('Voter verification successful for user:', user.id);

      return new Response(JSON.stringify({ 
        success: true,
        verified: true,
        registration_status: registrationStatus,
        state: state.toUpperCase(),
        verified_at: new Date().toISOString()
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    } else {
      return new Response(JSON.stringify({ 
        success: true,
        verified: false,
        registration_status: registrationStatus,
        state: state.toUpperCase(),
        message: 'Voter registration not found. You may not be registered or information may not match.'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

  } catch (error: unknown) {
    console.error('Error in verify-voter-registration:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ 
      error: 'Internal server error',
      message
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
