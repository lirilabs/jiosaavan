import axios from "axios";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Content-Type", "application/json");

  try {
    const { l = "", p = 1 } = req.query;

    // Language filter mapped to search keyword
    const langMap = {
      tamil: "tamil singer",
      hindi: "hindi singer",
      telugu: "telugu singer",
      malayalam: "malayalam singer",
      kannada: "kannada singer",
      english: "english singer"
    };

    // Search text based on language
    const q = langMap[l.toLowerCase()] || "artidt";

    // FIXED: always 50 per page
    const n = 50;

    const url =
      `https://www.jiosaavn.com/api.php?p=${p}&q=${encodeURIComponent(q)}` +
      `&_format=json&_marker=0&api_version=4&ctx=wap6dot0&n=${n}` +
      `&__call=search.getArtistResults`;

    // Fetch raw text
    const raw = await axios.get(url, { responseType: "text" });

    let data = raw.data.replace(/^[^{]+/, "");
    const cleanJSON = JSON.parse(data);

    return res.status(200).send(
      JSON.stringify(
        {
          page: Number(p),
          perPage: n,
          language: l || "default",
          total: cleanJSON.total,
          artists: cleanJSON.results || []
        },
        null,
        2
      )
    );

  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
}
