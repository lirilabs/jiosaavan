import axios from "axios";

// In-memory cache with TTL
const cache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Language-specific search terms to help API return relevant results
const langSearchTerms = {
  tamil: ["tamil songs", "tamil music", "kollywood", "tamil cinema"],
  hindi: ["hindi songs", "bollywood", "hindi music", "bollywood songs"],
  telugu: ["telugu songs", "tollywood", "telugu music", "telugu cinema"],
  malayalam: ["malayalam songs", "mollywood", "malayalam music"],
  kannada: ["kannada songs", "sandalwood", "kannada music"],
  english: ["english songs", "pop music", "western music"]
};

// Keywords to identify language from artist info
const langKeywords = {
  tamil: ["tamil", "kollywood", "chennai"],
  hindi: ["hindi", "bollywood", "mumbai"],
  telugu: ["telugu", "tollywood", "hyderabad"],
  malayalam: ["malayalam", "mollywood", "kerala"],
  kannada: ["kannada", "sandalwood", "bangalore"],
  english: ["english", "pop", "western"]
};

// Reusable axios instance
const apiClient = axios.create({
  timeout: 15000,
  headers: {
    "Accept-Encoding": "gzip, deflate, br",
    "Connection": "keep-alive"
  }
});

// Fetch multiple pages in parallel
async function fetchMultiplePages(searchQuery, startPage, numPages) {
  const promises = [];
  
  for (let i = 0; i < numPages; i++) {
    const page = startPage + i;
    const url =
      `https://www.jiosaavn.com/api.php?p=${page}&q=${encodeURIComponent(searchQuery)}` +
      `&_format=json&_marker=0&api_version=4&ctx=wap6dot0&n=50` +
      `&__call=search.getArtistResults`;
    
    promises.push(
      apiClient.get(url, { responseType: "text" })
        .then(raw => {
          const startIndex = raw.data.indexOf("{");
          const data = startIndex > 0 ? raw.data.slice(startIndex) : raw.data;
          return JSON.parse(data);
        })
        .catch(() => ({ results: [] }))
    );
  }

  const results = await Promise.all(promises);
  
  // Merge results and deduplicate by artist ID
  const artistMap = new Map();
  let total = 0;
  
  results.forEach(result => {
    total = Math.max(total, result.total || 0);
    (result.results || []).forEach(artist => {
      if (!artistMap.has(artist.id)) {
        artistMap.set(artist.id, artist);
      }
    });
  });

  return {
    results: Array.from(artistMap.values()),
    total
  };
}

// Check if artist matches language based on available info
function matchesLanguage(artist, language) {
  if (!language) return true;
  
  const searchText = `${artist.name} ${artist.role || ""}`.toLowerCase();
  const keywords = langKeywords[language] || [];
  
  // Check if any language keyword appears in artist info
  return keywords.some(keyword => searchText.includes(keyword));
}

// Cache key generator
function getCacheKey(query, lang, page) {
  return `${query}_${lang}_${page}`;
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
    
    // Determine search strategy
    let searchQuery;
    let fetchMultiple = false;
    let numPages = 1;
    
    if (name) {
      // Specific artist search
      searchQuery = name;
    } else if (lang && langSearchTerms[lang]) {
      // Language search - use language-specific terms and fetch multiple pages
      searchQuery = langSearchTerms[lang][0];
      fetchMultiple = true;
      numPages = 5; // Fetch 5 pages = 250 artists
    } else {
      // Default search
      searchQuery = "artist";
      fetchMultiple = true;
      numPages = 3;
    }
    
    const cacheKey = getCacheKey(searchQuery, lang, page);

    // Check cache first
    const cached = cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return res.status(200).json(cached.data);
    }

    let apiResponse;

    if (fetchMultiple && page === 1) {
      // Fetch multiple pages for better coverage
      apiResponse = await fetchMultiplePages(searchQuery, 1, numPages);
    } else {
      // Single page fetch
      const url =
        `https://www.jiosaavn.com/api.php?p=${page}&q=${encodeURIComponent(searchQuery)}` +
        `&_format=json&_marker=0&api_version=4&ctx=wap6dot0&n=50` +
        `&__call=search.getArtistResults`;

      const raw = await apiClient.get(url, { responseType: "text" });
      
      const startIndex = raw.data.indexOf("{");
      const data = startIndex > 0 ? raw.data.slice(startIndex) : raw.data;
      apiResponse = JSON.parse(data);
    }

    let artists = apiResponse.results || [];
    
    // Light filtering - just remove obvious mismatches
    if (lang && langKeywords[lang]) {
      const filtered = artists.filter(artist => matchesLanguage(artist, lang));
      // If filtering removed too many, keep originals
      if (filtered.length > 20) {
        artists = filtered;
      }
    }

    // Map to clean response
    const filteredArtists = artists.map(({ name, role, image, id, perma_url, ctr }) => ({
      id,
      name,
      role,
      image,
      url: perma_url,
      popularity: ctr || 0
    }));

    // Sort by popularity
    filteredArtists.sort((a, b) => b.popularity - a.popularity);

    const responseData = {
      page,
      perPage: filteredArtists.length,
      language: lang || "all",
      searchQuery: name || searchQuery,
      total: apiResponse.total,
      artists: filteredArtists,
      cached: false
    };

    // Cache the result
    cache.set(cacheKey, {
      data: responseData,
      timestamp: Date.now()
    });

    // Periodic cache cleanup
    if (Math.random() < 0.1) {
      setImmediate(cleanupCache);
    }

    return res.status(200).json(responseData);

  } catch (error) {
    console.error('API Error:', error);
    return res.status(500).json({
      success: false,
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}
