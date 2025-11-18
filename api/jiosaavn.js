import axios from "axios";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Content-Type", "application/json");

  try {
    const { q = "artidt", p = 1, n = 20 } = req.query;

    const url =
      `https://www.jiosaavn.com/api.php?p=${p}&q=${encodeURIComponent(q)}`
      + `&_format=json&_marker=0&api_version=4&ctx=wap6dot0&n=${n}`
      + `&__call=search.getArtistResults`;

    // Get raw text from JioSaavn
    const raw = await axios.get(url, {
      responseType: "text",
    });

    let data = raw.data;

    // Remove the garbage at the beginning
    data = data.replace(/^[^{]+/, "");

    // Convert to JSON
    const cleanJSON = JSON.parse(data);

    // Pretty print JSON
    return res.status(200).send(JSON.stringify(cleanJSON, null, 2));

  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
}
