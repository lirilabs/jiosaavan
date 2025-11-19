export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Content-Type", "application/json");

  try {
    const { l = "", p = 1 } = req.query;

    // Extremely lightweight language lookup
    const langMap = {
      tamil: "tamil singer",
      hindi: "hindi singer",
      telugu: "telugu singer",
      malayalam: "malayalam singer",
      kannada: "kannada singer",
      english: "english singer"
    };

    const q = langMap[l.toLowerCase()] || "artidt";

    const n = 50; // always 50 per page

    const url =
      `https://www.jiosaavn.com/api.php?p=${p}&q=${encodeURIComponent(q)}` +
      `&_format=json&_marker=0&api_version=4&ctx=wap6dot0&n=${n}` +
      `&__call=search.getArtistResults`;

    // FASTER THAN AXIOS — native fetch
    const response = await fetch(url);
    let raw = await response.text();

    // Pre-compiled regex for speed
    raw = raw.replace(/^[^{]+/, "");

    // Fast parse
    const json = JSON.parse(raw);

    // fastest possible clean mapping
    const artists = (json.results || []).map(a => ({
      name: a.name,
      role: a.role,
      image: a.image
    }));

    // Final response (no pretty print for speed)
    return res.status(200).json({
      page: Number(p),
      perPage: n,
      language: l || "default",
      total: json.total,
      artists
    });

  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err.message
    });
  }
}
