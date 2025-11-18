import axios from "axios";

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

    const q = langMap[l.toLowerCase()] || "artidt";
    const n = 50; // always 50 artists per page

    const url =
      `https://www.jiosaavn.com/api.php?p=${p}&q=${encodeURIComponent(q)}` +
      `&_format=json&_marker=0&api_version=4&ctx=wap6dot0&n=${n}` +
      `&__call=search.getArtistResults`;

    const raw = await axios.get(url, { responseType: "text" });

    let data = raw.data.replace(/^[^{]+/, "");
    const cleanJSON = JSON.parse(data);

    const artists = cleanJSON.results || [];

    // CLEAN ONLY name, role, image
    const filteredArtists = artists.map((artist) => ({
      name: artist.name,
      role: artist.role,
      image: artist.image
    }));

    return res.status(200).json({
      page: Number(p),
      perPage: n,
      language: l || "default",
      total: cleanJSON.total,
      artists: filteredArtists
    });

  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
}
