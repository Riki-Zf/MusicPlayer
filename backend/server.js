const express = require("express");
const cors = require("cors");
const { spawn } = require("child_process");
const path = require("path");
require("dotenv").config();

const app = express();
app.use(cors());
app.use(express.json());

// Menggunakan path ke python executable di dalam virtual environment (Windows)
const pythonExecutable = path.join(__dirname, "venv", "Scripts", "python.exe");

// Helper untuk mengeksekusi script Python
const runPython = (args, input) => {
  return new Promise((resolve, reject) => {
    // Memanggil python.exe dari venv dan menyertakan yt_bridge_2.py
    const pyProg = spawn(pythonExecutable, ["yt_bridge.py", ...args]);
    let dataString = "";
    let errorString = "";

    pyProg.stdout.on("data", (data) => {
      dataString += data.toString();
    });

    pyProg.stderr.on("data", (data) => {
      errorString += data.toString();
    });

    if (input !== undefined) pyProg.stdin.end(input);
    else pyProg.stdin.end();

    pyProg.on("close", (code) => {
      if (code !== 0) {
        console.error(`stderr Python: ${errorString}`);
        return reject(`Python process failed with code ${code}`);
      }
      try {
        resolve(JSON.parse(dataString));
      } catch (err) {
        reject("Failed to parse output JSON");
      }
    });
  });
};

const runPythonPayload = (command, payload) => runPython([command], JSON.stringify(payload));

// Endpoint Search Lagu
app.get("/api/search", async (req, res) => {
  try {
    const { q, filter = "songs", scope = "", limit = "20", ignoreSpelling = "false" } = req.query;
    if (!q) return res.status(400).json({ error: "Query is required" });
    const allowedFilters = ["all", "songs", "videos", "albums", "artists", "playlists", "community_playlists", "featured_playlists", "profiles", "podcasts", "episodes"];
    if (!allowedFilters.includes(filter)) {
      return res.status(400).json({ error: "Invalid search filter" });
    }
    if (scope && !["uploads", "library"].includes(scope)) {
      return res.status(400).json({ error: "Invalid search scope" });
    }
    const parsedLimit = Number(limit);
    if (!Number.isInteger(parsedLimit) || parsedLimit < 1 || parsedLimit > 100) {
      return res.status(400).json({ error: "Limit must be an integer between 1 and 100" });
    }
    const results = await runPython(["search", q, filter, scope, String(parsedLimit), String(ignoreSpelling === "true")]);
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.toString() });
  }
});

// Endpoint Saran Pencarian
app.get("/api/search/suggestions", async (req, res) => {
  try {
    const { q, detailed = "false" } = req.query;
    if (!q) return res.status(400).json({ error: "Query is required" });
    const suggestions = await runPython(["suggestions", q, String(detailed === "true")]);
    res.json(suggestions);
  } catch (err) {
    res.status(500).json({ error: err.toString() });
  }
});

// Endpoint Informasi Artis dan rilisnya
app.get("/api/artist/:channelId", async (req, res) => {
  try {
    const artist = await runPython(["artist", req.params.channelId]);
    res.json(artist);
  } catch (err) {
    res.status(500).json({ error: err.toString() });
  }
});

app.get("/api/artist/:channelId/albums", async (req, res) => {
  try {
    const { params, limit = "100", order = "" } = req.query;
    if (!params) return res.status(400).json({ error: "Artist albums params are required" });
    const parsedLimit = Number(limit);
    if (!Number.isInteger(parsedLimit) || parsedLimit < 1 || parsedLimit > 1000) {
      return res.status(400).json({ error: "Limit must be an integer between 1 and 1000" });
    }
    if (order && !["Recency", "Popularity", "Alphabetical order"].includes(order)) {
      return res.status(400).json({ error: "Invalid artist albums order" });
    }
    const albums = await runPython(["artist_albums", req.params.channelId, params, String(parsedLimit), order]);
    res.json(albums);
  } catch (err) {
    res.status(500).json({ error: err.toString() });
  }
});

