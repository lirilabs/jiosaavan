export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Content-Type", "application/json");

  try {
    const { l = "", p = 1 } = req.query;

    const langMap = {
      tamil: "tamil singer",
      hindi: "hindi singer",
      telugu: "telugu singer",
      malayalam: "malayalam singer",
      kannada: "kannada singer",
      english: "english singer"
    };

    const key = l.toLowerCase();

    if (!langMap[key]) {
      return res.status(400).json({
        success: false,
        error: "Invalid language"
      });
    }

    const q = langMap[key];
    const n = 50;

    const url =
      `https://www.jiosaavn.com/api.php?p=${p}&q=${encodeURIComponent(q)}` +
      `&_format=json&_marker=0&api_version=4&ctx=wap6dot0&n=${n}` +
      `&__call=search.getArtistResults`;

    const response = await fetch(url);
    let raw = await response.text();

    // FIX: force proper JSON parsing
    const firstBrace = raw.indexOf("{");
    if (firstBrace === -1) {
      return res.status(500).json({
        success: false,
        error: "Invalid API response from JioSaavn"
      });
    }

    raw = raw.slice(firstBrace);

    let json;
    try {
      json = JSON.parse(raw);
    } catch (e) {
      return res.status(500).json({
        success: false,
        error: "Failed to parse JioSaavn JSON"
      });
    }

    const artists = (json.results || []).map(a => ({
      name: a.name,
      role: a.role,
      image: a.image
    }));

    return res.status(200).json({
      page: Number(p),
      perPage: n,
      language: key,
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
