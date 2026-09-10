import { useState, useEffect, useCallback, useRef } from "react";

interface GiphyGif {
  id: string;
  title: string;
  preview: string;
  url: string;
  fullUrl: string;
}

// Compute ms until next 12:00am AEST (UTC+11 in DST / UTC+10 standard)
// We use UTC+11 (AEDT) as a safe approximation
const msUntilMidnightAEST = (): number => {
  const now = new Date();
  const aestOffset = 11 * 60; // AEDT minutes ahead of UTC
  const aestNow = new Date(now.getTime() + aestOffset * 60 * 1000);
  const nextMidnight = new Date(aestNow);
  nextMidnight.setUTCHours(0, 0, 0, 0);
  nextMidnight.setUTCDate(nextMidnight.getUTCDate() + 1);
  return nextMidnight.getTime() - aestNow.getTime();
};

// Cache key based on AEST date
const getTrendingCacheKey = (): string => {
  const now = new Date();
  const aest = new Date(now.getTime() + 11 * 60 * 60 * 1000);
  return `gifs_trending_${aest.getUTCFullYear()}-${aest.getUTCMonth()}-${aest.getUTCDate()}`;
};

export const useGiphySearch = () => {
  const [trending, setTrending] = useState<GiphyGif[]>([]);
  const [searchResults, setSearchResults] = useState<GiphyGif[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchGifs = useCallback(async (query: string = "", limit = 20): Promise<GiphyGif[]> => {
    try {
      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
      const url = `https://${projectId}.supabase.co/functions/v1/search-gifs`;

      const res = await fetch(url, {
        method: "POST",
        headers: {
          "apikey": anonKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ q: query, limit }),
      });

      if (!res.ok) throw new Error(`GIF fetch failed: ${res.status}`);
      const json = await res.json();
      return json.gifs || [];
    } catch (err) {
      console.error("Failed to fetch GIFs:", err);
      return [];
    }
  }, []);

  // Load trending on mount, refresh at midnight AEST
  useEffect(() => {
    const loadTrending = async () => {
      const cacheKey = getTrendingCacheKey();
      const cached = sessionStorage.getItem(cacheKey);
      if (cached) {
        try {
          setTrending(JSON.parse(cached));
          return;
        } catch {}
      }

      setLoading(true);
      const gifs = await fetchGifs("", 20);
      setTrending(gifs);
      setLoading(false);

      if (gifs.length > 0) {
        sessionStorage.setItem(cacheKey, JSON.stringify(gifs));
      }
    };

    loadTrending();

    // Schedule refresh at midnight AEST
    const scheduleRefresh = () => {
      const ms = msUntilMidnightAEST();
      refreshTimerRef.current = setTimeout(() => {
        sessionStorage.removeItem(getTrendingCacheKey());
        loadTrending();
        scheduleRefresh();
      }, ms);
    };
    scheduleRefresh();

    return () => {
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    };
  }, [fetchGifs]);

  const search = useCallback((query: string) => {
    setSearchQuery(query);

    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);

    if (!query.trim()) {
      setSearchResults([]);
      return;
    }

    searchTimeoutRef.current = setTimeout(async () => {
      setLoading(true);
      const gifs = await fetchGifs(query, 20);
      setSearchResults(gifs);
      setLoading(false);
    }, 400);
  }, [fetchGifs]);

  const displayGifs = searchQuery.trim() ? searchResults : trending;

  return { gifs: displayGifs, loading, search, searchQuery };
};
