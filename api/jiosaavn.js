import axios from "axios";

export default async function handler(req, res) {
  const { q = "arijit" } = req.query;

  try {
    const response = await axios.get(
      "https://www.jiosaavn.com/api.php",
      {
        params: {
          p: 1,
          q,
          _format: "json",
          _marker: 0,
          api_version: 4,
          ctx: "wap6dot0",
          n: 20,
          __call: "search.getArtistResults"
        },
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
          "Accept": "application/json, text/plain, */*",
          "Accept-Language": "en-US,en;q=0.9",
          "Referer": "https://www.jiosaavn.com/",
          // Put YOUR cookie here for stable access
          "Cookie": process.env.JIOSAAVN_COOKIE
        }
      }
    );

    // Clean JioSaavn JSON (removes "<!---->" etc.)
    const cleanJson = JSON.parse(
      response.data.replace(/^\s*<!.*?>\s*/g, "")
    );

    res.status(200).json(cleanJson);

  } catch (err) {
    console.error(err);
    res.status(500).json({
      error: true,
      message: err.response?.data || err.message
    });
  }
}