// Endpoint Informasi Pengguna, video, dan playlist
app.get("/api/user/:channelId", async (req, res) => {
  try {
    const user = await runPython(["user", req.params.channelId]);
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: err.toString() });
  }
});

app.get("/api/user/:channelId/videos", async (req, res) => {
  try {
    const { params } = req.query;
    if (!params) return res.status(400).json({ error: "User videos params are required" });
    const videos = await runPython(["user_videos", req.params.channelId, params]);
    res.json(videos);
  } catch (err) {
    res.status(500).json({ error: err.toString() });
  }
});

app.get("/api/user/:channelId/playlists", async (req, res) => {
  try {
    const { params } = req.query;
    if (!params) return res.status(400).json({ error: "User playlists params are required" });
    const playlists = await runPython(["user_playlists", req.params.channelId, params]);
    res.json(playlists);
  } catch (err) {
    res.status(500).json({ error: err.toString() });
  }
});

// Akun Library YT Music (memerlukan YTMUSIC_AUTH_FILE)
app.get("/api/library/status", async (req, res) => {
  try {
    res.json(await runPython(["auth_status"]));
  } catch (err) {
    res.status(500).json({ error: err.toString() });
  }
});

app.get("/api/library/:category", async (req, res) => {
  try {
    const { category } = req.params;
    const allowedCategories = ["playlists", "songs", "artists", "albums", "subscriptions", "podcasts", "channels", "history"];
    if (!allowedCategories.includes(category)) {
      return res.status(400).json({ error: "Unsupported library category" });
    }
    const limit = Number(req.query.limit || 50);
    if (!Number.isInteger(limit) || limit < 1 || limit > 500) {
      return res.status(400).json({ error: "Limit must be an integer between 1 and 500" });
    }
    const order = String(req.query.order || "");
    if (order && !["a_to_z", "z_to_a", "recently_added"].includes(order)) {
      return res.status(400).json({ error: "Invalid library order" });
    }
    const libraryData = category === "history"
      ? await runPython(["history"])
      : await runPython(["library", category, String(limit), order]);
    res.json(libraryData);
  } catch (err) {
    res.status(500).json({ error: err.toString() });
  }
});

app.post("/api/library/rate", async (req, res) => {
  try {
    const { type, id, rating } = req.body;
    if (!["song", "album", "playlist"].includes(type) || !id) {
      return res.status(400).json({ error: "A supported type and item id are required" });
    }
    if (!["LIKE", "DISLIKE", "INDIFFERENT"].includes(rating)) {
      return res.status(400).json({ error: "Rating must be LIKE, DISLIKE, or INDIFFERENT" });
    }
    res.json(await runPythonPayload("rate", { type, id, rating }));
  } catch (err) {
    res.status(500).json({ error: err.toString() });
  }
});

app.post("/api/library/artists/:channelId/subscription", async (req, res) => {
  try {
    res.json(await runPythonPayload("artist_subscription", {
      channelId: req.params.channelId,
      subscribe: true,
    }));
  } catch (err) {
    res.status(500).json({ error: err.toString() });
  }
});

app.delete("/api/library/artists/:channelId/subscription", async (req, res) => {
  try {
    res.json(await runPythonPayload("artist_subscription", {
      channelId: req.params.channelId,
      subscribe: false,
    }));
  } catch (err) {
    res.status(500).json({ error: err.toString() });
  }
});

app.get("/api/library/history", async (req, res) => {
  try {
    res.json(await runPython(["history"]));
  } catch (err) {
    res.status(500).json({ error: err.toString() });
  }
});

app.delete("/api/library/history", async (req, res) => {
  const { feedbackTokens } = req.body;
  if (!Array.isArray(feedbackTokens) || feedbackTokens.length === 0) {
    return res.status(400).json({ error: "feedbackTokens must be a non-empty array" });
  }
  try {
    res.json(await runPythonPayload("history_remove", { feedbackTokens }));
  } catch (err) {
    res.status(500).json({ error: err.toString() });
  }
});

