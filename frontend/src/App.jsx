import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
import { usePlayerStore } from "./usePlayerStore";
import PlayerBar from "./PlayerBar";
import Sidebar from "./Sidebar";
import HomeQuickAccess from "./HomeQuickAccess";
import { ArrowLeft, Disc3, LoaderCircle, Music2, Play, Radio, Search, Shuffle, Sparkles } from "lucide-react";
import "./App.css";

const API = import.meta.env.VITE_API_BASE_URL || "/api";
const SEARCH_FILTERS = [
  ["all", "Semua"],
  ["songs", "Lagu"],
  ["videos", "Video"],
  ["albums", "Album"],
  ["artists", "Artis"],
  ["playlists", "Playlist"],
  ["community_playlists", "Playlist komunitas"],
  ["featured_playlists", "Playlist pilihan"],
  ["profiles", "Pengguna"],
  ["podcasts", "Podcast"],
  ["episodes", "Episode"],
];

const asList = (value) => {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.results)) return value.results;
  if (Array.isArray(value?.items)) return value.items;
  return [];
};
const imageFor = (item) => item?.thumbnails?.at?.(-1)?.url || item?.thumbnails?.[0]?.url || item?.thumbnail?.[0]?.url || item?.thumbnail?.url || "";
const artistFor = (item) => item?.artists?.map((artist) => artist.name).filter(Boolean).join(", ") || item?.author?.name || item?.artist || item?.subtitle || "";
const channelIdFor = (item) => item?.browseId || item?.channelId || item?.artist?.browseId || item?.artists?.[0]?.id;
const videoIdFor = (item) => item?.videoId;
const titleFor = (item) => item?.title || item?.name || item?.artist || "Tanpa judul";

