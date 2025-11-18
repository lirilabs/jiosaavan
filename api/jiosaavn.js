import axios from "axios";

// In-memory cache with TTL (Time To Live)
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
function getCacheKey(lang, page) {
  return `${lang}_${page}`;
}

// Predictive prefetching for next page
async function prefetchNextPage(lang, currentPage) {
  const nextPage = currentPage + 1;
  const cacheKey = getCacheKey(lang, nextPage);
  
  if (!cache.has(cacheKey)) {
    const q = langMap[lang.toLowerCase()] || "artist";
    const url =
      `https://www.jiosaavn.com/api.php?p=${nextPage}&q=${encodeURIComponent(q)}` +
      `&_format=json&_marker=0&api_version=4&ctx=wap6dot0&n=50` +
      `&__call=search.getArtistResults`;
    
    // Non-blocking prefetch
    apiClient.get(url, { responseType: "text" })
      .then(raw => {
        let data = raw.data.replace(/^[^{]+/, "");
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
    const { l = "", p = 1 } = req.query;
    const lang = l.toLowerCase();
    const page = Number(p);
    const cacheKey = getCacheKey(lang || "default", page);

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
      setImmediate(() => prefetchNextPage(lang || "default", page));

      return res.status(200).json({
        page,
        perPage: 50,
        language: l || "default",
        total: cached.data.total,
        artists: filteredArtists,
        cached: true
      });
    }

    // Fetch from API
    const q = langMap[lang] || "artist";
    const url =
      `https://www.jiosaavn.com/api.php?p=${page}&q=${encodeURIComponent(q)}` +
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
    setImmediate(() => prefetchNextPage(lang || "default", page));

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
