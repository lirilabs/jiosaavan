import axios from "axios";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");

  try {
    const { q = "", p = 1, n = 20 } = req.query;

    const url = `https://www.jiosaavn.com/api.php?p=${p}&q=${encodeURIComponent(
      q
    )}&_format=json&_marker=0&api_version=4&ctx=wap6dot0&n=${n}&__call=search.getArtistResults`;

    // Fetch the data exactly as JioSaavn returns it (string)
    const response = await axios.get(url, {
      responseType: "text",     // Do NOT parse JSON
      transformResponse: r => r // Return raw
    });

    // Send exactly what JioSaavn sends
    return res.status(200).send(response.data);

  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err.message || err.toString()
    });
  }
}
