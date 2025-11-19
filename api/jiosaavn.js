import axios from "axios";

// In-memory cache with TTL (Time To Live)
const cache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Language mapping - removed "singer" suffix for better results
const langMap = {
  tamil: "tamil",
  hindi: "hindi",
  telugu: "telugu",
  malayalam: "malayalam",
  kannada: "kannada",
  english: "english"
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
      .catch(() => {});
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

// Filter artists by language (additional client-side filtering)
function filterByLanguage(artists, targetLang) {
  if (!targetLang || targetLang === "default") return artists;
  
  const langKeywords = {
    tamil: ["tamil"],
    hindi: ["hindi", "bollywood"],
    telugu: ["telugu", "tollywood"],
    malayalam: ["malayalam", "mollywood"],
    kannada: ["kannada", "sandalwood"],
    english: ["english", "international"]
  };
  
  const keywords = langKeywords[targetLang.toLowerCase()] || [];
  
  return artists.filter(artist => {
    const role = (artist.role || "").toLowerCase();
    const name = (artist.name || "").toLowerCase();
    
    // Check if artist role or name contains target language keywords
    return keywords.some(keyword => 
      role.includes(keyword) || name.includes(keyword)
    );
  });
}

export default async function handler(req, res) {
  // CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Content-Type", "application/json");
  
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  try {
    const { l = "", p = 1, name = "" } = req.query;
    const lang = l.toLowerCase();
    const page = Number(p);
    
    // Build search query
    let searchQuery;
    
    if (name) {
      // Search by artist name
      const langSuffix = lang && langMap[lang] ? ` ${langMap[lang]}` : "";
      searchQuery = `${name}${langSuffix}`;
    } else if (lang && langMap[lang]) {
      // Search by language - use more specific query
      searchQuery = `${langMap[lang]} artist songs music`;
    } else {
      // Default fallback
      searchQuery = "popular artist";
    }
    
    const cacheKey = getCacheKey(searchQuery, lang || "default", page);

    // Check cache
    const cached = cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      let artists = cached.data.results || [];
      
      // Apply language filter
      if (lang && !name) {
        artists = filterByLanguage(artists, lang);
      }
      
      const filteredArtists = artists.map(({ name, role, image }) => ({
        name,
        role,
        image
      }));

      setImmediate(() => prefetchNextPage(searchQuery, lang || "default", page));

      return res.status(200).json({
        page,
        perPage: 50,
        language: l || "default",
        searchQuery: name || searchQuery,
        total: filteredArtists.length,
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
    
    const startIndex = raw.data.indexOf("{");
    const data = startIndex > 0 ? raw.data.slice(startIndex) : raw.data;
    const cleanJSON = JSON.parse(data);

    cache.set(cacheKey, {
      data: cleanJSON,
      timestamp: Date.now()
    });

    if (Math.random() < 0.1) {
      setImmediate(cleanupCache);
    }

    setImmediate(() => prefetchNextPage(searchQuery, lang || "default", page));

    let artists = cleanJSON.results || [];
    
    // Apply language filter when searching by language only
    if (lang && !name) {
      artists = filterByLanguage(artists, lang);
    }
    
    const filteredArtists = artists.map(({ name, role, image }) => ({
      name,
      role,
      image
    }));

    return res.status(200).json({
      page,
      perPage: 50,
      language: l || "default",
      searchQuery: name || searchQuery,
      total: filteredArtists.length,
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
