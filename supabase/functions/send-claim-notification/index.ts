import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ClaimNotificationRequest {
  email: string;
  candidateName: string;
  status: "approved" | "rejected";
  rejectionReason?: string;
}

// Utility to mask PII in logs (e.g., "user@example.com" -> "us***@example.com")
const maskEmail = (email: string): string => {
  if (!email || !email.includes('@')) return '***';
  const [localPart, domain] = email.split('@');
  const maskedLocal = localPart.length > 2 
    ? localPart.substring(0, 2) + '***' 
    : '***';
  return `${maskedLocal}@${domain}`;
};

// HTML escape function to prevent XSS in email templates
const escapeHtml = (str: string): string => {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
};

// Email format validation
const isValidEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

const handler = async (req: Request): Promise<Response> => {
  console.log("send-claim-notification function called");

  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Admin auth check
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const adminCheckClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: roleData } = await adminCheckClient.from('user_roles').select('role').eq('user_id', user.id).eq('role', 'admin').maybeSingle();
    if (!roleData) {
      return new Response(JSON.stringify({ error: 'Forbidden: admin role required' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const { email, candidateName, status, rejectionReason }: ClaimNotificationRequest = await req.json();

    // Validate email format
    if (!email || !isValidEmail(email)) {
      throw new Error("Valid email is required");
    }

    if (!candidateName || typeof candidateName !== 'string' || candidateName.trim().length === 0) {
      throw new Error("Candidate name is required");
    }

    // Sanitize inputs to prevent XSS in email HTML
    const safeCandidateName = escapeHtml(candidateName.trim().substring(0, 200));
    const safeRejectionReason = escapeHtml((rejectionReason || '').trim().substring(0, 1000));

    // Log with masked PII to prevent sensitive data exposure
    console.log(`Sending ${status} notification to ${maskEmail(email)} for candidate`);

    if (!RESEND_API_KEY) {
      throw new Error("RESEND_API_KEY is not configured");
    }

    let subject: string;
    let html: string;

    if (status === "approved") {
      subject = `Your profile claim for ${safeCandidateName} has been approved!`;
      html = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); padding: 30px; border-radius: 12px 12px 0 0; text-align: center;">
            <h1 style="color: white; margin: 0; font-size: 24px;">Congratulations!</h1>
          </div>
          <div style="background: #f9fafb; padding: 30px; border-radius: 0 0 12px 12px; border: 1px solid #e5e7eb; border-top: none;">
            <p style="font-size: 16px; margin-bottom: 20px;">
              Your claim request for the profile of <strong>${safeCandidateName}</strong> has been <span style="color: #10b981; font-weight: bold;">approved</span>!
            </p>
            <p style="font-size: 16px; margin-bottom: 20px;">
              You now have access to edit your profile information. This allows you to:
            </p>
            <ul style="font-size: 14px; color: #4b5563; margin-bottom: 20px;">
              <li>Update your profile photo</li>
              <li>Correct any inaccurate information</li>
              <li>Add additional context to your positions</li>
            </ul>
            <p style="font-size: 14px; color: #6b7280;">
              Visit your profile page to start making updates.
            </p>
          </div>
          <p style="text-align: center; font-size: 12px; color: #9ca3af; margin-top: 20px;">
            This is an automated notification from PolitiScore.
          </p>
        </body>
        </html>
      `;
    } else {
      subject = `Profile claim for ${safeCandidateName} - Update`;
      html = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: linear-gradient(135deg, #6b7280 0%, #4b5563 100%); padding: 30px; border-radius: 12px 12px 0 0; text-align: center;">
            <h1 style="color: white; margin: 0; font-size: 24px;">Profile Claim Update</h1>
          </div>
          <div style="background: #f9fafb; padding: 30px; border-radius: 0 0 12px 12px; border: 1px solid #e5e7eb; border-top: none;">
            <p style="font-size: 16px; margin-bottom: 20px;">
              We've reviewed your claim request for the profile of <strong>${safeCandidateName}</strong>.
            </p>
            <p style="font-size: 16px; margin-bottom: 20px;">
              Unfortunately, we were unable to approve your request at this time.
            </p>
            ${safeRejectionReason ? `
              <div style="background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 16px; margin-bottom: 20px;">
                <p style="font-size: 14px; color: #991b1b; margin: 0;">
                  <strong>Reason:</strong> ${safeRejectionReason}
                </p>
              </div>
            ` : ''}
            <p style="font-size: 14px; color: #6b7280;">
              If you believe this decision was made in error, please contact our support team with additional verification information.
            </p>
          </div>
          <p style="text-align: center; font-size: 12px; color: #9ca3af; margin-top: 20px;">
            This is an automated notification from PolitiScore.
          </p>
        </body>
        </html>
      `;
    }

    // Send email using Resend API
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "PolitiScore <onboarding@resend.dev>",
        to: [email],
        subject,
        html,
      }),
    });

    const emailResponse = await response.json();

    if (!response.ok) {
      console.error("Resend API error:", emailResponse);
      throw new Error(emailResponse.message || "Failed to send email");
    }

    console.log("Email sent successfully:", emailResponse);

    return new Response(JSON.stringify({ success: true, data: emailResponse }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: any) {
    console.error("Error in send-claim-notification function:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

serve(handler);