// Playlist pribadi dan pengelolaan track
app.get("/api/playlists/:playlistId", async (req, res) => {
  try {
    const limit = Number(req.query.limit || 100);
    const suggestionsLimit = Number(req.query.suggestionsLimit || 0);
    if (!Number.isInteger(limit) || limit < 1 || limit > 500) {
      return res.status(400).json({ error: "Limit must be an integer between 1 and 500" });
    }
    if (!Number.isInteger(suggestionsLimit) || suggestionsLimit < 0 || suggestionsLimit > 50) {
      return res.status(400).json({ error: "Suggestions limit must be an integer between 0 and 50" });
    }
    res.json(await runPythonPayload("playlist", {
      playlistId: req.params.playlistId,
      limit,
      suggestionsLimit,
    }));
  } catch (err) {
    res.status(500).json({ error: err.toString() });
  }
});

app.post("/api/playlists", async (req, res) => {
  try {
    const { title, description = "", privacyStatus = "PRIVATE", videoIds = [] } = req.body;
    if (typeof title !== "string" || !title.trim()) {
      return res.status(400).json({ error: "Playlist title is required" });
    }
    if (!["PRIVATE", "PUBLIC", "UNLISTED"].includes(privacyStatus)) {
      return res.status(400).json({ error: "Invalid playlist privacy status" });
    }
    if (!Array.isArray(videoIds)) {
      return res.status(400).json({ error: "videoIds must be an array" });
    }
    res.json(await runPythonPayload("playlist_create", {
      title: title.trim(),
      description,
      privacyStatus,
      videoIds,
    }));
  } catch (err) {
    res.status(500).json({ error: err.toString() });
  }
});

app.delete("/api/playlists/:playlistId", async (req, res) => {
  try {
    res.json(await runPythonPayload("playlist_delete", { playlistId: req.params.playlistId }));
  } catch (err) {
    res.status(500).json({ error: err.toString() });
  }
});

app.patch("/api/playlists/:playlistId", async (req, res) => {
  try {
    const { title, description, privacyStatus, moveItem, successorSetVideoId } = req.body;
    if (privacyStatus && !["PRIVATE", "PUBLIC", "UNLISTED"].includes(privacyStatus)) {
      return res.status(400).json({ error: "Invalid playlist privacy status" });
    }
    if (moveItem && typeof moveItem !== "string") {
      return res.status(400).json({ error: "moveItem must be a setVideoId" });
    }
    const playlistPayload = {
      playlistId: req.params.playlistId,
      title,
      description,
      privacyStatus,
      moveItem: moveItem ? (successorSetVideoId ? [moveItem, successorSetVideoId] : moveItem) : undefined,
    };
    res.json(await runPythonPayload("playlist_edit", playlistPayload));
  } catch (err) {
    res.status(500).json({ error: err.toString() });
  }
});

app.post("/api/playlists/:playlistId/tracks", async (req, res) => {
  const { videoIds } = req.body;
  if (!Array.isArray(videoIds) || videoIds.length === 0) {
    return res.status(400).json({ error: "videoIds must be a non-empty array" });
  }
  try {
    res.json(await runPythonPayload("playlist_tracks_add", {
      playlistId: req.params.playlistId,
      videoIds,
    }));
  } catch (err) {
    res.status(500).json({ error: err.toString() });
  }
});

app.delete("/api/playlists/:playlistId/tracks", async (req, res) => {
  const { videos } = req.body;
  if (!Array.isArray(videos) || videos.length === 0) {
    return res.status(400).json({ error: "videos must be a non-empty array" });
  }
  if (videos.some((video) => !video.videoId || !video.setVideoId)) {
    return res.status(400).json({ error: "Each playlist video must include videoId and setVideoId" });
  }
  try {
    res.json(await runPythonPayload("playlist_tracks_remove", {
      playlistId: req.params.playlistId,
      videos,
    }));
  } catch (err) {
    res.status(500).json({ error: err.toString() });
  }
});

// Podcast, channel, episode, dan playlist episod
app.get("/api/podcasts/episodes-playlist", async (req, res) => {
  try {
    const playlistId = String(req.query.playlistId || "RDPN");
    res.json(await runPythonPayload("episodes_playlist", { playlistId }));
  } catch (err) {
    res.status(500).json({ error: err.toString() });
  }
});

