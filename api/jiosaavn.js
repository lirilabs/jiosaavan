import axios from "axios";

// In-memory cache with TTL
const cache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Known artists by language (for filtering)
const artistsByLanguage = {
  tamil: [
    "S. P. Balasubrahmanyam", "Anirudh Ravichander", "A.R. Rahman", "Yuvan Shankar Raja",
    "Harris Jayaraj", "Ilaiyaraaja", "Devi Sri Prasad", "Sid Sriram", "Vijay Antony",
    "G.V. Prakash Kumar", "D. Imman", "Santhosh Narayanan", "Hiphop Tamizha",
    "Chinmayi", "Shreya Ghoshal", "Harini", "Anuradha Sriram", "Shakthisree Gopalan",
    "K. S. Chithra", "S. Janaki", "P. Susheela", "T. M. Soundararajan", "K. J. Yesudas",
    "Unnikrishnan", "Hariharan", "SPB Charan", "Karthik", "Vijay Yesudas", "Haricharan",
    "Benny Dayal", "Andrea Jeremiah", "Dhee", "Jonita Gandhi"
  ],
  hindi: [
    "Arijit Singh", "Shreya Ghoshal", "Sonu Nigam", "Atif Aslam", "Neha Kakkar",
    "Badshah", "Jubin Nautiyal", "Armaan Malik", "Vishal Mishra", "B Praak",
    "Mohit Chauhan", "Sunidhi Chauhan", "Alka Yagnik", "Kumar Sanu", "Udit Narayan",
    "Anuradha Paudwal", "Kavita Krishnamurthy", "Shilpa Rao", "Payal Dev",
    "Amitabh Bhattacharya", "Yo Yo Honey Singh", "Guru Randhawa", "Diljit Dosanjh",
    "Darshan Raval", "Tony Kakkar", "Tulsi Kumar", "Palak Muchhal", "Shaan"
  ],
  telugu: [
    "Devi Sri Prasad", "Thaman S", "S. P. Balasubrahmanyam", "Sid Sriram",
    "MM Keeravani", "Anirudh Ravichander", "Mani Sharma", "R. P. Patnaik",
    "Ghibran", "S. Thaman", "Ramajogayya Sastry", "Chinmayi", "Shreya Ghoshal",
    "Sunitha", "Hemachandra", "Mangli", "Rahul Sipligunj", "Kaala Bhairava"
  ],
  malayalam: [
    "Vineeth Sreenivasan", "K. S. Chithra", "Vidyasagar", "Gopi Sundar",
    "M. G. Sreekumar", "K. J. Yesudas", "S. Janaki", "Sujatha Mohan",
    "Hariharan", "Najim Arshad", "Haricharan", "Shreya Ghoshal", "Vijay Yesudas"
  ],
  kannada: [
    "Armaan Malik", "Sanjith Hegde", "Vijay Prakash", "Shreya Ghoshal",
    "Raghu Dixit", "Puneeth Rajkumar", "Rajesh Krishnan", "V. Harikrishna",
    "Arjun Janya", "Chandan Shetty", "Vasuki Vaibhav"
  ],
  english: [
    "Ed Sheeran", "Taylor Swift", "Justin Bieber", "Ariana Grande", "The Weeknd",
    "DJ Snake", "Sean Paul", "Eminem", "Rihanna", "Drake", "Post Malone"
  ]
};

// Reusable axios instance
const apiClient = axios.create({
  timeout: 10000,
  headers: {
    "Accept-Encoding": "gzip, deflate, br",
    "Connection": "keep-alive"
  }
});

// Check if artist belongs to a language
function isArtistInLanguage(artistName, language) {
  if (!language || !artistsByLanguage[language]) return true;
  
  const langArtists = artistsByLanguage[language];
  const normalizedName = artistName.toLowerCase().trim();
  
  return langArtists.some(knownArtist => {
    const normalizedKnown = knownArtist.toLowerCase().trim();
    return normalizedName.includes(normalizedKnown) || normalizedKnown.includes(normalizedName);
  });
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
    
    // Simple search query
    const searchQuery = name || "artist";
    const cacheKey = getCacheKey(searchQuery, lang, page);

    // Check cache first
    const cached = cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return res.status(200).json(cached.data);
    }

    // Fetch from JioSaavn API
    const url =
      `https://www.jiosaavn.com/api.php?p=${page}&q=${encodeURIComponent(searchQuery)}` +
      `&_format=json&_marker=0&api_version=4&ctx=wap6dot0&n=50` +
      `&__call=search.getArtistResults`;

    const raw = await apiClient.get(url, { responseType: "text" });
    
    // Parse JSON (remove any prefix)
    const startIndex = raw.data.indexOf("{");
    const data = startIndex > 0 ? raw.data.slice(startIndex) : raw.data;
    const apiResponse = JSON.parse(data);

    let artists = apiResponse.results || [];
    
    // Filter by language if specified
    if (lang && artistsByLanguage[lang]) {
      artists = artists.filter(artist => isArtistInLanguage(artist.name, lang));
    }

    // Map to clean response
    const filteredArtists = artists.map(({ name, role, image, id, perma_url }) => ({
      id,
      name,
      role,
      image,
      url: perma_url
    }));

    const responseData = {
      page,
      perPage: 50,
      language: lang || "all",
      searchQuery: name || "artist",
      total: lang ? filteredArtists.length : apiResponse.total,
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
      error: error.message
    });
  }
}
