import axios from "axios";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Content-Type", "application/json");

  try {
    const { p = 1 } = req.query;

    const q = "artidt";
    const n = 20;

    const searchUrl =
      `https://www.jiosaavn.com/api.php?p=${p}&q=${encodeURIComponent(q)}` +
      `&_format=json&_marker=0&api_version=4&ctx=wap6dot0&n=${n}` +
      `&__call=search.getArtistResults`;

    // Fetch artist list (raw text)
    const raw = await axios.get(searchUrl, { responseType: "text" });
    let data = raw.data.replace(/^[^{]+/, "");
    const cleanJSON = JSON.parse(data);

    const artists = cleanJSON.results || [];

    // ------------------------------------------
    // GROUPING LOGIC
    // ------------------------------------------
    const groups = {
      Tamil: [],
      Hindi: [],
      Telugu: [],
      Malayalam: [],
      Kannada: [],
      English: [],
      Unknown: []
    };

    // Function to get languages for each artist
    const fetchArtistLanguages = async (artistId) => {
      try {
        const url =
          `https://www.jiosaavn.com/api.php?__call=artist.getArtistPageDetails` +
          `&artistId=${artistId}&_format=json&_marker=0`;

        const rawRes = await axios.get(url, { responseType: "text" });
        let clean = rawRes.data.replace(/^[^{]+/, "");
        const artistDetails = JSON.parse(clean);

        const languages = new Set();

        // Extract languages from top songs
        if (artistDetails.topSongs) {
          artistDetails.topSongs.forEach((song) => {
            if (song.language) languages.add(song.language);
          });
        }

        // Extract from albums
        if (artistDetails.topAlbums) {
          artistDetails.topAlbums.forEach((album) => {
            if (album.language) languages.add(album.language);
          });
        }

        return [...languages];

      } catch (err) {
        return [];
      }
    };

    // ------------------------------------------
    // PROCESS ALL ARTISTS
    // ------------------------------------------
    for (const artist of artists) {
      const langs = await fetchArtistLanguages(artist.id);

      if (langs.length === 0) {
        groups.Unknown.push(artist);
        continue;
      }

      let assigned = false;

      if (langs.includes("tamil")) {
        groups.Tamil.push(artist);
        assigned = true;
      }
      if (langs.includes("hindi")) {
        groups.Hindi.push(artist);
        assigned = true;
      }
      if (langs.includes("telugu")) {
        groups.Telugu.push(artist);
        assigned = true;
      }
      if (langs.includes("malayalam")) {
        groups.Malayalam.push(artist);
        assigned = true;
      }
      if (langs.includes("kannada")) {
        groups.Kannada.push(artist);
        assigned = true;
      }
      if (langs.includes("english")) {
        groups.English.push(artist);
        assigned = true;
      }

      if (!assigned) {
        groups.Unknown.push(artist);
      }
    }

    return res.status(200).json({
      page: p,
      total: cleanJSON.total,
      count: artists.length,
      languages: groups
    });

  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
}