app.get("/api/podcasts/:playlistId", async (req, res) => {
  try {
    const limit = Number(req.query.limit || 100);
    if (!Number.isInteger(limit) || limit < 1 || limit > 500) {
      return res.status(400).json({ error: "Limit must be an integer between 1 and 500" });
    }
    res.json(await runPythonPayload("podcast", { playlistId: req.params.playlistId, limit }));
  } catch (err) {
    res.status(500).json({ error: err.toString() });
  }
});

app.get("/api/channels/:channelId", async (req, res) => {
  try {
    res.json(await runPythonPayload("channel", { channelId: req.params.channelId }));
  } catch (err) {
    res.status(500).json({ error: err.toString() });
  }
});

app.get("/api/channels/:channelId/episodes", async (req, res) => {
  try {
    const { params } = req.query;
    if (!params) return res.status(400).json({ error: "Channel episodes params are required" });
    res.json(await runPythonPayload("channel_episodes", { channelId: req.params.channelId, params }));
  } catch (err) {
    res.status(500).json({ error: err.toString() });
  }
});

// Endpoint Metadata Album dan Lagu
app.get("/api/album/:browseId", async (req, res) => {
  try {
    const album = await runPython(["album", req.params.browseId]);
    res.json(album);
  } catch (err) {
    res.status(500).json({ error: err.toString() });
  }
});

app.get("/api/song/:videoId", async (req, res) => {
  try {
    const song = await runPython(["song", req.params.videoId]);
    res.json(song);
  } catch (err) {
    res.status(500).json({ error: err.toString() });
  }
});

// Endpoint Streaming Audio URL
app.get("/api/stream/:videoId", async (req, res) => {
  try {
    const { videoId } = req.params;
    const streamData = await runPython(["stream", videoId]);
    res.json(streamData);
  } catch (err) {
    res.status(500).json({ error: err.toString() });
  }
});

// Endpoint Lirik Lagu
app.get("/api/lyrics/:videoId", async (req, res) => {
  try {
    const { videoId } = req.params;
    const lyricsData = await runPython(["lyrics", videoId]);
    res.json(lyricsData);
  } catch (err) {
    res.status(500).json({ error: err.toString() });
  }
});

// Endpoint Rekomendasi Lagu Berikutnya
const getWatchPlaylist = async (req, res) => {
  try {
    const videoId = req.params.videoId || req.query.videoId || "";
    const { playlistId = "", limit = "25", radio = "false", shuffle = "false", includeMetadata = "false" } = req.query;
    if (!videoId && !playlistId) {
      return res.status(400).json({ error: "videoId or playlistId is required" });
    }
    const parsedLimit = Number(limit);
    if (!Number.isInteger(parsedLimit) || parsedLimit < 1 || parsedLimit > 100) {
      return res.status(400).json({ error: "Limit must be an integer between 1 and 100" });
    }
    const watchData = await runPython([
      "watch",
      videoId,
      playlistId,
      String(parsedLimit),
      String(radio === "true"),
      String(shuffle === "true"),
      String(includeMetadata === "true"),
    ]);
    res.json(watchData);
  } catch (err) {
    res.status(500).json({ error: err.toString() });
  }
};
app.get("/api/watch", getWatchPlaylist);
app.get("/api/watch/:videoId", getWatchPlaylist);

// Endpoint Top Charts dengan Fail-Safe
app.get("/api/charts", async (req, res) => {
  try {
    const country = String(req.query.country || "ID").toUpperCase();
    if (country !== "ZZ" && !/^[A-Z]{2}$/.test(country)) {
      return res.status(400).json({ error: "Country must be a two-letter ISO country code" });
    }
    const chartsData = await runPython(["charts", country]);
    if (chartsData?.error) {
      return res.status(502).json({ error: chartsData.error });
    }
    res.json(chartsData);
  } catch (err) {
    console.error("Charts Endpoint Error:", err);
    res.status(500).json({ error: err.toString() });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server backend berjalan di http://localhost:${PORT}`));
