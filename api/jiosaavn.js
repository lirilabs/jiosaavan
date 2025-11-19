import axios from "axios";

// In-memory cache with TTL
const cache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Language-specific popular artist names to get relevant results
const langSearchQueries = {
  tamil: "AR Rahman Anirudh Yuvan Shankar Raja Devi Sri Prasad Harris Jayaraj",
  hindi: "Arijit Singh Shreya Ghoshal Sonu Nigam Atif Aslam Neha Kakkar Badshah",
  telugu: "Devi Sri Prasad Thaman S Anirudh MM Keeravani Sid Sriram",
  malayalam: "Vineeth Sreenivasan KS Chithra Vidyasagar Gopi Sundar MG Sreekumar",
  kannada: "Armaan Malik Sanjith Hegde Vijay Prakash Shreya Ghoshal Raghu Dixit",
  english: "Ed Sheeran Taylor Swift Justin Bieber Ariana Grande The Weeknd"
};

// Reusable axios instance
const apiClient = axios.create({
  timeout: 10000,
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

// Helper to fetch and merge results from multiple queries
async function fetchMultipleQueries(queries, page) {
  const promises = queries.map(query => {
    const url =
      `https://www.jiosaavn.com/api.php?p=${page}&q=${encodeURIComponent(query)}` +
      `&_format=json&_marker=0&api_version=4&ctx=wap6dot0&n=20` +
      `&__call=search.getArtistResults`;
    
    return apiClient.get(url, { responseType: "text" })
      .then(raw => {
        const startIndex = raw.data.indexOf("{");
        const data = startIndex > 0 ? raw.data.slice(startIndex) : raw.data;
        return JSON.parse(data);
      })
      .catch(() => ({ results: [] }));
  });

  const results = await Promise.all(promises);
  
  // Merge and deduplicate artists by name
  const artistMap = new Map();
  let total = 0;
  
  results.forEach(result => {
    total = Math.max(total, result.total || 0);
    (result.results || []).forEach(artist => {
      if (!artistMap.has(artist.name)) {
        artistMap.set(artist.name, artist);
      }
    });
  });

  return {
    results: Array.from(artistMap.values()),
    total
  };
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
    let useMultiQuery = false;
    
    if (name) {
      // If artist name is provided, search for that specific name
      searchQuery = name;
    } else if (lang && langSearchQueries[lang]) {
      // For language searches, use language-specific artist names
      searchQuery = langSearchQueries[lang];
      useMultiQuery = true; // We'll search multiple artists for better results
    } else {
      // Default fallback
      searchQuery = "artist";
    }
    
    const cacheKey = getCacheKey(searchQuery, lang || "default", page);

    // Check cache first
    const cached = cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      const artists = cached.data.results || [];
      const filteredArtists = artists.slice(0, 50).map(({ name, role, image }) => ({
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
        searchQuery: name || lang || "default",
        total: cached.data.total,
        artists: filteredArtists,
        cached: true
      });
    }

    let cleanJSON;

    if (useMultiQuery && !name) {
      // For language queries, search multiple artists and merge results
      const artistNames = searchQuery.split(' ');
      const queries = artistNames.slice(0, 4); // Limit to 4 queries to avoid rate limits
      cleanJSON = await fetchMultipleQueries(queries, page);
    } else {
      // Single query for specific artist names
      const url =
        `https://www.jiosaavn.com/api.php?p=${page}&q=${encodeURIComponent(searchQuery)}` +
        `&_format=json&_marker=0&api_version=4&ctx=wap6dot0&n=50` +
        `&__call=search.getArtistResults`;

      const raw = await apiClient.get(url, { responseType: "text" });
      
      // Optimized JSON parsing (remove prefix)
      const startIndex = raw.data.indexOf("{");
      const data = startIndex > 0 ? raw.data.slice(startIndex) : raw.data;
      cleanJSON = JSON.parse(data);
    }

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
    if (!useMultiQuery) {
      setImmediate(() => prefetchNextPage(searchQuery, lang || "default", page));
    }

    const artists = cleanJSON.results || [];
    
    // Optimized mapping with destructuring, limit to 50 results
    const filteredArtists = artists.slice(0, 50).map(({ name, role, image }) => ({
      name,
      role,
      image
    }));

    return res.status(200).json({
      page,
      perPage: 50,
      language: l || "default",
      searchQuery: name || lang || "default",
      total: cleanJSON.total || artists.length,
      artists: filteredArtists,
      cached: false
    });

  } catch (error) {
    console.error('API Error:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
}
