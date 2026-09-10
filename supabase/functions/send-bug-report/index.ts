import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendLovableEmail } from 'npm:@lovable.dev/email-js';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { message, username, squad_id } = await req.json();

    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return new Response(JSON.stringify({ error: 'Message is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY')!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const authHeader = req.headers.get('Authorization');
    let userId: string | null = null;
    let userEmail: string | null = null;
    if (authHeader) {
      const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
      const userClient = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: { user } } = await userClient.auth.getUser();
      userId = user?.id || null;
      userEmail = user?.email || null;
    }

    const trimmedMessage = message.trim();
    const queuedAt = new Date().toISOString();

    const { error: insertError } = await supabase.from('bug_reports').insert({
      user_id: userId,
      username: username || null,
      squad_id: squad_id || null,
      message: trimmedMessage,
    });

    if (insertError) {
      console.error('Failed to insert bug report:', insertError);
      return new Response(JSON.stringify({ error: 'Failed to save bug report' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Generate a simple unsubscribe token for the developer email
    const unsubscribeToken = crypto.randomUUID();

    try {
      await sendLovableEmail({
        to: 'developer@thecaptain.online',
        subject: `🐛 Bug Report from ${username || 'Unknown User'}`,
        html: `
          <div style="font-family: 'Space Grotesk', Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff; padding: 24px;">
            <h2 style="color: #0d1117; margin-bottom: 16px;">🐛 New Bug Report</h2>
            <table style="width: 100%; border-collapse: collapse; margin-bottom: 16px;">
              <tr>
                <td style="padding: 8px 12px; background: #f6f8fa; font-weight: bold; width: 120px; border: 1px solid #d0d7de;">Username</td>
                <td style="padding: 8px 12px; border: 1px solid #d0d7de;">${username || 'N/A'}</td>
              </tr>
              <tr>
                <td style="padding: 8px 12px; background: #f6f8fa; font-weight: bold; border: 1px solid #d0d7de;">Email</td>
                <td style="padding: 8px 12px; border: 1px solid #d0d7de;">${userEmail || 'N/A'}</td>
              </tr>
              <tr>
                <td style="padding: 8px 12px; background: #f6f8fa; font-weight: bold; border: 1px solid #d0d7de;">Squad ID</td>
                <td style="padding: 8px 12px; border: 1px solid #d0d7de; font-size: 12px;">${squad_id || 'N/A'}</td>
              </tr>
              <tr>
                <td style="padding: 8px 12px; background: #f6f8fa; font-weight: bold; border: 1px solid #d0d7de;">User ID</td>
                <td style="padding: 8px 12px; border: 1px solid #d0d7de; font-size: 12px;">${userId || 'N/A'}</td>
              </tr>
            </table>
            <div style="padding: 16px; background: #f6f8fa; border: 1px solid #d0d7de; border-radius: 6px;">
              <p style="margin: 0; white-space: pre-wrap;">${trimmedMessage}</p>
            </div>
            <p style="color: #656d76; font-size: 12px; margin-top: 16px;">Sent from The Captain app at ${queuedAt}</p>
          </div>
        `,
        text: `Bug report from ${username || 'Unknown User'}\n\nEmail: ${userEmail || 'N/A'}\nSquad ID: ${squad_id || 'N/A'}\nUser ID: ${userId || 'N/A'}\n\n${trimmedMessage}`,
        from: 'Bug Reports <bugs@notify.thecaptain.online>',
        sender_domain: 'notify.thecaptain.online',
        purpose: 'transactional',
        label: 'bug_report',
        unsubscribe_token: unsubscribeToken,
        idempotency_key: `bug-report-${userId || 'anon'}-${Date.now()}`,
      }, {
        apiKey: lovableApiKey,
        sendUrl: Deno.env.get('LOVABLE_SEND_URL'),
      });
    } catch (emailErr) {
      console.error('Failed to send bug report email immediately:', emailErr);
    }

    console.log(`Bug report received from ${username || 'unknown'}: ${trimmedMessage.substring(0, 100)}...`);

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error processing bug report:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
