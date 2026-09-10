import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

/**
 * SECURITY: This endpoint MUST verify a real payment before granting credits.
 *
 * Previously this function granted credits to any authenticated caller — that
 * allowed anyone to call `supabase.functions.invoke('purchase-credits', ...)`
 * and receive paid credits for free.
 *
 * Credit granting now happens exclusively from server-to-server payment
 * webhooks (RevenueCat / Stripe / Despia IAP). Until at least one of those
 * webhooks is wired up, this function rejects all client calls.
 *
 * To re-enable purchases, build a webhook endpoint that:
 *   1. Verifies the provider's signature on the request body.
 *   2. Looks up the user from the verified payload (NOT from the client).
 *   3. Calls the `profiles` update via the service role.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Still verify the user so we can log abuse attempts cleanly.
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.warn(
      `[purchase-credits] Rejected unverified credit-grant attempt by user ${user.id}. ` +
        `Credits can only be granted via a verified payment webhook.`,
    );

    return new Response(
      JSON.stringify({
        error: "Payment verification required",
        message:
          "Credits cannot be granted without a verified payment receipt. " +
          "This endpoint is disabled until a payment webhook (RevenueCat / Stripe / Despia IAP) is wired up.",
      }),
      {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (err) {
    console.error("Purchase error:", err);
    return new Response(JSON.stringify({ error: "An internal error occurred." }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
