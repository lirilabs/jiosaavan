import axios from "axios";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");

  try {
    const {
      q = "arijit",
      p = 1,
      n = 20
    } = req.query;

    const url = `https://www.jiosaavn.com/api.php?p=${p}&q=${encodeURIComponent(
      q
    )}&_format=json&_marker=0&api_version=4&ctx=wap6dot0&n=${n}&__call=search.getArtistResults`;

    const response = await axios.get(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
        Accept: "application/json"
      }
    });

    let data = response.data;

    // JioSaavn returns string JSON — need fix
    if (typeof data === "string") {
      data = JSON.parse(data.replace(/^[^\{]+/, ""));
    }

    return res.status(200).json({
      success: true,
      page: Number(p),
      query: q,
      count: data?.results?.length || 0,
      total: data?.total || 0,
      data
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: "Error fetching data",
      error: err.toString()
    });
  }
}
