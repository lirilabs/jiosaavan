import axios from "axios";

// In-memory cache with TTL (Time To Live)
// NOTE: In serverless, this only persists during "warm" container lifecycle
// For persistent cache, use Redis, Vercel KV, or Upstash
const cache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Language mapping with optimized lookup
const langMap = {
  tamil: "tamil singer",
  hindi: "hindi singer",
  telugu: "telugu singer",
  malayalam: "malayalam singer",
  kannada: "kannada singer",
  english: "english singer"
};

// Reusable axios instance with optimizations
const apiClient = axios.create({
  timeout: 8000,
  headers: {
    "Accept-Encoding": "gzip, deflate, br",
    "Connection": "keep-alive"
  }
});

// Cache key generator
function getCacheKey(query, lang, page) {
  return `${query}_${lang}_${page}`;
}

// Predictive prefetching for next page
async function prefetchNextPage(query, lang, currentPage) {
  const nextPage = currentPage + 1;
  const cacheKey = getCacheKey(query, lang, nextPage);
  
  if (!cache.has(cacheKey)) {
    const url =
      `https://www.jiosaavn.com/api.php?p=${nextPage}&q=${encodeURIComponent(query)}` +
      `&_format=json&_marker=0&api_version=4&ctx=wap6dot0&n=50` +
      `&__call=search.getArtistResults`;
    
    // Non-blocking prefetch
    apiClient.get(url, { responseType: "text" })
      .then(raw => {
        const startIndex = raw.data.indexOf("{");
        const data = startIndex > 0 ? raw.data.slice(startIndex) : raw.data;
        const cleanJSON = JSON.parse(data);
        cache.set(cacheKey, {
          data: cleanJSON,
          timestamp: Date.now()
        });
      })
      .catch(() => {}); // Silent fail for prefetch
  }
}

// Cleanup expired cache entries
function cleanupCache() {
  const now = Date.now();
  for (const [key, value] of cache.entries()) {
    if (now - value.timestamp > CACHE_TTL) {
      cache.delete(key);
    }
  }
}

export default async function handler(req, res) {
  // CORS headers - allow all origins
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Content-Type", "application/json");
  
  // Handle preflight
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  try {
    const { l = "", p = 1, name = "" } = req.query;
    const lang = l.toLowerCase();
    const page = Number(p);
    
    // Build search query based on parameters
    let searchQuery;
    
    if (name) {
      // If artist name is provided, search with name + language
      const langSuffix = lang && langMap[lang] ? ` ${langMap[lang]}` : "";
      searchQuery = `${name}${langSuffix}`;
    } else {
      // Default behavior: search by language only
      searchQuery = langMap[lang] || "artist";
    }
    
    const cacheKey = getCacheKey(searchQuery, lang || "default", page);

    // Check cache first (AI-like optimization: pattern recognition)
    const cached = cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      const artists = cached.data.results || [];
      const filteredArtists = artists.map(({ name, role, image }) => ({
        name,
        role,
        image
      }));

      // Trigger prefetch in background
      setImmediate(() => prefetchNextPage(searchQuery, lang || "default", page));

      return res.status(200).json({
        page,
        perPage: 50,
        language: l || "default",
        searchQuery: name || "all",
        total: cached.data.total,
        artists: filteredArtists,
        cached: true
      });
    }

    // Fetch from API
    const url =
      `https://www.jiosaavn.com/api.php?p=${page}&q=${encodeURIComponent(searchQuery)}` +
      `&_format=json&_marker=0&api_version=4&ctx=wap6dot0&n=50` +
      `&__call=search.getArtistResults`;

    const raw = await apiClient.get(url, { responseType: "text" });
    
    // Optimized JSON parsing (remove prefix)
    const startIndex = raw.data.indexOf("{");
    const data = startIndex > 0 ? raw.data.slice(startIndex) : raw.data;
    const cleanJSON = JSON.parse(data);

    // Cache the result
    cache.set(cacheKey, {
      data: cleanJSON,
      timestamp: Date.now()
    });

    // Periodic cache cleanup
    if (Math.random() < 0.1) {
      setImmediate(cleanupCache);
    }

    // Trigger predictive prefetch
    setImmediate(() => prefetchNextPage(searchQuery, lang || "default", page));

    const artists = cleanJSON.results || [];
    
    // Optimized mapping with destructuring
    const filteredArtists = artists.map(({ name, role, image }) => ({
      name,
      role,
      image
    }));

    return res.status(200).json({
      page,
      perPage: 50,
      language: l || "default",
      searchQuery: name || "all",
      total: cleanJSON.total,
      artists: filteredArtists,
      cached: false
    });

  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
}