function App() {
  const [query, setQuery] = useState("");
  const [searchFilter, setSearchFilter] = useState("songs");
  const [searchScope, setSearchScope] = useState("");
  const [ignoreSpelling, setIgnoreSpelling] = useState(false);
  const [results, setResults] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [chartsResult, setChartsResult] = useState(null);
  const [chartCountry, setChartCountry] = useState("ID");
  const [activePage, setActivePage] = useState("home");
  const [libraryCategory, setLibraryCategory] = useState("songs");
  const [libraryItems, setLibraryItems] = useState([]);
  const [libraryStatus, setLibraryStatus] = useState(null);
  const [libraryBusy, setLibraryBusy] = useState(false);
  const [libraryReload, setLibraryReload] = useState(0);
  const [libraryPlaylist, setLibraryPlaylist] = useState(null);
  const [playlistTitle, setPlaylistTitle] = useState("");
  const [playlistDescription, setPlaylistDescription] = useState("");
  const [queue, setQueue] = useState([]);
  const [detail, setDetail] = useState(null);
  const [busy, setBusy] = useState(false);
  const [detailBusy, setDetailBusy] = useState(false);
  const [error, setError] = useState("");
  const searchBoxRef = useRef(null);
  const { currentTrack, setCurrentTrack, setStreamUrl, setIsLoading } = usePlayerStore();

  useEffect(() => {
    if (activePage !== "library") return undefined;
    let active = true;
    const statusRequest = axios.get(`${API}/library/status`);
    const dataRequest = libraryCategory === "history"
      ? axios.get(`${API}/library/history`)
      : axios.get(`${API}/library/${libraryCategory}`, { params: { limit: 100, order: "recently_added" } });
    Promise.allSettled([statusRequest, dataRequest])
      .then(([statusResult, dataResult]) => {
        if (!active) return;
        if (statusResult.status === "fulfilled") {
          setLibraryStatus(statusResult.value.data);
        } else {
          console.error("Gagal memeriksa autentikasi:", statusResult.reason);
          setLibraryStatus({ configured: false });
        }
        if (dataResult.status === "fulfilled") {
          const data = dataResult.value.data;
          setLibraryItems(Array.isArray(data) ? data : data?.tracks || []);
          setError("");
        } else {
          console.error("Gagal memuat koleksi:", dataResult.reason);
          setLibraryItems([]);
          setError(dataResult.reason.response?.data?.error || "Koleksi gagal dimuat. Periksa autentikasi YouTube Music.");
        }
      })
      .catch((err) => {
        if (!active) return;
        console.error("Gagal memproses respons koleksi:", err);
        setLibraryItems([]);
        setLibraryStatus((previous) => previous || { configured: false });
        setError("Koleksi gagal dimuat. Periksa autentikasi YouTube Music.");
      })
      .finally(() => {
        if (active) setLibraryBusy(false);
      });
    return () => { active = false; };
  }, [activePage, libraryCategory, libraryReload]);

  useEffect(() => {
    let active = true;
    axios.get(`${API}/charts`, { params: { country: chartCountry } })
      .then(({ data }) => {
        if (active && data && typeof data === "object" && !Array.isArray(data)) {
          setChartsResult({ country: chartCountry, data });
          setError("");
        }
      })
      .catch((err) => {
        console.error("Gagal memuat Top Charts:", err);
        if (active) {
          setChartsResult({ country: chartCountry, data: null });
          setError(err.response?.data?.error || "Charts gagal dimuat. Pastikan backend berjalan.");
        }
      });
    return () => { active = false; };
  }, [chartCountry]);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) return undefined;
    let active = true;
    const timer = setTimeout(async () => {
      try {
        const { data } = await axios.get(`${API}/search/suggestions`, { params: { q: trimmed } });
        if (active && Array.isArray(data)) setSuggestions(data);
      } catch (err) {
        if (active) console.error("Gagal memuat saran pencarian:", err);
      }
    }, 250);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [query]);

  const runSearch = useCallback(async (searchQuery = query, filter = searchFilter, scope = searchScope, ignoreSpellingFilter = ignoreSpelling) => {
    const term = searchQuery.trim();
    if (!term) return;
    setQuery(term);
    setActivePage("search");
    setShowSuggestions(false);
    setDetail(null);
    setBusy(true);
    setError("");
    try {
      const { data } = await axios.get(`${API}/search`, {
        params: { q: term, filter, limit: 50, scope, ignoreSpelling: ignoreSpellingFilter },
      });
      if (!Array.isArray(data)) throw new Error("Format hasil pencarian tidak valid.");
      setResults(data);
      setQueue(filter === "songs" ? data : []);
    } catch (err) {
      console.error("Pencarian gagal:", err);
      setResults([]);
      setError(err.response?.data?.error || "Pencarian gagal. Periksa koneksi backend lalu coba lagi.");
    } finally {
      setBusy(false);
    }
  }, [ignoreSpelling, query, searchFilter, searchScope]);

  const playSong = useCallback(async (track, list = queue) => {
    const videoId = videoIdFor(track);
    if (!videoId) {
      setError("Item ini tidak memiliki ID lagu yang bisa diputar.");
      return;
    }
    setCurrentTrack(track);
    setIsLoading(true);
    setStreamUrl(null);
    setError("");
    try {
      const { data } = await axios.get(`${API}/stream/${encodeURIComponent(videoId)}`);
      if (!data?.url) throw new Error("URL stream tidak ditemukan.");
      setQueue(list);
      setStreamUrl(data.url);
    } catch (err) {
      console.error("Gagal memutar lagu:", err);
      setError(err.response?.data?.error || err.message || "Lagu gagal diputar.");
      setStreamUrl(null);
    } finally {
      setIsLoading(false);
    }
  }, [queue, setCurrentTrack, setIsLoading, setStreamUrl]);

  const activeList = queue.length ? queue : results;
  const changeTrack = (offset) => {
    const index = activeList.findIndex((track) => videoIdFor(track) === videoIdFor(currentTrack));
    const nextIndex = index + offset;
    if (index >= 0 && nextIndex >= 0 && nextIndex < activeList.length) playSong(activeList[nextIndex], activeList);
  };

  const playRadio = async (shuffle = false) => {
    if (!currentTrack?.videoId) {
      setError("Putar lagu terlebih dahulu untuk memulai radio.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const { data } = await axios.get(`${API}/watch/${encodeURIComponent(currentTrack.videoId)}`, {
        params: { radio: "true", shuffle: String(shuffle), limit: 50 },
      });
      const tracks = Array.isArray(data) ? data.filter((track) => track.videoId) : [];
      if (!tracks.length) throw new Error("Playlist radio tidak tersedia untuk lagu ini.");
      setQueue(tracks);
      const first = tracks.find((track) => track.videoId === currentTrack.videoId) || tracks[0];
      if (first.videoId !== currentTrack.videoId) await playSong(first, tracks);
    } catch (err) {
      console.error("Gagal memuat radio:", err);
      setError(err.response?.data?.error || err.message || "Radio gagal dimuat.");
    } finally {
      setBusy(false);
    }
  };

  const openItem = async (item) => {
    if (!item) return;
    const id = channelIdFor(item);
    const itemType = String(item.resultType || item.type || "").toLowerCase();
    const albumLike = item.audioPlaylistId || itemType.includes("album") || itemType.includes("single") || /^MPRE|^OLAK/i.test(item.browseId || "");
    const artistLike = itemType.includes("artist") || item.channelId || /^UC/i.test(item.browseId || "");
    if (searchFilter !== "profiles" && (searchFilter === "artists" || artistLike || (detail?.kind === "artist" && id)) && !albumLike && id) {
      setDetailBusy(true);
      setError("");
      try {
        const { data } = await axios.get(`${API}/artist/${encodeURIComponent(id)}`);
        setDetail({ kind: "artist", data, channelId: id });
      } catch (err) {
        console.error("Gagal memuat artis:", err);
        setError("Informasi artis gagal dimuat.");
      } finally {
        setDetailBusy(false);
      }
      return;
    }
    if ((searchFilter === "profiles" || itemType.includes("profile") || itemType.includes("user")) && id) {
      setDetailBusy(true);
      setError("");
      try {
        const { data } = await axios.get(`${API}/user/${encodeURIComponent(id)}`);
        setDetail({ kind: "user", data, channelId: id });
      } catch (err) {
        console.error("Gagal memuat pengguna:", err);
        setError("Informasi pengguna gagal dimuat.");
      } finally {
        setDetailBusy(false);
      }
      return;
    }
    if ((searchFilter === "albums" || albumLike) && (item.browseId || item.audioPlaylistId)) {
      setDetailBusy(true);
      setError("");
      try {
        const browseId = item.browseId || item.audioPlaylistId;
        const { data } = await axios.get(`${API}/album/${encodeURIComponent(browseId)}`);
        setDetail({ kind: "album", data });
      } catch (err) {
        console.error("Gagal memuat album:", err);
        setError("Detail album gagal dimuat.");
      } finally {
        setDetailBusy(false);
      }
      return;
    }
    if (searchFilter === "podcasts" && (item.playlistId || item.audioPlaylistId || item.browseId)) {
      setDetailBusy(true);
      try {
        const playlistId = item.playlistId || item.audioPlaylistId || item.browseId;
        const { data } = await axios.get(`${API}/podcasts/${encodeURIComponent(playlistId)}`, { params: { limit: 200 } });
        setDetail({ kind: "podcast", data });
      } catch (err) {
        console.error("Gagal memuat podcast:", err);
        setError(err.response?.data?.error || "Podcast gagal dimuat.");
      } finally {
        setDetailBusy(false);
      }
      return;
    }
    const playlistId = item.playlistId || itemType.includes("playlist") && item.browseId || (["playlists", "community_playlists", "featured_playlists"].includes(searchFilter) && item.browseId);
    if ((["playlists", "community_playlists", "featured_playlists"].includes(searchFilter) || itemType.includes("playlist")) && playlistId) {
      setDetailBusy(true);
      setError("");
      try {
        const { data } = await axios.get(`${API}/watch`, { params: { playlistId, limit: 50 } });
        const tracks = Array.isArray(data) ? data.filter((track) => track.videoId) : [];
        setQueue(tracks);
        setDetail({ kind: "playlist", data: { ...item, tracks } });
      } catch (err) {
        console.error("Gagal memuat playlist:", err);
        setError("Playlist gagal dimuat.");
      } finally {
        setDetailBusy(false);
      }
      return;
    }
    if (item.videoId) {
      if (["songs", "videos", "episodes", "all"].includes(searchFilter) || itemType.includes("song") || itemType.includes("video") || itemType.includes("episode")) {
        const playList = results.filter((result) => result.videoId);
        playSong(item, playList);
      } else {
        setDetailBusy(true);
        try {
          const { data } = await axios.get(`${API}/song/${encodeURIComponent(item.videoId)}`);
          setDetail({ kind: "song", data });
        } catch (err) {
          console.error("Gagal memuat metadata lagu:", err);
          setError("Metadata lagu gagal dimuat.");
        } finally {
          setDetailBusy(false);
        }
      }
    }
  };

  const playTrackList = (tracks) => {
    const playable = asList(tracks).filter((track) => track.videoId);
    if (playable.length) playSong(playable[0], playable);
  };

  const openChartPlaylist = async (playlist) => {
    if (!playlist?.playlistId) {
      setError("Playlist chart ini tidak memiliki ID yang dapat dibuka.");
      return;
    }
    setDetailBusy(true);
    setError("");
    try {
      const { data } = await axios.get(`${API}/watch`, {
        params: { playlistId: playlist.playlistId, limit: 100 },
      });
      const tracks = Array.isArray(data) ? data.filter((track) => track.videoId) : [];
      if (!tracks.length) throw new Error("Playlist chart tidak memiliki lagu yang dapat diputar.");
      setQueue(tracks);
      setDetail({ kind: "playlist", data: { ...playlist, tracks } });
    } catch (err) {
      console.error("Gagal membuka playlist chart:", err);
      setError(err.response?.data?.error || err.message || "Playlist chart gagal dimuat.");
    } finally {
      setDetailBusy(false);
    }
  };

  const refreshLibrary = () => {
    setLibraryBusy(true);
    setLibraryReload((value) => value + 1);
  };

  const openLibraryPlaylist = async (item) => {
    const playlistId = item.playlistId || item.browseId || item.audioPlaylistId;
    if (!playlistId) {
      setError("Playlist ini tidak memiliki ID yang dapat dibuka.");
      return;
    }
    setDetailBusy(true);
    setError("");
    try {
      const { data } = await axios.get(`${API}/playlists/${encodeURIComponent(playlistId)}`, {
        params: { limit: 500, suggestionsLimit: 20 },
      });
      setLibraryPlaylist(data);
    } catch (err) {
      console.error("Gagal memuat playlist koleksi:", err);
      setError(err.response?.data?.error || "Playlist gagal dimuat.");
    } finally {
      setDetailBusy(false);
    }
  };

  const handleLibraryItem = async (item) => {
    if (libraryCategory === "playlists") {
      await openLibraryPlaylist(item);
      return;
    }
    const podcastPlaylistId = item.playlistId || item.audioPlaylistId || item.browseId;
    if (libraryCategory === "podcasts" && podcastPlaylistId) {
      setDetailBusy(true);
      try {
        const { data } = await axios.get(`${API}/podcasts/${encodeURIComponent(podcastPlaylistId)}`, { params: { limit: 200 } });
        setLibraryPlaylist({ ...data, podcast: true });
      } catch (err) {
        console.error("Gagal memuat podcast:", err);
        setError(err.response?.data?.error || "Podcast gagal dimuat.");
      } finally {
        setDetailBusy(false);
      }
      return;
    }
    if (libraryCategory === "channels" && (item.channelId || item.browseId)) {
      setDetailBusy(true);
      try {
        const channelId = item.channelId || item.browseId;
        const { data } = await axios.get(`${API}/channels/${encodeURIComponent(channelId)}`);
        setLibraryPlaylist({ ...data, channelId, channel: true });
      } catch (err) {
        console.error("Gagal memuat channel:", err);
        setError(err.response?.data?.error || "Channel gagal dimuat.");
      } finally {
        setDetailBusy(false);
      }
      return;
    }
    if (item.videoId) playSong(item, libraryItems.filter((entry) => entry.videoId));
    else if (item.browseId) openItem({ ...item, resultType: libraryCategory === "artists" || libraryCategory === "subscriptions" ? "artist" : "album" });
  };

  const rateLibraryItem = async (item, type, rating) => {
    const id = type === "song" ? item.videoId : type === "album" ? item.audioPlaylistId || item.browseId : item.playlistId || item.browseId;
    if (!id) {
      setError("Item ini tidak memiliki ID yang dapat diberi rating.");
      return;
    }
    try {
      await axios.post(`${API}/library/rate`, { type, id, rating });
      refreshLibrary();
    } catch (err) {
      console.error("Gagal mengubah rating:", err);
      setError(err.response?.data?.error || "Rating gagal diperbarui. Pastikan autentikasi aktif.");
    }
  };

  const setArtistSubscription = async (item, subscribe) => {
    const channelId = item.channelId || item.browseId;
    if (!channelId) {
      setError("ID artis tidak ditemukan.");
      return;
    }
    try {
      const url = `${API}/library/artists/${encodeURIComponent(channelId)}/subscription`;
      if (subscribe) await axios.post(url);
      else await axios.delete(url);
      refreshLibrary();
    } catch (err) {
      console.error("Gagal mengubah langganan artis:", err);
      setError(err.response?.data?.error || "Langganan artis gagal diperbarui.");
    }
  };

  const createLibraryPlaylist = async (event) => {
    event.preventDefault();
    if (!playlistTitle.trim()) return;
    try {
      await axios.post(`${API}/playlists`, {
        title: playlistTitle.trim(),
        description: playlistDescription,
        privacyStatus: "PRIVATE",
      });
      setPlaylistTitle("");
      setPlaylistDescription("");
      refreshLibrary();
    } catch (err) {
      console.error("Gagal membuat playlist:", err);
      setError(err.response?.data?.error || "Playlist gagal dibuat.");
    }
  };

  const deleteLibraryPlaylist = async (item) => {
    const playlistId = item.playlistId || item.browseId;
    if (!playlistId || !window.confirm(`Hapus playlist "${titleFor(item)}"?`)) return;
    try {
      await axios.delete(`${API}/playlists/${encodeURIComponent(playlistId)}`);
      refreshLibrary();
    } catch (err) {
      console.error("Gagal menghapus playlist:", err);
      setError(err.response?.data?.error || "Playlist gagal dihapus.");
    }
  };

  const deleteHistoryItem = async (item) => {
    if (!item.feedbackToken) {
      setError("Riwayat ini tidak memiliki token yang dapat dihapus.");
      return;
    }
    try {
      await axios.delete(`${API}/library/history`, { data: { feedbackTokens: [item.feedbackToken] } });
      refreshLibrary();
    } catch (err) {
      console.error("Gagal menghapus riwayat:", err);
      setError(err.response?.data?.error || "Riwayat gagal dihapus.");
    }
  };

  const clearLibraryHistory = async () => {
    const feedbackTokens = libraryItems.map((item) => item.feedbackToken).filter(Boolean);
    if (!feedbackTokens.length) {
      setError("Tidak ada token riwayat yang dapat dihapus.");
      return;
    }
    if (!window.confirm(`Hapus ${feedbackTokens.length} item dari riwayat?`)) return;
    try {
      for (let index = 0; index < feedbackTokens.length; index += 25) {
        await axios.delete(`${API}/library/history`, {
          data: { feedbackTokens: feedbackTokens.slice(index, index + 25) },
        });
      }
      refreshLibrary();
    } catch (err) {
      console.error("Gagal menghapus riwayat:", err);
      setError(err.response?.data?.error || "Riwayat gagal dihapus.");
    }
  };

  const editPlaylistMetadata = async (event) => {
    event.preventDefault();
    if (!libraryPlaylist?.id) return;
    const form = new FormData(event.currentTarget);
    try {
      await axios.patch(`${API}/playlists/${encodeURIComponent(libraryPlaylist.id)}`, {
        title: form.get("title"),
        description: form.get("description"),
        privacyStatus: form.get("privacyStatus"),
      });
      await openLibraryPlaylist({ playlistId: libraryPlaylist.id });
    } catch (err) {
      console.error("Gagal memperbarui playlist:", err);
      setError(err.response?.data?.error || "Metadata playlist gagal diperbarui.");
    }
  };

  const addPlaylistTrack = async (videoId) => {
    if (!libraryPlaylist?.id || !videoId) return;
    try {
      await axios.post(`${API}/playlists/${encodeURIComponent(libraryPlaylist.id)}/tracks`, { videoIds: [videoId] });
      await openLibraryPlaylist({ playlistId: libraryPlaylist.id });
    } catch (err) {
      console.error("Gagal menambahkan lagu ke playlist:", err);
      setError(err.response?.data?.error || "Lagu gagal ditambahkan.");
    }
  };

  const removePlaylistTrack = async (track) => {
    if (!libraryPlaylist?.id || !track.videoId || !track.setVideoId) {
      setError("Track ini tidak menyertakan identitas playlist untuk dihapus.");
      return;
    }
    try {
      await axios.delete(`${API}/playlists/${encodeURIComponent(libraryPlaylist.id)}/tracks`, {
        data: { videos: [{ videoId: track.videoId, setVideoId: track.setVideoId }] },
      });
      await openLibraryPlaylist({ playlistId: libraryPlaylist.id });
    } catch (err) {
      console.error("Gagal menghapus lagu dari playlist:", err);
      setError(err.response?.data?.error || "Lagu gagal dihapus.");
    }
  };

  const movePlaylistTrack = async (track, successor) => {
    if (!libraryPlaylist?.id || !track.setVideoId) return;
    try {
      await axios.patch(`${API}/playlists/${encodeURIComponent(libraryPlaylist.id)}`, {
        moveItem: track.setVideoId,
        successorSetVideoId: successor?.setVideoId || null,
      });
      await openLibraryPlaylist({ playlistId: libraryPlaylist.id });
    } catch (err) {
      console.error("Gagal memindahkan lagu:", err);
      setError(err.response?.data?.error || "Urutan lagu gagal diubah.");
    }
  };

  const loadArtistAlbums = async () => {
    const albums = detail?.data?.albums;
    if (!detail?.channelId || !albums?.params) return;
    setDetailBusy(true);
    try {
      const { data } = await axios.get(`${API}/artist/${encodeURIComponent(detail.channelId)}/albums`, {
        params: { params: albums.params },
      });
      setDetail((previous) => previous ? {
        ...previous,
        data: { ...previous.data, albums: { ...albums, results: [...asList(albums), ...asList(data)], params: null } },
      } : previous);
    } catch (err) {
      console.error("Gagal memuat rilisan artis:", err);
      setError("Rilisan artis selanjutnya gagal dimuat.");
    } finally {
      setDetailBusy(false);
    }
  };

  const loadUserItems = async (kind) => {
    const section = detail?.data?.[kind];
    if (!detail?.channelId || !section?.params) return;
    setDetailBusy(true);
    try {
      const { data } = await axios.get(`${API}/user/${encodeURIComponent(detail.channelId)}/${kind}`, {
        params: { params: section.params },
      });
      setDetail((previous) => previous ? {
        ...previous,
        data: { ...previous.data, [kind]: { ...section, results: [...asList(section), ...asList(data)], params: null } },
      } : previous);
    } catch (err) {
      console.error(`Gagal memuat ${kind} pengguna:`, err);
      setError(`Daftar ${kind === "videos" ? "video" : "playlist"} selanjutnya gagal dimuat.`);
    } finally {
      setDetailBusy(false);
    }
  };

  const detailTitle = detail?.data?.name || detail?.data?.title || detail?.data?.artist?.name || "Detail";
  const detailImage = imageFor(detail?.data) || imageFor(detail?.data?.artist);
  const artistSections = useMemo(() => {
    if (detail?.kind !== "artist") return [];
    const data = detail.data;
    return [
      ["Lagu", asList(data.songs)],
      ["Video", asList(data.videos)],
      ["Album", asList(data.albums)],
      ["Single & EP", asList(data.singles)],
      ["Artis terkait", asList(data.related)],
    ].filter(([, items]) => items.length);
  }, [detail]);

  const renderItems = (items, { circular = false } = {}) => (
    <div className="content-grid">
      {items.map((item, index) => {
        const image = imageFor(item);
        const title = titleFor(item);
        const subtitle = artistFor(item) || item?.year || item?.views || "";
        return (
          <article className="media-card" key={item.videoId || item.browseId || item.playlistId || item.channelId || `${title}-${index}`}>
            <button className="media-card-main" onClick={() => openItem(item)} type="button">
              {image ? <img className={circular ? "media-cover circular" : "media-cover"} src={image} alt="" loading="lazy" /> : <div className="media-cover media-placeholder"><Music2 /></div>}
              <strong>{title}</strong>
              {subtitle && <span>{subtitle}</span>}
            </button>
            {item.videoId && (
              <button className="card-play" type="button" aria-label={`Putar ${title}`} onClick={() => playSong(item, items.filter((entry) => entry.videoId))}>
                <Play size={17} fill="currentColor" />
              </button>
            )}
          </article>
        );
      })}
    </div>
  );

  const renderTrackRows = (items) => (
    <div className="track-list">
      {items.map((track, index) => (
        <div className="track-row" key={track.videoId || `${titleFor(track)}-${index}`}>
          <span className="track-index">{index + 1}</span>
          {imageFor(track) ? <img src={imageFor(track)} alt="" /> : <div className="track-placeholder"><Music2 size={18} /></div>}
          <button className="track-details" type="button" onClick={() => track.videoId && playSong(track, items.filter((item) => item.videoId))}>
            <strong>{titleFor(track)}</strong>
            <span>{artistFor(track)}</span>
          </button>
          {track.videoId && <button className="icon-button" title="Lihat metadata lagu" type="button" onClick={async () => {
            try {
              const { data } = await axios.get(`${API}/song/${encodeURIComponent(track.videoId)}`);
              setDetail({ kind: "song", data });
            } catch (err) {
              console.error("Gagal memuat metadata lagu:", err);
              setError("Metadata lagu gagal dimuat.");
            }
          }}><Disc3 size={18} /></button>}
        </div>
      ))}
    </div>
  );

  const charts = chartsResult?.country === chartCountry ? chartsResult.data : null;
  const chartsLoading = !chartsResult || chartsResult.country !== chartCountry;
  const chartCategoryNames = {
    videos: "Video Musik Populer",
    daily: "Chart Harian",
    weekly: "Chart Mingguan",
    genres: "Genre",
    languages: "Bahasa",
    artists: "Artis Populer",
  };
  const chartSections = charts
    ? Object.entries(charts).filter(([key, value]) => key !== "countries" && Array.isArray(value) && value.length > 0)
    : [];

  const renderChartItems = (category, items) => {
    const isArtistCategory = category === "artists";
    return (
      <div className={isArtistCategory ? "content-grid chart-artists-grid" : "chart-playlist-grid"}>
        {items.map((item, index) => {
          const title = titleFor(item);
          const image = imageFor(item);
          return (
            <button
              className={isArtistCategory ? "chart-artist-card" : "chart-playlist-card"}
              key={item.playlistId || item.browseId || `${title}-${index}`}
              type="button"
              onClick={() => isArtistCategory ? openItem({ ...item, resultType: "artist" }) : openChartPlaylist(item)}
            >
              {image ? <img src={image} alt="" loading="lazy" /> : <span className="chart-placeholder">{isArtistCategory ? <Music2 /> : <Disc3 />}</span>}
              <span className="chart-item-copy">
                <strong>{title}</strong>
                <small>{isArtistCategory ? `#${item.rank || index + 1}${item.subscribers ? ` · ${item.subscribers} pendengar` : ""}` : item.description || "Buka chart dan putar"}</small>
              </span>
              {!isArtistCategory && <Play className="chart-play-icon" size={19} fill="currentColor" />}
            </button>
          );
        })}
      </div>
    );
  };

  const renderDetail = () => {
    if (!detail) return null;
    const data = detail.data;
    if (detail.kind === "artist") {
      return (
        <section className="detail-view">
          <button className="back-button" onClick={() => setDetail(null)} type="button"><ArrowLeft size={17} /> Kembali ke hasil</button>
          <header className="detail-hero">
            {detailImage && <img className="artist-avatar" src={detailImage} alt="" />}
            <div><span className="eyebrow">ARTIS</span><h1>{detailTitle}</h1><p>{data.description || "Jelajahi lagu, video, album, dan artis terkait."}</p>
              {detail.channelId && <button className="primary-button" type="button" onClick={() => setArtistSubscription({ channelId: detail.channelId }, true)}>Ikuti artis</button>}
            </div>
          </header>
          {artistSections.map(([heading, items]) => (
            <section className="section-block" key={heading}>
              <div className="section-heading">
                <h2>{heading}</h2>
                <div className="section-actions">
                {heading === "Lagu" && <button className="text-button" onClick={() => playTrackList(items)} type="button">Putar semua</button>}
                {heading === "Album" && detail.data.albums?.params && <button className="text-button" onClick={loadArtistAlbums} type="button">Muat rilisan lainnya</button>}
                </div>
              </div>
              {heading === "Lagu" || heading === "Video" ? renderTrackRows(items) : renderItems(items, { circular: heading === "Artis terkait" })}
            </section>
          ))}
          {!artistSections.length && <p className="empty-state">Belum ada rilisan yang dapat ditampilkan.</p>}
        </section>
      );
    }
    if (detail.kind === "user") {
      const videos = asList(data.videos);
      const playlists = asList(data.playlists);
      return (
        <section className="detail-view">
          <button className="back-button" onClick={() => setDetail(null)} type="button"><ArrowLeft size={17} /> Kembali ke hasil</button>
          <header className="detail-hero">
            {detailImage && <img className="artist-avatar" src={detailImage} alt="" />}
            <div><span className="eyebrow">PENGGUNA YOUTUBE MUSIC</span><h1>{detailTitle}</h1><p>{data.description || data.subtitle || "Video dan playlist publik pengguna."}</p></div>
          </header>
          {videos.length > 0 && <section className="section-block"><div className="section-heading"><h2>Video</h2>{data.videos?.params && <button className="text-button" onClick={() => loadUserItems("videos")} type="button">Muat lainnya</button>}</div>{renderTrackRows(videos)}</section>}
          {playlists.length > 0 && <section className="section-block"><div className="section-heading"><h2>Playlist</h2>{data.playlists?.params && <button className="text-button" onClick={() => loadUserItems("playlists")} type="button">Muat lainnya</button>}</div>{renderItems(playlists)}</section>}
          {!videos.length && !playlists.length && <p className="empty-state">Tidak ada video atau playlist publik yang tersedia.</p>}
        </section>
      );
    }
    if (detail.kind === "album" || detail.kind === "playlist") {
      const tracks = asList(detail.kind === "album" ? data.tracks : data.tracks);
      return (
        <section className="detail-view">
          <button className="back-button" onClick={() => setDetail(null)} type="button"><ArrowLeft size={17} /> Kembali ke hasil</button>
          <header className="detail-hero album-hero">
            {detailImage && <img className="album-art" src={detailImage} alt="" />}
            <div><span className="eyebrow">{detail.kind === "album" ? "ALBUM" : "PLAYLIST"}</span><h1>{detailTitle}</h1><p>{artistFor(data) || data.description || `${tracks.length} lagu`}</p>
              {tracks.length > 0 && <button className="primary-button" onClick={() => playTrackList(tracks)} type="button"><Play size={17} fill="currentColor" /> Putar</button>}
            </div>
          </header>
          {tracks.length ? renderTrackRows(tracks) : <p className="empty-state">Playlist ini belum menyediakan daftar lagu.</p>}
        </section>
      );
    }
    if (detail.kind === "podcast") {
      const episodes = asList(data.episodes || data.tracks);
      return (
        <section className="detail-view">
          <button className="back-button" onClick={() => setDetail(null)} type="button"><ArrowLeft size={17} /> Kembali ke hasil</button>
          <header className="detail-hero album-hero">
            {detailImage && <img className="album-art" src={detailImage} alt="" />}
            <div><span className="eyebrow">PODCAST</span><h1>{detailTitle}</h1><p>{data.description || `${episodes.length} episode`}</p></div>
          </header>
          {episodes.length ? renderTrackRows(episodes) : <p className="empty-state">Episode podcast belum tersedia.</p>}
        </section>
      );
    }
    return (
      <section className="detail-view">
        <button className="back-button" onClick={() => setDetail(null)} type="button"><ArrowLeft size={17} /> Kembali</button>
        <div className="section-heading"><h1>{titleFor(data)}</h1>{data.videoId && <button className="primary-button" onClick={() => playSong(data)} type="button"><Play size={17} fill="currentColor" /> Putar</button>}</div>
        {detailImage && <img className="metadata-image" src={detailImage} alt="" />}
        <pre className="metadata-json">{JSON.stringify(data, null, 2)}</pre>
      </section>
    );
  };

  const libraryCategoryLabels = {
    songs: "Lagu",
    playlists: "Playlist",
    artists: "Artis",
    albums: "Album",
    subscriptions: "Langganan",
    podcasts: "Podcast",
    channels: "Channel",
    history: "Riwayat",
  };

  const renderLibrary = () => {
    const playlistTracks = asList(libraryPlaylist?.tracks || libraryPlaylist?.episodes);
    const playlistSuggestions = asList(libraryPlaylist?.suggestions);
    const userPlaylistId = libraryPlaylist?.id || libraryPlaylist?.playlistId;
    return (
      <section className="library-view">
        <div className="section-heading library-heading">
          <div><span className="eyebrow">KOLEKSI AKUN YOUTUBE MUSIC</span><h1>{libraryPlaylist ? titleFor(libraryPlaylist) : "Koleksi Kamu"}</h1></div>
          {libraryPlaylist && <button className="secondary-button" type="button" onClick={() => setLibraryPlaylist(null)}><ArrowLeft size={16} /> Kembali ke koleksi</button>}
        </div>
        {!libraryStatus?.configured && (
          <div className="auth-notice">
            <strong>Hubungkan akun YouTube Music</strong>
            <p>Fitur koleksi, riwayat, playlist, rating, dan langganan memerlukan auth file ytmusicapi lokal. Atur <code>YTMUSIC_AUTH_FILE</code> di <code>backend/.env</code> ke lokasi file auth Anda, lalu restart backend. Jangan masukkan file auth ke Git atau bagikan isinya.</p>
          </div>
        )}
        {libraryPlaylist ? (
          <>
            {!libraryPlaylist.podcast && !libraryPlaylist.channel && (
              <form className="playlist-edit-form" onSubmit={editPlaylistMetadata}>
                <label>Nama playlist<input name="title" defaultValue={libraryPlaylist.title || ""} required /></label>
                <label>Deskripsi<input name="description" defaultValue={libraryPlaylist.description || ""} /></label>
                <label>Privasi<select name="privacyStatus" defaultValue={libraryPlaylist.privacy || "PRIVATE"}><option value="PRIVATE">Pribadi</option><option value="PUBLIC">Publik</option><option value="UNLISTED">Tidak publik</option></select></label>
                <button className="primary-button" type="submit">Simpan perubahan</button>
              </form>
            )}
            <div className="section-heading"><h2>            {libraryPlaylist.channel ? "Episode channel" : libraryPlaylist.podcast ? "Episode podcast" : "Lagu"}</h2>
              {playlistTracks.length > 0 && <button className="primary-button" type="button" onClick={() => playTrackList(playlistTracks)}><Play size={16} fill="currentColor" /> Putar semua</button>}
            </div>
            {playlistTracks.length ? (
              <div className="track-list">
                {playlistTracks.map((track, index) => (
                  <div className="track-row playlist-manage-row" key={track.setVideoId || track.videoId || index}>
                    <span className="track-index">{index + 1}</span>
                    {imageFor(track) && <img src={imageFor(track)} alt="" />}
                    <button className="track-details" type="button" onClick={() => track.videoId && playSong(track, playlistTracks)}><strong>{titleFor(track)}</strong><span>{artistFor(track)}</span></button>
                    {userPlaylistId && !libraryPlaylist.podcast && !libraryPlaylist.channel && <div className="playlist-track-actions">
                      <button className="icon-button" type="button" title="Pindahkan ke atas" disabled={index === 0} onClick={() => movePlaylistTrack(track, playlistTracks[index - 1])}>↑</button>
                      <button className="icon-button" type="button" title="Hapus dari playlist" onClick={() => removePlaylistTrack(track)}>×</button>
                    </div>}
                  </div>
                ))}
              </div>
            ) : <p className="empty-state">Belum ada episode atau lagu yang tersedia.</p>}
            {libraryPlaylist.channel && libraryPlaylist.episodes?.params && <button className="text-button" type="button" onClick={async () => {
              try {
                const { data } = await axios.get(`${API}/channels/${encodeURIComponent(libraryPlaylist.channelId)}/episodes`, {
                  params: { params: libraryPlaylist.episodes.params },
                });
                setLibraryPlaylist((previous) => previous ? { ...previous, episodes: { ...previous.episodes, results: [...asList(previous.episodes), ...asList(data)], params: null } } : previous);
              } catch (err) {
                console.error("Gagal memuat episode channel:", err);
                setError(err.response?.data?.error || "Episode channel gagal dimuat.");
              }
            }}>Muat episode lainnya</button>}
            {playlistSuggestions.length > 0 && (
              <section className="section-block"><h2>Saran playlist</h2>{playlistSuggestions.map((item, index) => (
                <div className="track-row" key={item.videoId || index}><div className="track-details"><strong>{titleFor(item)}</strong><span>{artistFor(item)}</span></div>
                  {userPlaylistId && !libraryPlaylist.podcast && !libraryPlaylist.channel && item.videoId && <button className="text-button" type="button" onClick={() => addPlaylistTrack(item.videoId)}>Tambah</button>}
                </div>
              ))}</section>
            )}
            {userPlaylistId && !libraryPlaylist.podcast && !libraryPlaylist.channel && results.some((item) => item.videoId) && (
              <section className="section-block"><h2>Tambah dari hasil pencarian</h2>
                {results.filter((item) => item.videoId).slice(0, 8).map((item) => <div className="track-row" key={item.videoId}>
                  <div className="track-details"><strong>{titleFor(item)}</strong><span>{artistFor(item)}</span></div><button className="text-button" type="button" onClick={() => addPlaylistTrack(item.videoId)}>Tambah</button>
                </div>)}
              </section>
            )}
          </>
        ) : (
          <>
            <div className="library-tabs">
              {Object.entries(libraryCategoryLabels).map(([category, label]) => <button type="button" key={category} className={libraryCategory === category ? "active" : ""} onClick={() => { setLibraryBusy(true); setLibraryCategory(category); }}>{label}</button>)}
            </div>
            {libraryCategory === "podcasts" && <button className="secondary-button" type="button" onClick={async () => {
              setDetailBusy(true);
              setError("");
              try {
                const { data } = await axios.get(`${API}/podcasts/episodes-playlist`);
                setLibraryPlaylist({ ...data, podcast: true });
              } catch (err) {
                console.error("Gagal memuat playlist episode:", err);
                setError(err.response?.data?.error || "Playlist episode gagal dimuat.");
              } finally {
                setDetailBusy(false);
              }
            }}>Episode baru</button>}
            {libraryCategory === "history" && libraryItems.length > 0 && <div className="library-toolbar"><span>Terakhir diputar</span><button className="text-button" type="button" onClick={clearLibraryHistory}>Hapus riwayat yang dimuat</button></div>}
            {libraryCategory === "playlists" && <form className="create-playlist-form" onSubmit={createLibraryPlaylist}>
              <input value={playlistTitle} onChange={(event) => setPlaylistTitle(event.target.value)} placeholder="Nama playlist baru" aria-label="Nama playlist baru" required />
              <input value={playlistDescription} onChange={(event) => setPlaylistDescription(event.target.value)} placeholder="Deskripsi (opsional)" aria-label="Deskripsi playlist" />
              <button className="primary-button" type="submit">Buat playlist</button>
            </form>}
            {libraryBusy ? <p className="empty-state">Memuat koleksi...</p> : libraryItems.length ? (
              <div className="library-list">
                {libraryItems.map((item, index) => {
                  const type = libraryCategory === "songs" ? "song" : libraryCategory === "albums" ? "album" : "playlist";
                  const supportsRating = ["songs", "albums", "playlists"].includes(libraryCategory);
                  const subscribed = libraryCategory === "subscriptions";
                  return (
                    <article className="library-item" key={item.videoId || item.playlistId || item.browseId || item.channelId || `${titleFor(item)}-${index}`}>
                      {imageFor(item) ? <img src={imageFor(item)} alt="" /> : <div className="track-placeholder"><Music2 size={18} /></div>}
                      <button className="library-item-info" type="button" onClick={() => handleLibraryItem(item)}><strong>{titleFor(item)}</strong><span>{artistFor(item)}</span></button>
                      <div className="library-item-actions">
                        {item.videoId && <button className="icon-button" title="Putar" type="button" onClick={() => playSong(item, libraryItems.filter((entry) => entry.videoId))}><Play size={16} fill="currentColor" /></button>}
                        {supportsRating && <><button className="icon-button" title="Suka" type="button" onClick={() => rateLibraryItem(item, type, "LIKE")}>♥</button><button className="icon-button" title="Hapus suka" type="button" onClick={() => rateLibraryItem(item, type, "INDIFFERENT")}>♡</button></>}
                        {subscribed && <button className="text-button" type="button" onClick={() => setArtistSubscription(item, false)}>Berhenti ikuti</button>}
                        {libraryCategory === "playlists" && <button className="icon-button" title="Hapus playlist" type="button" onClick={() => deleteLibraryPlaylist(item)}>×</button>}
                        {libraryCategory === "history" && item.feedbackToken && <button className="icon-button" title="Hapus dari riwayat" type="button" onClick={() => deleteHistoryItem(item)}>×</button>}
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : <p className="empty-state">{libraryStatus?.configured ? `Belum ada ${libraryCategoryLabels[libraryCategory]?.toLowerCase()} di koleksi.` : "Koleksi akun akan tampil setelah autentikasi dikonfigurasi."}</p>}
          </>
        )}
      </section>
    );
  };

  const runQuickSearch = (item) => {
    const term = typeof item === "string" ? item : item.query || item.title;
    const filter = typeof item === "string" ? "songs" : item.filter || "songs";
    setSearchFilter(filter);
    runSearch(term, filter);
  };

  return (
    <div className="app-shell">
      <Sidebar
        activePage={activePage}
        onNavigate={(page) => {
          if (page === "library" && activePage !== "library") setLibraryBusy(true);
          setActivePage(page);
          if (page === "home" || page === "library") {
            setDetail(null);
            setLibraryPlaylist(null);
          }
          if (page === "search") searchBoxRef.current?.focus();
        }}
      />
      <main className="main-panel">
        <div className="topbar">
          <form className="search-form" onSubmit={(event) => { event.preventDefault(); runSearch(); }}>
            <Search size={19} />
            <input
              ref={searchBoxRef}
              value={query}
              onChange={(event) => { setQuery(event.target.value); setShowSuggestions(true); }}
              onFocus={() => setShowSuggestions(true)}
              onKeyDown={(event) => { if (event.key === "Escape") setShowSuggestions(false); }}
              placeholder="Apa yang ingin kamu dengarkan?"
              aria-label="Cari musik, artis, album, dan lainnya"
            />
            {query && <button type="button" className="clear-search" onClick={() => { setQuery(""); setResults([]); setDetail(null); }}>×</button>}
            {showSuggestions && query.trim().length >= 2 && suggestions.length > 0 && (
              <div className="suggestion-menu">
                {suggestions.map((suggestion, index) => {
                  const value = typeof suggestion === "string" ? suggestion : suggestion?.suggestion || suggestion?.text || suggestion?.query || "";
                  return value && <button key={`${value}-${index}`} type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => runSearch(value)}><Search size={15} />{value}</button>;
                })}
              </div>
            )}
          </form>
          <select className="filter-select" aria-label="Filter pencarian" value={searchFilter} onChange={(event) => { setSearchFilter(event.target.value); if (query.trim()) runSearch(query, event.target.value); }}>
            {SEARCH_FILTERS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          <button className="search-submit" onClick={() => runSearch()} type="button">Cari</button>
          <select className="filter-select scope-select" aria-label="Cakupan pencarian" value={searchScope} onChange={(event) => { setSearchScope(event.target.value); if (query.trim()) runSearch(query, searchFilter, event.target.value); }}>
            <option value="">Semua sumber</option>
            <option value="uploads">Unggahan</option>
            <option value="library">Koleksi</option>
          </select>
          <label className="spelling-option"><input type="checkbox" checked={ignoreSpelling} onChange={(event) => { setIgnoreSpelling(event.target.checked); if (query.trim()) runSearch(query, searchFilter, searchScope, event.target.checked); }} /> Abaikan ejaan</label>
        </div>

        {error && <div className="error-banner" role="alert">{error}<button type="button" onClick={() => setError("")}>Tutup</button></div>}
        {(busy || detailBusy) && <div className="loading-line"><LoaderCircle size={17} className="spin" /> Memuat...</div>}

        {activePage === "home" && !query && !detail && (
          <>
            <section className="welcome-hero">
              <div className="hero-copy"><span className="eyebrow"><Sparkles size={14} /> MUSIK UNTUK HARI INI</span><h1>Temukan musik<br />yang kamu suka.</h1><p>Cari lagu, jelajahi artis dan album, atau mulai radio dari lagu yang sedang diputar.</p>
                <div className="hero-actions">
                  <button className="primary-button" onClick={() => { searchBoxRef.current?.focus(); runQuickSearch("Lagu Populer Indonesia"); }} type="button"><Search size={17} /> Jelajahi musik</button>
                  {currentTrack && <button className="secondary-button" onClick={() => playRadio(false)} type="button"><Radio size={17} /> Mulai radio</button>}
                  {currentTrack && <button className="secondary-button" onClick={() => playRadio(true)} type="button"><Shuffle size={17} /> Acak radio</button>}
                </div>
              </div>
              <div className="hero-art"><Disc3 size={132} strokeWidth={1} /><Music2 size={42} /></div>
            </section>
            <HomeQuickAccess onPlayQuickItem={runQuickSearch} />
            <section className="section-block charts-section">
              <div className="section-heading charts-heading">
                <div><span className="eyebrow">YOUTUBE MUSIC</span><h2>Charts & Tren</h2><p>{charts?.countries?.selected?.text ? `Pilihan musik populer di ${charts.countries.selected.text}` : "Musik populer dari YouTube Music"}</p></div>
                {charts?.countries?.options?.length > 0 && (
                  <label className="country-picker">
                    <span>Wilayah</span>
                    <select value={chartCountry} onChange={(event) => setChartCountry(event.target.value)} aria-label="Pilih wilayah charts">
                      {charts.countries.options.map((country) => <option value={country} key={country}>{country === "ZZ" ? "Global" : country}</option>)}
                    </select>
                  </label>
                )}
              </div>
              {chartSections.length ? chartSections.map(([category, items]) => (
                <section className="chart-category" key={category}>
                  <div className="section-heading"><div><span className="eyebrow">CHART</span><h3>{chartCategoryNames[category] || category}</h3></div><span className="chart-count">{items.length} item</span></div>
                  {renderChartItems(category, items)}
                </section>
              )) : <p className="empty-state">{chartsLoading ? "Memuat charts..." : "Belum ada chart untuk wilayah ini."}</p>}
            </section>
          </>
        )}

        {activePage === "library" && renderLibrary()}

        {activePage === "home" && detail && renderDetail()}

        {activePage === "search" && !detail && query && (
          <section className="results-view">
            <div className="section-heading"><div><span className="eyebrow">HASIL PENCARIAN · {SEARCH_FILTERS.find(([value]) => value === searchFilter)?.[1]}</span><h1>{query}</h1></div></div>
            {!busy && results.length === 0 ? <p className="empty-state">Tidak ada hasil ditemukan. Coba kata kunci atau filter lain.</p> : searchFilter === "songs" || searchFilter === "videos" || searchFilter === "episodes" ? renderTrackRows(results) : renderItems(results, { circular: searchFilter === "artists" || searchFilter === "profiles" })}
          </section>
        )}
      </main>
      <PlayerBar onNext={() => changeTrack(1)} onPrev={() => changeTrack(-1)} activeList={activeList} onPlaySong={(track) => playSong(track, activeList)} />
    </div>
  );
}

export default App;
