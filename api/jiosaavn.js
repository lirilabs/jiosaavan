import axios from "axios";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Content-Type", "application/json");

  try {
    const { q, p, n } = req.query;

    // Strict: NO STATIC VALUES — all required
    if (!q) {
      return res.status(400).json({
        success: false,
        message: "Missing required parameter: q (search query)"
      });
    }
    if (!p) {
      return res.status(400).json({
        success: false,
        message: "Missing required parameter: p (page number)"
      });
    }
    if (!n) {
      return res.status(400).json({
        success: false,
        message: "Missing required parameter: n (results per page)"
      });
    }

    const url = `https://www.jiosaavn.com/api.php?p=${p}&q=${encodeURIComponent(
      q
    )}&_format=json&_marker=0&api_version=4&ctx=wap6dot0&n=${n}&__call=search.getArtistResults`;

    const response = await axios.get(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        Accept: "application/json"
      }
    });

    let data = response.data;

    // Fix JioSaavn string response
    if (typeof data === "string") {
      data = JSON.parse(data.replace(/^[^\{]+/, ""));
    }

    return res.status(200).json({
      success: true,
      query: q,
      page: Number(p),
      perPage: Number(n),
      total: data.total || 0,
      count: data.results?.length || 0,
      artists: data.results || []
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err.message || err.toString()
    });
  }
}
