import axios from "axios";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Content-Type", "application/json");

  try {
    // If values missing → auto defaults
    const q = req.query.q ?? "";
    const p = req.query.p ?? 1;
    const n = req.query.n ?? 20;

    const url = `https://www.jiosaavn.com/api.php?p=${p}&q=${encodeURIComponent(
      q
    )}&_format=json&_marker=0&api_version=4&ctx=wap6dot0&n=${n}&__call=search.getArtistResults`;

    const response = await axios.get(url, {
      headers: {
        "User-Agent": "Mozilla/5.0",
        Accept: "application/json"
      }
    });

    let data = response.data;

    // Sometimes returned as string → convert to JSON
    if (typeof data === "string") {
      data = JSON.parse(data.replace(/^[^\{]+/, ""));
    }

    return res.status(200).json({
      success: true,
      query: q,
      page: Number(p),
      perPage: Number(n),
      total: data.total || 0,
      count: (data.results || []).length,
      artists: data.results || []
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err.message || err.toString()
    });
  }
}
