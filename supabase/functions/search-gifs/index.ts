import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const GIPHY_API_KEY = Deno.env.get('GIPHY_API_KEY');
  if (!GIPHY_API_KEY) {
    return new Response(JSON.stringify({ error: 'GIPHY_API_KEY not configured' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    let query = '';
    let limit = '20';
    let offset = '0';

    // Support both GET query params and POST body
    if (req.method === 'POST') {
      try {
        const body = await req.json();
        query = body.q || '';
        limit = String(body.limit || 20);
        offset = String(body.offset || 0);
      } catch {}
    } else {
      const url = new URL(req.url);
      query = url.searchParams.get('q') || '';
      limit = url.searchParams.get('limit') || '20';
      offset = url.searchParams.get('offset') || '0';
    }

    let giphyUrl: string;
    if (query.trim()) {
      giphyUrl = `https://api.giphy.com/v1/gifs/search?api_key=${GIPHY_API_KEY}&q=${encodeURIComponent(query)}&limit=${limit}&offset=${offset}&rating=pg-13&lang=en`;
    } else {
      giphyUrl = `https://api.giphy.com/v1/gifs/trending?api_key=${GIPHY_API_KEY}&limit=${limit}&offset=${offset}&rating=pg-13`;
    }

    const response = await fetch(giphyUrl);
    if (!response.ok) {
      throw new Error(`Giphy API error [${response.status}]: ${await response.text()}`);
    }

    const data = await response.json();

    const gifs = (data.data || []).map((gif: any) => ({
      id: gif.id,
      title: gif.title,
      preview: gif.images?.fixed_width_small?.url || gif.images?.preview_gif?.url || '',
      url: gif.images?.fixed_width?.url || gif.images?.original?.url || '',
      fullUrl: gif.images?.original?.url || '',
    }));

    return new Response(JSON.stringify({ gifs }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error fetching GIFs:', error);
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
